-- api.set_orders_test (ADR-066): flag a range of days as test data, and undo it.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('e8000000-0000-0000-0000-000000000001', 'owner-t@example.am', false),
  ('e8000000-0000-0000-0000-000000000002', 'owner-u@example.am', false),
  ('e8000000-0000-0000-0000-000000000003', null, true);

select test.act_as('e8000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Թ', 'testflag-t', 'Main', 'Tigran') as rt \gset
select test.act_as('e8000000-0000-0000-0000-000000000002');
select api.create_restaurant('Cafe U', 'testflag-u', 'Main', 'Ulla') as ru \gset

reset role;
select id as lt from public.locations where restaurant_id = :'rt' \gset
select id as lu from public.locations where restaurant_id = :'ru' \gset
select id as owner_member from public.members where restaurant_id = :'rt' and role = 'owner' \gset
select private.business_date(:'lt') as today \gset

insert into public.orders (id, restaurant_id, location_id, created_by_member, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at)
values
  ('e8a00000-0000-0000-0000-000000000001', :'rt', :'lt', :'owner_member', 'waiter', 'takeaway', 'accepted', 'hy', :'today'::date - 10, 1, gen_random_uuid(), 'x', now() - interval '10 days'),
  ('e8a00000-0000-0000-0000-000000000002', :'rt', :'lt', :'owner_member', 'waiter', 'takeaway', 'accepted', 'hy', :'today'::date - 9, 1, gen_random_uuid(), 'x', now() - interval '9 days'),
  ('e8a00000-0000-0000-0000-000000000003', :'rt', :'lt', :'owner_member', 'waiter', 'takeaway', 'accepted', 'hy', :'today', 1, gen_random_uuid(), 'x', now());

select test.act_as('e8000000-0000-0000-0000-000000000001');
select test.ok(api.set_orders_test(:'lt', :'today'::date - 10, :'today'::date - 9, true) = 2, 'two orders in the range are flagged');
reset role;
select test.ok((select count(*) from public.orders where location_id = :'lt' and is_test) = 2, 'and only those');
select test.ok((select not is_test from public.orders where id = 'e8a00000-0000-0000-0000-000000000003'), 'today''s order stays real');
select test.ok((select count(*) from public.audit_log where location_id = :'lt' and action = 'orders.test_flag') = 1, 'the change is in the audit log');

select test.act_as('e8000000-0000-0000-0000-000000000001');
select test.ok(api.set_orders_test(:'lt', :'today'::date - 10, :'today'::date - 9, true) = 0, 'flagging again changes nothing');
select test.ok(api.set_orders_test(:'lt', :'today'::date - 10, :'today'::date - 10, false) = 1, 'a day can be put back');
reset role;
select test.ok((select count(*) from public.orders where location_id = :'lt' and is_test) = 1, 'one order is still flagged');

select test.act_as('e8000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_orders_test(%L, %L, %L, true)', :'lt', :'today'::date, :'today'::date - 1),
  'invalid_range', 'a backwards range is refused');
select test.fails(format('select api.set_orders_test(%L, %L, %L, true)', :'lt', :'today'::date - 400, :'today'::date),
  'invalid_range', 'a range over a year is refused');
select test.fails(format('select api.set_orders_test(%L, %L, %L, true)', :'lu', :'today'::date, :'today'::date),
  'forbidden', 'another café''s location is off limits');
select test.act_as('e8000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.set_orders_test(%L, %L, %L, true)', :'lt', :'today'::date, :'today'::date),
  'forbidden', 'a guest cannot flag orders');

\echo 'ORDERS TEST FLAG TESTS PASSED'
