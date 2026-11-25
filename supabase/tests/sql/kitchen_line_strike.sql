-- Shared struck lines (ADR-086): a cook strikes a dish off a ticket in Cooking,
-- every kitchen screen sees it, the other screens are told, and a ticket that
-- leaves Cooking forgets its strikes. Also: who may strike, idempotence, the
-- answer "every wanted line is struck", cancelled lines, and the table's grants.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('5717c000-0000-0000-0000-000000000001', 'owner-ks-a@example.am', false),
  ('5717c000-0000-0000-0000-000000000002', 'owner-ks-b@example.am', false),
  ('5717c000-0000-0000-0000-000000000003', 'manager-ks-a@example.am', false),
  ('5717c000-0000-0000-0000-000000000004', null, true),   -- guest at table 1
  ('5717c000-0000-0000-0000-000000000005', null, true),   -- guest at table 2
  ('5717c000-0000-0000-0000-000000000006', null, true),   -- kitchen tablet of A (paired)
  ('5717c000-0000-0000-0000-000000000007', null, true);   -- guest at café B

select test.act_as('5717c000-0000-0000-0000-000000000001');
select api.create_restaurant('Strike A', 'ks-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('5717c000-0000-0000-0000-000000000002');
select api.create_restaurant('Strike B', 'ks-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ks-cafe-a-waiter' \gset
select user_id as u_kitchen from public.staff_logins where username = 'ks-cafe-a-kitchen' \gset
select user_id as u_kitchen_b from public.staff_logins where username = 'ks-cafe-b-kitchen' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', '5717c000-0000-0000-0000-000000000003', 'manager', 'Manager A');
update public.locations set require_acceptance = false, max_auto_accept_total = 1000000 where id in (:'la', :'lb');

-- A kitchen tablet paired the way the real ones are.
select test.act_as('5717c000-0000-0000-0000-000000000001');
select api.create_device_pairing(:'la', 'kitchen', 'Tablet') as code \gset
select test.act_as('5717c000-0000-0000-0000-000000000006', true);
select api.redeem_device_pairing(:'code') is not null as paired \gset
reset role;

-- Café A: one section, three dishes; café B: one dish.
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'Grill');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 3000) returning id as i1 \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 2000) returning id as i2 \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as i3 \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'i1', 'en', 'Ribs'), (:'ra', :'i2', 'en', 'Salad'), (:'ra', :'i3', 'en', 'Bread');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '2') returning id as t2 \gset

insert into public.menus (restaurant_id, internal_name) values (:'rb', 'Main') returning id as menu_b \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rb', :'menu_b', :'lb');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rb', :'menu_b', 1) returning id as cat_b \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rb', :'cat_b', 'en', 'Grill');
insert into public.items (restaurant_id, category_id, price) values (:'rb', :'cat_b', 1000) returning id as ib \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rb', :'ib', 'en', 'B one');
insert into public.tables (restaurant_id, location_id, label) values (:'rb', :'lb', '1') returning id as tb1 \gset

select test.act_as('5717c000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub_a \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
select test.act_as('5717c000-0000-0000-0000-000000000002');
select api.publish_menu(:'lb') is not null as pub_b \gset
select api.table_qr_token(:'tb1') as tokb1 \gset
reset role;

select test.act_as('5717c000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('5717c000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok2', 'en') as g2 \gset
select test.act_as('5717c000-0000-0000-0000-000000000007', true);
select api.guest_join_table(:'tokb1', 'en') as gb \gset

-- Table 1: ribs x2, salad, bread. Table 2: ribs. Café B: its dish.
select test.act_as('5717c000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', '5717c0de-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('item_id', :'i1', 'quantity', 2), jsonb_build_object('item_id', :'i2', 'quantity', 1),
                    jsonb_build_object('item_id', :'i3', 'quantity', 1)), null) as o1 \gset
select test.act_as('5717c000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', '5717c0de-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('item_id', :'i1', 'quantity', 1)), null) as o2 \gset
select test.act_as('5717c000-0000-0000-0000-000000000007', true);
select api.guest_place_order(:'gb', '5717c0de-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('item_id', :'ib', 'quantity', 1)), null) as ob \gset
reset role;

select id as k1 from public.kitchen_tickets where order_id = :'o1' and kind = 'order' \gset
select id as k2 from public.kitchen_tickets where order_id = :'o2' and kind = 'order' \gset
select id as kb from public.kitchen_tickets where order_id = :'ob' and kind = 'order' \gset
select id as li1 from public.order_items where order_id = :'o1' and item_id = :'i1' \gset
select id as li2 from public.order_items where order_id = :'o1' and item_id = :'i2' \gset
select id as li3 from public.order_items where order_id = :'o1' and item_id = :'i3' \gset
select id as li_o2 from public.order_items where order_id = :'o2' \gset
select id as li_b from public.order_items where order_id = :'ob' \gset

-- ---------------------------------------------------------------------------
-- Shape
-- ---------------------------------------------------------------------------
select test.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kitchen_ticket_items'
                       and column_name = 'struck_at' and data_type = 'timestamp with time zone' and is_nullable = 'YES'),
               'lines carry struck_at');
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is null) = 3, 'nothing is struck on a new ticket');
select test.ok(has_function_privilege('authenticated', 'api.set_line_struck(uuid, uuid, boolean)', 'execute')
               and not has_function_privilege('anon', 'api.set_line_struck(uuid, uuid, boolean)', 'execute'),
               'authenticated may call api.set_line_struck, anon may not');
select test.ok(not has_function_privilege('authenticated', 'private.clear_struck_lines()', 'execute'),
               'nobody calls the clearing trigger function');

-- ---------------------------------------------------------------------------
-- Only a ticket in Cooking
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), '%stale_status%', 'a ticket still in New cannot have struck lines');
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 0, 'and nothing changed');
select test.act_as(:'u_kitchen');
select api.set_ticket_status(:'k1', 'new', 'cooking') = 'cooking' as moved \gset
select api.set_ticket_status(:'k2', 'new', 'cooking') = 'cooking' as moved2 \gset
reset role;

-- ---------------------------------------------------------------------------
-- Who may
-- ---------------------------------------------------------------------------
select test.act_as('5717c000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), 'forbidden', 'a guest cannot strike, not even on their own order');
select test.act_as(:'u_waiter');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), 'forbidden', 'a waiter cannot');
select test.act_as('5717c000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), 'forbidden', 'the owner of another café cannot');
select test.act_as(:'u_kitchen_b');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), 'forbidden', 'nor the other café''s kitchen');
reset role;
set role anon;
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), 'permission denied%', 'anon cannot call it');
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 0, 'none of that struck a line');

-- ---------------------------------------------------------------------------
-- Striking: the kitchen login, a paired tablet, a manager and the owner
-- ---------------------------------------------------------------------------
select count(*) as msgs0 from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket' \gset
select updated_at as upd0 from public.kitchen_tickets where id = :'k1' \gset

select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li1', true) = false, 'striking one of three lines says the ticket is not done');
reset role;
select test.ok((select struck_at is not null from public.kitchen_ticket_items where ticket_id = :'k1' and order_item_id = :'li1')
               and (select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 1,
               'that line is struck, the others are not');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket') = :'msgs0'::int + 1,
               'the other screens are told (one ticket message on the café''s channel)');
select test.ok((select payload ->> 'status' = 'cooking' and payload ->> 'id' = :'k1'
                from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket' order by id desc limit 1),
               'and the message carries the ticket and its unchanged status');
select test.ok((select updated_at > :'upd0'::timestamptz from public.kitchen_tickets where id = :'k1'), 'the ticket''s updated_at moved');
select test.ok((select status = 'cooking' and ready_at is null from public.kitchen_tickets where id = :'k1')
               and not exists (select 1 from public.order_status_history where ticket_id = :'k1' and to_status = 'cooking' and from_status = 'cooking'),
               'its status is untouched and no history row was written for the touch');
select struck_at as s1 from public.kitchen_ticket_items where ticket_id = :'k1' and order_item_id = :'li1' \gset
select updated_at as upd1 from public.kitchen_tickets where id = :'k1' \gset

-- The same call again changes nothing and tells nobody.
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li1', true) = false, 'striking it again answers the same');
reset role;
select test.ok((select struck_at = :'s1'::timestamptz from public.kitchen_ticket_items where ticket_id = :'k1' and order_item_id = :'li1'),
               'idempotent: the time of the first strike stays');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket') = :'msgs0'::int + 1
               and (select updated_at = :'upd1'::timestamptz from public.kitchen_tickets where id = :'k1'),
               'and nothing is broadcast, updated_at stays');

-- The paired tablet strikes the second line; a manager the third: the last answer is "done".
select test.act_as('5717c000-0000-0000-0000-000000000006', true);
select test.ok(api.set_line_struck(:'k1', :'li2', true) = false, 'a paired kitchen tablet can strike');
select test.act_as('5717c000-0000-0000-0000-000000000003');
select test.ok(api.set_line_struck(:'k1', :'li3', true) = true, 'a manager can; with every line struck the answer is true');
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 3, 'all three lines are struck');
select test.act_as('5717c000-0000-0000-0000-000000000001');
select test.ok(api.set_line_struck(:'k1', :'li3', true) = true, 'the owner can too (idempotent, still done)');

-- ---------------------------------------------------------------------------
-- Taking a strike back
-- ---------------------------------------------------------------------------
reset role;
select count(*) as msgs1 from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket' \gset
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li2', false) = false, 'un-striking a line says the ticket is not done');
reset role;
select test.ok((select struck_at is null from public.kitchen_ticket_items where ticket_id = :'k1' and order_item_id = :'li2')
               and (select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 2,
               'that line is open again, the others stay struck');
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket') = :'msgs1'::int + 1,
               'and the other screens are told');
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li2', false) = false, 'un-striking again is fine');
reset role;
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la' and event = 'ticket') = :'msgs1'::int + 1,
               'and silent');

-- ---------------------------------------------------------------------------
-- Bad input and other tickets' lines
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_line_struck(%L, %L, true)', gen_random_uuid(), :'li1'), 'ticket_not_found', 'an unknown ticket is not found');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', gen_random_uuid()), 'line_not_found', 'an unknown line is not found');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li_o2'), 'line_not_found', 'a line of another ticket is not found');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li_b'), 'line_not_found', 'nor a line of another café');
select test.fails(format('select api.set_line_struck(%L, %L, null)', :'k1', :'li1'), 'invalid_argument', 'a missing true/false is refused');
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k2' and struck_at is not null) = 0, 'the other ticket stayed clean');
-- A cancellation slip is not a ticket to strike.
select test.act_as(:'u_waiter');
select api.cancel_order_item(:'li_o2', 1, 'Guest changed their mind') is null as c0 \gset
reset role;
select id as kvoid from public.kitchen_tickets where order_id = :'o2' and kind = 'void' \gset
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'kvoid', :'li_o2'), 'ticket_not_found', 'a cancellation slip cannot be struck');
reset role;

-- ---------------------------------------------------------------------------
-- A cancelled line is not wanted: the answer ignores it
-- ---------------------------------------------------------------------------
select test.act_as(:'u_waiter');
select api.cancel_order_item(:'li3', 1, 'Guest changed their mind') is null as c1 \gset
reset role;
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li2', true) = true, 'with the bread cancelled, ribs and salad struck is done');
select test.ok(api.set_line_struck(:'k1', :'li2', false) = false, 'and taking the salad back is not');
reset role;

-- ---------------------------------------------------------------------------
-- What the board reads, and what nobody writes around the api
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and order_item_id = :'li1' and struck_at is not null) = 1,
               'the kitchen reads struck_at through RLS');
select test.fails(format('update public.kitchen_ticket_items set struck_at = now() where ticket_id = %L', :'k1'), 'permission denied%',
                  'but cannot write it directly');
select test.act_as(:'u_kitchen_b');
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1') = 0, 'the other café''s kitchen reads none of it');
select test.act_as('5717c000-0000-0000-0000-000000000004', true);
select test.ok((select count(*) from public.kitchen_ticket_items) = 0, 'nor a guest');
reset role;

-- ---------------------------------------------------------------------------
-- Leaving Cooking clears the strikes; undoing "ready" starts fresh
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li2', true) = true, 'strike the salad again: done');
select api.set_ticket_status(:'k1', 'cooking', 'ready') = 'ready' as rdy \gset
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 0,
               'a ticket that went Ready has no strikes left');
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_line_struck(%L, %L, true)', :'k1', :'li1'), '%stale_status%', 'a ready ticket takes no strikes');
select api.set_ticket_status(:'k1', 'ready', 'cooking') = 'cooking' as undone \gset
reset role;
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'k1' and struck_at is not null) = 0,
               'undoing "ready" brings the ticket back with nothing struck');
select test.act_as(:'u_kitchen');
select test.ok(api.set_line_struck(:'k1', :'li1', true) = false, 'and it can be struck again');
reset role;

-- The ticket of café B was never touched by any of this.
select test.ok((select count(*) from public.kitchen_ticket_items where ticket_id = :'kb' and struck_at is not null) = 0, 'café B''s ticket stayed clean');

\echo
\echo KITCHEN LINE STRIKE TESTS PASSED
