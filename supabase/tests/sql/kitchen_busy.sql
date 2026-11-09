-- "Kitchen busy" switch (Task 6.3, ADR-033): api.set_kitchen_busy. Runs after
-- adr038.sql and uses the test.* helpers of 90-smoke-test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('a6000000-0000-0000-0000-000000000001', 'owner-k@example.am', false),
  ('a6000000-0000-0000-0000-000000000002', null, true),   -- café K's kitchen tablet
  ('a6000000-0000-0000-0000-000000000003', null, true),   -- café K's waiter tablet
  ('a6000000-0000-0000-0000-000000000004', 'manager-k@example.am', false),
  ('a6000000-0000-0000-0000-000000000005', null, true),   -- a guest
  ('a6000000-0000-0000-0000-000000000006', 'owner-l@example.am', false);

-- Café K with a published (empty) menu, a kitchen tablet and a waiter tablet
select test.act_as('a6000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Կ', 'cafe-k', 'Main', 'Karen') as rk \gset
select id as lk from public.locations where restaurant_id = :'rk' \gset
select api.publish_menu(:'lk') is not null as published \gset
select api.create_device_pairing(:'lk', 'kitchen', 'Խոհանոց') as kcode \gset
select api.create_device_pairing(:'lk', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('a6000000-0000-0000-0000-000000000002', true);
select (api.redeem_device_pairing(:'kcode') ->> 'role') = 'kitchen' as kitchen_ok \gset
select test.act_as('a6000000-0000-0000-0000-000000000003', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rk', 'a6000000-0000-0000-0000-000000000004', 'manager', 'Mane');

-- Café L, whose owner must not touch café K
select test.act_as('a6000000-0000-0000-0000-000000000006');
select api.create_restaurant('Cafe L', 'cafe-l', 'Main', 'Lilit') as rl \gset

-- The kitchen switches it on: an hour of "about 30 minutes" for guests
select test.act_as('a6000000-0000-0000-0000-000000000002', true);
select api.set_kitchen_busy(:'lk', 30) as until30 \gset
reset role;
select test.ok((select expected_wait_minutes from public.locations where id = :'lk') = 30, 'the kitchen tablet sets a 30-minute wait');
select test.ok((select kitchen_busy_until from public.locations where id = :'lk') = :'until30'::timestamptz,
  'the function returns when the notice ends');
select test.ok((select kitchen_busy_until - now() from public.locations where id = :'lk') between interval '59 minutes' and interval '61 minutes',
  'the notice ends by itself after an hour');
select test.ok((select api.public_menu('cafe-k', 'main') -> 'kitchen_busy' ->> 'expected_wait_minutes') = '30',
  'guests see the expected wait on the menu');
select test.ok((select count(*) from public.audit_log where location_id = :'lk' and action = 'kitchen.busy_on'
                and actor_user_id = 'a6000000-0000-0000-0000-000000000002') = 1, 'the switch is written to the audit log');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'lk' and event = 'location'
                and (payload ->> 'expected_wait_minutes') = '30') = 1, 'the location''s other screens hear about it');

-- The owner and a manager can change it
select test.act_as('a6000000-0000-0000-0000-000000000001');
select api.set_kitchen_busy(:'lk', 45) is not null as ok45 \gset
select test.act_as('a6000000-0000-0000-0000-000000000004');
select api.set_kitchen_busy(:'lk', 20) is not null as ok20 \gset
reset role;
select test.ok((select expected_wait_minutes from public.locations where id = :'lk') = 20, 'the owner and a manager can change the wait');

-- Only 20, 30 or 45 minutes
select test.act_as('a6000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.set_kitchen_busy(%L, 25)', :'lk'), 'invalid_minutes', 'a 25-minute wait is refused');
select test.fails(format('select api.set_kitchen_busy(%L, 0)', :'lk'), 'invalid_minutes', 'a zero wait is refused');

-- Switching off clears both columns
select api.set_kitchen_busy(:'lk', null) is null as cleared \gset
reset role;
select test.ok((select kitchen_busy_until is null and expected_wait_minutes is null from public.locations where id = :'lk'),
  'null switches the notice off');
select test.ok((select api.public_menu('cafe-k', 'main') -> 'kitchen_busy') = 'null'::jsonb, 'and guests no longer see it');
select test.ok((select count(*) from public.audit_log where location_id = :'lk' and action = 'kitchen.busy_off') = 1,
  'switching off is logged too');

-- Who may not
select test.act_as('a6000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.set_kitchen_busy(%L, 30)', :'lk'), 'forbidden', 'a waiter tablet cannot switch it');
select test.act_as('a6000000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.set_kitchen_busy(%L, 30)', :'lk'), 'forbidden', 'a guest cannot switch it');
select test.act_as('a6000000-0000-0000-0000-000000000006');
select test.fails(format('select api.set_kitchen_busy(%L, 30)', :'lk'), 'forbidden', 'another café''s owner cannot switch it');
select test.fails(format('select api.set_kitchen_busy(%L, 30)', gen_random_uuid()), 'forbidden', 'an unknown location is refused');
select test.act_as_anon();
select test.fails(format('select api.set_kitchen_busy(%L, 30)', :'lk'), 'permission denied%', 'anonymous callers cannot even call it');

-- A revoked kitchen tablet loses the switch at once
select test.act_as('a6000000-0000-0000-0000-000000000001');
select api.revoke_member((select id from public.members where user_id = 'a6000000-0000-0000-0000-000000000002'));
select test.act_as('a6000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.set_kitchen_busy(%L, 30)', :'lk'), 'forbidden', 'a disconnected kitchen tablet cannot switch it');

reset role;
select test.ok(not has_function_privilege('anon', 'api.set_kitchen_busy(uuid, integer)', 'execute'), 'anon has no execute grant');
select test.ok(has_function_privilege('authenticated', 'api.set_kitchen_busy(uuid, integer)', 'execute'), 'authenticated has the named grant');
select test.ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'api.set_kitchen_busy(uuid, integer)'::regprocedure),
  'security definer with an empty search_path');

select set_config('request.jwt.claims', '', false);
\echo 'KITCHEN BUSY TESTS PASSED'
