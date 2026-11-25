-- What a guest's page shows about waiter calls and bill requests (ADR-090).
-- The database keeps one open request per table and kind, so a second phone at
-- the table (or a guest after an earlier one) joins the open request instead
-- of creating its own. The guest could only read rows of their own session,
-- so that guest saw no confirmation at all. This function tells a guest the
-- requests of their table: every open one, and the ones answered in the last
-- three minutes. Only kind, status and time come back, nothing personal.
create function api.guest_service_status(p_guest_session_id uuid)
returns table (id uuid, kind public.service_request_kind, status public.service_request_status, resolved_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
begin
  select * into v_guest from public.guest_sessions g where g.id = p_guest_session_id;
  if not found or v_guest.user_id is distinct from auth.uid() then
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
