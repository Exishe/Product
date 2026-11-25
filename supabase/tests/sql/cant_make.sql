-- "Can't make" (ADR-081): the kitchen cancels one line already on a placed order
-- with the reason 'cant_make', the guest is offered similar dishes by rules, the
-- waiters are told once, and the bill stays right. Also: who may press it, who
-- may read the alternatives, and the shared cancellation core still behaving.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('cb3a0000-0000-0000-0000-000000000001', 'owner-cm-a@example.am', false),
  ('cb3a0000-0000-0000-0000-000000000002', 'owner-cm-b@example.am', false),
  ('cb3a0000-0000-0000-0000-000000000003', 'manager-cm-a@example.am', false),
  ('cb3a0000-0000-0000-0000-000000000004', null, true),   -- guest at table 1 (the order)
  ('cb3a0000-0000-0000-0000-000000000005', null, true),   -- guest at table 2 (another order)
  ('cb3a0000-0000-0000-0000-000000000006', null, true),   -- guest at table 3 (pays)
  ('cb3a0000-0000-0000-0000-000000000007', null, true),   -- guest at table 4 (partial cancel)
  ('cb3a0000-0000-0000-0000-000000000008', null, true);   -- guest at café B

select test.act_as('cb3a0000-0000-0000-0000-000000000001');
select api.create_restaurant('Cant make A', 'cm-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000002');
select api.create_restaurant('Cant make B', 'cm-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'cm-cafe-a-waiter' \gset
select user_id as u_kitchen from public.staff_logins where username = 'cm-cafe-a-kitchen' \gset
select user_id as u_kitchen_b from public.staff_logins where username = 'cm-cafe-b-kitchen' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'cb3a0000-0000-0000-0000-000000000003', 'manager', 'Manager A');
update public.locations set require_acceptance = false, max_auto_accept_total = 1000000 where id in (:'la', :'lb');

-- ---------------------------------------------------------------------------
-- Café A's menu. Section "Grill" (main): the dish that cannot be made and its
-- neighbours; "Stews" (main); "Late night" (closed now); "Drinks" (cold_drink).
-- ---------------------------------------------------------------------------
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as c_grill \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 2) returning id as c_stew \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 3) returning id as c_late \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 4) returning id as c_drink \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values
  (:'ra', :'c_grill', 'en', 'Grill'), (:'ra', :'c_stew', 'en', 'Stews'), (:'ra', :'c_late', 'en', 'Late night'), (:'ra', :'c_drink', 'en', 'Drinks');
-- "Late night" is open only in a window that does not contain now.
update public.categories c
set available_from = ((now() at time zone l.timezone)::time + interval '2 hours')::time,
    available_to = ((now() at time zone l.timezone)::time + interval '3 hours')::time
from public.locations l where l.id = :'la' and c.id = :'c_late';

insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 3000) returning id as i_main \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 2000) returning id as i_alpha \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 2100) returning id as i_bravo \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 2200) returning id as i_charlie \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1900) returning id as i_hidden \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1800) returning id as i_stop \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1700) returning id as i_out \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1600) returning id as i_onorder \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1500) returning id as i_sized \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_stew', 2600) returning id as i_stew \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_late', 2300) returning id as i_late \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_drink', 500) returning id as i_cola \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'i_main', 'en', 'Lamb ribs'), (:'ra', :'i_alpha', 'en', 'Alpha'), (:'ra', :'i_bravo', 'en', 'Bravo'),
  (:'ra', :'i_charlie', 'en', 'Charlie'), (:'ra', :'i_hidden', 'en', 'Hidden'), (:'ra', :'i_stop', 'en', 'Stopped'),
  (:'ra', :'i_out', 'en', 'Out'), (:'ra', :'i_onorder', 'en', 'On order'), (:'ra', :'i_sized', 'en', 'Sized'),
  (:'ra', :'i_stew', 'en', 'Stew'), (:'ra', :'i_late', 'en', 'Late'), (:'ra', :'i_cola', 'en', 'Cola');
update public.items set item_type = 'main' where id in (:'i_main', :'i_alpha', :'i_bravo', :'i_charlie', :'i_hidden', :'i_stop', :'i_out', :'i_onorder', :'i_sized', :'i_stew', :'i_late');
update public.items set item_type = 'cold_drink' where id = :'i_cola';
insert into public.modifier_groups (restaurant_id, min_select, max_select) values (:'ra', 1, 1) returning id as g_size \gset
insert into public.item_modifier_groups (restaurant_id, item_id, group_id) values (:'ra', :'i_sized', :'g_size');

insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '2') returning id as t2 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '3') returning id as t3 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '4') returning id as t4 \gset

-- Café B: a dish of the same section name and type that must never be offered to A.
insert into public.menus (restaurant_id, internal_name) values (:'rb', 'Main') returning id as menu_b \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rb', :'menu_b', :'lb');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rb', :'menu_b', 1) returning id as c_b \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rb', :'c_b', 'en', 'Grill');
insert into public.items (restaurant_id, category_id, price) values (:'rb', :'c_b', 1000) returning id as i_b1 \gset
insert into public.items (restaurant_id, category_id, price) values (:'rb', :'c_b', 1100) returning id as i_b2 \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rb', :'i_b1', 'en', 'B one'), (:'rb', :'i_b2', 'en', 'B two');
update public.items set item_type = 'main' where id in (:'i_b1', :'i_b2');
insert into public.tables (restaurant_id, location_id, label) values (:'rb', :'lb', '1') returning id as tb1 \gset

select test.act_as('cb3a0000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub_a \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
select api.table_qr_token(:'t3') as tok3 \gset
select api.table_qr_token(:'t4') as tok4 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000002');
select api.publish_menu(:'lb') is not null as pub_b \gset
select api.table_qr_token(:'tb1') as tokb1 \gset
reset role;

select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok2', 'en') as g2 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok3', 'en') as g3 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000007', true);
select api.guest_join_table(:'tok4', 'en') as g4 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000008', true);
select api.guest_join_table(:'tokb1', 'en') as gb \gset
reset role;

-- A chat that gets this café's alerts
insert into public.notification_channels (restaurant_id, telegram_chat_id, title, locale)
values (:'ra', 9301, 'Team', 'ru') returning id as ch \gset

-- Before the dish cannot be made: nothing is marked, and the migration's shape
select test.ok(exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'order_items' and column_name = 'cant_make_at'),
               'order lines carry cant_make_at');

-- ---------------------------------------------------------------------------
-- Orders. Table 1: 3 ribs and one "On order" dish. Popularity: Bravo twice, Alpha once.
-- ---------------------------------------------------------------------------
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', 'cb3b0000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('item_id', :'i_main', 'quantity', 3), jsonb_build_object('item_id', :'i_onorder', 'quantity', 1)), null) as o1 \gset
select test.act_as('cb3a0000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'cb3b0000-0000-0000-0000-000000000002',
  jsonb_build_array(jsonb_build_object('item_id', :'i_bravo', 'quantity', 1), jsonb_build_object('item_id', :'i_main', 'quantity', 1)), null) as o2 \gset
select api.guest_place_order(:'g2', 'cb3b0000-0000-0000-0000-000000000003',
  jsonb_build_array(jsonb_build_object('item_id', :'i_bravo', 'quantity', 1), jsonb_build_object('item_id', :'i_alpha', 'quantity', 1)), null) as o3 \gset
reset role;
select id as li_main from public.order_items where order_id = :'o1' and item_id = :'i_main' \gset
select id as li_onorder from public.order_items where order_id = :'o1' and item_id = :'i_onorder' \gset
select id as li_o2 from public.order_items where order_id = :'o2' and item_id = :'i_main' \gset
select test.ok((select status = 'accepted' and total = 3 * 3000 + 1600 from public.orders where id = :'o1'), 'the order is accepted: 3 ribs and one dish, 10 600');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1' and kind = 'order' and status = 'new') = 1, 'one ticket in the kitchen');

-- ---------------------------------------------------------------------------
-- Alternatives before anything: nothing to offer (the line is fine)
-- ---------------------------------------------------------------------------
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select test.ok(api.cant_make_alternatives(:'li_main') = '{}'::uuid[], 'a dish that can be made has no alternatives');
reset role;

-- ---------------------------------------------------------------------------
-- Who may press it
-- ---------------------------------------------------------------------------
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.cant_make_item(%L)', :'li_main'), 'forbidden', 'a guest cannot press it, not even on their own order');
select test.act_as('cb3a0000-0000-0000-0000-000000000002');
select test.fails(format('select api.cant_make_item(%L)', :'li_main'), 'forbidden', 'the owner of another café cannot');
select test.act_as(:'u_kitchen_b');
select test.fails(format('select api.cant_make_item(%L)', :'li_main'), 'forbidden', 'nor the other café''s kitchen');
select test.fails(format('select api.cant_make_item(%L)', gen_random_uuid()), 'order_item_not_found', 'an unknown line is not found');
reset role;
set role anon;
select test.fails(format('select api.cant_make_item(%L)', :'li_main'), 'permission denied%', 'anon cannot call it');
reset role;
select test.ok((select cant_make_at is null and cancelled_quantity = 0 from public.order_items where id = :'li_main'), 'none of that changed the line');

-- ---------------------------------------------------------------------------
-- A partial cancel first (the existing rule, now on the shared core), then the
-- kitchen: it takes what is left.
-- ---------------------------------------------------------------------------
select test.act_as(:'u_waiter');
select api.cancel_order_item(:'li_main', 1, 'Guest changed their mind') is null as c1 \gset
reset role;
select test.ok((select cancelled_quantity = 1 and line_total = 6000 and cant_make_at is null from public.order_items where id = :'li_main')
               and (select total = 2 * 3000 + 1600 from public.orders where id = :'o1'), 'api.cancel_order_item still cancels part of a line, with no can''t-make mark');
select test.ok(not exists (select 1 from public.notification_outbox where event = 'table.alert' and dedupe_key like 'table.alert:cant_make:%'), 'an ordinary cancellation sends no can''t-make alert');
select test.act_as(:'u_waiter');
select api.cant_make_item(:'li_main') as pressed \gset
reset role;
select test.ok((select cancelled_quantity = 3 and line_total = 0 and cant_make_at is not null and cant_make_ack_at is null from public.order_items where id = :'li_main'),
               'the whole rest of the line is cancelled, its total is zero and it is marked');
select test.ok((select total = 1600 and subtotal = 1600 and item_count = 1 and status = 'accepted' from public.orders where id = :'o1'),
               'the order total is the other dish only, and the order stays');
select test.ok((select count(*) from public.order_status_history where order_id = :'o1' and entity = 'order_item' and reason = 'cant_make' and to_status = 'cancelled:2') = 1,
               'the history keeps the reason code and the quantity');
select test.ok((select count(*) from public.order_status_history where order_id = :'o1' and entity = 'order_item' and reason = 'Guest changed their mind' and to_status = 'cancelled:1') = 1,
               'and the earlier partial cancel with its own reason');
select test.ok((select count(*) from public.kitchen_ticket_items kti join public.kitchen_tickets k on k.id = kti.ticket_id
                where k.order_id = :'o1' and k.kind = 'void' and kti.quantity = 2) = 1, 'the kitchen gets a void slip for the cancelled quantity (2)');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1' and kind = 'void') = 2, 'one void slip per cancellation (the waiter''s and the kitchen''s)');

select test.act_as(:'u_kitchen');
select test.fails(format('select api.cant_make_item(%L)', :'li_main'), 'invalid_quantity', 'pressing it again on an empty line is refused');
reset role;

-- One alert for the chat, once
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch' and event = 'table.alert' and dedupe_key like 'table.alert:cant_make:%') = 1,
               'one outbox row for the chat');
select test.ok(private.enqueue_table_alerts() = 0, 'the minute job adds nothing for it');
select payload as p_cm from public.notification_outbox where channel_id = :'ch' and dedupe_key like 'table.alert:cant_make:%' \gset
select test.ok(private.render_notification('table.alert', :'p_cm'::jsonb, 'en') = 'Table 1: the kitchen can''t make "Lamb ribs". The guest has been told; please speak to them.', 'English text names the table and the dish');
select test.ok(private.render_notification('table.alert', :'p_cm'::jsonb, 'ru') like 'Стол 1: блюдо «%» приготовить нельзя.%', 'Russian text');
select test.ok(private.render_notification('table.alert', :'p_cm'::jsonb, 'hy') like 'Սեղան 1՝ «%» ուտեստը հնարավոր չէ պատրաստել։%', 'Armenian text (the dish falls back to the Armenian name when there is none in the language)');
select test.ok(private.render_notification('table.alert', '{"reason":"slow","table":"5","minutes":30}'::jsonb, 'en') = 'Table 5: order not served for 30 min.', 'slow-table alerts still render');
select test.ok(private.render_notification('order.overdue', '{"table":"5","number":3,"minutes":25}'::jsonb, 'en') like 'Order running late%', 'so do the other messages');

-- ---------------------------------------------------------------------------
-- The waiters' list, until "Told the guest"
-- ---------------------------------------------------------------------------
select test.act_as(:'u_waiter');
select api.table_alerts(:'la') as al \gset
select test.ok(jsonb_array_length(:'al'::jsonb) = 1 and (:'al'::jsonb -> 0 ->> 'reason') = 'cant_make' and (:'al'::jsonb -> 0 ->> 'table') = '1'
               and (:'al'::jsonb -> 0 ->> 'id') = :'li_main' and (:'al'::jsonb -> 0 -> 'dish' ->> 'en') = 'Lamb ribs' and (:'al'::jsonb -> 0 ->> 'quantity') = '3',
               'the waiter list shows table 1, the dish and the quantity');
select test.act_as('cb3a0000-0000-0000-0000-000000000003');
select test.ok(jsonb_array_length(api.table_alerts(:'la')) = 1, 'a manager sees it too');
select test.act_as('cb3a0000-0000-0000-0000-000000000002');
select test.fails(format('select api.table_alerts(%L)', :'la'), 'forbidden', 'another café''s owner does not');
select test.fails(format('select api.ack_cant_make(%L)', :'li_main'), 'forbidden', 'nor can they say the guest was told');
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.ack_cant_make(%L)', :'li_main'), 'forbidden', 'a guest cannot');
select test.act_as(:'u_waiter');
select api.ack_cant_make(:'li_main') is null as acked \gset
select api.ack_cant_make(:'li_main') is null as acked2 \gset
select test.ok(api.table_alerts(:'la') = '[]'::jsonb, '"Told the guest" removes it (and may be pressed twice)');
reset role;
select test.ok((select cant_make_ack_at is not null and cant_make_at is not null from public.order_items where id = :'li_main'), 'the line keeps its mark and records the answer');

-- ---------------------------------------------------------------------------
-- Alternatives: the rules
-- ---------------------------------------------------------------------------
-- Make each rule bite: hidden, stop-listed, out by ingredient, on the order (already), required options,
-- a closed section, café B, an item not on the published menu.
update public.items set is_active = false where id = :'i_hidden';
insert into public.stop_list (restaurant_id, location_id, item_id, until, created_by) values (:'ra', :'la', :'i_stop', now() + interval '3 hours', :'u_kitchen');
select test.act_as('cb3a0000-0000-0000-0000-000000000001');
select api.save_ingredient(:'ra', null, '{"hy": "Գառ", "en": "Lamb"}'::jsonb, 'g') as lamb \gset
select api.set_item_ingredient(:'i_out', :'lamb', 200, true) is not null as r1 \gset
select api.set_ingredient_out(:'la', :'lamb', true) is not null as out_now \gset
reset role;
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'c_grill', 1000) returning id as i_new \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'ra', :'i_new', 'en', 'Newcomer');
update public.items set item_type = 'main' where id = :'i_new';

select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select api.cant_make_alternatives(:'li_main') as alts \gset
reset role;
-- Bravo (2 orders) before Alpha (1) before Charlie (0): popularity, then name. Same section first.
select test.ok(:'alts'::uuid[] = array[:'i_bravo', :'i_alpha', :'i_charlie']::uuid[], 'three dishes of the same section: the most ordered first, then by name');
select test.ok(not (:'alts'::uuid[] && array[:'i_hidden']::uuid[]), 'a hidden dish is never offered');
select test.ok(not (:'alts'::uuid[] && array[:'i_stop']::uuid[]), 'nor a stop-listed one');
select test.ok(not (:'alts'::uuid[] && array[:'i_out']::uuid[]), 'nor one an ingredient outage blocks');
select test.ok(not (:'alts'::uuid[] && array[:'i_onorder']::uuid[]), 'nor one already on the order');
select test.ok(not (:'alts'::uuid[] && array[:'i_sized']::uuid[]), 'nor one that needs a choice (one tap must be enough)');
select test.ok(not (:'alts'::uuid[] && array[:'i_late']::uuid[]), 'nor one in a section that is closed now');
select test.ok(not (:'alts'::uuid[] && array[:'i_new']::uuid[]), 'nor one that is not on the published menu yet');
select test.ok(not (:'alts'::uuid[] && array[:'i_b1', :'i_b2']::uuid[]), 'never another café''s dishes');
select test.ok(not (:'alts'::uuid[] && array[:'i_main']::uuid[]), 'and not the dish itself');

-- Fewer in the section: the same dish type from another section fills up, and only that type.
update public.items set is_active = false where id = :'i_charlie';
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select api.cant_make_alternatives(:'li_main') as alts2 \gset
reset role;
select test.ok(:'alts2'::uuid[] = array[:'i_bravo', :'i_alpha', :'i_stew']::uuid[], 'then the same dish type from another section (not a drink, not a closed section)');
update public.items set is_active = false where id in (:'i_alpha', :'i_bravo', :'i_stew');
select test.act_as(:'u_kitchen');
select test.ok(api.cant_make_alternatives(:'li_main') = '{}'::uuid[], 'nothing left: an empty list, not an error');
reset role;
update public.items set is_active = true where id in (:'i_alpha', :'i_bravo', :'i_stew');
-- The ingredient is back: the dish can be offered again
select test.act_as('cb3a0000-0000-0000-0000-000000000001');
select api.set_ingredient_out(:'la', :'lamb', false) is null as back \gset
select api.cant_make_alternatives(:'li_main') as alts3 \gset
reset role;
select test.ok(:'alts3'::uuid[] = array[:'i_bravo', :'i_alpha', :'i_out']::uuid[], 'a dish returns when its ingredient is back');

-- Who may read them
select test.act_as(:'u_waiter');
select test.ok(array_length(api.cant_make_alternatives(:'li_main'), 1) = 3, 'a waiter of the café may');
select test.act_as(:'u_kitchen');
select test.ok(array_length(api.cant_make_alternatives(:'li_main'), 1) = 3, 'and the kitchen');
select test.act_as('cb3a0000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.cant_make_alternatives(%L)', :'li_main'), 'forbidden', 'a guest of another order may not');
select test.act_as('cb3a0000-0000-0000-0000-000000000008', true);
select test.fails(format('select api.cant_make_alternatives(%L)', :'li_main'), 'forbidden', 'nor a guest of another café');
select test.act_as('cb3a0000-0000-0000-0000-000000000002');
select test.fails(format('select api.cant_make_alternatives(%L)', :'li_main'), 'forbidden', 'nor the owner of another café');
select test.fails(format('select api.cant_make_alternatives(%L)', gen_random_uuid()), 'forbidden', 'an unknown line looks the same as a forbidden one');
reset role;
set role anon;
select test.fails(format('select api.cant_make_alternatives(%L)', :'li_main'), 'permission denied%', 'anon cannot call it');
reset role;

-- ---------------------------------------------------------------------------
-- The whole order cannot be made: the order is cancelled with the same reason,
-- the guest of that order still gets alternatives
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select api.cant_make_item(:'li_o2') is null as o2_cm \gset
reset role;
select test.ok((select status = 'accepted' and total = 2100 from public.orders where id = :'o2'), 'the other dish of that order stays');
select id as li_o2b from public.order_items where order_id = :'o2' and item_id = :'i_bravo' \gset
select test.act_as(:'u_kitchen');
select api.cant_make_item(:'li_o2b') is null as o2_cm2 \gset
reset role;
select test.ok((select status = 'cancelled' and cancel_reason = 'cant_make' and total = 0 from public.orders where id = :'o2'), 'when the last line goes, the order is cancelled with the reason cant_make');
select test.act_as('cb3a0000-0000-0000-0000-000000000005', true);
select test.ok(api.cant_make_alternatives(:'li_o2b') is not null and api.cant_make_alternatives(:'li_o2') is not null, 'its guest can still ask for alternatives');
reset role;
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch' and event = 'table.alert' and dedupe_key like 'table.alert:cant_make:%') = 3, 'one outbox row per press: three in all');

-- ---------------------------------------------------------------------------
-- Served food: a manager's decision (as for any cancellation)
-- ---------------------------------------------------------------------------
select test.act_as('cb3a0000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'cb3b0000-0000-0000-0000-000000000004',
  jsonb_build_array(jsonb_build_object('item_id', :'i_main', 'quantity', 1)), null) as o4 \gset
reset role;
select id as k4 from public.kitchen_tickets where order_id = :'o4' and kind = 'order' \gset
select id as li4 from public.order_items where order_id = :'o4' \gset
select test.act_as(:'u_kitchen');
select api.set_ticket_status(:'k4', 'new', 'ready') is not null as r \gset
select api.set_ticket_status(:'k4', 'ready', 'served') is not null as s \gset
select test.fails(format('select api.cant_make_item(%L)', :'li4'), 'forbidden', 'the kitchen cannot say "can''t make" about food already served');
select test.act_as(:'u_waiter');
select test.fails(format('select api.cant_make_item(%L)', :'li4'), 'forbidden', 'nor a waiter');
select test.act_as('cb3a0000-0000-0000-0000-000000000003');
select api.cant_make_item(:'li4') is null as mgr \gset
reset role;
select test.ok((select cant_make_at is not null and line_total = 0 from public.order_items where id = :'li4'), 'a manager can');

-- ---------------------------------------------------------------------------
-- The bill: totals, paid and unpaid
-- ---------------------------------------------------------------------------
select test.act_as('cb3a0000-0000-0000-0000-000000000006', true);
select api.guest_place_order(:'g3', 'cb3b0000-0000-0000-0000-000000000005',
  jsonb_build_array(jsonb_build_object('item_id', :'i_main', 'quantity', 2), jsonb_build_object('item_id', :'i_cola', 'quantity', 1)), null) as o5 \gset
reset role;
select id as li5 from public.order_items where order_id = :'o5' and item_id = :'i_main' \gset
select id as li5b from public.order_items where order_id = :'o5' and item_id = :'i_cola' \gset
select table_session_id as ts5 from public.orders where id = :'o5' \gset
select test.act_as(:'u_kitchen');
select api.cant_make_item(:'li5') is null as c5 \gset
reset role;
select test.ok((select total = 500 and subtotal = 500 and item_count = 1 from public.orders where id = :'o5'), 'unpaid order: the total drops by the dish, 500 left');
select test.act_as(:'u_waiter');
select test.fails(format('select api.settle_table_session(%L, %L::jsonb, %L)', :'ts5', '[{"method":"cash","amount":6500}]', gen_random_uuid()),
                  'payment_mismatch', 'the old total cannot be paid any more');
select api.settle_table_session(:'ts5', '[{"method":"cash","amount":500}]'::jsonb, 'cb3b0000-0000-0000-0000-0000000000a5') as bill5 \gset
reset role;
select test.ok((select total = 500 and subtotal = 500 from public.bills where id = :'bill5')
               and (select sum(amount) from public.bill_lines where bill_id = :'bill5') = 500
               and not exists (select 1 from public.bill_lines where bill_id = :'bill5' and order_item_id = :'li5')
               and (select sum(amount) from public.payments where bill_id = :'bill5') = 500,
               'the bill, its lines (the cancelled dish is not on it) and the payments all say 500');
select test.ok((select paid_at is not null from public.orders where id = :'o5'), 'the order is paid');
select test.act_as(:'u_kitchen');
select test.fails(format('select api.cant_make_item(%L)', :'li5b'), 'order_paid', 'a paid order is refused');
reset role;
select test.ok((select cancelled_quantity = 0 and cant_make_at is null from public.order_items where id = :'li5b')
               and (select total = 500 from public.orders where id = :'o5'), 'and nothing changed on it');

-- The bill CSV reads orders.total and bills.total: both equal the sum of the lines
select test.ok((select o.total = (select coalesce(sum(line_total), 0) from public.order_items where order_id = o.id) from public.orders o where o.id = :'o1')
               and (select o.total = (select coalesce(sum(line_total), 0) from public.order_items where order_id = o.id) from public.orders o where o.id = :'o2'),
               'every order total equals the sum of its line totals after the cancellations');

-- ---------------------------------------------------------------------------
-- The shared core: the lock order of ADR-064 is in ticket_lock_order.sql; here the
-- grants. The core and the live list are private.
-- ---------------------------------------------------------------------------
select test.ok(not has_function_privilege('authenticated', 'private.cancel_order_item_core(uuid, integer, text, public.member_role[], boolean, boolean)', 'execute')
               and not has_function_privilege('anon', 'private.cancel_order_item_core(uuid, integer, text, public.member_role[], boolean, boolean)', 'execute')
               and not has_function_privilege('authenticated', 'private.cant_make_live(uuid)', 'execute'), 'the core and the live list are not callable by clients');
select test.ok(has_function_privilege('authenticated', 'api.cant_make_item(uuid)', 'execute')
               and has_function_privilege('authenticated', 'api.ack_cant_make(uuid)', 'execute')
               and has_function_privilege('authenticated', 'api.cant_make_alternatives(uuid)', 'execute')
               and not has_function_privilege('anon', 'api.cant_make_item(uuid)', 'execute')
               and not has_function_privilege('anon', 'api.ack_cant_make(uuid)', 'execute')
               and not has_function_privilege('anon', 'api.cant_make_alternatives(uuid)', 'execute'), 'the three api functions are for signed-in users only');
select test.act_as('cb3a0000-0000-0000-0000-000000000004', true);
select test.ok((select cant_make_at is not null from public.order_items where id = :'li_main'), 'the guest reads the mark on their own line');
select test.ok((select count(*) from public.order_items where order_id = :'o2') = 0, 'and not on another guest''s order');
reset role;

-- Leave no alert rows for the other test files that count outbox events
delete from public.notification_outbox where restaurant_id in (:'ra', :'rb');
