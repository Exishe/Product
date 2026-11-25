-- "Can't make" on a dish that is already on a placed order (ADR-081).
-- The kitchen finds out at cooking time that one dish cannot be made (an
-- ingredient, a broken oven, anything). One action does four things:
--   1. cancels that line through the same rule as api.cancel_order_item (partial
--      or whole quantity, void ticket, line total zeroed, history row), with the
--      reason code 'cant_make';
--   2. marks the line, so the guest's order page can say so kindly and offer up
--      to 3 similar dishes (api.cant_make_alternatives, rules only, no AI);
--   3. tells the waiters at once: the live list api.table_alerts gets a
--      'cant_make' row until a waiter taps "Told the guest" (api.ack_cant_make),
--      and the existing notification outbox gets one table.alert row per press;
--   4. leaves the bill consistent: the cancelled quantity is already out of the
--      line total, the order total and the bill lines. A paid order is refused.
-- The lock order of ADR-064 (order, then ticket, then line) is kept: the
-- cancellation body now lives once, in private.cancel_order_item_core.

-- -----------------------------------------------------------------------------
-- 1. Two columns on the line (the guest and the waiter already read the line)
-- -----------------------------------------------------------------------------
alter table public.order_items
  add column cant_make_at timestamptz,        -- the last time the kitchen could not make it
  add column cant_make_ack_at timestamptz;    -- the waiter spoke to the guest

-- -----------------------------------------------------------------------------
-- 2. The cancellation, once. Body of api.cancel_order_item from
-- 20261119120000_ticket_lock_order, with the allowed roles, "all that is left"
-- and "refuse a paid order" as arguments.
-- -----------------------------------------------------------------------------
create function private.cancel_order_item_core(
  p_order_item_id uuid, p_quantity integer, p_reason text,
  p_roles public.member_role[], p_all boolean, p_refuse_paid boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_ticket public.kitchen_tickets;
  v_has_ticket boolean;
  v_void uuid;
  v_qty integer;
begin
  -- 1. the order (a line never changes its order or station)
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception using errcode = 'P0002', message = 'order_item_not_found'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.assert_location_role(v_order.location_id, p_roles);
  if p_refuse_paid and v_order.paid_at is not null then
    raise exception using errcode = 'RS409', message = 'order_paid';
  end if;

  -- 2. the station's ticket, so its status can't move under us
  select * into v_ticket from public.kitchen_tickets
  where order_id = v_order.id and station_id = v_item.station_id and kind = 'order'
  order by created_at, id
  limit 1
  for update;
  v_has_ticket := found;

  -- 3. the line itself, read again now that it can't change
  select * into v_item from public.order_items where id = p_order_item_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order_item_not_found'; end if;
  v_qty := case when p_all then v_item.quantity - v_item.cancelled_quantity else p_quantity end;
  if v_qty < 1 or v_qty > v_item.quantity - v_item.cancelled_quantity then
    raise exception using errcode = 'RS422', message = 'invalid_quantity';
  end if;

  if v_has_ticket and v_ticket.status = 'served' then
    -- Food already went out: this is a comp, managers only.
    perform private.assert_location_role(v_order.location_id, '{owner,manager}');
  end if;

  update public.order_items
  set cancelled_quantity = cancelled_quantity + v_qty,
      line_total = (unit_price + modifiers_total) * (quantity - cancelled_quantity - v_qty)
  where id = p_order_item_id;

  update public.orders o
  set subtotal = s.sum, total = s.sum, item_count = s.cnt
  from (select coalesce(sum(line_total), 0) as sum, coalesce(sum(quantity - cancelled_quantity), 0) as cnt
        from public.order_items where order_id = v_order.id) s
  where o.id = v_order.id;

  if v_has_ticket and v_ticket.status in ('new', 'cooking', 'ready') then
    if v_ticket.status = 'new' and not exists (
         select 1 from public.order_items oi
         where oi.order_id = v_order.id and oi.station_id = v_item.station_id
           and oi.quantity > oi.cancelled_quantity) then
      update public.kitchen_tickets set status = 'cancelled', cancelled_at = now() where id = v_ticket.id;
    else
      insert into public.kitchen_tickets (restaurant_id, location_id, order_id, station_id, kind, voids_ticket_id, number)
      values (v_order.restaurant_id, v_order.location_id, v_order.id, v_ticket.station_id, 'void', v_ticket.id, v_order.number)
      returning id into v_void;
      insert into public.kitchen_ticket_items (restaurant_id, ticket_id, order_item_id, quantity)
      values (v_order.restaurant_id, v_void, v_item.id, v_qty);
    end if;
  end if;

  if not exists (select 1 from public.order_items where order_id = v_order.id and quantity > cancelled_quantity) then
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 200),
           cancelled_by = private.current_member_id(v_order.restaurant_id)
    where id = v_order.id;
  end if;

  insert into public.order_status_history (restaurant_id, order_id, entity, from_status, to_status,
                                           actor_kind, actor_user_id, reason)
  values (v_order.restaurant_id, v_order.id, 'order_item', null, 'cancelled:' || v_qty,
          'member', auth.uid(), left(p_reason, 200));
end $$;

-- The same rule as before: owners, managers and waiters (what the waiter app uses).
create or replace function api.cancel_order_item(p_order_item_id uuid, p_quantity integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.cancel_order_item_core(p_order_item_id, p_quantity, p_reason, '{owner,manager,waiter}', false, false);
end $$;

-- -----------------------------------------------------------------------------
-- 3. The kitchen's one action. Kitchen devices join the people who may cancel a
-- line, because this is the button on their screen. As for any cancellation,
-- food that already went out (ticket served) is a manager's decision.
-- -----------------------------------------------------------------------------
create function api.cant_make_item(p_order_item_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_table text;
begin
  perform private.cancel_order_item_core(p_order_item_id, 1, 'cant_make', '{owner,manager,waiter,kitchen}', true, true);

  -- The order lock from the core is still held; the line is ours.
  update public.order_items set cant_make_at = now(), cant_make_ack_at = null
  where id = p_order_item_id
  returning * into v_item;
  select * into v_order from public.orders where id = v_item.order_id;
  select t.label into v_table from public.tables t where t.id = v_order.table_id;

  -- One outbox row per chat and press (a later press has a higher cancelled quantity).
  perform private.enqueue_notification(v_order.restaurant_id, v_order.location_id, 'table.alert',
    'table.alert:cant_make:' || v_item.id || ':' || v_item.cancelled_quantity,
    jsonb_build_object('reason', 'cant_make', 'table', v_table, 'number', v_order.number,
                       'dish', v_item.name_i18n, 'quantity', v_item.cancelled_quantity,
                       'minutes', 0, 'presses', null));
end $$;

-- The waiter spoke to the guest. Safe to repeat.
create function api.ack_cant_make(p_order_item_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_location uuid;
begin
  select oi.order_id into v_order_id from public.order_items oi where oi.id = p_order_item_id;
  if not found then raise exception using errcode = 'P0002', message = 'order_item_not_found'; end if;
  -- Lock order: the order first (ADR-064).
  select o.location_id into v_location from public.orders o where o.id = v_order_id for update;
  perform private.assert_location_role(v_location, '{owner,manager,waiter}');
  update public.order_items set cant_make_ack_at = now()
  where id = p_order_item_id and cant_make_at is not null and cant_make_ack_at is null;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Similar dishes, by rules. Same section first, then the same dish type;
-- only dishes that can be ordered right now (the same test as
-- api.public_suggestions): on the published menu, active, section active and
-- open, not on the stop list, not blocked by an ingredient outage, and one tap
-- must be enough (no required options). Never a dish already on this order.
-- Most ordered here in the last 60 days first, then by name. At most 3 ids.
-- The guest of the order and the café's staff may ask; nobody else.
-- -----------------------------------------------------------------------------
create function api.cant_make_alternatives(p_order_item_id uuid) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_loc public.locations;
  v_dish public.items;
  v_snap jsonb;
  v_local timestamp;
  v_result uuid[];
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_order from public.orders where id = v_item.order_id;
  if not (exists (select 1 from private.my_location_ids('{owner,manager,waiter,kitchen}') x where x = v_order.location_id)
          or (v_order.guest_session_id is not null
              and exists (select 1 from public.guest_sessions g
                          where g.id = v_order.guest_session_id and g.user_id = auth.uid() and g.revoked_at is null))) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if v_item.cant_make_at is null or v_item.item_id is null then
    return '{}'::uuid[];
  end if;

  select l.* into v_loc
  from public.locations l join public.restaurants r on r.id = l.restaurant_id
  where l.id = v_order.location_id and l.status = 'active' and r.status = 'active'
    and l.published_menu_version_id is not null;
  if not found then
    return '{}'::uuid[];
  end if;
  select v.snapshot -> 'items' into v_snap from public.menu_versions v where v.id = v_loc.published_menu_version_id;
  select * into v_dish from public.items where id = v_item.item_id and restaurant_id = v_loc.restaurant_id;
  if v_snap is null or not found then
    return '{}'::uuid[];
  end if;
  v_local := now() at time zone v_loc.timezone;

  with avail as (
    select i.id, i.category_id, i.item_type as itype,
           (select coalesce(min(t.name) filter (where t.locale = 'hy'), min(t.name) filter (where t.locale = 'ru'),
                            min(t.name) filter (where t.locale = 'en'), min(t.name), '')
            from public.item_translations t where t.item_id = i.id) as nm
    from public.items i
    join public.categories c on c.id = i.category_id
    where i.restaurant_id = v_loc.restaurant_id
      and i.is_active and c.is_active
      and v_snap ? i.id::text
      and i.id <> v_dish.id
      and not exists (select 1 from public.order_items oi
                      where oi.order_id = v_order.id and oi.item_id = i.id and oi.quantity > oi.cancelled_quantity)
      and private.in_daily_window(v_local::time, c.available_from, c.available_to)
      and not exists (select 1 from public.stop_list s
                      where s.location_id = v_loc.id and s.item_id = i.id and (s.until is null or s.until > now()))
      and not exists (select 1 from private.outage_effects(v_loc.id) e where e.item_id = i.id and e.hidden)
      and not exists (select 1 from public.item_modifier_groups img
                      join public.modifier_groups g on g.id = img.group_id
                      where img.item_id = i.id and g.min_select > 0)
  ),
  pop as (
    select oi.item_id, count(*) as n
    from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.location_id = v_loc.id and o.business_date >= current_date - 60
      and o.status in ('placed', 'accepted') and oi.quantity > oi.cancelled_quantity
    group by oi.item_id
  ),
  ranked as (
    select a.id,
           case when a.category_id = v_dish.category_id then 1
                when v_dish.item_type is not null and a.itype = v_dish.item_type then 2 end as tier,
           coalesce(p.n, 0) as n, a.nm
    from avail a left join pop p on p.item_id = a.id
  )
  select coalesce(array_agg(x.id order by x.tier, x.n desc, x.nm, x.id), '{}'::uuid[]) into v_result
  from (select r.* from ranked r where r.tier is not null order by r.tier, r.n desc, r.nm, r.id limit 3) x;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- 5. The waiters' live list and the notification text
-- -----------------------------------------------------------------------------
-- Lines the kitchen could not make and nobody has told the guest about yet
-- (forgotten after 12 hours).
create function private.cant_make_live(p_location_id uuid)
returns table (item_id uuid, table_label text, order_number integer, minutes integer, dish jsonb, quantity integer)
language sql stable security definer set search_path = '' as $$
  select oi.id, t.label, o.number, floor(extract(epoch from now() - oi.cant_make_at) / 60)::integer,
         oi.name_i18n, oi.cancelled_quantity::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  left join public.tables t on t.id = o.table_id
  where o.location_id = p_location_id
    and oi.cant_make_at is not null and oi.cant_make_ack_at is null
    and oi.cant_make_at > now() - interval '12 hours'
$$;

-- api.table_alerts of ADR-071 plus the "can't make" rows: reason 'cant_make',
-- id = the line, dish = its names, quantity = how many.
create or replace function api.table_alerts(p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,waiter}');
  return coalesce((
    select jsonb_agg(jsonb_build_object('reason', a.reason, 'id', a.ref_id, 'table', a.table_label,
                                        'number', a.order_number, 'minutes', a.minutes, 'presses', a.presses)
                     || case when a.dish is null then '{}'::jsonb
                             else jsonb_build_object('dish', a.dish, 'quantity', a.quantity) end
                     order by a.minutes desc, a.ref_id)
    from (select l.reason, l.ref_id, l.table_label, l.order_number, l.minutes, l.presses,
                 null::jsonb as dish, null::integer as quantity
          from private.table_alerts_live(p_location_id) l
          union all
          select 'cant_make', c.item_id, c.table_label, c.order_number, c.minutes, null::integer, c.dish, c.quantity
          from private.cant_make_live(p_location_id) c) a), '[]'::jsonb);
end $$;

-- Text for the new alert; every other message goes to the renderer below it.
alter function private.render_notification(text, jsonb, public.app_locale) rename to render_notification_before_cant_make;

create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_table text := coalesce(nullif(p_payload ->> 'table', ''), '?');
  v_dish text;
begin
  if p_kind is distinct from 'table.alert' or p_payload ->> 'reason' is distinct from 'cant_make' then
    return private.render_notification_before_cant_make(p_kind, p_payload, p_locale);
  end if;
  v_dish := coalesce(nullif(p_payload -> 'dish' ->> l::text, ''), nullif(p_payload -> 'dish' ->> 'hy', ''),
                     nullif(p_payload -> 'dish' ->> 'ru', ''), nullif(p_payload -> 'dish' ->> 'en', ''), '?');
  return case l
    when 'hy' then 'Սեղան ' || v_table || '՝ «' || v_dish || '» ուտեստը հնարավոր չէ պատրաստել։ Հյուրը տեղեկացված է, խնդրում ենք խոսել նրա հետ։'
    when 'ru' then 'Стол ' || v_table || ': блюдо «' || v_dish || '» приготовить нельзя. Гость уведомлён, подойдите к нему.'
    else 'Table ' || v_table || ': the kitchen can''t make "' || v_dish || '". The guest has been told; please speak to them.' end;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function private.cancel_order_item_core(uuid, integer, text, public.member_role[], boolean, boolean) from public, anon, authenticated;
revoke execute on function private.cant_make_live(uuid) from public, anon, authenticated;
revoke execute on function private.render_notification(text, jsonb, public.app_locale) from public, anon, authenticated;
revoke execute on function private.render_notification_before_cant_make(text, jsonb, public.app_locale) from public, anon, authenticated;
revoke execute on function api.cancel_order_item(uuid, integer, text) from public, anon, authenticated;
revoke execute on function api.cant_make_item(uuid) from public, anon, authenticated;
revoke execute on function api.ack_cant_make(uuid) from public, anon, authenticated;
revoke execute on function api.cant_make_alternatives(uuid) from public, anon, authenticated;
revoke execute on function api.table_alerts(uuid) from public, anon, authenticated;
grant execute on function api.cancel_order_item(uuid, integer, text) to authenticated;
grant execute on function api.cant_make_item(uuid) to authenticated;
grant execute on function api.ack_cant_make(uuid) to authenticated;
grant execute on function api.cant_make_alternatives(uuid) to authenticated;
grant execute on function api.table_alerts(uuid) to authenticated;
