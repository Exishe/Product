-- Waiter app (milestone 7, ADR-045): resolving calls, accepting, serving,
-- cancelling, closing the table and the stale-table guard. Runs after
-- 90-smoke-test.sql and adr038.sql and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('f7000000-0000-0000-0000-000000000001', 'owner-w@example.am', false),
  ('f7000000-0000-0000-0000-000000000002', null, true),   -- waiter tablet
  ('f7000000-0000-0000-0000-000000000003', null, true),   -- guest A (first party)
  ('f7000000-0000-0000-0000-000000000004', null, true),   -- guest B (first party, second phone)
  ('f7000000-0000-0000-0000-000000000005', null, true),   -- guest C (a new party)
  ('f7000000-0000-0000-0000-000000000006', 'manager-w@example.am', false),
  ('f7000000-0000-0000-0000-000000000007', 'owner-x@example.am', false),
  ('f7000000-0000-0000-0000-000000000008', null, true);   -- guest D

-- Café W: tolma and coffee, tables 1–3, waiters confirm orders over 5 000 ֏
select test.act_as('f7000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Մ', 'cafe-waiter', 'Main', 'Mher') as rw \gset
select id as lw from public.locations where restaurant_id = :'rw' \gset
update public.locations set max_auto_accept_total = 5000 where id = :'lw';
insert into public.menus (restaurant_id, internal_name) values (:'rw', 'Main') returning id as wmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rw', :'wmenu', :'lw');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rw', :'wmenu', 1) returning id as wcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rw', :'wcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rw', :'wcat', 3200) returning id as tolma \gset
insert into public.items (restaurant_id, category_id, price) values (:'rw', :'wcat', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'rw', :'tolma', 'hy', 'Տոլմա'), (:'rw', :'coffee', 'hy', 'Սուրճ');
insert into public.tables (restaurant_id, location_id, label) values (:'rw', :'lw', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rw', :'lw', '2') returning id as t2 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rw', :'lw', '3') returning id as t3 \gset
select api.publish_menu(:'lw') is not null as published \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
select api.table_qr_token(:'t3') as tok3 \gset
select api.create_device_pairing(:'lw', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rw', 'f7000000-0000-0000-0000-000000000006', 'manager', 'Mane');
select test.act_as('f7000000-0000-0000-0000-000000000007');
select api.create_restaurant('Cafe X', 'cafe-x-waiter', 'Main', 'Xena') is not null as rx \gset

\set three_tolma '[{"item_id": "' :tolma '", "quantity": 3}]'
\set one_tolma '[{"item_id": "' :tolma '", "quantity": 1}]'
\set one_coffee '[{"item_id": "' :coffee '", "quantity": 1}]'

-- ---------------------------------------------------------------------------
-- Calls: one tap resolves
-- ---------------------------------------------------------------------------
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok1', 'hy') as ga \gset
select api.guest_service_request(:'ga', 'call_waiter') as call1 \gset
select test.act_as('f7000000-0000-0000-0000-000000000007');
select test.fails(format('select api.resolve_service_request(%L)', :'call1'), 'forbidden', 'another café''s owner cannot resolve a call');
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.resolve_service_request(%L)', :'call1'), 'forbidden', 'nor can a guest');
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select api.resolve_service_request(:'call1') is null as r \gset
select api.resolve_service_request(:'call1') is null as r \gset
reset role;
select test.ok((select status from public.service_requests where id = :'call1') = 'resolved', 'the waiter tablet resolves a call with one tap, twice is fine');
select test.ok((select resolved_by is not null and resolved_at is not null from public.service_requests where id = :'call1'), 'and records who and when');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'lw' and event = 'service_request'
                and payload ->> 'status' = 'resolved') >= 1, 'the other screens hear about it');

-- ---------------------------------------------------------------------------
-- Full loop at table 1: a large QR order waits, the waiter accepts, the
-- kitchen cooks, the waiter serves, the table is settled by card.
-- ---------------------------------------------------------------------------
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_place_order(:'ga', 'a7000000-0000-0000-0000-000000000001', :'three_tolma'::jsonb, null) as o1 \gset
reset role;
select test.ok((select status from public.orders where id = :'o1') = 'placed', '9 600 ֏ is over the café''s limit and waits for the waiter');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1') = 0, 'nothing reaches the kitchen yet');

select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select api.accept_order(:'o1') is null as a \gset
reset role;
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1' and status = 'new') = 1, '"Accept" sends it to the kitchen');
select id as k1 from public.kitchen_tickets where order_id = :'o1' \gset

select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', :'k1', 'new', 'ready'), 'forbidden', 'a waiter cannot mark food ready');
select test.act_as('f7000000-0000-0000-0000-000000000001');
select api.set_ticket_status(:'k1', 'new', 'ready') = 'ready' as ready_ok \gset
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select api.set_ticket_status(:'k1', 'ready', 'served') = 'served' as served_ok \gset
reset role;
select test.ok((select kitchen_status from public.orders where id = :'o1') = 'served', 'the waiter marks it served');

-- Cancelling a served line needs a manager
select id as oi1 from public.order_items where order_id = :'o1' \gset
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.cancel_order_item(%L, 1, %L)', :'oi1', 'Սխալ'), 'forbidden', 'a waiter cannot cancel food already served');
select test.act_as('f7000000-0000-0000-0000-000000000006');
select api.cancel_order_item(:'oi1', 1, 'Հյուրը դժգոհ էր') is null as c \gset
reset role;
select test.ok((select total from public.orders where id = :'o1') = 6400, 'a manager can, and the order total drops to 6 400 ֏');

-- Settling: the amounts must add up, cash and card only, money never twice
select id as s1 from public.table_sessions where table_id = :'t1' and status = 'open' \gset
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_service_request(:'ga', 'bring_bill') as bill1 \gset
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.settle_table_session(%L, %L, %L)', :'s1', '[{"method": "card_terminal", "amount": 6000}]',
  'b7000000-0000-0000-0000-000000000001'), 'payment_mismatch', 'a wrong amount is refused');
select test.fails(format('select api.settle_table_session(%L, %L, %L)', :'s1', '[{"method": "idram", "amount": 6400}]',
  'b7000000-0000-0000-0000-000000000001'), 'invalid_payments', 'only cash and card in Stage 1');
select api.settle_table_session(:'s1', '[{"method": "card_terminal", "amount": 6400}]', 'b7000000-0000-0000-0000-000000000001') as bill \gset
select test.ok(api.settle_table_session(:'s1', '[{"method": "card_terminal", "amount": 6400}]', 'b7000000-0000-0000-0000-000000000001') = :'bill',
  'a repeated tap returns the same bill');
reset role;
select test.ok((select status from public.table_sessions where id = :'s1') = 'closed', 'the table is free');
select test.ok((select count(*) from public.payments where bill_id = :'bill' and method = 'card_terminal' and amount = 6400) = 1, 'one card payment of 6 400 ֏');
select test.ok((select status from public.service_requests where id = :'bill1') = 'resolved', 'the bill request is resolved with the bill');
select test.ok((select paid_at is not null from public.orders where id = :'o1'), 'the order is paid');
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'ga', 'a7000000-0000-0000-0000-000000000002', :'one_coffee'),
  'guest_session_invalid', 'the old guest session cannot order any more');

-- ---------------------------------------------------------------------------
-- Stale-table guard at table 2
-- ---------------------------------------------------------------------------
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok2', 'hy') as ga2 \gset
select api.guest_place_order(:'ga2', 'a7000000-0000-0000-0000-000000000003', :'one_tolma'::jsonb, null) as o2 \gset
reset role;
select id as s2 from public.table_sessions where table_id = :'t2' and status = 'open' \gset

-- While food is still cooking, a second phone joins the same bill.
select test.act_as('f7000000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok2', 'ru') as gb2 \gset
reset role;
select test.ok((select table_session_id from public.guest_sessions where id = :'gb2') = :'s2'::uuid, 'a phone joining a busy table joins its bill');

-- Everything served and the bill asked for: the table looks finished.
select test.act_as('f7000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'new', 'ready') is not null as moved from public.kitchen_tickets where order_id = :'o2' \gset
select api.set_ticket_status(id, 'ready', 'served') is not null as moved from public.kitchen_tickets where order_id = :'o2' \gset
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_service_request(:'ga2', 'bring_bill') is not null as asked \gset

-- A new party scans the sticker and orders a coffee.
select test.act_as('f7000000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok2', 'en') as gc2 \gset
select api.guest_place_order(:'gc2', 'a7000000-0000-0000-0000-000000000004', :'one_coffee'::jsonb, null) as o3 \gset
reset role;
select table_session_id as w2 from public.guest_sessions where id = :'gc2' \gset
select test.ok(:'w2' <> :'s2', 'a new guest at a table that looks finished does not join the old bill');
select test.ok((select status::text from public.table_sessions where id = :'w2') = 'waiting', 'they wait in a separate session');
select test.ok((select status from public.orders where id = :'o3') = 'placed', 'their small order still waits for the waiter');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o3') = 0, 'and makes no kitchen ticket');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'lw' and event = 'table'
                and payload ->> 'id' = :'w2') >= 1, 'the waiter hears about the new party');

-- The old party's phone still belongs to the old bill.
select test.act_as('f7000000-0000-0000-0000-000000000004', true);
select test.ok(api.guest_join_table(:'tok2', 'ru') = :'gb2', 'the first party''s phones keep their session');
-- A second phone of the new party joins the waiting session too.
select test.act_as('f7000000-0000-0000-0000-000000000008', true);
select api.guest_join_table(:'tok2', 'hy') as gd2 \gset
reset role;
select test.ok((select table_session_id from public.guest_sessions where id = :'gd2') = :'w2'::uuid, 'one waiting session per table');

select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.accept_order(%L)', :'o3'), 'table_needs_closing', 'the waiter must close the old bill first');
select test.fails(format('select api.settle_table_session(%L, %L, %L)', :'w2', '[]', 'b7000000-0000-0000-0000-000000000002'),
  'stale_status', 'the waiting session itself cannot be settled');

-- The waiter closes the old bill in cash; the new party gets the table.
select api.settle_table_session(:'s2', '[{"method": "cash", "amount": 3200}]', 'b7000000-0000-0000-0000-000000000003') is not null as closed2 \gset
reset role;
select test.ok((select status from public.table_sessions where id = :'w2') = 'open', 'after the old bill, the new party''s session opens');
select test.ok((select revoked_at is null from public.guest_sessions where id = :'gc2'), 'the new guest keeps ordering');
select test.ok((select revoked_at is not null from public.guest_sessions where id = :'gb2'), 'the old party''s phones are done');
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select api.accept_order(:'o3') is null as a \gset
reset role;
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o3') = 1, 'now the coffee goes to the kitchen');

-- ---------------------------------------------------------------------------
-- Idle for 45 minutes at table 3, and "it's the same party"
-- ---------------------------------------------------------------------------
select test.act_as('f7000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok3', 'hy') as ga3 \gset
select api.guest_place_order(:'ga3', 'a7000000-0000-0000-0000-000000000005', :'one_tolma'::jsonb, null) as o4 \gset
select test.act_as('f7000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'new', 'ready') is not null as moved from public.kitchen_tickets where order_id = :'o4' \gset
select api.set_ticket_status(id, 'ready', 'served') is not null as moved from public.kitchen_tickets where order_id = :'o4' \gset
reset role;
select id as s3 from public.table_sessions where table_id = :'t3' and status = 'open' \gset

select test.act_as('f7000000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok3', 'hy') as gc3 \gset
reset role;
select test.ok((select table_session_id from public.guest_sessions where id = :'gc3') = :'s3'::uuid,
  'served but recent and no bill asked: a new phone joins the same bill');

update public.orders set placed_at = now() - interval '50 minutes' where id = :'o4';
select test.act_as('f7000000-0000-0000-0000-000000000008', true);
select api.guest_join_table(:'tok3', 'hy') as gd3 \gset
select api.guest_place_order(:'gd3', 'a7000000-0000-0000-0000-000000000006', :'one_coffee'::jsonb, null) as o5 \gset
reset role;
select table_session_id as w3 from public.guest_sessions where id = :'gd3' \gset
select test.ok(:'w3' <> :'s3', 'after 45 quiet minutes a new phone waits for the waiter');

select test.act_as('f7000000-0000-0000-0000-000000000007');
select test.fails(format('select api.seat_waiting_guests(%L)', :'w3'), 'forbidden', 'another café cannot merge sessions');
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select test.ok(api.seat_waiting_guests(:'w3') = :'s3', '"Same party": the waiting guests join the open bill');
select test.ok(api.seat_waiting_guests(:'w3') = :'s3', 'a repeated tap is fine');
reset role;
select test.ok((select table_session_id from public.guest_sessions where id = :'gd3') = :'s3'::uuid, 'the phone moves to the open bill');
select test.ok((select table_session_id from public.orders where id = :'o5') = :'s3'::uuid, 'and so does its order');
select test.ok((select status from public.table_sessions where id = :'w3') = 'void', 'the waiting session is gone');
select test.act_as('f7000000-0000-0000-0000-000000000002', true);
select api.accept_order(:'o5') is null as a \gset
reset role;
select test.ok((select status from public.orders where id = :'o5') = 'accepted', 'and its order can be accepted');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'WAITER APP TESTS PASSED'
