-- Milestone 7, the waiter app (plan.md Tasks 7.1–7.3, ADR-045).
--
-- 1. api.resolve_service_request: one tap on «Գնում եմ» resolves a call.
-- 2. The stale-table guard (ADR-033 (4), R8): a new guest joining a table
--    that looks finished does not join the old bill. They get a separate
--    table session in the new 'waiting' state; their orders wait for the
--    waiter, who either closes the old bill first (the waiting session then
--    becomes the table's open session) or says it is the same party
--    (api.seat_waiting_guests merges the two).
-- 3. api.settle_table_session also resolves the table's service requests and
--    opens the waiting session, if any.
--
-- 'waiting' is only used inside plpgsql bodies and in the trigger function,
-- never in an index or a constraint, so the enum value can be added in the
-- same migration transaction.

alter type public.table_session_status add value if not exists 'waiting';

-- -----------------------------------------------------------------------------
-- 1. Service requests
-- -----------------------------------------------------------------------------
-- Idempotent: a repeat (an outbox replay, a second tablet) succeeds silently.
create function api.resolve_service_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_req public.service_requests;
begin
  select * into v_req from public.service_requests where id = p_request_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'service_request_not_found'; end if;
  perform private.assert_location_role(v_req.location_id, '{owner,manager,waiter}');
  if v_req.status = 'resolved' then return; end if;
  update public.service_requests
  set status = 'resolved', resolved_at = now(), resolved_by = private.current_member_id(v_req.restaurant_id),
      acknowledged_at = coalesce(acknowledged_at, now()),
      acknowledged_by = coalesce(acknowledged_by, private.current_member_id(v_req.restaurant_id))
  where id = p_request_id;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Stale-table guard
-- -----------------------------------------------------------------------------
-- A session "looks finished" when it has at least one accepted order, nothing
-- waits for acceptance, every accepted order is served, and the guests asked
-- for the bill or nobody ordered for 45 minutes.
create function private.session_looks_finished(p_table_session_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.orders o where o.table_session_id = p_table_session_id and o.status = 'accepted')
     and not exists (select 1 from public.orders o where o.table_session_id = p_table_session_id
                     and (o.status = 'placed' or (o.status = 'accepted' and o.kitchen_status <> 'served')))
     and (exists (select 1 from public.service_requests r where r.table_session_id = p_table_session_id
                  and r.kind = 'bring_bill' and r.status <> 'resolved')
          or (select max(o.placed_at) from public.orders o where o.table_session_id = p_table_session_id)
             < now() - interval '45 minutes')
$$;

create or replace function private.join_table(p_user_id uuid, p_table_id uuid, p_qr_version integer, p_locale public.app_locale)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables;
  v_location public.locations;
  v_open public.table_sessions;
  v_session uuid;
  v_guest uuid;
begin
  select * into v_table from public.tables where id = p_table_id;
  if not found or not v_table.is_active or v_table.qr_version <> p_qr_version then
    raise exception using errcode = 'RS403', message = 'table_unavailable';
  end if;
  select * into v_location from public.locations where id = v_table.location_id;
  if v_location.status <> 'active' or not v_location.qr_ordering_enabled then
    raise exception using errcode = 'RS403', message = 'ordering_disabled';
  end if;
  if not private.rate_limit_hit('join:' || p_user_id, 20, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  -- A phone that already joined (the old party or the waiting one) keeps its session.
  select g.id into v_guest from public.guest_sessions g
  where g.user_id = p_user_id and g.table_id = p_table_id and g.revoked_at is null and g.expires_at > now()
  order by g.created_at desc limit 1;
  if v_guest is not null then
    update public.guest_sessions set last_seen_at = now(), expires_at = now() + interval '4 hours', locale = p_locale
    where id = v_guest;
    return v_guest;
  end if;

  insert into public.table_sessions (restaurant_id, location_id, table_id)
  values (v_table.restaurant_id, v_table.location_id, v_table.id)
  on conflict (table_id) where status = 'open' do nothing;
  -- The lock serialises new guests at this table, so there is one waiting session at most.
  select * into v_open from public.table_sessions where table_id = p_table_id and status = 'open' for update;
  v_session := v_open.id;

  if private.session_looks_finished(v_open.id) then
    select id into v_session from public.table_sessions
    where table_id = p_table_id and status = 'waiting'::public.table_session_status
    order by opened_at limit 1;
    if v_session is null then
      insert into public.table_sessions (restaurant_id, location_id, table_id, status)
      values (v_table.restaurant_id, v_table.location_id, v_table.id, 'waiting'::public.table_session_status)
      returning id into v_session;
    end if;
  end if;

  insert into public.guest_sessions (restaurant_id, location_id, table_id, table_session_id, user_id,
                                     qr_version, locale, expires_at)
  values (v_table.restaurant_id, v_table.location_id, v_table.id, v_session, p_user_id,
          p_qr_version, p_locale, now() + interval '4 hours')
  returning id into v_guest;
  return v_guest;
end $$;

-- Orders of a waiting party never go to the kitchen by themselves: the
-- automatic acceptance in private.place_guest_order is skipped (the update
-- touches no row, so no tickets are made), and api.accept_order refuses
-- until the old bill is closed.
create function private.hold_waiting_orders() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'placed' and new.status = 'accepted' and exists (
       select 1 from public.table_sessions s
       where s.id = new.table_session_id and s.status = 'waiting'::public.table_session_status) then
    return null;
  end if;
  return new;
end $$;
create trigger orders_hold_waiting before update of status on public.orders
  for each row execute function private.hold_waiting_orders();

create or replace function api.accept_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order_not_found'; end if;
  perform private.assert_location_role(v_order.location_id, '{owner,manager,waiter}');
  if v_order.status = 'accepted' then return; end if;     -- idempotent replay
  if v_order.status <> 'placed' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_order.status::text;
  end if;
  if exists (select 1 from public.table_sessions s
             where s.id = v_order.table_session_id and s.status = 'waiting'::public.table_session_status) then
    raise exception using errcode = 'RS409', message = 'table_needs_closing';
  end if;
  update public.orders set status = 'accepted', accepted_at = now(),
         accepted_by = private.current_member_id(v_order.restaurant_id)
  where id = p_order_id;
  perform private.create_tickets(p_order_id);
end $$;

-- "Same party": the waiting guests join the open session after all.
create function api.seat_waiting_guests(p_table_session_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_waiting public.table_sessions;
  v_open uuid;
begin
  select * into v_waiting from public.table_sessions where id = p_table_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'table_session_not_found'; end if;
  perform private.assert_location_role(v_waiting.location_id, '{owner,manager,waiter}');
  select id into v_open from public.table_sessions where table_id = v_waiting.table_id and status = 'open' for update;
  if v_waiting.status = 'void' and v_open is not null then return v_open; end if;   -- replay
  if v_waiting.status <> 'waiting'::public.table_session_status then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_waiting.status::text;
  end if;
  if v_open is null then
    -- The old bill was closed meanwhile: the waiting session simply opens.
    update public.table_sessions set status = 'open' where id = v_waiting.id;
    return v_waiting.id;
  end if;
  update public.guest_sessions set table_session_id = v_open where table_session_id = v_waiting.id;
  update public.orders set table_session_id = v_open where table_session_id = v_waiting.id;
  update public.service_requests set table_session_id = v_open where table_session_id = v_waiting.id;
  update public.table_sessions set status = 'void', closed_at = now(),
         closed_by = private.current_member_id(v_waiting.restaurant_id)
  where id = v_waiting.id;
  return v_open;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Closing the table
-- -----------------------------------------------------------------------------
-- As before, plus: the session's service requests are resolved, and a party
-- waiting at the table gets the table (their orders still wait for "Accept").
create or replace function api.settle_table_session(p_table_session_id uuid, p_payments jsonb, p_idempotency_key uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.table_sessions;
  v_bill uuid;
  v_total integer;
  v_paid integer;
  v_date date;
begin
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'table_session_not_found'; end if;
  perform private.assert_location_role(v_session.location_id, '{owner,manager,waiter,cashier}');

  select id into v_bill from public.bills
  where restaurant_id = v_session.restaurant_id and idempotency_key = p_idempotency_key;
  if found then return v_bill; end if;                       -- replay
  if v_session.status <> 'open' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_session.status::text;
  end if;
  if exists (select 1 from public.orders where table_session_id = p_table_session_id and status = 'placed') then
    raise exception using errcode = 'RS422', message = 'unaccepted_orders';
  end if;
  if jsonb_typeof(p_payments) <> 'array'
     or exists (select 1 from jsonb_array_elements(p_payments) p
                where (p ->> 'method') not in ('cash', 'card_terminal') or (p ->> 'amount')::integer < 0) then
    raise exception using errcode = 'RS422', message = 'invalid_payments';
  end if;

  select coalesce(sum(oi.line_total), 0) into v_total
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.table_session_id = p_table_session_id and o.status = 'accepted';

  select coalesce(sum((p ->> 'amount')::integer), 0) into v_paid from jsonb_array_elements(p_payments) p;
  if v_paid <> v_total then
    raise exception using errcode = 'RS422', message = 'payment_mismatch',
      detail = format('total=%s paid=%s', v_total, v_paid);
  end if;

  v_date := private.business_date(v_session.location_id);
  insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status,
                            subtotal, total, idempotency_key, closed_at, closed_by)
  values (v_session.restaurant_id, v_session.location_id, v_session.id, v_date,
          private.next_number(v_session.location_id, v_date, 'bill'), 'paid', v_total, v_total,
          p_idempotency_key, now(), private.current_member_id(v_session.restaurant_id))
  returning id into v_bill;

  insert into public.bill_lines (restaurant_id, bill_id, order_item_id, quantity, amount)
  select v_session.restaurant_id, v_bill, oi.id, oi.quantity - oi.cancelled_quantity, oi.line_total
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.table_session_id = p_table_session_id and o.status = 'accepted' and oi.quantity > oi.cancelled_quantity;

  insert into public.payments (restaurant_id, location_id, bill_id, method, amount, recorded_by, confirmed_at)
  select v_session.restaurant_id, v_session.location_id, v_bill, (p ->> 'method')::public.payment_method,
         (p ->> 'amount')::integer, auth.uid(), now()
  from jsonb_array_elements(p_payments) p
  where (p ->> 'amount')::integer > 0;

  update public.orders set paid_at = now() where table_session_id = p_table_session_id and status = 'accepted';
  update public.table_sessions set status = 'closed', closed_at = now(),
         closed_by = private.current_member_id(v_session.restaurant_id)
  where id = p_table_session_id;
  update public.guest_sessions set revoked_at = now() where table_session_id = p_table_session_id and revoked_at is null;
  update public.service_requests
  set status = 'resolved', resolved_at = now(), resolved_by = private.current_member_id(v_session.restaurant_id)
  where table_id = v_session.table_id and status <> 'resolved'
    and (table_session_id = p_table_session_id or table_session_id is null);
  update public.table_sessions set status = 'open'
  where id = (select s.id from public.table_sessions s
              where s.table_id = v_session.table_id and s.status = 'waiting'::public.table_session_status
              order by s.opened_at limit 1);
  return v_bill;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges (create or replace keeps them; restated on purpose)
-- -----------------------------------------------------------------------------
revoke execute on function api.resolve_service_request(uuid) from public, anon, authenticated;
revoke execute on function api.seat_waiting_guests(uuid) from public, anon, authenticated;
revoke execute on function private.session_looks_finished(uuid) from public, anon, authenticated;
revoke execute on function private.hold_waiting_orders() from public, anon, authenticated;
revoke execute on function private.join_table(uuid, uuid, integer, public.app_locale) from public, anon, authenticated;
revoke execute on function api.accept_order(uuid) from public, anon, authenticated;
revoke execute on function api.settle_table_session(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function api.resolve_service_request(uuid) to authenticated;
grant execute on function api.seat_waiting_guests(uuid) to authenticated;
grant execute on function api.accept_order(uuid) to authenticated;
grant execute on function api.settle_table_session(uuid, jsonb, uuid) to authenticated;
grant execute on function private.join_table(uuid, uuid, integer, public.app_locale) to service_role;
