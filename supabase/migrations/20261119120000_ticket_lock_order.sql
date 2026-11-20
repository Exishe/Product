-- ADR-064: one lock order for an order's rows: order -> kitchen ticket -> order item.
--
-- The kitchen moving a ticket and a waiter cancelling a line of the same order
-- could deadlock (Postgres 40P01):
--   api.set_ticket_status locked the ticket, then its status update fired
--     kitchen_tickets_sync_order, which updates the order row: ticket -> order;
--   api.cancel_order_item locked the item, then the order, then updated the
--     ticket: item -> order -> ticket.
-- Both now find the order with a plain read, lock the ORDER row first, then the
-- ticket, then the item, and only then read what they decide on. Everything
-- else (checks, their sequence, error codes, grants) is as in the baseline.
--
-- Locking the order first also closes two stale reads: cancel_order_item chose
-- "cancel the ticket" or "send a void" from a ticket status read without a
-- lock, and two stations finishing at the same moment could each compute the
-- order's kitchen status without seeing the other's ticket.
--
-- Any new function that writes an order's tickets or items takes the locks in
-- this order. api.accept_order and api.reject_order already lock the order first.

create or replace function api.set_ticket_status(p_ticket_id uuid, p_expected public.ticket_status, p_next public.ticket_status)
returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.kitchen_tickets;
  v_order_id uuid;
  v_roles public.member_role[];
begin
  -- 1. the order (a ticket never changes its order), 2. the ticket
  select order_id into v_order_id from public.kitchen_tickets where id = p_ticket_id;
  if found then
    perform 1 from public.orders where id = v_order_id for update;
  end if;
  select * into v_t from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or v_t.kind <> 'order' then
    raise exception using errcode = 'P0002', message = 'ticket_not_found';
  end if;
  v_roles := case
    when p_expected = 'new'     and p_next = 'cooking' then '{owner,manager,kitchen}'
    when p_expected = 'new'     and p_next = 'ready'   then '{owner,manager,kitchen}'   -- drinks: no cooking step
    when p_expected = 'cooking' and p_next = 'ready'   then '{owner,manager,kitchen}'
    when p_expected = 'ready'   and p_next = 'cooking' then '{owner,manager,kitchen}'   -- undo a wrong "ready"
    when p_expected = 'ready'   and p_next = 'served'  then '{owner,manager,kitchen,waiter}'
  end::public.member_role[];
  if v_roles is null then
    raise exception using errcode = 'RS422', message = 'transition_not_allowed';
  end if;
  perform private.assert_location_role(v_t.location_id, v_roles);
  if v_t.status = p_next then
    return v_t.status;
  end if;
  if v_t.status <> p_expected then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_t.status::text;
  end if;
  update public.kitchen_tickets
  set status = p_next,
      started_at = case when p_next = 'cooking' then coalesce(started_at, now()) else started_at end,
      ready_at = case when p_next = 'ready' then now() when p_next = 'cooking' then null else ready_at end,
      served_at = case when p_next = 'served' then now() else served_at end
  where id = p_ticket_id;
  return p_next;
end $$;

create or replace function api.cancel_order_item(p_order_item_id uuid, p_quantity integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_ticket public.kitchen_tickets;
  v_has_ticket boolean;
  v_void uuid;
begin
  -- 1. the order (a line never changes its order or station)
  select * into v_item from public.order_items where id = p_order_item_id;
  if not found then raise exception using errcode = 'P0002', message = 'order_item_not_found'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.assert_location_role(v_order.location_id, '{owner,manager,waiter}');

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
  if p_quantity < 1 or p_quantity > v_item.quantity - v_item.cancelled_quantity then
    raise exception using errcode = 'RS422', message = 'invalid_quantity';
  end if;

  if v_has_ticket and v_ticket.status = 'served' then
    -- Food already went out: this is a comp, managers only.
    perform private.assert_location_role(v_order.location_id, '{owner,manager}');
  end if;

  update public.order_items
  set cancelled_quantity = cancelled_quantity + p_quantity,
      line_total = (unit_price + modifiers_total) * (quantity - cancelled_quantity - p_quantity)
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
      values (v_order.restaurant_id, v_void, v_item.id, p_quantity);
    end if;
  end if;

  if not exists (select 1 from public.order_items where order_id = v_order.id and quantity > cancelled_quantity) then
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 200),
           cancelled_by = private.current_member_id(v_order.restaurant_id)
    where id = v_order.id;
  end if;

  insert into public.order_status_history (restaurant_id, order_id, entity, from_status, to_status,
                                           actor_kind, actor_user_id, reason)
  values (v_order.restaurant_id, v_order.id, 'order_item', null, 'cancelled:' || p_quantity,
          'member', auth.uid(), left(p_reason, 200));
end $$;

-- `create or replace` keeps the baseline's grants; stated again per the migration checklist.
revoke execute on function api.set_ticket_status(uuid, public.ticket_status, public.ticket_status) from public, anon, authenticated;
grant execute on function api.set_ticket_status(uuid, public.ticket_status, public.ticket_status) to authenticated;
revoke execute on function api.cancel_order_item(uuid, integer, text) from public, anon, authenticated;
grant execute on function api.cancel_order_item(uuid, integer, text) to authenticated;
