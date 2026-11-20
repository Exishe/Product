-- Fix the nightly purge (ADR-050). It failed on 19 and 20 Nov with
-- "new row for relation orders violates check constraint orders_check".
--
-- Cause: purge_demo_activity deleted guest_sessions older than the cutoff while
-- a newer order of the demo café still pointed at them. orders.guest_session_id
-- is ON DELETE SET NULL, and a QR order must keep a guest session
-- (check: source <> 'qr' or guest_session_id is not null), so the delete failed.
-- Because both purges ran in one cron command (one implicit transaction), the
-- failure also rolled back the café purge and 4,000+ test cafés piled up.
--
-- Fix: sessions are deleted only when no surviving order, bill or service
-- request references them (dependants first, then sessions). The two purges
-- become two cron jobs so one cannot block the other. The café purge now
-- deletes the orders of the doomed cafés first, and handles at most 1,000
-- cafés per call, so a large backlog cannot hit a statement timeout; run it
-- again to continue.

create or replace function private.purge_test_cafes(p_older_than interval default '1 day') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_ids uuid[];
  v_cafes integer;
  v_users integer := 0;
  v_user uuid;
begin
  -- A test café: not the demo, old enough, has an owner, and every person
  -- member has a @pativ.test address (device members have no real email).
  select coalesce(array_agg(id), '{}') into v_ids from (
    select r.id
    from public.restaurants r
    where r.slug <> 'demo-cafe'
      and r.created_at < v_cutoff
      and exists (select 1 from public.members m where m.restaurant_id = r.id and m.role = 'owner')
      and not exists (
        select 1
        from public.members m
        left join auth.users u on u.id = m.user_id
        where m.restaurant_id = r.id
          and m.kind = 'person'
          and coalesce(lower(u.email), '') not like '%@pativ.test'
      )
    order by r.created_at
    limit 1000
  ) t;

  -- Orders first: deleting a guest or table session (or a table) of a café
  -- would otherwise null columns that a QR / dine-in order must keep.
  delete from public.orders where restaurant_id = any (v_ids);
  with doomed as (
    delete from public.restaurants where id = any (v_ids) returning id
  )
  select count(*) into v_cafes from doomed;

  -- Test users left without any café. A user still referenced by a surviving
  -- row without cascade (created_by, invited_by) is skipped, not an error.
  for v_user in
    select u.id from auth.users u
    where lower(u.email) like '%@pativ.test'
      and u.created_at < v_cutoff
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.platform_admins a where a.user_id = u.id)
    limit 1000
  loop
    begin
      delete from auth.users where id = v_user;
      v_users := v_users + 1;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('cafes', v_cafes, 'users', v_users);
end $$;

create or replace function private.purge_demo_activity(p_older_than interval default '1 day') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_r uuid;
  v_orders integer;
  v_bills integer;
  v_requests integer;
  v_tsessions integer;
  v_gsessions integer;
begin
  select id into v_r from public.restaurants where slug = 'demo-cafe';
  if v_r is null then
    return jsonb_build_object('orders', 0);
  end if;

  -- Orders cascade to items, kitchen tickets, status history and their bill lines.
  with d as (delete from public.orders where restaurant_id = v_r and placed_at < v_cutoff returning 1)
  select count(*) into v_orders from d;
  -- Bills cascade to bill lines, payments and discounts.
  with d as (delete from public.bills where restaurant_id = v_r and opened_at < v_cutoff returning 1)
  select count(*) into v_bills from d;
  with d as (delete from public.service_requests where restaurant_id = v_r and created_at < v_cutoff returning 1)
  select count(*) into v_requests from d;
  -- Sessions last, and only those nothing newer still points at: a QR order
  -- must keep its guest session, so a recent order keeps its old session alive.
  with d as (
    delete from public.guest_sessions g
    where g.restaurant_id = v_r and g.created_at < v_cutoff
      and not exists (select 1 from public.orders o where o.restaurant_id = v_r and o.guest_session_id = g.id)
      and not exists (select 1 from public.service_requests s where s.restaurant_id = v_r and s.guest_session_id = g.id)
    returning 1)
  select count(*) into v_gsessions from d;
  with d as (
    delete from public.table_sessions t
    where t.restaurant_id = v_r and t.opened_at < v_cutoff
      and not exists (select 1 from public.orders o where o.restaurant_id = v_r and o.table_session_id = t.id)
      and not exists (select 1 from public.bills b where b.restaurant_id = v_r and b.table_session_id = t.id)
      and not exists (select 1 from public.service_requests s where s.restaurant_id = v_r and s.table_session_id = t.id)
      and not exists (select 1 from public.guest_sessions g where g.restaurant_id = v_r and g.table_session_id = t.id)
    returning 1)
  select count(*) into v_tsessions from d;

  return jsonb_build_object(
    'orders', v_orders, 'bills', v_bills, 'service_requests', v_requests,
    'guest_sessions', v_gsessions, 'table_sessions', v_tsessions);
end $$;

revoke execute on function private.purge_test_cafes(interval), private.purge_demo_activity(interval)
  from public, anon, authenticated;

-- Two jobs instead of one command. Staggered five minutes apart, 02:40 and 02:45 UTC.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-purge-test-data') then
      perform cron.unschedule('pativ-purge-test-data');
    end if;
    perform cron.schedule('pativ-purge-test-cafes', '40 2 * * *', $job$select private.purge_test_cafes()$job$);
    perform cron.schedule('pativ-purge-demo-activity', '45 2 * * *', $job$select private.purge_demo_activity()$job$);
  else
    raise notice 'pg_cron is not available: the purge jobs are not scheduled';
  end if;
end $$;
