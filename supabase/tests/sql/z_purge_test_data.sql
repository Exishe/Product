-- Daily clean-up (ADR-050): private.purge_test_cafes and private.purge_demo_activity.
-- Runs after seed.sql, so the demo café exists.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous, created_at) values
  ('c1000000-0000-0000-0000-000000000001', 'e2e-old@pativ.test', false, now() - interval '3 days'),      -- test owner, old
  ('c1000000-0000-0000-0000-000000000002', 'e2e-new@pativ.test', false, now()),                         -- test owner, recent
  ('c1000000-0000-0000-0000-000000000003', 'real-owner@example.am', false, now() - interval '3 days'),   -- real owner
  ('c1000000-0000-0000-0000-000000000004', 'e2e-lookalike@pative.test', false, now() - interval '3 days'), -- look-alike domain: NOT a test address
  ('c1000000-0000-0000-0000-000000000005', 'e2e-orphan@pativ.test', false, now() - interval '3 days'),   -- test user, no café
  ('c1000000-0000-0000-0000-000000000006', 'e2e-orphan-new@pativ.test', false, now()),                   -- test user, no café, recent
  ('c1000000-0000-0000-0000-000000000007', 'e2e-staff@pativ.test', false, now() - interval '3 days'),    -- test staff of a real café
  ('c1000000-0000-0000-0000-000000000008', null, true, now() - interval '3 days'),                       -- paired device of the old test café
  ('c1000000-0000-0000-0000-000000000009', 'someone@notpativ.test', false, now() - interval '3 days'),   -- not a test address (other domain)
  ('c1000000-0000-0000-0000-00000000000a', 'e2e-case@PATIV.TEST', false, now() - interval '3 days');     -- test owner, upper case

select test.act_as('c1000000-0000-0000-0000-000000000001');
select api.create_restaurant('Test old', 'purge-test-old', 'Main', 'Tester') as r_old \gset
select api.create_restaurant('Mixed', 'purge-mixed', 'Main', 'Tester') as r_mixed \gset
select test.act_as('c1000000-0000-0000-0000-000000000002');
select api.create_restaurant('Test new', 'purge-test-new', 'Main', 'Tester') as r_new \gset
select test.act_as('c1000000-0000-0000-0000-000000000003');
select api.create_restaurant('Real cafe', 'purge-real', 'Main', 'Owner') as r_real \gset
select test.act_as('c1000000-0000-0000-0000-000000000004');
select api.create_restaurant('Lookalike', 'purge-lookalike', 'Main', 'Owner') as r_look \gset
select test.act_as('c1000000-0000-0000-0000-00000000000a');
select api.create_restaurant('Test upper', 'purge-test-upper', 'Main', 'Tester') as r_upper \gset
reset role;

-- Mixed café: a test owner plus a real person member
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'r_mixed', 'c1000000-0000-0000-0000-000000000003', 'manager', 'Real manager');

-- A real café with a test staff member (the test user must stay: it has a membership)
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'r_real', 'c1000000-0000-0000-0000-000000000007', 'waiter', 'Test waiter');

-- A paired device in the old test café (device members do not make a café "real")
insert into public.members (restaurant_id, user_id, role, kind, display_name)
values (:'r_old', 'c1000000-0000-0000-0000-000000000008', 'kitchen', 'device', 'Kitchen tablet');

-- Data in a café: a table, a table session, a guest session, an order with an item,
-- a bill and a service request, all placed at p_when.
create function pg_temp.add_activity(p_r uuid, p_when timestamptz) returns void language plpgsql as $$
declare
  v_l uuid; v_t uuid; v_ts uuid; v_u uuid; v_gs uuid; v_o uuid;
  v_n integer := 9000 + (random() * 900)::integer;
begin
  select id into v_l from public.locations where restaurant_id = p_r limit 1;
  insert into public.tables (restaurant_id, location_id, label)
  values (p_r, v_l, 'P' || v_n) returning id into v_t;
  insert into public.table_sessions (restaurant_id, location_id, table_id, opened_at)
  values (p_r, v_l, v_t, p_when) returning id into v_ts;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into v_u;
  insert into public.guest_sessions (restaurant_id, location_id, table_id, table_session_id, user_id, qr_version, created_at, expires_at)
  values (p_r, v_l, v_t, v_ts, v_u, 1, p_when, p_when + interval '1 day') returning id into v_gs;
  insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, locale,
                             business_date, number, idempotency_key, request_hash, item_count, subtotal, total, placed_at)
  values (p_r, v_l, v_t, v_ts, v_gs, 'qr', 'hy', p_when::date, v_n, gen_random_uuid(), 'h', 1, 100, 100, p_when)
  returning id into v_o;
  insert into public.order_items (restaurant_id, order_id, name_i18n, unit_price, quantity, line_total)
  values (p_r, v_o, '{"hy": "Թեյ"}', 100, 1, 100);
  insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, idempotency_key, opened_at)
  values (p_r, v_l, v_ts, p_when::date, v_n, gen_random_uuid(), p_when);
  insert into public.service_requests (restaurant_id, location_id, table_id, table_session_id, guest_session_id, kind, created_at)
  values (p_r, v_l, v_t, v_ts, v_gs, 'call_waiter', p_when);
end $$;

select pg_temp.add_activity(r, now() - interval '3 days')
from unnest(array[:'r_old', :'r_mixed', :'r_real', :'r_look', :'r_upper']::uuid[]) r;
select pg_temp.add_activity(:'r_new', now());

-- Age the old cafés; the recent one stays fresh
update public.restaurants set created_at = now() - interval '3 days'
where id in (:'r_old', :'r_mixed', :'r_real', :'r_look', :'r_upper');

-- The demo café: old and fresh activity side by side
select id as r_demo from public.restaurants where slug = 'demo-cafe' \gset
select count(*) as demo_tables_before from public.tables where restaurant_id = :'r_demo' \gset
select count(*) as demo_items_before from public.items where restaurant_id = :'r_demo' \gset
select count(*) as demo_stations_before from public.stations where restaurant_id = :'r_demo' \gset
select pg_temp.add_activity(:'r_demo', now() - interval '3 days');
select pg_temp.add_activity(:'r_demo', now() - interval '1 hour');
update public.restaurants set created_at = now() - interval '30 days' where id = :'r_demo';

-- ---------------------------------------------------------------------------
-- Only the server may call them
-- ---------------------------------------------------------------------------
select test.act_as('c1000000-0000-0000-0000-000000000003');
select test.fails('select private.purge_test_cafes()', '%permission denied%', 'signed-in users cannot run the test-café purge');
select test.fails('select private.purge_demo_activity()', '%permission denied%', 'signed-in users cannot run the demo purge');
reset role;
set role anon;
select test.fails('select private.purge_test_cafes()', '%permission denied%', 'anon cannot run the test-café purge');
reset role;

-- ---------------------------------------------------------------------------
-- purge_test_cafes
-- ---------------------------------------------------------------------------
select private.purge_test_cafes() as purge1 \gset
select test.ok((:'purge1'::jsonb ->> 'cafes')::int = 2, 'two old test cafés (lower and upper case address) were deleted');
select test.ok(not exists (select 1 from public.restaurants where id in (:'r_old', :'r_upper')), 'the old test cafés are gone');
select test.ok(not exists (select 1 from public.orders where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.order_items where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.bills where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.table_sessions where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.guest_sessions where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.service_requests where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.members where restaurant_id in (:'r_old', :'r_upper'))
  and not exists (select 1 from public.locations where restaurant_id in (:'r_old', :'r_upper')),
  'everything that belonged to them is gone');
select test.ok(exists (select 1 from public.restaurants where id = :'r_new'), 'a recent test café stays');
select test.ok(exists (select 1 from public.restaurants where id = :'r_real'), 'a café with a real owner stays');
select test.ok(exists (select 1 from public.restaurants where id = :'r_look'), 'a look-alike address (pative.test) is not a test café');
select test.ok(exists (select 1 from public.restaurants where id = :'r_mixed'), 'a café with a test owner and a real member stays');
select test.ok(exists (select 1 from public.restaurants where slug = 'demo-cafe'), 'the demo café stays');
select test.ok((select count(*) from public.orders where restaurant_id in (:'r_real', :'r_mixed', :'r_look', :'r_new')) = 4,
  'the data of the cafés that stay is untouched');

-- Users
select test.ok(not exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-00000000000a'),
  'the upper-case test owner of a deleted café is deleted');
select test.ok(exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-000000000001'),
  'a test user who still owns the mixed café stays');
select test.ok(not exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-000000000005'), 'an old test user without a café is deleted');
select test.ok(exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-000000000006'), 'a recent test user stays');
select test.ok(exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-000000000007'), 'a test user who is staff of a real café stays');
select test.ok((select count(*) from auth.users where id in (
    'c1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000009')) = 3,
  'real users and look-alike addresses stay');
select test.ok(exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-000000000008'), 'anonymous device users are not touched');
select test.ok(exists (select 1 from public.members m join public.restaurants r on r.id = m.restaurant_id
                       where r.slug = 'demo-cafe' and m.role = 'owner'), 'the demo owner membership is still there');

-- A platform admin with a test address is never deleted
insert into auth.users (id, email, created_at) values ('c1000000-0000-0000-0000-00000000000b', 'e2e-admin@pativ.test', now() - interval '3 days');
insert into public.platform_admins (user_id) values ('c1000000-0000-0000-0000-00000000000b');
select private.purge_test_cafes();
select test.ok(exists (select 1 from auth.users where id = 'c1000000-0000-0000-0000-00000000000b'), 'a platform admin is never deleted');

-- The interval argument
select test.act_as('c1000000-0000-0000-0000-000000000002');
select api.create_restaurant('Test mid', 'purge-test-mid', 'Main', 'Tester') as r_mid \gset
reset role;
update public.restaurants set created_at = now() - interval '3 days' where id = :'r_mid';
select private.purge_test_cafes('7 days');
select test.ok(exists (select 1 from public.restaurants where id = :'r_mid'), 'a 7-day interval keeps a 3-day-old test café');
select private.purge_test_cafes('1 day');
select test.ok(not exists (select 1 from public.restaurants where id = :'r_mid'), 'the default interval removes it');

-- ---------------------------------------------------------------------------
-- purge_demo_activity
-- ---------------------------------------------------------------------------
select count(*) as demo_orders_before from public.orders where restaurant_id = :'r_demo' \gset
select test.ok(:demo_orders_before = 2, 'the demo has an old and a fresh order before the purge');
select private.purge_demo_activity() as purge2 \gset
select test.ok((:'purge2'::jsonb ->> 'orders')::int = 1, 'one old demo order is deleted');
select test.ok((select count(*) from public.orders where restaurant_id = :'r_demo') = 1, 'the fresh demo order stays');
select test.ok((select count(*) from public.order_items where restaurant_id = :'r_demo') = 1, 'items of the old demo order are gone');
select test.ok((select count(*) from public.bills where restaurant_id = :'r_demo') = 1, 'the old demo bill is gone, the fresh one stays');
select test.ok((select count(*) from public.table_sessions where restaurant_id = :'r_demo' and opened_at < now() - interval '1 day') = 0,
  'old table sessions are gone');
select test.ok((select count(*) from public.guest_sessions where restaurant_id = :'r_demo') = 1, 'the old guest session is gone, the fresh one stays');
select test.ok((select count(*) from public.service_requests where restaurant_id = :'r_demo') = 1, 'the old service request is gone, the fresh one stays');
select test.ok((select count(*) from public.tables where restaurant_id = :'r_demo') = :demo_tables_before + 2, 'demo tables stay');
select test.ok((select count(*) from public.items where restaurant_id = :'r_demo') = :demo_items_before, 'the demo menu stays');
select test.ok((select count(*) from public.stations where restaurant_id = :'r_demo') = :demo_stations_before, 'demo stations stay');
select test.ok((select count(*) from public.orders where restaurant_id in (:'r_real', :'r_new')) = 2,
  'other cafés'' orders are not touched by the demo purge');

-- The daily job is scheduled
select test.ok(exists (select 1 from cron.job where jobname = 'pativ-purge-test-data'), 'the daily purge is scheduled');
