-- The guest says how they will pay when they ask for the bill: card or cash.
-- The waiter sees it on the floor map and the settle sheet preselects it.
-- Only for 'bring_bill'; a repeat tap updates the preference on the open
-- request; a null preference keeps the old behaviour.

alter table public.service_requests
  add column payment_preference text check (payment_preference in ('card', 'cash'));

-- The waiters' floor refetches on this event; a changed preference is news too.
drop trigger service_requests_broadcast on public.service_requests;
create trigger service_requests_broadcast after insert or update of status, payment_preference on public.service_requests
  for each row execute function private.broadcast_change();

-- A new signature (one more argument) replaces the old function, so a call
-- with two arguments cannot be ambiguous.
drop function api.guest_service_request(uuid, public.service_request_kind);

create function api.guest_service_request(
  p_guest_session_id uuid,
  p_kind public.service_request_kind,
  p_payment_preference text default null
)
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
  if p_payment_preference is not null
     and (p_kind <> 'bring_bill' or p_payment_preference not in ('card', 'cash')) then
    raise exception using errcode = '22023', message = 'invalid_payment_preference';
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
    if p_payment_preference is not null then
      update public.service_requests set payment_preference = p_payment_preference
      where id = v_id and payment_preference is distinct from p_payment_preference;
    end if;
    return v_id;
  end if;

  if not private.rate_limit_hit('service:guest:' || v_guest.id, 10, interval '10 minutes') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  insert into public.service_requests (restaurant_id, location_id, table_id, table_session_id, guest_session_id, kind, payment_preference)
  values (v_guest.restaurant_id, v_guest.location_id, v_table.id, v_guest.table_session_id, v_guest.id, p_kind, p_payment_preference)
  on conflict (table_id, kind) where status <> 'resolved' do nothing
  returning id into v_id;
  if v_id is null then
    -- Another phone at the table asked at the same moment.
    select r.id into v_id from public.service_requests r
    where r.table_id = v_table.id and r.kind = p_kind and r.status <> 'resolved';
    if p_payment_preference is not null then
      update public.service_requests set payment_preference = p_payment_preference
      where id = v_id and payment_preference is distinct from p_payment_preference;
    end if;
  end if;
  update public.guest_sessions set last_seen_at = now() where id = v_guest.id;
  return v_id;
end $$;

revoke execute on function api.guest_service_request(uuid, public.service_request_kind, text) from public, anon, authenticated;
grant execute on function api.guest_service_request(uuid, public.service_request_kind, text) to authenticated;
