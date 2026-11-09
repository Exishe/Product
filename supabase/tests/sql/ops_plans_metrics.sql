-- ADR-033 (operations), ADR-036 (plans) and ADR-037 (metrics): new columns
-- and the functions around them. Runs after adr038.sql and reuses café D.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
select id as rd from public.restaurants where slug = 'cafe-d' \gset
select id as ld from public.locations where restaurant_id = :'rd' \gset
select id as tolma from public.items where restaurant_id = :'rd' limit 1 \gset
select id as t8 from public.tables where restaurant_id = :'rd' and label = '8' \gset
insert into auth.users (id, email, is_anonymous) values
  ('f0000000-0000-0000-0000-000000000001', null, true),   -- a guest
  ('f0000000-0000-0000-0000-000000000002', null, true),   -- café D's new kitchen tablet
  ('f0000000-0000-0000-0000-000000000003', 'owner-g@example.am', false);

-- ---------------------------------------------------------------------------
-- Plans (ADR-036)
-- ---------------------------------------------------------------------------
select test.act_as('f0000000-0000-0000-0000-000000000003');
select api.create_restaurant('Cafe G', 'cafe-g', 'Main', 'Gor') as rg \gset
reset role;
select test.ok((select plan from public.subscriptions where restaurant_id = :'rg') = 'service', 'a new café starts on the Service plan');
select test.ok((select status from public.subscriptions where restaurant_id = :'rg') = 'trialing', 'in its free month');
select test.ok((select trial_ends_at::date from public.subscriptions where restaurant_id = :'rg') = (now() + interval '30 days')::date,
  'the free month lasts 30 days');
select test.ok((select count(*) from public.subscriptions where plan not in ('menu', 'service')) = 0, 'old plan names are migrated');
select test.fails(format('update public.subscriptions set plan = %L where restaurant_id = %L', 'gold', :'rg'),
  '%subscriptions_plan_check%', 'only menu and service plans exist');

select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.table_qr_token(:'t8') as tok8 \gset
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select api.guest_join_table(:'tok8', 'hy') as gs \gset
\set flines '[{"item_id": "' :tolma '", "quantity": 1}]'

reset role;
update public.subscriptions set plan = 'menu' where location_id = :'ld';
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select test.fails(format('select api.guest_place_order(%L, gen_random_uuid(), %L::jsonb, null)', :'gs', :'flines'),
  'plan_required', 'a Menu-plan café takes no orders');

reset role;
update public.subscriptions set plan = 'service', status = 'trialing', trial_ends_at = now() - interval '1 day' where location_id = :'ld';
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select test.fails(format('select api.guest_place_order(%L, gen_random_uuid(), %L::jsonb, null)', :'gs', :'flines'),
  'plan_required', 'an expired free month takes no orders');

reset role;
update public.subscriptions set status = 'past_due', current_period_end = now() - interval '3 days' where location_id = :'ld';
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select api.guest_place_order(:'gs', gen_random_uuid(), :'flines'::jsonb, null) as ford \gset
select test.ok(:'ford' is not null, 'a café 3 days past due still takes orders');

reset role;
update public.subscriptions set current_period_end = now() - interval '8 days' where location_id = :'ld';
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select test.fails(format('select api.guest_place_order(%L, gen_random_uuid(), %L::jsonb, null)', :'gs', :'flines'),
  'plan_required', 'more than 7 days past due takes no orders');

reset role;
update public.subscriptions set status = 'active', current_period_end = now() + interval '30 days' where location_id = :'ld';
select test.ok((select is_test from public.orders where id = :'ford') = false, 'orders are real unless marked as tests');

-- ---------------------------------------------------------------------------
-- Kitchen first-seen and device heartbeat (ADR-037, ADR-033)
-- ---------------------------------------------------------------------------
select test.act_as((select user_id from public.members where restaurant_id = :'rd' and role = 'owner'));
select api.create_device_pairing(:'ld', 'kitchen', 'Խոհանոց 2') as code \gset
select test.act_as('f0000000-0000-0000-0000-000000000002', true);
select api.redeem_device_pairing(:'code') ->> 'member_id' as kmember \gset
select id as tk from public.kitchen_tickets where order_id = :'ford' limit 1 \gset
select api.mark_tickets_seen(array[:'tk']::uuid[]);
reset role;
select first_seen_at as seen1 from public.kitchen_tickets where id = :'tk' \gset
select test.ok(:'seen1' <> '', 'the kitchen screen records when it first drew the ticket');
select pg_sleep(0.01);
select test.act_as('f0000000-0000-0000-0000-000000000002', true);
select api.mark_tickets_seen(array[:'tk']::uuid[]);
reset role;
select test.ok((select first_seen_at from public.kitchen_tickets where id = :'tk') = :'seen1'::timestamptz, 'a second report keeps the first time');

select test.act_as('f0000000-0000-0000-0000-000000000002', true);
select api.heartbeat();
reset role;
select test.ok((select last_seen_at is not null from public.members where id = :'kmember'), 'a device heartbeat is recorded');
select test.act_as('f0000000-0000-0000-0000-000000000001', true);
select test.fails('select api.heartbeat()', 'forbidden', 'a guest has no heartbeat');

-- another café's device can't mark café D's tickets
select test.act_as('f0000000-0000-0000-0000-000000000003');
select api.create_device_pairing((select id from public.locations where restaurant_id = :'rg'), 'kitchen', 'G') as gcode \gset
reset role;
insert into auth.users (id, is_anonymous) values ('f0000000-0000-0000-0000-000000000004', true);
select test.act_as('f0000000-0000-0000-0000-000000000004', true);
select api.redeem_device_pairing(:'gcode') is not null as ok \gset
reset role;
update public.kitchen_tickets set first_seen_at = null where id = :'tk';
select test.act_as('f0000000-0000-0000-0000-000000000004', true);
select api.mark_tickets_seen(array[:'tk']::uuid[]);
reset role;
select test.ok((select first_seen_at is null from public.kitchen_tickets where id = :'tk'), 'another café''s screen cannot mark our tickets');

-- ---------------------------------------------------------------------------
-- Kitchen busy (ADR-033)
-- ---------------------------------------------------------------------------
select test.fails(format('update public.locations set expected_wait_minutes = 25 where id = %L', :'ld'),
  '%expected_wait_minutes%', 'the expected wait is 20, 30 or 45 minutes');
update public.locations set kitchen_busy_until = now() + interval '1 hour', expected_wait_minutes = 30 where id = :'ld';
select test.ok((select api.public_menu('cafe-d', 'main') -> 'kitchen_busy' ->> 'expected_wait_minutes') = '30',
  'guests see the expected wait while the kitchen is busy');
update public.locations set kitchen_busy_until = now() - interval '1 minute' where id = :'ld';
select test.ok((select api.public_menu('cafe-d', 'main') -> 'kitchen_busy') = 'null'::jsonb, 'the busy notice ends by itself');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'OPS, PLANS AND METRICS TESTS PASSED'
