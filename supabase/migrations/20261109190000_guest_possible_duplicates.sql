-- ADR-033 (1): possible duplicates. A QR order with the same dishes as another
-- order at the same table in the last 3 minutes, from a different guest
-- session (another phone, or the waiter), waits for the waiter instead of
-- going straight to the kitchen; orders.possible_duplicate_of names the other
-- order. "Same dishes" = the same dish ids with the same total quantities.
--
-- A retry with the same idempotency key (Review focus 1) now returns the
-- original order untouched: it never re-runs the acceptance decision, so an
-- order held for the waiter can't be auto-accepted by a late retry.

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

-- Same privileges as before (create or replace keeps them; restated on purpose).
revoke execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text) to service_role;
