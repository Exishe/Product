-- Promotions (ADR-070): a promo is a short announcement the owner switches on,
-- shown as a banner at the top of the guest menu. It never changes a price;
-- the waiter applies any discount. Up to 3 per location, any number on.
--   * public.promos: the owner's rows (owner and manager read them; no guest
--     access to the table, guests read the live ones through the menu calls).
--   * api.save_promo / api.set_promo_on / api.delete_promo: the only writers,
--     SECURITY DEFINER, owner or manager of that café (the Telegram bot calls
--     api.set_promo_on later).
--   * api.public_menu and api.public_menu_status gain `promos`: the ones that
--     are on and inside their window right now in the café's time zone.

create table public.promos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  title jsonb not null,                 -- {"hy": "...", "ru": "...", "en": "..."}; hy is required
  body jsonb not null default '{}',     -- optional one line, same shape
  badge text check (badge is null or char_length(badge) between 1 and 16),   -- "-20%"
  is_on boolean not null default false,
  starts_at timestamp,                  -- café wall-clock time (locations.timezone); null: no start
  ends_at timestamp,                    -- null: no end
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  constraint promos_title_shape check (jsonb_typeof(title) = 'object' and nullif(btrim(coalesce(title ->> 'hy', '')), '') is not null),
  constraint promos_body_shape check (jsonb_typeof(body) = 'object'),
  constraint promos_window_order check (starts_at is null or ends_at is null or ends_at > starts_at)
);
create index promos_location_idx on public.promos (location_id);

alter table public.promos enable row level security;
create policy promos_read on public.promos for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
revoke all on public.promos from anon, authenticated;
grant select on public.promos to authenticated;
-- No client write grant: only the api functions below change the table.

-- -----------------------------------------------------------------------------
-- Helpers (private)
-- -----------------------------------------------------------------------------

-- Keep only hy/ru/en strings, trimmed, empty ones dropped; too long is refused.
create function private.clean_promo_text(p_text jsonb, p_max integer, p_require_hy boolean) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_lang text;
  v_val text;
begin
  if p_text is not null and jsonb_typeof(p_text) = 'object' then
    foreach v_lang in array array['hy', 'ru', 'en'] loop
      if jsonb_typeof(p_text -> v_lang) = 'string' then
        v_val := nullif(btrim(p_text ->> v_lang), '');
        if v_val is not null then
          if char_length(v_val) > p_max then
            raise exception using errcode = '22023', message = 'promo_text_too_long';
          end if;
          v_out := v_out || jsonb_build_object(v_lang, v_val);
        end if;
      end if;
    end loop;
  end if;
  if p_require_hy and not (v_out ? 'hy') then
    raise exception using errcode = '22023', message = 'name_required';
  end if;
  return v_out;
end $$;

-- Is this promo showing to guests right now (on, and inside its window in the café's zone)?
create function private.promo_is_live(p_promo public.promos, p_timezone text) returns boolean
language sql stable set search_path = '' as $$
  select p_promo.is_on
    and (p_promo.starts_at is null or p_promo.starts_at <= (now() at time zone p_timezone))
    and (p_promo.ends_at is null or (now() at time zone p_timezone) < p_promo.ends_at)
$$;

-- What guests see: the live promos of a location, oldest first.
create function private.live_promos(p_location_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'text', p.body, 'badge', p.badge)
                            order by p.created_at, p.id), '[]'::jsonb)
  from public.promos p
  join public.locations l on l.id = p.location_id
  where p.location_id = p_location_id and private.promo_is_live(p, l.timezone)
$$;

-- -----------------------------------------------------------------------------
-- What guests read: api.public_menu and api.public_menu_status gain `promos`.
-- Everything else is unchanged from 20261123120000_availability_controls.
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
                    end,
    'promos', private.live_promos(l.id))
  from public.restaurants r
  join public.locations l on l.restaurant_id = r.id
  join public.menu_versions v on v.id = l.published_menu_version_id
  where r.slug = p_restaurant_slug and l.slug = p_location_slug
    and r.status = 'active' and l.status = 'active'
$$;

create or replace function api.public_menu_status(p_location_id uuid) returns jsonb
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
                    end,
    'promos', private.live_promos(l.id))
  from public.locations l
  join public.restaurants r on r.id = l.restaurant_id
  left join public.menu_versions v on v.id = l.published_menu_version_id
  where l.id = p_location_id and l.status = 'active' and r.status = 'active'
$$;

-- -----------------------------------------------------------------------------
-- Owner and manager controls (api.set_promo_on is also for the Telegram bot)
-- -----------------------------------------------------------------------------

-- Create (p_promo_id null) or change a promo. Up to 3 per location. p_is_on
-- null keeps the stored switch (a new promo starts off). The window is in
-- the café's wall-clock time. Returns the promo id.
create function api.save_promo(
  p_location_id uuid,
  p_promo_id uuid,
  p_title jsonb,
  p_text jsonb default null,
  p_badge text default null,
  p_starts timestamp default null,
  p_ends timestamp default null,
  p_is_on boolean default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_title jsonb;
  v_body jsonb;
  v_badge text;
  v_id uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  v_title := private.clean_promo_text(p_title, 80, true);
  v_body := private.clean_promo_text(p_text, 160, false);
  v_badge := nullif(btrim(coalesce(p_badge, '')), '');
  if v_badge is not null and char_length(v_badge) > 16 then
    raise exception using errcode = '22023', message = 'promo_text_too_long';
  end if;
  if p_starts is not null and p_ends is not null and p_ends <= p_starts then
    raise exception using errcode = '22023', message = 'invalid_window';
  end if;

  -- Serialise creators of one location so the limit holds.
  select restaurant_id into v_restaurant from public.locations where id = p_location_id for update;

  if p_promo_id is null then
    if (select count(*) from public.promos where location_id = p_location_id) >= 3 then
      raise exception using errcode = 'RS422', message = 'promo_limit';
    end if;
    insert into public.promos (restaurant_id, location_id, title, body, badge, is_on, starts_at, ends_at, created_by)
    values (v_restaurant, p_location_id, v_title, v_body, v_badge, coalesce(p_is_on, false), p_starts, p_ends, auth.uid())
    returning id into v_id;
  else
    update public.promos
    set title = v_title, body = v_body, badge = v_badge, starts_at = p_starts, ends_at = p_ends,
        is_on = coalesce(p_is_on, is_on), updated_at = now()
    where id = p_promo_id and location_id = p_location_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(),
          case when p_promo_id is null then 'promo.created' else 'promo.updated' end,
          'promo', v_id, jsonb_build_object('title', v_title, 'is_on', p_is_on));
  return v_id;
end $$;

-- Switch a promo on or off. Returns whether guests see it right now (it can
-- be on but outside its window). The Telegram bot calls this.
create function api.set_promo_on(p_promo_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
  v_tz text;
begin
  if p_on is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select * into v_promo from public.promos where id = p_promo_id;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_promo.location_id, '{owner,manager}');

  update public.promos set is_on = p_on, updated_at = now() where id = p_promo_id
  returning * into v_promo;
  select timezone into v_tz from public.locations where id = v_promo.location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_promo.restaurant_id, v_promo.location_id, 'member', auth.uid(),
          case when p_on then 'promo.on' else 'promo.off' end, 'promo', p_promo_id,
          jsonb_build_object('title', v_promo.title));
  return private.promo_is_live(v_promo, v_tz);
end $$;

create function api.delete_promo(p_promo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
begin
  select * into v_promo from public.promos where id = p_promo_id;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_promo.location_id, '{owner,manager}');

  delete from public.promos where id = p_promo_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_promo.restaurant_id, v_promo.location_id, 'member', auth.uid(), 'promo.deleted', 'promo', p_promo_id,
          jsonb_build_object('title', v_promo.title));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing is callable until granted by name
-- -----------------------------------------------------------------------------
revoke execute on function private.clean_promo_text(jsonb, integer, boolean) from public, anon, authenticated;
revoke execute on function private.promo_is_live(public.promos, text) from public, anon, authenticated;
revoke execute on function private.live_promos(uuid) from public, anon, authenticated;

revoke execute on function api.save_promo(uuid, uuid, jsonb, jsonb, text, timestamp, timestamp, boolean) from public, anon, authenticated;
grant execute on function api.save_promo(uuid, uuid, jsonb, jsonb, text, timestamp, timestamp, boolean) to authenticated;
revoke execute on function api.set_promo_on(uuid, boolean) from public, anon, authenticated;
grant execute on function api.set_promo_on(uuid, boolean) to authenticated;
revoke execute on function api.delete_promo(uuid) from public, anon, authenticated;
grant execute on function api.delete_promo(uuid) to authenticated;
