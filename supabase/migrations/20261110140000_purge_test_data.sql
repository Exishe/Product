-- Pilot readiness: keep the shared cloud project clean.
--
-- Every CI run creates throwaway cafés (browser tests sign up owners as
-- e2e-...@pativ.test), and the public demo café collects test orders. The same
-- project will host a real pilot café, so a daily job removes both. See ADR-050.
--
--  * private.purge_test_cafes(interval): deletes cafés older than the interval
--    whose members (people, not paired devices) ALL have an @pativ.test email
--    and that have at least one owner; everything cascades from the restaurant
--    row. Then deletes @pativ.test auth users older than the interval that are
--    in no café and are not platform admins. Never touches slug 'demo-cafe',
--    and never a café with any non-test person member.
--  * private.purge_demo_activity(interval): clears orders, bills, table sessions,
--    guest sessions and service requests of 'demo-cafe' older than the interval.
--    The demo menu, tables and stations stay.
--
-- Anonymous auth users (guests, paired devices) are not touched here.

create function private.purge_test_cafes(p_older_than interval default '1 day') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_cafes integer;
  v_users integer := 0;
  v_user uuid;
begin
  -- A test café: not the demo, old enough, has an owner, and every person
  -- member has a @pativ.test address (device members have no real email).
  with doomed as (
    delete from public.restaurants r
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
    returning r.id
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

create function private.purge_demo_activity(p_older_than interval default '1 day') returns jsonb
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
  -- Guest sessions (cascade to their push subscriptions) before table sessions.
  with d as (delete from public.guest_sessions where restaurant_id = v_r and created_at < v_cutoff returning 1)
  select count(*) into v_gsessions from d;
  with d as (delete from public.table_sessions where restaurant_id = v_r and opened_at < v_cutoff returning 1)
  select count(*) into v_tsessions from d;

  return jsonb_build_object(
    'orders', v_orders, 'bills', v_bills, 'service_requests', v_requests,
    'guest_sessions', v_gsessions, 'table_sessions', v_tsessions);
end $$;

revoke execute on function private.purge_test_cafes(interval), private.purge_demo_activity(interval)
  from public, anon, authenticated;

-- Daily at 02:40 UTC (06:40 Yerevan, before opening). pg_cron on Supabase
-- (created by 20261109200100_notification_delivery); the plain-Postgres
-- harness stub only records the schedule.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('pativ-purge-test-data', '40 2 * * *',
      $job$select private.purge_test_cafes(); select private.purge_demo_activity()$job$);
  else
    raise notice 'pg_cron is not available: pativ-purge-test-data is not scheduled';
  end if;
end $$;

-- Clear what has piled up so far.
select private.purge_test_cafes();
select private.purge_demo_activity();
