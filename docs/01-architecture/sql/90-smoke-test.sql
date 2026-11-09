-- Smoke test for 10-schema.sql on a throwaway database (after 00-supabase-stubs.sql).
-- Walks the Stage 1 flow as real roles and checks tenant isolation.
-- Every check raises an exception on failure, so a clean run means all passed.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

create schema test;
grant usage on schema test to public;

create function test.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is distinct from true then raise exception 'FAILED: %', p_msg; end if;
  raise notice 'ok  %', p_msg;
end $$;

create function test.fails(p_sql text, p_like text, p_msg text) returns void language plpgsql as $$
declare v_failed boolean := false; v_err text;
begin
  begin
    execute p_sql;
  exception when others then
    v_failed := true; v_err := sqlerrm;
  end;
  if not v_failed then raise exception 'FAILED (no error): %', p_msg; end if;
  if v_err not like p_like then raise exception 'FAILED (wrong error "%"): %', v_err, p_msg; end if;
  raise notice 'ok  % [%]', p_msg, v_err;
end $$;

-- Switch identity: a signed-in user, a guest (anonymous user) or our server.
create function test.act_as(p_user uuid, p_anon boolean default false) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  perform set_config('role', 'authenticated', false);
end $$;
create function test.act_as_server() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'service_role', false);
end $$;
grant execute on all functions in schema test to public;

insert into auth.users (id, email, is_anonymous) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'owner-a@example.am', false),
  ('aaaaaaaa-0000-0000-0000-000000000002', null, false),  -- waiter tablet (device)
  ('aaaaaaaa-0000-0000-0000-000000000003', null, false),  -- kitchen screen (device)
  ('bbbbbbbb-0000-0000-0000-000000000001', 'owner-b@example.am', false),
  ('cccccccc-0000-0000-0000-000000000001', null, true),   -- guest at café A
  ('cccccccc-0000-0000-0000-000000000002', null, true);   -- another guest

-- ---------------------------------------------------------------------------
-- Owner A signs up and builds a menu
-- ---------------------------------------------------------------------------
select test.act_as('aaaaaaaa-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Ա', 'cafe-a', 'Main', 'Anna') as ra \gset
select id as la from public.locations where restaurant_id = :'ra' \gset
select test.ok((select count(*) from public.members where restaurant_id = :'ra') = 1, 'owner A is a member');

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.menu_translations (restaurant_id, menu_id, locale, name) values
  (:'ra', :'menu', 'hy', 'Ճաշացանկ'), (:'ra', :'menu', 'ru', 'Меню'), (:'ra', :'menu', 'en', 'Menu');

insert into public.prep_areas (restaurant_id, name) values (:'ra', 'Bar') returning id as bar_area \gset
insert into public.stations (restaurant_id, location_id, name) values (:'ra', :'la', 'Bar') returning id as bar_station \gset
insert into public.station_prep_areas (restaurant_id, location_id, prep_area_id, station_id)
  values (:'ra', :'la', :'bar_area', :'bar_station');

insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat_food \gset
insert into public.categories (restaurant_id, menu_id, sort, prep_area_id) values (:'ra', :'menu', 2, :'bar_area') returning id as cat_drinks \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values
  (:'ra', :'cat_food', 'hy', 'Ուտեստներ'), (:'ra', :'cat_food', 'en', 'Food'),
  (:'ra', :'cat_drinks', 'hy', 'Խմիչքներ'), (:'ra', :'cat_drinks', 'en', 'Drinks');

insert into public.items (restaurant_id, category_id, price, portion_amount, portion_unit)
  values (:'ra', :'cat_food', 3500, 300, 'g') returning id as khorovats \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat_drinks', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name, description, source) values
  (:'ra', :'khorovats', 'hy', 'Խորոված', 'Խոզի չալաղաջ', 'owner'),
  (:'ra', :'khorovats', 'ru', 'Хоровац', 'Свиная корейка', 'ai'),
  (:'ra', :'khorovats', 'en', 'Khorovats', 'Pork chops', 'ai'),
  (:'ra', :'coffee', 'hy', 'Հայկական սուրճ', null, 'owner'),
  (:'ra', :'coffee', 'en', 'Armenian coffee', null, 'owner');

insert into public.modifier_groups (restaurant_id, min_select, max_select) values (:'ra', 1, 1) returning id as sugar \gset
insert into public.modifier_group_translations (restaurant_id, group_id, locale, name) values (:'ra', :'sugar', 'hy', 'Շաքար'), (:'ra', :'sugar', 'en', 'Sugar');
insert into public.modifiers (restaurant_id, group_id, price_delta, sort) values (:'ra', :'sugar', 0, 1) returning id as no_sugar \gset
insert into public.modifiers (restaurant_id, group_id, price_delta, sort) values (:'ra', :'sugar', 100, 2) returning id as extra_sugar \gset
insert into public.modifier_translations (restaurant_id, modifier_id, locale, name) values
  (:'ra', :'no_sugar', 'hy', 'Առանց շաքարի'), (:'ra', :'no_sugar', 'en', 'No sugar'),
  (:'ra', :'extra_sugar', 'hy', 'Քաղցր'), (:'ra', :'extra_sugar', 'en', 'Sweet');
insert into public.item_modifier_groups (restaurant_id, item_id, group_id) values (:'ra', :'coffee', :'sugar');

insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '5') returning id as t5 \gset

select test.fails(format('select api.publish_menu(%L)', :'la'), '%unreviewed_ai_translations%',
  'publish refuses unreviewed AI translations');
update public.item_translations set reviewed_at = now() where restaurant_id = :'ra' and source = 'ai';
select api.publish_menu(:'la') as v1 \gset
select test.ok((select item_count from public.menu_versions where id = :'v1') = 2, 'menu v1 published with 2 items');

insert into public.notification_channels (restaurant_id, telegram_chat_id, title)
  values (:'ra', 111222333, 'Owner A') returning id as chan \gset
select test.ok((select not ('order.placed' = any (events)) from public.notification_channels where id = :'chan'),
  'a new Telegram channel gets exceptions only, not every order (ADR-040)');
-- Owner A switches on every-order alerts, so the outbox path below is exercised.
update public.notification_channels set events = events || '{order.placed}' where id = :'chan';

-- ---------------------------------------------------------------------------
-- Owner B: a second tenant that must see nothing of A
-- ---------------------------------------------------------------------------
select test.act_as('bbbbbbbb-0000-0000-0000-000000000001');
select api.create_restaurant('Cafe B', 'cafe-b', 'Main', 'Boris') as rb \gset
select test.ok((select count(*) from public.items) = 0, 'owner B sees no items of A');
select test.ok((select count(*) from public.restaurants) = 1, 'owner B sees only own restaurant');
select test.fails(format('insert into public.items (restaurant_id, category_id, price) values (%L, %L, 1)', :'ra', :'cat_food'),
  '%row-level security%', 'owner B cannot insert into A''s menu');
select test.fails(format('select api.publish_menu(%L)', :'la'), 'forbidden', 'owner B cannot publish A''s menu');

-- ---------------------------------------------------------------------------
-- Staff devices for café A (created by our server after pairing)
-- ---------------------------------------------------------------------------
reset role;
insert into public.members (restaurant_id, user_id, role, kind, display_name) values
  (:'ra', 'aaaaaaaa-0000-0000-0000-000000000002', 'waiter', 'device', 'Waiter tablet'),
  (:'ra', 'aaaaaaaa-0000-0000-0000-000000000003', 'kitchen', 'device', 'Kitchen screen');

-- ---------------------------------------------------------------------------
-- Guest scans table 5 and orders (through our server)
-- ---------------------------------------------------------------------------
select test.act_as('cccccccc-0000-0000-0000-000000000001', true);
select test.fails(format('select private.join_table(%L, %L, 1, %L)', 'cccccccc-0000-0000-0000-000000000001', :'t5', 'en'),
  '%permission denied%', 'guest cannot call server-only join_table');
select test.ok((select api.public_menu('cafe-a', 'main') -> 'menu' ->> 'version') = '1', 'guest reads public menu without staff rights');

select test.act_as_server();
select test.fails(format('select private.join_table(%L, %L, 2, %L)', 'cccccccc-0000-0000-0000-000000000001', :'t5', 'en'),
  'table_unavailable', 'old or forged QR version is refused');
select private.join_table('cccccccc-0000-0000-0000-000000000001', :'t5', 1, 'en') as g1 \gset

\set lines '[{"item_id": "' :khorovats '", "quantity": 2}, {"item_id": "' :coffee '", "quantity": 2, "modifier_ids": ["' :extra_sugar '"]}]'
select private.place_guest_order('cccccccc-0000-0000-0000-000000000001', :'g1',
  '11111111-0000-0000-0000-000000000001', :'lines'::jsonb, 'Առանց սոխի') as o1 \gset

select test.ok((select total from public.orders where id = :'o1') = 2 * 3500 + 2 * 900, 'server-side price: 2x3500 + 2x(800+100)');
select test.ok((select status from public.orders where id = :'o1') = 'accepted', 'small order auto-accepted');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1') = 2, 'one ticket per station (kitchen + bar)');
select test.ok((select station_id from public.order_items where order_id = :'o1' and item_id = :'coffee') = :'bar_station',
  'coffee routed to the bar via category prep area');
select test.ok((select name_i18n ->> 'hy' from public.order_items where order_id = :'o1' and item_id = :'khorovats') = 'Խորոված',
  'order line keeps the Armenian name for the kitchen');
select test.ok((select count(*) from public.notification_outbox where payload ->> 'order_id' = :'o1') = 1, 'Telegram message queued');
select test.ok(
  private.place_guest_order('cccccccc-0000-0000-0000-000000000001', :'g1', '11111111-0000-0000-0000-000000000001', :'lines'::jsonb, 'Առանց սոխի') = :'o1',
  'idempotent replay returns the same order');
select test.fails(format('select private.place_guest_order(%L, %L, %L, %L::jsonb)', 'cccccccc-0000-0000-0000-000000000001', :'g1',
  '11111111-0000-0000-0000-000000000001', '[{"item_id": "' || :'coffee' || '", "quantity": 1, "modifier_ids": ["' || :'no_sugar' || '"]}]'),
  'idempotency_key_reused', 'same key with a different body is refused');
select test.fails(format('select private.place_guest_order(%L, %L, gen_random_uuid(), %L::jsonb)', 'cccccccc-0000-0000-0000-000000000001', :'g1',
  '[{"item_id": "' || :'coffee' || '", "quantity": 1}]'),
  'invalid_modifiers', 'required modifier group is enforced');
select test.fails(format('select private.place_guest_order(%L, %L, gen_random_uuid(), %L::jsonb)', 'cccccccc-0000-0000-0000-000000000002', :'g1',
  '[{"item_id": "' || :'khorovats' || '", "quantity": 1}]'),
  'guest_session_invalid', 'another guest cannot use this guest session');

-- ---------------------------------------------------------------------------
-- What each identity can see
-- ---------------------------------------------------------------------------
select test.act_as('cccccccc-0000-0000-0000-000000000001', true);
select test.ok((select count(*) from public.orders) = 1, 'guest sees own order');
select test.ok((select count(*) from public.order_items) = 2, 'guest sees own order lines');
select test.ok((select count(*) from public.kitchen_tickets) = 0, 'guest sees no kitchen tickets');
select test.ok((select count(*) from public.items) = 0, 'guest cannot read menu source tables');
select test.fails(format('update public.orders set total = 1 where id = %L', :'o1'), '%permission denied%', 'guest cannot edit an order');
select set_config('realtime.topic', 'guest:' || :'g1', false);
select test.ok((select count(*) from realtime.messages where topic = 'guest:' || :'g1') > 0, 'guest can join own realtime channel');
select set_config('realtime.topic', 'loc:' || :'la', false);
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la') = 0, 'guest cannot join the staff channel');

select test.act_as('cccccccc-0000-0000-0000-000000000002', true);
select test.ok((select count(*) from public.orders) = 0, 'other guest sees nothing');

select test.act_as('bbbbbbbb-0000-0000-0000-000000000001');
select test.ok((select count(*) from public.orders) = 0, 'owner B sees no orders of A');
select set_config('realtime.topic', 'loc:' || :'la', false);
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la') = 0, 'owner B cannot join A''s staff channel');

-- ---------------------------------------------------------------------------
-- Kitchen and waiter work the tickets
-- ---------------------------------------------------------------------------
reset role;
select id as tk from public.kitchen_tickets where order_id = :'o1' and station_id <> :'bar_station' \gset
select id as tb from public.kitchen_tickets where order_id = :'o1' and station_id = :'bar_station' \gset

select test.act_as('aaaaaaaa-0000-0000-0000-000000000003');   -- kitchen screen
select set_config('realtime.topic', 'loc:' || :'la', false);
select test.ok((select count(*) from realtime.messages where topic = 'loc:' || :'la') > 0, 'kitchen joins the staff channel');
select test.ok(api.set_ticket_status(:'tk', 'new', 'cooking') = 'cooking', 'kitchen starts cooking');
select test.ok(api.set_ticket_status(:'tk', 'new', 'cooking') = 'cooking', 'offline replay of the same tap is harmless');
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', :'tb', 'cooking', 'ready'), 'stale_status', 'stale expected status is refused (409)');
select test.ok((select kitchen_status from public.orders where id = :'o1') = 'pending', 'order waits for its slowest ticket');
select api.set_ticket_status(:'tb', 'new', 'ready');
select api.set_ticket_status(:'tk', 'cooking', 'ready');
select test.ok((select kitchen_status from public.orders where id = :'o1') = 'ready', 'order is ready when all tickets are');

select test.act_as('aaaaaaaa-0000-0000-0000-000000000002');   -- waiter tablet
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', :'tk', 'ready', 'cooking'), 'forbidden', 'waiter cannot reopen cooking');
select api.set_ticket_status(:'tk', 'ready', 'served');
select api.set_ticket_status(:'tb', 'ready', 'served');
select test.ok((select public.order_display_status(o) from public.orders o where o.id = :'o1') = 'served', 'guest status: served');

-- Waiter adds a round from the tablet, then the guest changes their mind.
\set wl '[{"item_id": "' :coffee '", "quantity": 3, "modifier_ids": ["' :no_sugar '"]}]'
select api.place_waiter_order(:'t5', '22222222-0000-0000-0000-000000000001', :'wl'::jsonb) as o2 \gset
select test.ok((select table_session_id from public.orders where id = :'o2') = (select table_session_id from public.orders where id = :'o1'),
  'waiter round joins the same table session');
select id as o2_line from public.order_items where order_id = :'o2' \gset
select id as o2_ticket from public.kitchen_tickets where order_id = :'o2' \gset

select test.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select api.set_ticket_status(:'o2_ticket', 'new', 'cooking');
select test.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select api.cancel_order_item(:'o2_line', 1, 'Guest changed mind');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o2' and kind = 'void') = 1, 'cancel after cooking started creates a void ticket');
select test.ok((select total from public.orders where id = :'o2') = 2 * 800, 'order total drops to 2 coffees');

select test.act_as('aaaaaaaa-0000-0000-0000-000000000003');
select id as void_t from public.kitchen_tickets where order_id = :'o2' and kind = 'void' \gset
select api.acknowledge_void(:'void_t');
select api.set_ticket_status(:'o2_ticket', 'cooking', 'ready');
select test.act_as('aaaaaaaa-0000-0000-0000-000000000002');
select api.set_ticket_status(:'o2_ticket', 'ready', 'served');

-- ---------------------------------------------------------------------------
-- Waiter closes the table
-- ---------------------------------------------------------------------------
select table_session_id as ts from public.orders where id = :'o1' \gset
select test.fails(format('select api.settle_table_session(%L, %L::jsonb, gen_random_uuid())', :'ts', '[{"method": "cash", "amount": 1000}]'),
  'payment_mismatch', 'payments must add up to the bill');
select api.settle_table_session(:'ts', '[{"method": "cash", "amount": 5000}, {"method": "card_terminal", "amount": 5400}]'::jsonb,
  '33333333-0000-0000-0000-000000000001') as bill \gset
select test.ok((select total from public.bills where id = :'bill') = 10400, 'bill = 8800 + 1600');
select test.ok(api.settle_table_session(:'ts', '[]'::jsonb, '33333333-0000-0000-0000-000000000001') = :'bill', 'settle replay returns the same bill');

select test.act_as('cccccccc-0000-0000-0000-000000000001', true);
select test.ok((select public.order_display_status(o) from public.orders o where o.id = :'o1') = 'paid', 'guest status: paid');
select test.act_as_server();
select test.fails(format('select private.place_guest_order(%L, %L, gen_random_uuid(), %L::jsonb)', 'cccccccc-0000-0000-0000-000000000001', :'g1',
  '[{"item_id": "' || :'khorovats' || '", "quantity": 1}]'),
  'guest_session_invalid', 'closed table: old guest session cannot order');

-- ---------------------------------------------------------------------------
-- Guard rails
-- ---------------------------------------------------------------------------
reset role;
select test.fails(format('insert into public.order_items (restaurant_id, order_id, name_i18n, unit_price, quantity, line_total) values (%L, %L, %L, 1, 1, 1)',
  :'rb', :'o1', '{}'), '%foreign key%', 'a row cannot point at another tenant''s order');

select test.act_as_server();
select private.join_table('cccccccc-0000-0000-0000-000000000002', :'t5', 1, 'ru') as g2 \gset
select test.fails(format($q$
  do $d$ begin
    for i in 1..7 loop
      perform private.place_guest_order('cccccccc-0000-0000-0000-000000000002', %L, gen_random_uuid(),
        '[{"item_id": "%s", "quantity": 1}]'::jsonb);
    end loop;
  end $d$ $q$, :'g2', :'khorovats'), '%rate_limited%', 'seventh order in 10 minutes is rate limited');

reset role;
select test.ok((select count(*) from public.order_status_history where order_id = :'o1') >= 4, 'status history recorded');
\echo 'ALL SMOKE TESTS PASSED'
