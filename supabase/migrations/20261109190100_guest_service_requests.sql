-- Task 5.2: "Call the waiter" and "Ask for the bill" from the guest's phone.
-- One open request per table and kind (service_requests_one_open): repeat
-- taps, from this phone or another one at the table, return the open request
-- instead of creating another. Waiters resolve requests in milestone 7.

create function api.guest_service_request(p_guest_session_id uuid, p_kind public.service_request_kind)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> auth.uid() or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'table_unavailable';
  end if;

  select r.id into v_id from public.service_requests r
  where r.table_id = v_table.id and r.kind = p_kind and r.status <> 'resolved';
  if found then
    return v_id;
  end if;

  if not private.rate_limit_hit('service:guest:' || v_guest.id, 10, interval '10 minutes') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  insert into public.service_requests (restaurant_id, location_id, table_id, table_session_id, guest_session_id, kind)
  values (v_guest.restaurant_id, v_guest.location_id, v_table.id, v_guest.table_session_id, v_guest.id, p_kind)
  on conflict (table_id, kind) where status <> 'resolved' do nothing
  returning id into v_id;
  if v_id is null then
    -- Another phone at the table asked at the same moment.
    select r.id into v_id from public.service_requests r
    where r.table_id = v_table.id and r.kind = p_kind and r.status <> 'resolved';
  end if;
  update public.guest_sessions set last_seen_at = now() where id = v_guest.id;
  return v_id;
end $$;

revoke execute on function api.guest_service_request(uuid, public.service_request_kind) from public, anon, authenticated;
grant execute on function api.guest_service_request(uuid, public.service_request_kind) to authenticated;
