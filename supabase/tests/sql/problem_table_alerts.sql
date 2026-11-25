-- Problem tables (ADR-071): slow orders and repeated waiter calls, the café's
-- own limits, who may change them, the live list and one outbox row per alert.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('ab1a0000-0000-0000-0000-000000000001', 'owner-ad-a@example.am', false),
  ('ab1a0000-0000-0000-0000-000000000002', 'owner-ad-b@example.am', false),
  ('ab1a0000-0000-0000-0000-000000000003', 'manager-ad-a@example.am', false),
  ('ab1a0000-0000-0000-0000-000000000004', null, true),   -- guest at table 1
  ('ab1a0000-0000-0000-0000-000000000005', null, true),   -- guest at table 2
  ('ab1a0000-0000-0000-0000-000000000006', null, true);   -- guest at table 3

select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select api.create_restaurant('Alerts A', 'ad-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('ab1a0000-0000-0000-0000-000000000002');
select api.create_restaurant('Alerts B', 'ad-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ad-cafe-a-waiter' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'ab1a0000-0000-0000-0000-000000000003', 'manager', 'Manager A');
update public.locations set require_acceptance = false, max_auto_accept_total = 100000 where id = :'la';

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'Drinks');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 700) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'ra', :'coffee', 'en', 'Coffee');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '2') returning id as t2 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '3') returning id as t3 \gset
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as published \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
select api.table_qr_token(:'t3') as tok3 \gset
reset role;

select test.act_as('ab1a0000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('ab1a0000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok2', 'en') as g2 \gset
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok3', 'en') as g3 \gset
reset role;

-- A chat that gets this café's alerts
insert into public.notification_channels (restaurant_id, telegram_chat_id, title, locale)
values (:'ra', 9001, 'Team', 'ru') returning id as ch \gset
select test.ok((select 'table.alert' = any (events) from public.notification_channels where id = :'ch'), 'new chats get problem-table alerts by default');

\set line '[{"item_id": "' :coffee '", "quantity": 1}]'

-- Earlier test files leave open orders at fixed hours of the day (06:15, 08:05 ...).
-- Whether those count as "slow" depends on the clock (they only fall inside the
-- 6-hour window in the morning), and private.enqueue_table_alerts() looks at every
-- café. Close them so this file only sees its own fixtures at any time of day.
update public.orders set kitchen_status = 'served'
where restaurant_id <> :'ra' and status = 'accepted' and kitchen_status <> 'served';

-- ---------------------------------------------------------------------------
-- Defaults and the setting
-- ---------------------------------------------------------------------------
select test.ok((select overdue_minutes = 25 and repeat_call_threshold = 3 from public.locations where id = :'la'), 'defaults: 25 minutes, 3 calls');

select test.act_as('ab1a0000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', 'ab1b0000-0000-0000-0000-000000000001', :'line'::jsonb, null) as o1 \gset
select test.act_as('ab1a0000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ab1b0000-0000-0000-0000-000000000002', :'line'::jsonb, null) as o2 \gset
reset role;
select test.ok((select status = 'accepted' from public.orders where id = :'o1'), 'the order is accepted and in the kitchen');

-- ---------------------------------------------------------------------------
-- Slow orders: not before the limit, at the limit, once, resolved when served
-- ---------------------------------------------------------------------------
update public.orders set placed_at = now() - interval '24 minutes' where id = :'o1';
select test.ok(private.enqueue_table_alerts() = 0, 'an order waiting 24 minutes is not an alert yet');
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.ok(api.table_alerts(:'la') = '[]'::jsonb, 'and the admin list is empty');
reset role;

update public.orders set placed_at = now() - interval '26 minutes' where id = :'o1';
select test.ok(private.enqueue_table_alerts() = 1, 'at 26 minutes the table raises one alert');
select test.ok(private.enqueue_table_alerts() = 0, 'a second run adds nothing');
select test.ok((select count(*) from public.notification_outbox where event = 'table.alert' and channel_id = :'ch') = 1, 'one outbox row for the chat');
select payload as p_slow from public.notification_outbox where event = 'table.alert' and dedupe_key = 'table.alert:slow:' || :'o1' \gset
select test.ok(private.render_notification('table.alert', :'p_slow'::jsonb, 'ru') = 'Стол 1: заказ не подан уже 26 мин.', 'Russian text names the table and the minutes');
select test.ok(private.render_notification('table.alert', :'p_slow'::jsonb, 'en') = 'Table 1: order not served for 26 min.', 'English text');
select test.ok(private.render_notification('table.alert', :'p_slow'::jsonb, 'hy') ~ '^Սեղան 1՝ պատվերը դեռ չի մատուցվել, անցել է 26 րոպե։$', 'Armenian text');
select test.ok(private.render_notification('order.overdue', '{"table":"5","number":3,"minutes":25}'::jsonb, 'en') like 'Order running late%', 'the other messages still render');

select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.ok((api.table_alerts(:'la') -> 0 ->> 'table') = '1' and (api.table_alerts(:'la') -> 0 ->> 'reason') = 'slow'
  and (api.table_alerts(:'la') -> 0 ->> 'minutes')::int = 26 and jsonb_array_length(api.table_alerts(:'la')) = 1, 'the admin list shows table 1, slow, 26 minutes');
reset role;

-- Served: the alert is gone
select id as tk1 from public.kitchen_tickets where order_id = :'o1' limit 1 \gset
update public.kitchen_tickets set status = 'served', served_at = now() where order_id = :'o1';
select test.ok((select kitchen_status = 'served' from public.orders where id = :'o1'), 'all tickets served marks the order served');
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.ok(api.table_alerts(:'la') = '[]'::jsonb, 'serving the order resolves the alert');
reset role;

-- Test orders, rejected and cancelled orders, paid orders, forgotten orders
update public.orders set placed_at = now() - interval '40 minutes', is_test = true where id = :'o2';
select test.ok(private.enqueue_table_alerts() = 0, 'a test order never alerts');
update public.orders set is_test = false, status = 'cancelled' where id = :'o2';
select test.ok(private.enqueue_table_alerts() = 0, 'a cancelled order never alerts');
update public.orders set status = 'accepted', placed_at = now() - interval '7 hours' where id = :'o2';
select test.ok(private.enqueue_table_alerts() = 0, 'an order forgotten for 7 hours is not reported');
update public.orders set placed_at = now() - interval '40 minutes' where id = :'o2';
select test.ok(private.enqueue_table_alerts() = 1, 'table 2 at 40 minutes alerts');

-- ---------------------------------------------------------------------------
-- The café's own limit
-- ---------------------------------------------------------------------------
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select api.set_alert_settings(:'la', 45, 4);
reset role;
select test.ok((select overdue_minutes = 45 and repeat_call_threshold = 4 from public.locations where id = :'la'), 'the setting is stored');
select test.ok((select count(*) from public.audit_log where action = 'alerts.settings' and location_id = :'la') = 1, 'and audited');
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.ok(api.table_alerts(:'la') = '[]'::jsonb, 'with a 45-minute limit a 40-minute wait is not listed any more');
reset role;
update public.orders set placed_at = now() - interval '50 minutes' where id = :'o2';
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.ok(jsonb_array_length(api.table_alerts(:'la')) = 1, 'at 50 minutes it is');
select api.set_alert_settings(:'la', 25, 3);
reset role;
select test.ok(private.enqueue_table_alerts() = 0, 'table 2 was already alerted: still one alert per order');

-- Another café's limit does not matter here
select test.act_as('ab1a0000-0000-0000-0000-000000000002');
select api.set_alert_settings(:'lb', 180, 10);
reset role;
select test.ok((select overdue_minutes = 25 from public.locations where id = :'la'), 'café B''s setting leaves café A alone');

-- ---------------------------------------------------------------------------
-- Repeated calls: the 3rd press, not the 2nd; answered resolves
-- ---------------------------------------------------------------------------
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') as req \gset
reset role;
select test.ok((select press_count = 1 from public.service_requests where id = :'req'), 'the first press counts 1');
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') = :'req'::uuid as same_req \gset
reset role;
select test.ok((select press_count = 1 from public.service_requests where id = :'req'), 'a double tap within 5 seconds is not a new press');
update public.service_requests set last_pressed_at = now() - interval '30 seconds' where id = :'req';
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') = :'req'::uuid as same_req2 \gset
reset role;
select test.ok((select press_count = 2 from public.service_requests where id = :'req'), 'the second press counts 2');
select test.ok(not exists (select 1 from private.table_alerts_live(:'la') where reason = 'calls'), 'two presses are not an alert');
select test.ok(private.enqueue_table_alerts() = 0, 'and nothing is queued');
update public.service_requests set last_pressed_at = now() - interval '30 seconds' where id = :'req';
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') = :'req'::uuid as same_req3 \gset
reset role;
select test.ok((select press_count = 3 from public.service_requests where id = :'req'), 'the third press counts 3');
select test.ok((select count(*) from public.service_requests where table_id = :'t3' and kind = 'call_waiter') = 1, 'repeat presses still make one request');
select test.ok(private.enqueue_table_alerts() = 1, 'the third press raises the alert');
select test.ok(private.enqueue_table_alerts() = 0, 'once');
select payload as p_call from public.notification_outbox where dedupe_key = 'table.alert:calls:' || :'req' \gset
select test.ok(private.render_notification('table.alert', :'p_call'::jsonb, 'en') like 'Table 3: called the waiter 3 times, no answer (%', 'the text names the table and the presses');
select test.ok(private.render_notification('table.alert', :'p_call'::jsonb, 'hy') like 'Սեղան 3՝ մատուցողին կանչել են 3 անգամ%', 'also in Armenian');
select test.act_as('ab1a0000-0000-0000-0000-000000000003');
select test.ok(jsonb_array_length(api.table_alerts(:'la')) = 2 and (api.table_alerts(:'la') @> '[{"reason":"calls","table":"3","presses":3}]'::jsonb), 'a manager sees both problem tables');
reset role;

-- A waiter acknowledges: the alert goes, and more presses do not bring it back
update public.service_requests set status = 'acknowledged', acknowledged_at = now() where id = :'req';
select test.ok(not exists (select 1 from private.table_alerts_live(:'la') where reason = 'calls'), 'an acknowledged request is not an alert');
update public.service_requests set last_pressed_at = now() - interval '30 seconds' where id = :'req';
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') as same_req4 \gset
reset role;
select test.ok((select press_count = 3 from public.service_requests where id = :'req'), 'an answered request stops counting');
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select api.set_alert_settings(:'la', 25, 2);
reset role;
update public.service_requests set status = 'open' where id = :'req';
select test.ok(exists (select 1 from private.table_alerts_live(:'la') where reason = 'calls'), 'a lower threshold (2) applies to the open request');
update public.service_requests set status = 'resolved', resolved_at = now() where id = :'req';
select test.ok(not exists (select 1 from private.table_alerts_live(:'la') where reason = 'calls'), 'a resolved request is not an alert');
-- A new request after resolving starts again at 1
select test.act_as('ab1a0000-0000-0000-0000-000000000006', true);
select api.guest_service_request(:'g3', 'call_waiter') as req2 \gset
reset role;
select test.ok((select press_count = 1 from public.service_requests where id = :'req2') and :'req2' <> :'req', 'a new request after resolving starts at 1');
select test.ok((select count(*) from public.notification_outbox where event = 'table.alert') = 3, 'three alerts in total, one outbox row each');
-- The bill request is not a waiter call
select test.act_as('ab1a0000-0000-0000-0000-000000000005', true);
select api.guest_service_request(:'g2', 'bring_bill') as bill \gset
reset role;
update public.service_requests set press_count = 5 where id = :'bill';
select test.ok(not exists (select 1 from private.table_alerts_live(:'la') where ref_id = :'bill'), 'a bill request never alerts');

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
select test.act_as('ab1a0000-0000-0000-0000-000000000003');
select api.set_alert_settings(:'la', 30, 3);
reset role;
select test.ok((select overdue_minutes = 30 from public.locations where id = :'la'), 'a manager may change the setting');
select test.act_as('ab1a0000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_alert_settings(%L, 10, 3)', :'la'), 'forbidden', 'another café''s owner cannot change it');
select test.fails(format('select api.table_alerts(%L)', :'la'), 'forbidden', 'nor read the list');
reset role;
select test.act_as(:'u_waiter', false);
select test.fails(format('select api.set_alert_settings(%L, 10, 3)', :'la'), 'forbidden', 'a waiter login cannot change it');
select test.ok(api.table_alerts(:'la') is not null, 'but a waiter login reads the list');
reset role;
select test.act_as('ab1a0000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.table_alerts(%L)', :'la'), 'forbidden', 'a guest cannot read the list');
select test.fails(format('select api.set_alert_settings(%L, 10, 3)', :'la'), 'forbidden', 'or change the setting');
reset role;
select test.act_as('ab1a0000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_alert_settings(%L, 4, 3)', :'la'), 'invalid_minutes', 'under 5 minutes is refused');
select test.fails(format('select api.set_alert_settings(%L, 181, 3)', :'la'), 'invalid_minutes', 'over 180 minutes is refused');
select test.fails(format('select api.set_alert_settings(%L, 25, 1)', :'la'), 'invalid_calls', 'fewer than 2 calls is refused');
select test.fails(format('select api.set_alert_settings(%L, 25, 11)', :'la'), 'invalid_calls', 'more than 10 calls is refused');
select test.fails(format('select api.set_alert_settings(%L, null, 3)', :'la'), 'invalid_minutes', 'null is refused');
reset role;

-- Only that café's alerts
select test.act_as('ab1a0000-0000-0000-0000-000000000002');
select test.ok(api.table_alerts(:'lb') = '[]'::jsonb, 'café B sees none of café A''s alerts');
reset role;
select test.ok(not exists (select 1 from public.notification_outbox o join public.notification_channels c on c.id = o.channel_id
                           where o.event = 'table.alert' and c.restaurant_id <> :'ra'), 'no alert reaches another café''s chats');

-- ---------------------------------------------------------------------------
-- One late-order message per chat (ADR-084): a chat that gets the owner-set
-- table alert does not also get the fixed 20-minute ticket alert
-- ---------------------------------------------------------------------------
reset role;
insert into public.notification_channels (restaurant_id, telegram_chat_id, title, locale, events)
values (:'ra', 9002, 'Old style', 'ru', '{order.overdue}') returning id as ch_old \gset
update public.orders set status = 'accepted', kitchen_status = 'pending', placed_at = now() - interval '26 minutes' where id = :'o2';
update public.kitchen_tickets set status = 'new', created_at = now() - interval '25 minutes' where order_id = :'o2';
select private.enqueue_overdue_alerts();
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_old' and dedupe_key = 'order.overdue:' || :'o2'),
               'a chat with only order.overdue still gets the late ticket alert');
select test.ok(not exists (select 1 from public.notification_outbox where channel_id = :'ch' and event = 'order.overdue'),
               'a chat that receives table.alert does not get the same late order twice');
