-- Availability controls (ADR-068): owner-controlled, enforced in the database.
--   1. A category may have a daily time window (in the café's time zone).
--   2. The café can pause QR ordering (for some minutes, or until resumed).
--   3. The café can close the kitchen until the next business-day opening.
--   4. api.public_menu_status: the tiny status the guest menu polls.
-- The old switches stay: qr_ordering_enabled (the hard off) and the kitchen
-- busy timer (kitchen_busy_until) are not touched.

alter table public.categories
  add column available_from time,
  add column available_to time,
  add constraint categories_window_pair check ((available_from is null) = (available_to is null)),
  add constraint categories_window_not_empty check (available_from <> available_to);

alter table public.locations
  add column ordering_paused boolean not null default false,
  add column ordering_paused_until timestamptz,
  add column kitchen_closed_until timestamptz,
  add constraint locations_pause_until_needs_pause check (ordering_paused_until is null or ordering_paused);
-- No client write grant on these columns: only the api functions below change them.

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Is a wall-clock time inside [from, to)? A window may span midnight (22:00-02:00).
create function private.in_daily_window(p_now time, p_from time, p_to time) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_from is null or p_to is null then true
    when p_from < p_to then p_now >= p_from and p_now < p_to
    else p_now >= p_from or p_now < p_to
  end
$$;

-- Is this category orderable right now at this location (café time zone)?
create function private.category_open_now(p_category_id uuid, p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select private.in_daily_window((now() at time zone l.timezone)::time, c.available_from, c.available_to)
     from public.categories c, public.locations l
     where c.id = p_category_id and l.id = p_location_id),
    true)
$$;

-- Categories of this location's menus that are outside their window now.
create function private.hidden_categories(p_location_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c.id order by c.id), '{}'::uuid[])
  from public.locations l
  join public.menu_locations ml on ml.location_id = l.id
  join public.categories c on c.menu_id = ml.menu_id
  where l.id = p_location_id
    and c.available_from is not null
    and not private.in_daily_window((now() at time zone l.timezone)::time, c.available_from, c.available_to)
$$;

-- Why guests cannot order right now, besides the hard off: null when they can.
create function private.ordering_block(p_location_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when l.kitchen_closed_until > now() then 'kitchen_closed'
    when l.ordering_paused and (l.ordering_paused_until is null or l.ordering_paused_until > now()) then 'ordering_paused'
  end
  from public.locations l where l.id = p_location_id
$$;

-- A guest cannot order a dish whose category is outside its window.
create function private.assert_lines_in_window(p_location_id uuid, p_lines jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_item text;
begin
  if jsonb_typeof(p_lines) <> 'array' then
    return;  -- the order core rejects it
  end if;
  select l ->> 'item_id' into v_item
  from jsonb_array_elements(p_lines) l
  join public.items i on l ->> 'item_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     and i.id = (l ->> 'item_id')::uuid
  where not private.category_open_now(i.category_id, p_location_id)
  limit 1;
  if v_item is not null then
    raise exception using errcode = 'RS422', message = 'category_unavailable', detail = v_item;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- The guest order: pause, closed kitchen and time windows are checked here,
-- not only in the UI. A replay of an order already placed is returned as
-- before (a retry never fails because the café paused in between). Waiters
-- place orders through their own function and are not held back by these.
-- Everything else is unchanged from 20261109190200_guest_possible_duplicates.
-- -----------------------------------------------------------------------------
create or replace function private.place_guest_order(
  p_user_id uuid,
  p_guest_session_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
  v_replay boolean;
  v_block text;
  v_total integer;
  v_dishes jsonb;
  v_duplicate uuid;
  v_id uuid;
begin
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> p_user_id or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version
     or not v_location.qr_ordering_enabled or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'ordering_disabled';
  end if;

  v_replay := exists (select 1 from public.orders o where o.restaurant_id = v_guest.restaurant_id
                      and o.idempotency_key = p_idempotency_key);
  if not v_replay then
    v_block := private.ordering_block(v_location.id);
    if v_block is not null then
      raise exception using errcode = 'RS403', message = v_block;
    end if;
    perform private.assert_lines_in_window(v_location.id, p_lines);
    if not private.rate_limit_hit('order:guest:' || p_guest_session_id, 6, interval '10 minutes')
       or not private.rate_limit_hit('order:table:' || v_table.id, 30, interval '1 hour') then
      raise exception using errcode = 'RS429', message = 'rate_limited';
    end if;
  end if;

  -- On a replay the core checks the request hash and the guest session and
  -- returns the original order.
  v_id := private.place_order_core(v_location.id, v_table.id, v_guest.table_session_id, v_guest.id, null, 'qr',
                                   v_guest.locale, p_idempotency_key, p_lines, p_note, true);
  if v_replay then
    return v_id;
  end if;

  select o.total into v_total from public.orders o where o.id = v_id;

  select jsonb_object_agg(d.item_id, d.qty) into v_dishes
  from (select oi.item_id::text as item_id, sum(oi.quantity) as qty
        from public.order_items oi where oi.order_id = v_id group by oi.item_id) d;

  select o.id into v_duplicate
  from public.orders o
  where o.table_id = v_table.id
    and o.id <> v_id
    and o.guest_session_id is distinct from v_guest.id
    and o.status in ('placed', 'accepted')
    and o.placed_at > now() - interval '3 minutes'
    and (select jsonb_object_agg(d.item_id, d.qty)
         from (select oi.item_id::text as item_id, sum(oi.quantity) as qty
               from public.order_items oi where oi.order_id = o.id group by oi.item_id) d) = v_dishes
  order by o.placed_at desc
  limit 1;

  if v_duplicate is not null then
    update public.orders set possible_duplicate_of = v_duplicate where id = v_id;
  elsif not v_location.require_acceptance and v_total <= v_location.max_auto_accept_total then
    -- Small orders go straight to the kitchen; large or flagged ones wait for a waiter.
    update public.orders set status = 'accepted', accepted_at = now() where id = v_id and status = 'placed';
    if found then
      perform private.create_tickets(v_id);
    end if;
  end if;

  update public.guest_sessions set last_seen_at = now(), expires_at = now() + interval '4 hours' where id = v_guest.id;
  return v_id;
end $$;

revoke execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text) to service_role;

-- -----------------------------------------------------------------------------
-- What guests read. api.public_menu gains location.paused / location.closed
-- (null, or {until}; `until` is null for "until the café resumes") and the ids
-- of categories that are outside their window right now. Everything else is
-- unchanged from 20261119100000_brand_profile.
-- -----------------------------------------------------------------------------
create or replace function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'logo', r.logo_path, 'brand_color', r.brand_color,
                                     'guest_theme', r.guest_theme, 'brand', r.brand),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'locales', to_jsonb(l.guest_locales),
                                   'ordering', l.qr_ordering_enabled and private.location_can_order(l.id),
                                   'paused', case when private.ordering_block(l.id) = 'ordering_paused'
                                                  then jsonb_build_object('until', l.ordering_paused_until) end,
                                   'closed', case when private.ordering_block(l.id) = 'kitchen_closed'
                                                  then jsonb_build_object('until', l.kitchen_closed_until) end),
    'menu', v.snapshot,
    'sold_out', (select coalesce(jsonb_agg(s.item_id), '[]'::jsonb) from public.stop_list s
                 where s.location_id = l.id and (s.until is null or s.until > now())),
    'hidden_categories', to_jsonb(private.hidden_categories(l.id)),
    'covers', (select coalesce(jsonb_object_agg(c.id, c.image_path), '{}'::jsonb) from public.categories c
               where c.restaurant_id = r.id and c.is_active and c.image_path is not null),
    'kitchen_busy', case when l.kitchen_busy_until > now()
                         then jsonb_build_object('until', l.kitchen_busy_until,
                                                 'expected_wait_minutes', l.expected_wait_minutes)
                    end)
  from public.restaurants r
  join public.locations l on l.restaurant_id = r.id
  join public.menu_versions v on v.id = l.published_menu_version_id
  where r.slug = p_restaurant_slug and l.slug = p_location_slug
    and r.status = 'active' and l.status = 'active'
$$;

-- The status a guest's phone polls every few seconds while the menu is open.
-- Only the things that change during service, no menu text: the published
-- version, the hard off, pause, closed kitchen, the stop list, the categories
-- outside their window, and the busy timer. When the answer differs from the
-- last one, the page reloads the menu; otherwise nothing else is fetched.
create function api.public_menu_status(p_location_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', v.version,
    'ordering', l.qr_ordering_enabled and private.location_can_order(l.id),
    'paused', case when private.ordering_block(l.id) = 'ordering_paused'
                   then jsonb_build_object('until', l.ordering_paused_until) end,
    'closed', case when private.ordering_block(l.id) = 'kitchen_closed'
                   then jsonb_build_object('until', l.kitchen_closed_until) end,
    'sold_out', (select coalesce(jsonb_agg(s.item_id order by s.item_id), '[]'::jsonb) from public.stop_list s
                 where s.location_id = l.id and (s.until is null or s.until > now())),
    'hidden_categories', to_jsonb(private.hidden_categories(l.id)),
    'kitchen_busy', case when l.kitchen_busy_until > now()
                         then jsonb_build_object('until', l.kitchen_busy_until,
                                                 'expected_wait_minutes', l.expected_wait_minutes)
                    end)
  from public.locations l
  join public.restaurants r on r.id = l.restaurant_id
  left join public.menu_versions v on v.id = l.published_menu_version_id
  where l.id = p_location_id and l.status = 'active' and r.status = 'active'
$$;

-- -----------------------------------------------------------------------------
-- Owner and manager controls (also for the Telegram bot)
-- -----------------------------------------------------------------------------

-- Pause QR ordering. p_minutes null = until resumed; otherwise 1 to 720
-- minutes and it resumes by itself. p_paused = false resumes at once.
-- Returns when it resumes (null: no end, or resumed).
create function api.set_ordering_pause(p_location_id uuid, p_paused boolean, p_minutes integer default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_until timestamptz;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_paused is null or (p_paused and p_minutes is not null and p_minutes not between 1 and 720)
     or (not p_paused and p_minutes is not null) then
    raise exception using errcode = '22023', message = 'invalid_minutes';
  end if;
  v_until := case when p_paused and p_minutes is not null then now() + make_interval(mins => p_minutes) end;

  update public.locations
  set ordering_paused = p_paused, ordering_paused_until = v_until
  where id = p_location_id
  returning restaurant_id into v_restaurant;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(),
          case when p_paused then 'ordering.paused' else 'ordering.resumed' end,
          'location', p_location_id, jsonb_build_object('minutes', p_minutes, 'until', v_until));
  return v_until;
end $$;

-- Close the kitchen for today: no new guest orders until the next business-day
-- opening (locations.business_day_starts in the café's time zone, the same
-- boundary as "not today" on the stop list). p_closed = false reopens at once.
-- Returns when it reopens by itself (null when reopened).
create function api.set_kitchen_closed_today(p_location_id uuid, p_closed boolean)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_tz text;
  v_starts time;
  v_local timestamp;
  v_open timestamp;
  v_until timestamptz;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_closed is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select l.restaurant_id, l.timezone, l.business_day_starts into v_restaurant, v_tz, v_starts
  from public.locations l where l.id = p_location_id;

  if p_closed then
    v_local := now() at time zone v_tz;
    v_open := date_trunc('day', v_local) + v_starts;
    if v_open <= v_local then
      v_open := v_open + interval '1 day';
    end if;
    v_until := v_open at time zone v_tz;
  end if;

  update public.locations set kitchen_closed_until = v_until where id = p_location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(),
          case when p_closed then 'kitchen.closed_today' else 'kitchen.reopened' end,
          'location', p_location_id, jsonb_build_object('until', v_until));
  return v_until;
end $$;

-- A daily window for a category ("Breakfast" 08:00-12:00), in the café's time
-- zone; both null removes it. Read live by guests: no republish needed.
create function api.set_category_window(p_category_id uuid, p_from time, p_to time) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.categories where id = p_category_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if (p_from is null) <> (p_to is null) or p_from = p_to then
    raise exception using errcode = '22023', message = 'invalid_window';
  end if;

  update public.categories
  set available_from = p_from, available_to = p_to, updated_at = now()
  where id = p_category_id;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'category.window', 'category', p_category_id,
          jsonb_build_object('from', p_from, 'to', p_to));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function private.in_daily_window(time, time, time) from public, anon, authenticated;
revoke execute on function private.category_open_now(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.hidden_categories(uuid) from public, anon, authenticated;
revoke execute on function private.ordering_block(uuid) from public, anon, authenticated;
revoke execute on function private.assert_lines_in_window(uuid, jsonb) from public, anon, authenticated;

revoke execute on function api.public_menu_status(uuid) from public, anon, authenticated;
grant execute on function api.public_menu_status(uuid) to anon, authenticated;
revoke execute on function api.set_ordering_pause(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function api.set_ordering_pause(uuid, boolean, integer) to authenticated;
revoke execute on function api.set_kitchen_closed_today(uuid, boolean) from public, anon, authenticated;
grant execute on function api.set_kitchen_closed_today(uuid, boolean) to authenticated;
revoke execute on function api.set_category_window(uuid, time, time) from public, anon, authenticated;
grant execute on function api.set_category_window(uuid, time, time) to authenticated;
