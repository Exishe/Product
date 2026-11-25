-- api.guest_service_status (20261124200000) checked only that the guest session
-- belongs to the caller. A revoked session (the table was closed) or an expired
-- one could still read the table's waiter calls and bill requests. The same
-- guard as the other guest functions now refuses both. Nothing else changes.
create or replace function api.guest_service_status(p_guest_session_id uuid)
returns table (id uuid, kind public.service_request_kind, status public.service_request_status, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
begin
  select * into v_guest from public.guest_sessions g where g.id = p_guest_session_id;
  if not found or v_guest.user_id is distinct from auth.uid() or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return query
    select r.id, r.kind, r.status, r.resolved_at
    from public.service_requests r
    where r.table_id = v_guest.table_id
      and (r.status <> 'resolved'
           or (r.resolved_at >= now() - interval '3 minutes'
               and (r.guest_session_id = v_guest.id
                    or r.table_session_id is not distinct from v_guest.table_session_id)))
    order by r.created_at;
end $$;

revoke execute on function api.guest_service_status(uuid) from public, anon, authenticated;
grant execute on function api.guest_service_status(uuid) to authenticated;
