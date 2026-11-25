-- A guest sees their table's waiter calls and bill requests (ADR-090), also
-- the open one another phone at the table created; never another table's,
-- and only their own guest session may ask.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('a5c50000-0000-0000-0000-000000000001', 'owner-gss@example.am', false),
  ('a5c50000-0000-0000-0000-000000000002', null, true),   -- first phone at table 1
  ('a5c50000-0000-0000-0000-000000000003', null, true),   -- second phone at table 1
  ('a5c50000-0000-0000-0000-000000000004', null, true);   -- a guest at table 2

select test.act_as('a5c50000-0000-0000-0000-000000000001');
select api.create_restaurant('Status Cafe', 'gss-cafe', 'Main', 'Owner') as ra \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'Drinks');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 700) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'ra', :'coffee', 'en', 'Coffee');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '2') returning id as t2 \gset
select test.act_as('a5c50000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as published \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
reset role;

select test.act_as('a5c50000-0000-0000-0000-000000000002', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('a5c50000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok1', 'en') as g2 \gset
select test.act_as('a5c50000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok2', 'en') as g3 \gset
reset role;

-- The first phone asks for the bill; the second phone's tap joins it.
select test.act_as('a5c50000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'g1', 'bring_bill', 'cash') as bill \gset
reset role;
select test.act_as('a5c50000-0000-0000-0000-000000000003', true);
select api.guest_service_request(:'g2', 'bring_bill', 'card') = :'bill' as joined \gset
select test.ok(:'joined', 'the second phone joins the open bill request');
select test.ok((select count(*) = 0 from public.service_requests where guest_session_id = :'g2'),
               'and has no row of its own (the old read showed it nothing)');
select test.ok((select count(*) = 1 from api.guest_service_status(:'g2') s where s.kind = 'bring_bill' and s.status = 'open'),
               'the second phone now sees the open bill request');
reset role;

-- Another table sees nothing of it.
select test.act_as('a5c50000-0000-0000-0000-000000000004', true);
select test.ok((select count(*) = 0 from api.guest_service_status(:'g3')), 'another table sees nothing');
-- And nobody may read through someone else's guest session.
select test.fails(format('select * from api.guest_service_status(%L)', :'g1'), 'forbidden', 'another guest session is refused');
reset role;
select test.fails(format('select * from api.guest_service_status(%L)', :'g1'), 'forbidden', 'without a session too');

-- A call the waiter answered shows for three minutes, then drops out.
select test.act_as('a5c50000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'g1', 'call_waiter') as call \gset
reset role;
update public.service_requests set status = 'resolved', resolved_at = now() - interval '1 minute' where id = :'call';
select test.act_as('a5c50000-0000-0000-0000-000000000003', true);
select test.ok((select count(*) = 1 from api.guest_service_status(:'g2') s where s.kind = 'call_waiter' and s.status = 'resolved'),
               'an answer of a minute ago is shown at the table');
reset role;
update public.service_requests set resolved_at = now() - interval '4 minutes' where id = :'call';
select test.act_as('a5c50000-0000-0000-0000-000000000003', true);
select test.ok((select count(*) = 0 from api.guest_service_status(:'g2') s where s.kind = 'call_waiter'),
               'an older answer is not');
reset role;

-- Grants
select test.ok(not has_function_privilege('anon', 'api.guest_service_status(uuid)', 'execute'), 'anon cannot execute it');
select test.ok(has_function_privilege('authenticated', 'api.guest_service_status(uuid)', 'execute'), 'authenticated can');
