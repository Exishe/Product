-- Guest ordering rules added in milestone 5: possible duplicates (ADR-033)
-- and service requests from the guest's phone. Runs after 90-smoke-test.sql
-- and adr038.sql and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('e0000000-0000-0000-0000-000000000001', 'owner-g@example.am', false),
  ('e0000000-0000-0000-0000-000000000002', null, true),   -- guest A's phone
  ('e0000000-0000-0000-0000-000000000003', null, true),   -- guest B's phone, same table
  ('e0000000-0000-0000-0000-000000000004', null, true);   -- guest C's phone

-- Café G: tolma and coffee, tables 3, 4 and 5, published menu
select test.act_as('e0000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Հյուր', 'cafe-guest', 'Main', 'Gor') as rg \gset
select id as lg from public.locations where restaurant_id = :'rg' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rg', 'Main') returning id as gmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rg', :'gmenu', :'lg');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rg', :'gmenu', 1) returning id as gcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rg', :'gcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rg', :'gcat', 3200) returning id as tolma \gset
insert into public.items (restaurant_id, category_id, price) values (:'rg', :'gcat', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'rg', :'tolma', 'hy', 'Տոլմա'), (:'rg', :'coffee', 'hy', 'Սուրճ');
insert into public.tables (restaurant_id, location_id, label) values (:'rg', :'lg', '3') returning id as t3 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rg', :'lg', '4') returning id as t4 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rg', :'lg', '5') returning id as t5 \gset
select api.publish_menu(:'lg') as gv1 \gset
select api.table_qr_token(:'t3') as tok3 \gset
select api.table_qr_token(:'t4') as tok4 \gset
select api.table_qr_token(:'t5') as tok5 \gset

\set two_tolma '[{"item_id": "' :tolma '", "quantity": 2}]'
\set split_tolma '[{"item_id": "' :tolma '", "quantity": 1, "note": "առանց սոխի"}, {"item_id": "' :tolma '", "quantity": 1}]'
\set one_coffee '[{"item_id": "' :coffee '", "quantity": 1}]'

-- ---------------------------------------------------------------------------
-- Possible duplicates
-- ---------------------------------------------------------------------------
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select api.guest_join_table(:'tok3', 'hy') as ga \gset
select api.guest_place_order(:'ga', 'aaaa0000-0000-0000-0000-000000000001', :'two_tolma'::jsonb, null) as oa \gset
select test.ok((select status from public.orders where id = :'oa') = 'accepted', 'the first order of two tolmas goes to the kitchen');
select test.ok((select possible_duplicate_of from public.orders where id = :'oa') is null, 'and is not a duplicate of anything');

select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok3', 'ru') as gb \gset
-- The same dishes split over two lines (one with a note) are still the same dishes.
select api.guest_place_order(:'gb', 'bbbb0000-0000-0000-0000-000000000001', :'split_tolma'::jsonb, null) as ob \gset
select test.ok((select status from public.orders where id = :'ob') = 'placed', 'two tolmas from another phone at the table within 3 minutes wait for the waiter');
select test.ok((select possible_duplicate_of from public.orders where id = :'ob') = :'oa'::uuid, 'the order names the order it may duplicate');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'ob') = 0, 'a possible duplicate makes no kitchen ticket yet');
select test.ok((select public.order_display_status(o) from public.orders o where o.id = :'ob') = 'received', 'the guest sees it as received');

select api.guest_place_order(:'gb', 'bbbb0000-0000-0000-0000-000000000002', :'one_coffee'::jsonb, null) as ob2 \gset
select test.ok((select status from public.orders where id = :'ob2') = 'accepted', 'different dishes from the same phone go straight through');

-- A late retry of the held order must not slip it into the kitchen.
reset role;
update public.orders set placed_at = now() - interval '10 minutes' where id = :'oa';
select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select test.ok(api.guest_place_order(:'gb', 'bbbb0000-0000-0000-0000-000000000001', :'split_tolma'::jsonb, null) = :'ob',
  'a retry with the same key returns the same order');
select test.ok((select status from public.orders where id = :'ob') = 'placed', 'and leaves it waiting for the waiter');
select test.ok((select count(*) from public.orders where idempotency_key = 'bbbb0000-0000-0000-0000-000000000001') = 1, 'one order per key');

-- More than 3 minutes later the same dishes are a new round.
reset role;
update public.orders set placed_at = now() - interval '4 minutes' where table_id = :'t3';
select test.act_as('e0000000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok3', 'en') as gc \gset
select api.guest_place_order(:'gc', 'cccc0000-0000-0000-0000-000000000001', :'two_tolma'::jsonb, null) as oc \gset
select test.ok((select status from public.orders where id = :'oc') = 'accepted', 'the same dishes after 3 minutes are a new round');
select test.ok((select possible_duplicate_of from public.orders where id = :'oc') is null, 'and are not flagged');

-- The same phone ordering the same again is a second round, not a duplicate.
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select api.guest_join_table(:'tok4', 'hy') as ga4 \gset
select api.guest_place_order(:'ga4', 'aaaa0000-0000-0000-0000-000000000004', :'one_coffee'::jsonb, null) as oa4 \gset
select api.guest_place_order(:'ga4', 'aaaa0000-0000-0000-0000-000000000005', :'one_coffee'::jsonb, null) as oa5 \gset
select test.ok((select status from public.orders where id = :'oa5') = 'accepted', 'a second identical round from the same phone is accepted');

-- A rejected order doesn't count, and neither does another table.
reset role;
update public.orders set status = 'rejected', rejected_at = now() where id = :'oa4';
select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok5', 'hy') as gb5 \gset
select api.guest_place_order(:'gb5', 'bbbb0000-0000-0000-0000-000000000005', :'one_coffee'::jsonb, null) as ob5 \gset
select test.ok((select status from public.orders where id = :'ob5') = 'accepted', 'an order at another table is never a duplicate');

-- A waiter's order of the same dishes counts too (the guest also told the waiter).
select test.act_as('e0000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'t5', 'dddd0000-0000-0000-0000-000000000001', :'two_tolma'::jsonb) as ow \gset
select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select api.guest_place_order(:'gb5', 'bbbb0000-0000-0000-0000-000000000006', :'two_tolma'::jsonb, null) as ob6 \gset
select test.ok((select possible_duplicate_of from public.orders where id = :'ob6') = :'ow'::uuid, 'the same dishes as the waiter just ordered wait too');

-- ---------------------------------------------------------------------------
-- Calling the waiter and asking for the bill
-- ---------------------------------------------------------------------------
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'ga', 'call_waiter') as r1 \gset
select test.ok(api.guest_service_request(:'ga', 'call_waiter') = :'r1', 'a second tap returns the same request');
select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select test.ok(api.guest_service_request(:'gb', 'call_waiter') = :'r1', 'another phone at the table joins the open request');
reset role;
select test.ok((select count(*) from public.service_requests where table_id = :'t3' and kind = 'call_waiter') = 1, 'one open call per table');
select test.ok((select guest_session_id from public.service_requests where id = :'r1') = :'ga'::uuid, 'the request remembers who called');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'lg' and event = 'service_request') >= 1, 'the waiters hear about it');
select test.ok((select count(*) from realtime.messages where topic = 'guest:' || :'ga' and event = 'service_request') >= 1, 'the guest''s phone hears about it');

select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'ga', 'bring_bill') as r2 \gset
select test.ok(:'r2' <> :'r1', 'asking for the bill is a separate request');
select test.ok((select count(*) from public.service_requests where id in (:'r1', :'r2')) = 2, 'the guest reads their own requests');

-- Card or cash with the bill (20261110120000_bill_payment_preference).
select test.ok((select payment_preference from public.service_requests where id = :'r2') is null, 'no preference given: none stored');
select test.ok(api.guest_service_request(:'ga', 'bring_bill', 'card') = :'r2', 'choosing card returns the open bill request');
select test.ok((select payment_preference from public.service_requests where id = :'r2') = 'card', 'the open request now says card');
select test.act_as('e0000000-0000-0000-0000-000000000003', true);
select test.ok(api.guest_service_request(:'gb', 'bring_bill', 'cash') = :'r2', 'another phone changes it to cash on the same request');
select test.ok(api.guest_service_request(:'gb', 'bring_bill') = :'r2', 'a tap without a preference keeps the old behaviour');
reset role;
select test.ok((select payment_preference from public.service_requests where id = :'r2') = 'cash', 'cash stays after a plain tap');
select test.ok((select count(*) from public.service_requests where table_id = :'t3' and kind = 'bring_bill' and status <> 'resolved') = 1, 'still one open bill request');
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.guest_service_request(%L, %L, %L)', :'ga', 'bring_bill', 'bitcoin'), 'invalid_payment_preference',
  'only card or cash');
select test.fails(format('select api.guest_service_request(%L, %L, %L)', :'ga', 'call_waiter', 'card'), 'invalid_payment_preference',
  'a preference belongs to the bill only');
select test.ok(not exists (
  select 1 from information_schema.routine_privileges
  where specific_schema = 'api' and routine_name = 'guest_service_request' and grantee in ('anon', 'PUBLIC')),
  'the new signature is not callable by anon or public');
select test.ok((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'api' and p.proname = 'guest_service_request') = 1,
  'one guest_service_request, no ambiguous overload');

reset role;
update public.service_requests set status = 'resolved', resolved_at = now() where id = :'r1';
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select test.ok(api.guest_service_request(:'ga', 'call_waiter') <> :'r1', 'after the waiter came, a new call is a new request');

select test.fails(format('select api.guest_service_request(%L, %L)', :'gb', 'call_waiter'), 'guest_session_invalid',
  'a guest cannot call with someone else''s session');
select test.act_as_anon();
select test.fails(format('select api.guest_service_request(%L, %L)', :'ga', 'call_waiter'), '%permission denied%',
  'nobody signed out can call');
select test.act_as('e0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.guest_service_request(%L, %L)', :'ga', 'call_waiter'), 'guest_session_invalid',
  'the owner cannot use a guest''s session either');

-- A reprinted table and a closed table end the guest's calls.
update public.tables set qr_version = qr_version + 1 where id = :'t4';
select test.act_as('e0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.guest_service_request(%L, %L)', :'ga4', 'call_waiter'), 'table_unavailable',
  'an old sticker''s session cannot call');
reset role;
update public.guest_sessions set revoked_at = now() where id = :'gc';
select test.act_as('e0000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.guest_service_request(%L, %L)', :'gc', 'bring_bill'), 'guest_session_invalid',
  'a closed table''s session cannot call');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'GUEST ORDERING TESTS PASSED'
