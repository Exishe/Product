-- Milestone 8: Telegram linking (8.1), delivery from the database (8.2) and
-- web push (8.3). pg_net and pg_cron are the harness stand-ins of
-- 00-supabase-stubs.sql: requests are recorded, answers are written here by
-- hand. Runs after 90-smoke-test.sql and adr038.sql (test.* helpers).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('f8000000-0000-0000-0000-000000000001', 'owner-n@example.am', false),
  ('f8000000-0000-0000-0000-000000000002', null, true),   -- café N's kitchen tablet
  ('f8000000-0000-0000-0000-000000000003', null, true),   -- a guest
  ('f8000000-0000-0000-0000-000000000004', 'owner-o@example.am', false),
  ('f8000000-0000-0000-0000-000000000005', 'manager-n@example.am', false);

-- Café N: one dish at 3 250, table 5, a kitchen tablet, a manager
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Ն', 'cafe-n', 'Main', 'Nare') as rn \gset
select id as ln from public.locations where restaurant_id = :'rn' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rn', 'Main') returning id as nmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rn', :'nmenu', :'ln');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rn', :'nmenu', 1) returning id as ncat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rn', :'ncat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rn', :'ncat', 3250) returning id as khorovats \gset
insert into public.item_translations (restaurant_id, item_id, locale, name, source) values
  (:'rn', :'khorovats', 'hy', 'Խորոված', 'owner'), (:'rn', :'khorovats', 'ru', 'Хоровац', 'owner');
insert into public.tables (restaurant_id, location_id, label) values (:'rn', :'ln', '5') returning id as t5 \gset
select api.publish_menu(:'ln') as nv1 \gset
select api.create_device_pairing(:'ln', 'kitchen', 'Խոհանոց') as kcode \gset
select test.act_as('f8000000-0000-0000-0000-000000000002', true);
select (api.redeem_device_pairing(:'kcode') ->> 'member_id') as kitchen_member \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name, locale)
values (:'rn', 'f8000000-0000-0000-0000-000000000005', 'manager', 'Mane', 'ru');

-- Café O, whose owner must not touch café N's alerts
select test.act_as('f8000000-0000-0000-0000-000000000004');
select api.create_restaurant('Cafe O', 'cafe-o', 'Main', 'Olga') as ro \gset

\set two_khorovats '[{"item_id": "' :khorovats '", "quantity": 2}]'

-- ===========================================================================
-- 8.1 Linking the owner's Telegram
-- ===========================================================================
reset role;
select test.ok(not exists (select 1 from vault.secrets where name = 'telegram_bot_token'), 'the harness starts without a bot token');
select test.ok(exists (select 1 from vault.secrets where name = 'telegram_webhook_secret'),
  'the migration generated the webhook secret inside the database');
select test.ok(length(private.secret('telegram_webhook_secret')) >= 40, 'the webhook secret is long');
select count(*) as req0 from net._stub_requests \gset
select test.ok(private.telegram_set_webhook('https://preview.example/api/telegram') = 'no_token',
  'without a token, registering the webhook does nothing');
select test.ok((select count(*) from net._stub_requests) = :req0, 'and calls nothing');
select private.secret('telegram_webhook_secret') as hook_secret \gset

-- Status for the admin page
select test.act_as('f8000000-0000-0000-0000-000000000001');
select test.ok((api.telegram_status(:'rn') ->> 'bot_ready')::boolean = false, 'the admin sees that the bot is not ready');
select test.act_as('f8000000-0000-0000-0000-000000000004');
select test.fails(format('select api.telegram_status(%L)', :'rn'), 'forbidden', 'another café''s owner cannot read our status');

-- Link codes
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.create_telegram_link(:'rn') ->> 'code' as code1 \gset
select test.ok(:'code1' ~ '^[A-Za-z0-9_-]{16}$', 'a link code is 16 URL-safe characters (fits /start)');
reset role;
select test.ok((select count(*) from public.telegram_link_codes where code_hash = encode(extensions.digest(:'code1', 'sha256'), 'hex')) = 1,
  'only the code''s hash is stored');
select test.act_as('f8000000-0000-0000-0000-000000000004');
select test.fails(format('select api.create_telegram_link(%L)', :'rn'), 'forbidden', 'another café''s owner cannot make our link');
select test.act_as('f8000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.create_telegram_link(%L)', :'rn'), 'forbidden', 'a guest cannot make a link');

-- The webhook: a wrong secret is refused
select test.act_as_anon();
\set start1 '{"update_id": 1, "message": {"message_id": 1, "chat": {"id": 4242, "type": "private", "first_name": "Nare"}, "from": {"id": 4242, "language_code": "ru"}, "text": "/start ' :code1 '"}}'
select test.fails(format('select api.telegram_update(%L, %L::jsonb)', 'wrong-secret', :'start1'), 'forbidden', 'a wrong webhook secret is refused');
select test.fails(format('select api.telegram_update(null, %L::jsonb)', :'start1'), 'forbidden', 'a missing webhook secret is refused');
reset role;
select test.ok(not exists (select 1 from public.notification_channels where telegram_chat_id = 4242), 'a refused update links nothing');

-- /start <code> links the chat and marks the code used
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'start1'::jsonb) as reply1 \gset
reset role;
select test.ok((select count(*) from public.notification_channels where restaurant_id = :'rn' and telegram_chat_id = 4242 and is_active) = 1,
  '/start <code> links the chat to the café');
select test.ok((select consumed_at is not null from public.telegram_link_codes where code_hash = encode(extensions.digest(:'code1', 'sha256'), 'hex')),
  'and marks the code used');
select test.ok((select locale from public.notification_channels where telegram_chat_id = 4242) = 'hy',
  'the chat gets the language of the member who made the link');
select test.ok((select events from public.notification_channels where telegram_chat_id = 4242)
               = '{order.overdue,station.offline,order.comped,day.summary}', 'exceptions only, every-order alerts off (ADR-040)');
select test.ok((:'reply1'::jsonb -> 'reply' ->> 'method') = 'sendMessage' and (:'reply1'::jsonb -> 'reply' ->> 'chat_id') = '4242',
  'the webhook answers with a message to the chat');
select test.ok((:'reply1'::jsonb -> 'reply' ->> 'text') like 'Պատրաստ է։%«Սրճարան Ն»%', 'the confirmation is in Armenian and names the café');

-- Telegram retries an update it thinks failed: still one channel, still a confirmation
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'start1'::jsonb) as reply1b \gset
reset role;
select test.ok((select count(*) from public.notification_channels where telegram_chat_id = 4242) = 1, 'a repeated update links once');
select test.ok((:'reply1b'::jsonb -> 'reply' ->> 'text') like 'Պատրաստ է։%', 'and confirms again');

-- A used code from another chat, an expired code, a made-up code
\set steal '{"update_id": 2, "message": {"chat": {"id": 777, "type": "private"}, "from": {"id": 777, "language_code": "en"}, "text": "/start ' :code1 '"}}'
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'steal'::jsonb) as reply2 \gset
reset role;
select test.ok(not exists (select 1 from public.notification_channels where telegram_chat_id = 777), 'a used code links no other chat');
select test.ok((:'reply2'::jsonb -> 'reply' ->> 'text') like 'This code no longer works.%', 'the stranger is told so in their language');

select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.create_telegram_link(:'rn') ->> 'code' as code_old \gset
reset role;
update public.telegram_link_codes set expires_at = now() - interval '1 second'
where code_hash = encode(extensions.digest(:'code_old', 'sha256'), 'hex');
\set late '{"update_id": 3, "message": {"chat": {"id": 888, "type": "private"}, "from": {"id": 888}, "text": "/start ' :code_old '"}}'
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'late'::jsonb) is not null as late_ok \gset
select api.telegram_update(:'hook_secret', '{"update_id": 4, "message": {"chat": {"id": 889, "type": "private"}, "text": "/start AAAAAAAAAAAAAAAA"}}'::jsonb) is not null as fake_ok \gset
select api.telegram_update(:'hook_secret', '{"update_id": 5, "edited_message": {"chat": {"id": 889}}}'::jsonb) as other_update \gset
reset role;
select test.ok(not exists (select 1 from public.notification_channels where telegram_chat_id in (888, 889)), 'expired and made-up codes link nothing');
select test.ok(:'other_update'::jsonb = '{}'::jsonb, 'updates we don''t handle are acknowledged quietly');

-- A group chat: /start@bot <code>, the group's title
select test.act_as('f8000000-0000-0000-0000-000000000005');
select api.create_telegram_link(:'rn') ->> 'code' as code_group \gset
\set group_start '{"update_id": 6, "message": {"chat": {"id": -1001, "type": "group", "title": "Սրճարանի թիմ"}, "from": {"id": 5}, "text": "/start@PativBot ' :code_group '"}}'
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'group_start'::jsonb) as reply3 \gset
reset role;
select test.ok((select title from public.notification_channels where telegram_chat_id = -1001) = 'Սրճարանի թիմ', 'a group links with its title');
select test.ok((select locale from public.notification_channels where telegram_chat_id = -1001) = 'ru', 'in the manager''s language');
select test.ok((:'reply3'::jsonb -> 'reply' ->> 'text') like 'Готово.%', 'and is confirmed in Russian');

-- /stop and being removed from the group turn a chat off; a new code turns it back on
select test.act_as_anon();
select api.telegram_update(:'hook_secret', '{"update_id": 7, "message": {"chat": {"id": 4242, "type": "private"}, "text": "/stop"}}'::jsonb) as reply4 \gset
select api.telegram_update(:'hook_secret', '{"update_id": 8, "my_chat_member": {"chat": {"id": -1001, "type": "group"}, "new_chat_member": {"status": "kicked"}}}'::jsonb) is not null as kicked_ok \gset
reset role;
select test.ok((select not is_active from public.notification_channels where telegram_chat_id = 4242), '/stop turns the chat off');
select test.ok((:'reply4'::jsonb -> 'reply' ->> 'text') like 'Ծանուցումներն անջատված են։%', 'and says so');
select test.ok((select not is_active from public.notification_channels where telegram_chat_id = -1001), 'removing the bot from a group turns it off');
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.create_telegram_link(:'rn') ->> 'code' as code2 \gset
\set start2 '{"update_id": 9, "message": {"chat": {"id": 4242, "type": "private"}, "text": "/start ' :code2 '"}}'
select test.act_as_anon();
select api.telegram_update(:'hook_secret', :'start2'::jsonb) is not null as relinked \gset
reset role;
select test.ok((select is_active from public.notification_channels where telegram_chat_id = 4242), 'a new code turns the chat back on');
select id as ch_tg from public.notification_channels where telegram_chat_id = 4242 \gset

-- Channel settings
select test.act_as('f8000000-0000-0000-0000-000000000001');
select test.fails(format('select api.update_notification_channel(%L, %L, %L, true)', :'ch_tg', '{order.placed,order.hacked}', 'hy'),
  'invalid_events', 'unknown events are refused');
select api.update_notification_channel(:'ch_tg', '{order.placed,order.overdue,station.offline,order.comped,day.summary}', 'hy', true) is null as upd_ok \gset
select test.act_as('f8000000-0000-0000-0000-000000000004');
select test.fails(format('select api.update_notification_channel(%L, %L, %L, false)', :'ch_tg', '{}', 'hy'),
  'forbidden', 'another café''s owner cannot change our channel');
reset role;
select test.ok((select 'order.placed' = any (events) from public.notification_channels where id = :'ch_tg'),
  'the owner turns on every-order alerts');
select test.ok(not has_table_privilege('authenticated', 'public.notification_channels', 'insert')
               and not has_table_privilege('authenticated', 'public.notification_channels', 'update'),
  'clients cannot create or repoint a chat directly');
select test.act_as('f8000000-0000-0000-0000-000000000001');
select test.ok((select count(*) from public.notification_channels where restaurant_id = :'rn') = 2,
  'the owner still reads the café''s chats');
reset role;

-- ===========================================================================
-- 8.2 Delivery from the database
-- ===========================================================================
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'t5', 'f8a00000-0000-0000-0000-000000000001', :'two_khorovats'::jsonb) as o1 \gset
reset role;
select id as ob1, payload as p1 from public.notification_outbox where dedupe_key = 'order.placed:' || :'o1' \gset
select test.ok(:'ob1' is not null, 'a new order queues an alert for the chat');
select test.ok(private.render_notification('order.placed', :'p1'::jsonb, 'hy')
               = format('Նոր պատվեր՝ սեղան 5, 6%s500%s֏', chr(160), chr(160)),
  'the Armenian text is «Նոր պատվեր՝ սեղան 5, 6 500 ֏»');
select test.ok(private.render_notification('order.placed', :'p1'::jsonb, 'ru')
               = format('Новый заказ: стол 5, 6%s500%s֏', chr(160), chr(160)), 'in Russian');
select test.ok(private.render_notification('order.placed', :'p1'::jsonb, 'en')
               = format('New order: table 5, AMD%s6,500', chr(160)), 'in English');
select test.fails('select private.render_notification(''order.unknown'', ''{}'', ''hy'')', 'unknown_notification%', 'an unknown kind is an error, not an empty message');

-- Earlier suites queued alerts for their own cafés; keep them out of the counts
update public.notification_outbox set status = 'sent' where restaurant_id <> :'rn';

-- No token in Vault: nothing is sent and nothing fails
select count(*) as req1 from net._stub_requests \gset
select test.ok(private.run_notifications() = 0, 'without a token the worker sends nothing');
select test.ok((select count(*) from net._stub_requests) = :req1, 'and makes no request');
select test.ok((select status = 'pending' and attempts = 0 and last_error is null from public.notification_outbox where id = :ob1),
  'the alert waits, unharmed');

-- The owner adds the token: the next run sends through pg_net
select vault.create_secret('123456:TEST-token', 'telegram_bot_token') is not null as token_added \gset
select test.ok(private.run_notifications() = 1, 'with a token the worker sends the alert');
select id as rq1, url as rq1_url, body as rq1_body from net._stub_requests order by id desc limit 1 \gset
select test.ok(:'rq1_url' = 'https://api.telegram.org/bot123456:TEST-token/sendMessage', 'to the Bot API with the token from Vault');
select test.ok((:'rq1_body'::jsonb ->> 'chat_id') = '4242' and (:'rq1_body'::jsonb ->> 'text') like 'Նոր պատվեր՝ սեղան 5,%',
  'the right chat gets the Armenian text');
select test.ok((select net_request_id = :rq1 and attempts = 1 from public.notification_outbox where id = :ob1), 'the row remembers its request');
select test.ok(private.run_notifications() = 0, 'a row in flight is not sent twice');
insert into net._http_response (id, status_code, content) values (:rq1, 200, '{"ok":true}');
select private.run_notifications() is not null as run_ok \gset
select test.ok((select status = 'sent' and sent_at is not null and net_request_id is null from public.notification_outbox where id = :ob1),
  'a 200 from Telegram marks it sent');

-- A failing send retries at 1, 5 and 15 minutes and is dead after 5 failures
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'t5', 'f8a00000-0000-0000-0000-000000000002', :'two_khorovats'::jsonb) as o2 \gset
reset role;
select id as ob2 from public.notification_outbox where dedupe_key = 'order.placed:' || :'o2' \gset
create function test.fail_once(p_id bigint, p_status integer) returns interval language plpgsql as $$
declare v_req bigint;
begin
  update public.notification_outbox set next_attempt_at = now() where id = p_id;
  perform private.run_notifications();
  select net_request_id into v_req from public.notification_outbox where id = p_id;
  if v_req is null then raise exception 'FAILED: row % was not sent', p_id; end if;
  insert into net._http_response (id, status_code, content) values (v_req, p_status, '{"ok":false,"description":"Bad Gateway"}');
  perform private.run_notifications();
  return (select next_attempt_at - now() from public.notification_outbox where id = p_id);
end $$;
-- (BETWEEN would evaluate the call twice, so each result is stored first)
select test.fail_once(:ob2, 502) as wait1 \gset
select test.ok(:'wait1'::interval = interval '1 minute', 'first failure: retry in 1 minute');
select test.ok((select status = 'failed' and attempts = 1 and last_error like 'http 502%' from public.notification_outbox where id = :ob2),
  'the row is failed with the error');
select test.fail_once(:ob2, 502) as wait2 \gset
select test.ok(:'wait2'::interval = interval '5 minutes', 'second failure: retry in 5 minutes');
select test.fail_once(:ob2, 500) as wait3 \gset
select test.ok(:'wait3'::interval = interval '15 minutes', 'third failure: retry in 15 minutes');
select test.fail_once(:ob2, 500) as wait4 \gset
select test.ok(:'wait4'::interval = interval '15 minutes', 'fourth failure: 15 minutes again');
select test.fail_once(:ob2, 500) is not null as fifth \gset
select test.ok((select status = 'dead' and attempts = 5 from public.notification_outbox where id = :ob2), 'dead after 5 failures');
select test.ok(private.run_notifications() >= 0 and (select status = 'dead' from public.notification_outbox where id = :ob2), 'and never sent again');

-- No answer at all (pg_net lost it): the lease runs out and counts as a failure
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'t5', 'f8a00000-0000-0000-0000-000000000003', :'two_khorovats'::jsonb) as o3 \gset
reset role;
select id as ob3 from public.notification_outbox where dedupe_key = 'order.placed:' || :'o3' \gset
select private.run_notifications() is not null as sent3 \gset
update public.notification_outbox set next_attempt_at = now() - interval '1 second' where id = :ob3;
select private.collect_outbox_responses() is not null as collected3 \gset
select test.ok((select status = 'failed' and attempts = 1 and last_error = 'no_response' from public.notification_outbox where id = :ob3),
  'a request with no answer after its lease is a failure');

-- Telegram says "slow down": wait as long as it asks
update public.notification_outbox set next_attempt_at = now() where id = :ob3;
select private.run_notifications() is not null as sent3b \gset
select net_request_id as rq3 from public.notification_outbox where id = :ob3 \gset
insert into net._http_response (id, status_code, content) values (:rq3, 429, '{"ok":false,"parameters":{"retry_after":120}}');
select private.collect_outbox_responses() is not null as collected3b \gset
select test.ok((select next_attempt_at - now() between interval '115 seconds' and interval '125 seconds' from public.notification_outbox where id = :ob3),
  'a 429 waits retry_after seconds');

-- The owner blocked the bot: the chat is turned off, the row is dead, no retries
update public.notification_outbox set next_attempt_at = now() where id = :ob3;
select private.run_notifications() is not null as sent3c \gset
select net_request_id as rq3c from public.notification_outbox where id = :ob3 \gset
insert into net._http_response (id, status_code, content) values (:rq3c, 403, '{"ok":false,"description":"Forbidden: bot was blocked by the user"}');
select private.collect_outbox_responses() is not null as collected3c \gset
select test.ok((select status = 'dead' from public.notification_outbox where id = :ob3), 'a blocked bot makes the row dead at once');
select test.ok((select not is_active from public.notification_channels where id = :'ch_tg'), 'and turns the chat off');
update public.notification_channels set is_active = true where id = :'ch_tg';

-- Alerts that waited too long while the token was missing are not sent hours late
insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload, created_at)
values (:'rn', :'ch_tg', 'channel.test', 'channel.test:old', '{}', now() - interval '7 hours') returning id as ob_old \gset
select private.run_notifications() is not null as ran_old \gset
select test.ok((select status = 'dead' and last_error = 'stale' from public.notification_outbox where id = :ob_old), 'an alert older than 6 hours is dropped as stale');

-- A late ticket: one alert per order
update public.kitchen_tickets set created_at = now() - interval '25 minutes' where order_id = :'o1';
select test.ok(private.enqueue_overdue_alerts() = 1, 'a ticket waiting 25 minutes raises a late alert');
select test.ok(private.enqueue_overdue_alerts() = 0, 'only once');
select payload as p_late from public.notification_outbox where dedupe_key = 'order.overdue:' || :'o1' \gset
select test.ok(private.render_notification('order.overdue', :'p_late'::jsonb, 'hy') ~ '^Պատվերն ուշանում է՝ սեղան 5, №[0-9]+, 25 րոպե$',
  'the late alert names the table, the order and the minutes');
update public.kitchen_tickets set created_at = now() - interval '5 hours' where order_id = :'o2';
select test.ok(private.enqueue_overdue_alerts() = 0, 'a ticket forgotten for hours is not reported as late');

-- A kitchen screen offline for 2 minutes while the café is serving
update public.members set last_seen_at = now() - interval '20 seconds' where id = :'kitchen_member';
select test.ok(private.enqueue_offline_alerts() = 0, 'a screen seen 20 seconds ago is fine');
update public.members set last_seen_at = now() - interval '3 minutes' where id = :'kitchen_member';
select test.ok(private.enqueue_offline_alerts() = 1, 'a screen silent for 3 minutes during service raises an alert');
select test.ok(private.enqueue_offline_alerts() = 0, 'once per outage');
select payload as p_off from public.notification_outbox where event = 'station.offline' order by id desc limit 1 \gset
select test.ok(private.render_notification('station.offline', :'p_off'::jsonb, 'hy') = '«Խոհանոց» էկրանն անջատված է 3 րոպե։',
  'the alert names the screen');
update public.members set last_seen_at = now() - interval '4 minutes' - interval '1 second' where id = :'kitchen_member';
select test.ok(private.enqueue_offline_alerts() = 1, 'a new outage (new last-seen time) alerts again');
-- Closed for the night: no open tables and no recent orders
update public.table_sessions set status = 'closed', closed_at = now() where location_id = :'ln';
update public.orders set placed_at = now() - interval '2 hours' where location_id = :'ln';
update public.members set last_seen_at = now() - interval '5 minutes' where id = :'kitchen_member';
select test.ok(private.enqueue_offline_alerts() = 0, 'a screen switched off after closing raises nothing');

-- A dish cancelled after it was served
update public.kitchen_tickets set status = 'served', served_at = now() where order_id = :'o3' and kind = 'order';
select id as oi3 from public.order_items where order_id = :'o3' \gset
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.cancel_order_item(:'oi3', 1, 'cold') is null as comped \gset
reset role;
select payload as p_comp from public.notification_outbox where event = 'order.comped' and payload ->> 'order_id' = :'o3' \gset
select test.ok(:'p_comp' is not null, 'cancelling a served dish raises an alert');
select test.ok(private.render_notification('order.comped', :'p_comp'::jsonb, 'hy')
               ~ ('^Չեղարկվել է մատուցելուց հետո՝ սեղան 5, №[0-9]+, Խորոված × 1, 3' || chr(160) || '250' || chr(160) || '֏$'),
  'the alert names the dish and the amount');
select test.ok(private.render_notification('order.comped', :'p_comp'::jsonb, 'ru') like '%Хоровац × 1%', 'Russian uses the Russian dish name');

-- The day summary, once the café has closed
select private.business_date(:'ln') as bd \gset
select (:'bd'::date + time '23:30') at time zone 'Asia/Yerevan' as close_time \gset
update public.orders set placed_at = :'close_time'::timestamptz - interval '2 hours' where location_id = :'ln';
select private.day_summary_payload(:'ln', :'bd') as p_day \gset
select test.ok((:'p_day'::jsonb ->> 'orders')::int = 3, 'the summary counts the day''s orders');
select test.ok((:'p_day'::jsonb ->> 'revenue')::int = 6500 * 3 - 3250, 'and the revenue after cancellations');
select test.ok((:'p_day'::jsonb ->> 'cancelled')::int = 1, 'and cancelled dishes');
select test.ok(private.render_notification('day.summary', :'p_day'::jsonb, 'hy')
               like format('Օրվա ամփոփում՝ %s%%Պատվերներ՝ 3%%Վաճառք՝ 16%s250%s֏%%Խորոված (5)%%', to_char(:'bd'::date, 'DD.MM.YYYY'), chr(160), chr(160)),
  'the Armenian summary lists date, orders, revenue and top dishes');
select test.ok(private.enqueue_day_summaries(:'close_time'::timestamptz - interval '3 hours') = 0, 'no summary while the evening is on');
select test.ok(private.enqueue_day_summaries(:'close_time'::timestamptz) = 1, 'at closing (all tables closed, quiet for an hour) the summary is queued');
select test.ok(private.enqueue_day_summaries(:'close_time'::timestamptz + interval '5 hours') = 0, 'and only once a day');

-- Test messages from the admin
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.send_test_notification(:'ch_tg') is null as test_sent \gset
reset role;
select test.ok(exists (select 1 from public.notification_outbox where channel_id = :'ch_tg' and event = 'channel.test' and status = 'pending'),
  '"send test" queues a test message');
select test.act_as('f8000000-0000-0000-0000-000000000004');
select test.fails(format('select api.send_test_notification(%L)', :'ch_tg'), 'forbidden', 'another café cannot send to our chat');

-- Schedules and privileges
reset role;
select test.ok((select count(*) from cron.job where jobname in ('pativ-notify', 'pativ-alerts', 'pativ-day-summary')) = 3,
  'pg_cron runs the worker, the alert checks and the summaries');
select test.ok((select schedule from cron.job where jobname = 'pativ-notify') = '10 seconds', 'the worker runs every 10 seconds');
select test.ok(not has_function_privilege('authenticated', 'private.run_notifications()', 'execute')
               and not has_function_privilege('anon', 'private.deliver_outbox(integer)', 'execute')
               and not has_function_privilege('authenticated', 'private.telegram_set_webhook(text)', 'execute')
               and not has_function_privilege('authenticated', 'private.secret(text)', 'execute'),
  'clients cannot run the worker or read Vault');
select test.ok(has_function_privilege('anon', 'api.telegram_update(text, jsonb)', 'execute'), 'the webhook route can call telegram_update');

-- With a token, registering the webhook calls setWebhook with the secret
select test.ok(private.telegram_set_webhook('https://preview.example/api/telegram') like 'requested:%', 'with a token the webhook is registered');
select url as wh_url, body as wh_body from net._stub_requests order by id desc limit 1 \gset
select test.ok(:'wh_url' = 'https://api.telegram.org/bot123456:TEST-token/setWebhook'
               and (:'wh_body'::jsonb ->> 'secret_token') = :'hook_secret'
               and (:'wh_body'::jsonb ->> 'url') = 'https://preview.example/api/telegram', 'setWebhook gets the URL and the secret');

-- ===========================================================================
-- 8.3 Web push
-- ===========================================================================
-- A P-256 public key is 65 bytes, the auth secret 16
\set p256dh 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
\set authkey 'tBHItJI5svbpez7KI4CCXg'
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.save_push_subscription(:'rn', 'https://fcm.googleapis.com/fcm/send/device-a', :'p256dh', :'authkey', 'Phone') as ch_push \gset
select api.save_push_subscription(:'rn', 'https://fcm.googleapis.com/fcm/send/device-a', :'p256dh', :'authkey', 'Phone') = :'ch_push' as same_ch \gset
select api.save_push_subscription(:'rn', 'https://web.push.apple.com/device-b', :'p256dh', :'authkey', 'iPhone') is not null as second \gset
select test.fails(format('select api.save_push_subscription(%L, %L, %L, %L)', :'rn', 'http://evil.example/x', :'p256dh', :'authkey'),
  'invalid_subscription', 'a non-https endpoint is refused');
select test.fails(format('select api.save_push_subscription(%L, %L, %L, %L)', :'rn', 'https://fcm.googleapis.com/x', 'short', :'authkey'),
  'invalid_subscription', 'a malformed key is refused');
select test.act_as('f8000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.save_push_subscription(%L, %L, %L, %L)', :'rn', 'https://fcm.googleapis.com/fcm/send/g', :'p256dh', :'authkey'),
  'forbidden', 'a guest cannot subscribe to café alerts');
reset role;
select test.ok((select count(*) from public.push_subscriptions where channel_id = :'ch_push') = 2, 'subscribing stores one row per device');
select test.ok((select kind = 'web_push' and user_id = 'f8000000-0000-0000-0000-000000000001'
                from public.notification_channels where id = :'ch_push'), 'the owner gets one web push channel');
select test.ok(not has_table_privilege('authenticated', 'public.push_subscriptions', 'select'), 'clients cannot read subscription keys');

select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.update_notification_channel(:'ch_push', '{order.placed,order.overdue,station.offline,order.comped,day.summary}', 'hy', true) is null as push_upd \gset
select api.place_waiter_order(:'t5', 'f8a00000-0000-0000-0000-000000000004', :'two_khorovats'::jsonb) as o4 \gset
reset role;
select id as ob4_push, payload as p4 from public.notification_outbox where dedupe_key = 'order.placed:' || :'o4' and channel_id = :'ch_push' \gset
select test.ok(:'ob4_push' is not null, 'a new order creates a web_push outbox row');
select test.ok((select payload from public.notification_outbox where dedupe_key = 'order.placed:' || :'o4' and channel_id = :'ch_tg') = :'p4'::jsonb,
  'with the same content as the Telegram row');

-- No app address in Vault yet: web push waits, nothing fails
update public.notification_outbox set status = 'sent' where status in ('pending', 'failed') and id <> :ob4_push;
select count(*) as req4 from net._stub_requests \gset
select test.ok(private.run_notifications() = 0, 'without app_base_url web push sends nothing');
select test.ok((select status = 'pending' and attempts = 0 from public.notification_outbox where id = :ob4_push), 'and the row waits');

select vault.create_secret('https://preview.example/', 'app_base_url') is not null as base_added \gset
select test.ok(private.run_notifications() = 1, 'with the app address the worker pokes the push route');
select url as push_url, body as push_body from net._stub_requests order by id desc limit 1 \gset
select test.ok(:'push_url' = 'https://preview.example/api/push', 'at /api/push');
select test.ok((:'push_body'::jsonb ->> 'id')::bigint = :ob4_push and (:'push_body'::jsonb ->> 'attempt') = '1'
               and (:'push_body'::jsonb ->> 'sig') = private.push_sig(:ob4_push, 1), 'with the row id signed for this attempt');
select :'push_body'::jsonb ->> 'sig' as sig4 \gset

select test.act_as_anon();
select test.fails(format('select api.push_claim(%s, 1, %L)', :ob4_push, 'forged'), 'forbidden', 'a forged signature is refused');
select test.fails(format('select api.push_claim(%s, 2, %L)', :ob4_push, :'sig4'), 'forbidden', 'a signature for another attempt is refused');
select api.push_claim(:ob4_push, 1, :'sig4') as claim \gset
select test.ok((:'claim'::jsonb ->> 'body') = format('Նոր պատվեր՝ սեղան 5, 6%s500%s֏', chr(160), chr(160)),
  'the push text is the same as Telegram''s');
select test.ok((:'claim'::jsonb ->> 'title') = 'Պատիվ', 'the title is the brand name');
select test.ok(jsonb_array_length(:'claim'::jsonb -> 'subscriptions') = 2, 'both devices are listed');

-- The route reports: one device delivered, one gone (410)
select api.push_report(:ob4_push, 1, :'sig4',
  '[{"endpoint": "https://fcm.googleapis.com/fcm/send/device-a", "status": 201},
    {"endpoint": "https://web.push.apple.com/device-b", "status": 410}]'::jsonb) is null as reported \gset
reset role;
select test.ok((select status = 'sent' and net_request_id is null from public.notification_outbox where id = :ob4_push), 'a delivered push marks the row sent');
select test.ok((select count(*) from public.push_subscriptions where channel_id = :'ch_push') = 1, 'a gone (410) subscription is removed');
select test.act_as_anon();
select test.fails(format('select api.push_claim(%s, 1, %L)', :ob4_push, :'sig4'), 'not_in_flight', 'a used signature cannot claim the row again');

-- Unsubscribing removes only the caller's device
select test.act_as('f8000000-0000-0000-0000-000000000004');
select api.delete_push_subscription('https://fcm.googleapis.com/fcm/send/device-a') is null as other_del \gset
reset role;
select test.ok((select count(*) from public.push_subscriptions where channel_id = :'ch_push') = 1, 'another user cannot remove our device');
select test.act_as('f8000000-0000-0000-0000-000000000001');
select api.delete_push_subscription('https://fcm.googleapis.com/fcm/send/device-a') is null as own_del \gset
reset role;
select test.ok((select count(*) from public.push_subscriptions where channel_id = :'ch_push') = 0, 'the owner removes their device');

-- Leave nothing behind for later suites
delete from vault.secrets where name in ('telegram_bot_token', 'app_base_url');
\echo NOTIFICATION TESTS PASSED
