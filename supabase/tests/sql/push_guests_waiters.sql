-- Web push for guests and waiters (20261110130000_push_guests_waiters, ADR-049).
-- pg_net and pg_cron are the harness stand-ins of 00-supabase-stubs.sql. Runs
-- after 90-smoke-test.sql and adr038.sql and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('f9000000-0000-0000-0000-000000000001', 'owner-q@example.am', false),
  ('f9000000-0000-0000-0000-000000000002', null, true),   -- guest A (table 5, Armenian)
  ('f9000000-0000-0000-0000-000000000003', null, true),   -- guest B (table 5, Russian)
  ('f9000000-0000-0000-0000-000000000004', null, true),   -- waiter tablet
  ('f9000000-0000-0000-0000-000000000005', 'owner-r@example.am', false),
  ('f9000000-0000-0000-0000-000000000006', null, true),   -- guest C (table 6, English)
  ('f9000000-0000-0000-0000-000000000007', null, true);   -- guest D (table 6)

-- Café Q: one coffee, tables 5 and 6, a waiter tablet
select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Ք', 'cafe-push', 'Main', 'Qare') as rq \gset
select id as lq from public.locations where restaurant_id = :'rq' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rq', 'Main') returning id as qmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rq', :'qmenu', :'lq');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rq', :'qmenu', 1) returning id as qcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rq', :'qcat', 'hy', 'Ըմպելիք');
insert into public.items (restaurant_id, category_id, price) values (:'rq', :'qcat', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rq', :'coffee', 'hy', 'Սուրճ');
insert into public.tables (restaurant_id, location_id, label) values (:'rq', :'lq', '5') returning id as t5 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rq', :'lq', '6') returning id as t6 \gset
select api.publish_menu(:'lq') is not null as published \gset
select api.table_qr_token(:'t5') as tok5 \gset
select api.table_qr_token(:'t6') as tok6 \gset
select api.create_device_pairing(:'lq', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('f9000000-0000-0000-0000-000000000004', true);
select (api.redeem_device_pairing(:'wcode') ->> 'member_id') as waiter_member \gset
select test.act_as('f9000000-0000-0000-0000-000000000005');
select api.create_restaurant('Cafe R', 'cafe-push-r', 'Main', 'Rita') as rr \gset

\set one_coffee '[{"item_id": "' :coffee '", "quantity": 1}]'
\set two_coffee '[{"item_id": "' :coffee '", "quantity": 2}]'
-- A P-256 public key is 65 bytes, the auth secret 16
\set p256dh 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
\set authkey 'tBHItJI5svbpez7KI4CCXg'
\set sub_a '{"endpoint": "https://fcm.googleapis.com/fcm/send/guest-a1", "keys": {"p256dh": "' :p256dh '", "auth": "' :authkey '"}}'
\set sub_b '{"endpoint": "https://updates.push.services.mozilla.com/wpush/v2/guest-b1", "keys": {"p256dh": "' :p256dh '", "auth": "' :authkey '"}}'

-- Earlier suites leave their own alerts behind; keep them out of the counts
reset role;
update public.notification_outbox set status = 'sent' where restaurant_id <> :'rq';

-- ===========================================================================
-- Guests: subscribing
-- ===========================================================================
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select api.guest_join_table(:'tok5', 'hy') as ga \gset
select test.act_as('f9000000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok5', 'ru') as gb \gset

select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select api.guest_push_subscribe(:'ga', :'sub_a'::jsonb, 'Chrome') as ch_a \gset
select api.guest_push_subscribe(:'ga', :'sub_a'::jsonb, 'Chrome') = :'ch_a' as again \gset
reset role;
select test.ok(:'again', 'subscribing the same phone again keeps one channel');
select test.ok((select count(*) from public.push_subscriptions where channel_id = :'ch_a') = 1, 'and one device');
select test.ok((select audience = 'guest' and guest_session_id = :'ga'::uuid and kind = 'web_push' and events = '{}'
                       and locale = 'hy' and user_id = 'f9000000-0000-0000-0000-000000000002'
                from public.notification_channels where id = :'ch_a'),
  'the guest session gets its own web push channel, in its language, with no owner alerts');

-- Who may subscribe
select test.act_as('f9000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga', :'sub_b'), 'guest_session_invalid',
  'a guest cannot subscribe for another guest session');
select test.act_as('f9000000-0000-0000-0000-000000000001');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga', :'sub_b'), 'guest_session_invalid',
  'the owner cannot use a guest''s session either');
select test.act_as_anon();
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga', :'sub_b'), '%permission denied%',
  'nobody signed out can subscribe');

-- What may be stored
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "https://evil.example/push", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}'),
  'invalid_subscription', 'an endpoint outside the browsers'' push services is refused');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "https://fcm.googleapis.com.evil.example/x", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}'),
  'invalid_subscription', 'so is a look-alike host');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "http://fcm.googleapis.com/fcm/send/x", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}'),
  'invalid_subscription', 'and plain http');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": {"p256dh": "short", "auth": "' || :'authkey' || '"}}'),
  'invalid_subscription', 'a malformed key is refused');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga', '[]'), 'invalid_subscription', 'a non-object is refused');
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "https://fcm.googleapis.com/fcm/send/' || repeat('x', 2100) || '", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}'),
  'invalid_subscription', 'an oversized body is refused');

-- Three phones per guest session, not four
select api.guest_push_subscribe(:'ga',
  ('{"endpoint": "https://fcm.googleapis.com/fcm/send/guest-a2", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}')::jsonb) is not null as two \gset
select api.guest_push_subscribe(:'ga',
  ('{"endpoint": "https://fcm.googleapis.com/fcm/send/guest-a3", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}')::jsonb) is not null as three \gset
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'ga',
  '{"endpoint": "https://fcm.googleapis.com/fcm/send/guest-a4", "keys": {"p256dh": "' || :'p256dh' || '", "auth": "' || :'authkey' || '"}}'),
  'too_many_devices', 'a fourth device is refused');
select test.ok(api.guest_push_subscribe(:'ga', :'sub_a'::jsonb) = :'ch_a', 'an existing device can still be refreshed at the limit');
select api.delete_push_subscription('https://fcm.googleapis.com/fcm/send/guest-a2') is null as d2 \gset
select api.delete_push_subscription('https://fcm.googleapis.com/fcm/send/guest-a3') is null as d3 \gset

-- The button's state
select test.ok(api.guest_push_exists(:'ga', 'https://fcm.googleapis.com/fcm/send/guest-a1'), 'the guest sees their phone is subscribed');
select test.ok(not api.guest_push_exists(:'ga', 'https://fcm.googleapis.com/fcm/send/other'), 'and not another endpoint');
select test.act_as('f9000000-0000-0000-0000-000000000003', true);
select test.ok(not api.guest_push_exists(:'ga', 'https://fcm.googleapis.com/fcm/send/guest-a1'), 'another guest cannot see it');
reset role;
select test.ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'select'), 'clients cannot read subscription keys');
select test.ok(not exists (
  select 1 from information_schema.routine_privileges
  where specific_schema = 'api' and routine_name in ('guest_push_subscribe', 'guest_push_exists', 'waiter_push_subscribe')
    and grantee in ('anon', 'PUBLIC')), 'the new functions are not callable by anon or public');

-- ===========================================================================
-- Guests: the ready push
-- ===========================================================================
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select api.guest_place_order(:'ga', 'f9a00000-0000-0000-0000-000000000001', :'one_coffee'::jsonb, null) as oa \gset
select test.act_as('f9000000-0000-0000-0000-000000000003', true);
select api.guest_place_order(:'gb', 'f9b00000-0000-0000-0000-000000000001', :'two_coffee'::jsonb, null) as ob \gset
reset role;
select test.ok((select status from public.orders where id = :'oa') = 'accepted' and (select status from public.orders where id = :'ob') = 'accepted',
  'both orders reached the kitchen');
select test.ok((select count(*) from public.notification_outbox where event = 'order.ready') = 0, 'nothing is pushed before the dish is ready');

select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'new', 'cooking') is not null as cooking from public.kitchen_tickets where order_id = :'oa' and kind = 'order' \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where event = 'order.ready') = 0, 'cooking is not ready');
select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'cooking', 'ready') is not null as ready from public.kitchen_tickets where order_id = :'oa' and kind = 'order' \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where event = 'order.ready' and channel_id = :'ch_a') = 1,
  'when the order becomes ready the subscribed guest gets exactly one push');
select id as ob_ready, payload as p_ready from public.notification_outbox where event = 'order.ready' and channel_id = :'ch_a' \gset
select test.ok(private.render_notification('order.ready', :'p_ready'::jsonb, 'hy') = 'Ձեր պատվերը պատրաստ է՝ սեղան 5', 'in Armenian: «Ձեր պատվերը պատրաստ է՝ սեղան 5»');
select test.ok(private.render_notification('order.ready', :'p_ready'::jsonb, 'ru') = 'Ваш заказ готов — стол 5', 'in Russian');
select test.ok(private.render_notification('order.ready', :'p_ready'::jsonb, 'en') = 'Your order is ready — table 5', 'in English');
select test.ok(private.render_notification('order.ready', '{}'::jsonb, 'en') = 'Your order is ready', 'and without a table label');
select test.ok((:'p_ready'::jsonb ->> 'locale') = 'hy' and (:'p_ready'::jsonb ->> 'path') like '/hy/m/cafe-push/main/order?t=%',
  'the payload carries the order''s language and the status page path');
select test.ok(substring(:'p_ready'::jsonb ->> 'path' from '\?t=(.*)$') = :'tok5', 'with the table''s signed sticker');

-- Undo and ready again: still one
select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'ready', 'cooking') is not null as undone from public.kitchen_tickets where order_id = :'oa' and kind = 'order' \gset
select api.set_ticket_status(id, 'cooking', 'ready') is not null as readied from public.kitchen_tickets where order_id = :'oa' and kind = 'order' \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where event = 'order.ready' and channel_id = :'ch_a') = 1, 'ready, undo, ready sends one push, not two');

-- Guest B has not subscribed: nothing for them. A waiter's own order: nothing.
select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.set_ticket_status(id, 'new', 'ready') is not null as b_ready from public.kitchen_tickets where order_id = :'ob' and kind = 'order' \gset
select api.place_waiter_order(:'t6', 'f9c00000-0000-0000-0000-000000000001', :'one_coffee'::jsonb) as ow \gset
select api.set_ticket_status(id, 'new', 'ready') is not null as w_ready from public.kitchen_tickets where order_id = :'ow' and kind = 'order' \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where event = 'order.ready') = 1,
  'an unsubscribed guest and a waiter''s order queue nothing');

-- Delivery: the push route claims the row and gets the order's language, the order's tag and the status page
select vault.create_secret('https://preview.example', 'app_base_url') is not null as base_set \gset
select test.ok(private.run_notifications() = 1, 'the worker pokes the push route for the ready row');
select body as push_body from net._stub_requests order by id desc limit 1 \gset
select api.push_claim((:'push_body'::jsonb ->> 'id')::bigint, 1, :'push_body'::jsonb ->> 'sig') as claim \gset
select test.ok((:'claim'::jsonb ->> 'body') = 'Ձեր պատվերը պատրաստ է՝ սեղան 5' and (:'claim'::jsonb ->> 'title') = 'Պատիվ', 'the claim has the text and the brand');
select test.ok((:'claim'::jsonb ->> 'tag') = 'order:' || :'oa' and (:'claim'::jsonb ->> 'renotify')::boolean, 'tagged by order, so a repeat replaces it');
select test.ok((:'claim'::jsonb ->> 'url') = (:'p_ready'::jsonb ->> 'path'), 'a tap opens the guest status page');
select test.ok(jsonb_array_length(:'claim'::jsonb -> 'subscriptions') = 1, 'to the guest''s phone');

-- The order's language beats the channel's: a Russian order on an Armenian channel
reset role;
select private.render_notification('order.ready', '{"table": "7", "locale": "ru"}'::jsonb, private.outbox_locale('{"locale": "ru"}', 'hy')) = 'Ваш заказ готов — стол 7' as ru_wins \gset
select test.ok(:'ru_wins', 'the order''s language is used for the text');
select test.ok(private.outbox_locale('{"locale": "xx"}', 'en') = 'en' and private.outbox_locale('{}', 'ru') = 'ru', 'an unknown language falls back to the channel''s');

-- ===========================================================================
-- Waiters
-- ===========================================================================
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.waiter_push_subscribe(%L, %L, %L, %L)', :'rq', 'https://fcm.googleapis.com/fcm/send/w1', :'p256dh', :'authkey'),
  'forbidden', 'a guest cannot subscribe as a waiter');
select test.act_as('f9000000-0000-0000-0000-000000000005');
select test.fails(format('select api.waiter_push_subscribe(%L, %L, %L, %L)', :'rq', 'https://fcm.googleapis.com/fcm/send/w1', :'p256dh', :'authkey'),
  'forbidden', 'another café''s owner cannot either');
select test.act_as('f9000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.waiter_push_subscribe(%L, %L, %L, %L)', :'rq', 'http://evil.example/x', :'p256dh', :'authkey'),
  'invalid_subscription', 'the allow-list applies to waiters too');
select api.waiter_push_subscribe(:'rq', 'https://fcm.googleapis.com/fcm/send/waiter-1', :'p256dh', :'authkey', 'Tablet', 'ru') as ch_w \gset
reset role;
select test.ok((select audience = 'waiter' and kind = 'web_push' and events = '{}' and locale = 'ru' and guest_session_id is null
                from public.notification_channels where id = :'ch_w'), 'the waiter tablet gets a waiter channel in the app''s language');

-- The owner also has a phone on the Telegram page: it must not get table calls
select test.act_as('f9000000-0000-0000-0000-000000000001');
select api.save_push_subscription(:'rq', 'https://fcm.googleapis.com/fcm/send/owner-1', :'p256dh', :'authkey', 'Phone') as ch_owner \gset
select api.update_notification_channel(:'ch_owner', '{order.placed,order.overdue,station.offline,order.comped,day.summary}', 'hy', true) is null as owner_upd \gset
reset role;
select test.ok((select audience = 'owner' from public.notification_channels where id = :'ch_owner'), 'the owner''s channel keeps its audience');

-- A call
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'ga', 'call_waiter') as call1 \gset
select api.guest_service_request(:'ga', 'call_waiter') = :'call1' as call_again \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch_w' and event = 'service.call') = 1,
  'a call pushes once to the waiter tablet, a second tap on the open call adds nothing');
select payload as p_call from public.notification_outbox where channel_id = :'ch_w' and event = 'service.call' \gset
select test.ok(private.render_notification('service.call', :'p_call'::jsonb, 'hy') = 'Սեղան 5․ կանչում են', 'Armenian: «Սեղան 5․ կանչում են»');
select test.ok(private.render_notification('service.call', :'p_call'::jsonb, 'ru') = 'Стол 5: зовут официанта', 'Russian');
select test.ok(private.render_notification('service.call', :'p_call'::jsonb, 'en') = 'Table 5: calling a waiter', 'English');
select test.ok(not exists (select 1 from public.notification_outbox where channel_id = :'ch_owner' and event like 'service.%'),
  'the owner''s Telegram-page phone gets no table calls');
select test.ok(not exists (select 1 from public.notification_outbox where channel_id = :'ch_a' and event like 'service.%'),
  'neither does the guest');

-- The bill: asked, then card, then cash, then cash again
select test.act_as('f9000000-0000-0000-0000-000000000002', true);
select api.guest_service_request(:'ga', 'bring_bill') as bill1 \gset
select api.guest_service_request(:'ga', 'bring_bill', 'card') = :'bill1' as card \gset
select api.guest_service_request(:'ga', 'bring_bill', 'cash') = :'bill1' as cash \gset
select api.guest_service_request(:'ga', 'bring_bill', 'cash') = :'bill1' as cash2 \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill') = 3,
  'asking, choosing card and changing to cash push; choosing cash again does not');
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill'
                       and private.render_notification(event, payload, 'hy') = 'Սեղան 5․ հաշիվ'), 'bill without a choice: «Սեղան 5․ հաշիվ»');
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill'
                       and private.render_notification(event, payload, 'hy') = 'Սեղան 5․ հաշիվ՝ քարտով'), 'by card: «Սեղան 5․ հաշիվ՝ քարտով»');
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill'
                       and private.render_notification(event, payload, 'hy') = 'Սեղան 5․ հաշիվ՝ կանխիկ'), 'cash: «Սեղան 5․ հաշիվ՝ կանխիկ»');
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill'
                       and private.render_notification(event, payload, 'ru') = 'Стол 5: счёт, наличными'), 'Russian cash');
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_w' and event = 'service.bill'
                       and private.render_notification(event, payload, 'en') = 'Table 5: bill, by card'), 'English card');
select test.ok(not exists (select 1 from public.notification_outbox where event like 'order.placed%' and channel_id = :'ch_w'),
  'waiters get calls and bills, not every order');

-- Delivery: tag per table and kind, tap opens the waiter app
update public.notification_outbox set status = 'sent' where status in ('pending', 'failed') and net_request_id is null and event = 'order.ready';
select test.ok(private.run_notifications() >= 1, 'the worker pokes the push route for the waiter rows');
select body as wpush_body from net._stub_requests order by id desc limit 1 \gset
select api.push_claim((:'wpush_body'::jsonb ->> 'id')::bigint, 1, :'wpush_body'::jsonb ->> 'sig') as wclaim \gset
select test.ok((:'wclaim'::jsonb ->> 'url') = '/waiter' and (:'wclaim'::jsonb ->> 'tag') like 'table:' || :'t5' || ':service.%', 'a tap opens /waiter; the tag is per table and kind');
select test.ok((:'wclaim'::jsonb ->> 'body') like 'Стол 5:%', 'in the waiter app''s language');

-- A deactivated member and a resolved request get nothing
select count(*) as n_before from public.notification_outbox where channel_id = :'ch_w' \gset
update public.service_requests set status = 'resolved', resolved_at = now() where id = :'bill1';
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch_w') = :n_before, 'resolving a request pushes nothing');
update public.members set is_active = false where id = :'waiter_member';
select test.act_as('f9000000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok6', 'en') as gc \gset
select api.guest_service_request(:'gc', 'call_waiter') is not null as call_c \gset
reset role;
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch_w') = :n_before, 'a deactivated waiter gets no pushes');
update public.members set is_active = true where id = :'waiter_member';

-- ===========================================================================
-- Cleanup of guest devices
-- ===========================================================================
select test.ok(exists (select 1 from cron.job where jobname = 'pativ-guest-push-cleanup'), 'the cleanup is scheduled');

-- The table closes: the party's devices go (A and B share the table session)
select test.act_as('f9000000-0000-0000-0000-000000000003', true);
select api.guest_push_subscribe(:'gb', :'sub_b'::jsonb) as ch_b \gset
reset role;
select test.ok((select count(*) from public.notification_channels where audience = 'guest' and restaurant_id = :'rq') = 2, 'two guest channels at table 5');
select test.ok((select count(*) from public.notification_outbox where channel_id = :'ch_a') >= 1, 'with queued rows');
update public.table_sessions set status = 'closed', closed_at = now() where table_id = :'t5' and status = 'open';
select test.ok((select count(*) from public.notification_channels where audience = 'guest' and restaurant_id = :'rq') = 0,
  'closing the table removes the guests'' channels');
select test.ok((select count(*) from public.push_subscriptions where channel_id in (:'ch_a', :'ch_b')) = 0, 'their devices');
select test.ok((select count(*) from public.notification_outbox where channel_id in (:'ch_a', :'ch_b')) = 0, 'and their queued rows');
select test.ok((select count(*) from public.notification_channels where id = :'ch_w') = 1, 'the waiter''s channel stays');

-- Older than 24 hours, or the guest session is gone
select test.act_as('f9000000-0000-0000-0000-000000000006', true);
select api.guest_push_subscribe(:'gc', :'sub_a'::jsonb) as ch_c \gset
select test.act_as('f9000000-0000-0000-0000-000000000007', true);
select api.guest_join_table(:'tok6', 'hy') as gd \gset
select api.guest_push_subscribe(:'gd', :'sub_b'::jsonb) as ch_d \gset
reset role;
select test.ok(private.cleanup_guest_push() = 0, 'fresh channels of open sessions are kept');
update public.notification_channels set created_at = now() - interval '25 hours' where id = :'ch_c';
update public.guest_sessions set expires_at = now() - interval '1 minute' where id = :'gd';
select test.ok(private.cleanup_guest_push() = 2, 'the cleanup removes a 25-hour-old channel and one of an expired session');
select test.ok((select count(*) from public.notification_channels where audience = 'guest' and restaurant_id = :'rq') = 0, 'nothing is left');

-- A revoked guest session (settled bill) takes its channel along
select test.act_as('f9000000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok6', 'en') as gc2 \gset
select api.guest_push_subscribe(:'gc2', :'sub_a'::jsonb) is not null as sub_c2 \gset
reset role;
update public.guest_sessions set revoked_at = now() where id = :'gc2';
select test.ok((select count(*) from public.notification_channels where audience = 'guest' and restaurant_id = :'rq') = 0, 'revoking the guest session removes its channel');
select test.act_as('f9000000-0000-0000-0000-000000000006', true);
select test.fails(format('select api.guest_push_subscribe(%L, %L::jsonb)', :'gc2', :'sub_a'), 'guest_session_invalid', 'and a closed session cannot subscribe again');

-- Leave nothing behind for later suites
reset role;
delete from vault.secrets where name in ('telegram_bot_token', 'app_base_url');
select set_config('request.jwt.claims', '', false);
\echo 'PUSH GUESTS AND WAITERS TESTS PASSED'
