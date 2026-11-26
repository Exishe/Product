-- POS connection (ADR-093): accepted orders are queued for the location's
-- POS, the worker pokes /api/pos with a signed id, the route claims and
-- reports. pg_net is the harness stand-in (requests are only recorded).
-- Runs after 90-smoke-test.sql and adr038.sql and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('f9300000-0000-0000-0000-000000000001', 'owner-pos@example.am', false),
  ('f9300000-0000-0000-0000-000000000002', null, true),   -- waiter tablet
  ('f9300000-0000-0000-0000-000000000003', 'owner-pos-q@example.am', false),
  ('f9300000-0000-0000-0000-000000000004', null, true),   -- a guest
  ('f9300000-0000-0000-0000-000000000005', null, true),   -- kitchen tablet
  ('f9300000-0000-0000-0000-000000000006', 'manager-pos@example.am', false);

-- Café P: khorovats with a size option, tolma, tables 4 and 5
select test.act_as('f9300000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Պ', 'cafe-pos', 'Main', 'Petros') as rp \gset
select id as lp from public.locations where restaurant_id = :'rp' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rp', 'Main') returning id as pmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rp', :'pmenu', :'lp');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rp', :'pmenu', 1) returning id as pcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rp', :'pcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price, sort) values (:'rp', :'pcat', 3300, 1) returning id as khorovats \gset
insert into public.items (restaurant_id, category_id, price, sort) values (:'rp', :'pcat', 3200, 2) returning id as tolma \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'rp', :'khorovats', 'hy', 'Հավի խորոված'), (:'rp', :'khorovats', 'ru', 'Хоровац из курицы'),
  (:'rp', :'tolma', 'hy', 'Տոլմա');
insert into public.modifier_groups (restaurant_id, min_select, max_select) values (:'rp', 0, 1) returning id as size_group \gset
insert into public.modifier_group_translations (restaurant_id, group_id, locale, name) values (:'rp', :'size_group', 'hy', 'Չափ');
insert into public.modifiers (restaurant_id, group_id, price_delta) values (:'rp', :'size_group', 500) returning id as big \gset
insert into public.modifier_translations (restaurant_id, modifier_id, locale, name) values (:'rp', :'big', 'hy', 'Մեծ');
insert into public.item_modifier_groups (restaurant_id, item_id, group_id) values (:'rp', :'khorovats', :'size_group');
insert into public.tables (restaurant_id, location_id, label) values (:'rp', :'lp', '4') returning id as t4 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rp', :'lp', '5') returning id as t5 \gset
select api.publish_menu(:'lp') is not null as published \gset
select api.table_qr_token(:'t5') as tok5 \gset
select api.create_device_pairing(:'lp', 'waiter', 'Սրահ') as wcode \gset
select api.create_device_pairing(:'lp', 'kitchen', 'Խոհանոց') as kcode \gset
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
select test.act_as('f9300000-0000-0000-0000-000000000005', true);
select (api.redeem_device_pairing(:'kcode') ->> 'role') = 'kitchen' as kitchen_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rp', 'f9300000-0000-0000-0000-000000000006', 'manager', 'Mane');

-- Café Q, whose owner must see nothing of P's connection
select test.act_as('f9300000-0000-0000-0000-000000000003');
select api.create_restaurant('Cafe Q', 'cafe-pos-q', 'Main', 'Qnar') as rq \gset
select id as lq from public.locations where restaurant_id = :'rq' \gset

\set two_khorovats_big '[{"item_id": "' :khorovats '", "quantity": 2, "modifier_ids": ["' :big '"], "note": "առանց սոխի"}]'
\set one_tolma '[{"item_id": "' :tolma '", "quantity": 1}]'

-- ===========================================================================
-- No connection: nothing is queued
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t4', 'f9300000-0000-0000-0000-0000000000a1', :'one_tolma'::jsonb) as o0 \gset
reset role;
select test.ok((select status from public.orders where id = :'o0') = 'accepted', 'a waiter order is accepted at once');
select test.ok(not exists (select 1 from public.pos_outbox where order_id = :'o0'), 'without a POS connection nothing is queued');
select test.ok(exists (select 1 from vault.secrets where name = 'pos_job_key'), 'the migration generated the job key inside the database');

-- ===========================================================================
-- Saving a connection: owner or manager only, settings checked
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000003');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', ''{}'')', :'lp'), 'forbidden',
  'another café''s owner cannot connect our POS');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.pos_save_connection(%L, ''test'', ''{}'')', :'lp'), 'forbidden', 'nor can the waiter tablet');
select test.act_as('f9300000-0000-0000-0000-000000000001');
select test.fails(format('select api.pos_save_connection(%L, ''rkeeper'', ''{}'')', :'lp'), 'invalid_vendor', 'r_keeper is not offered');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "http://pos.example.am/hook"}'),
  'invalid_url', 'a webhook must be https');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "https://localhost/hook"}'),
  'invalid_url', 'not localhost');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "https://192.168.1.10/hook"}'),
  'invalid_url', 'not a private address');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "https://169.254.169.254/latest"}'),
  'invalid_url', 'not the link-local metadata address');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "https://[::1]/hook"}'),
  'invalid_url', 'not an IPv6 literal');
select test.fails(format('select api.pos_save_connection(%L, ''webhook'', %L)', :'lp', '{"url": "https://pos.example.am/x", "secret": "x"}'),
  'invalid_settings', 'and no unknown setting (a key never goes into settings)');
reset role;
select test.ok(private.pos_url_ok('https://pos.example.am/hook') and private.pos_url_ok('https://8.8.8.8/x')
               and not private.pos_url_ok('https://10.0.0.1/') and not private.pos_url_ok('https://172.20.1.1/')
               and not private.pos_url_ok('https://127.0.0.1/') and not private.pos_url_ok('https://intranet/')
               and not private.pos_url_ok('https://user@pos.example.am/'), 'the URL guard');
select test.act_as('f9300000-0000-0000-0000-000000000001');

select api.pos_save_connection(:'lp', 'test', '{}') as conn \gset
select test.fails(format('select api.pos_set_secret(%L, %L)', :'conn', 'short'), 'invalid_secret', 'a key is at least 8 characters');

-- ===========================================================================
-- Turned off: still nothing queued
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t4', 'f9300000-0000-0000-0000-0000000000a2', :'one_tolma'::jsonb) as o00 \gset
reset role;
select test.ok(not exists (select 1 from public.pos_outbox where order_id = :'o00'), 'a connection that is off queues nothing');

-- ===========================================================================
-- Test POS on: an accepted order is queued with the neutral payload
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000001');
select api.pos_set_active(:'conn', true) is null as on1 \gset
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t4', 'f9300000-0000-0000-0000-0000000000a3', :'two_khorovats_big'::jsonb) as o1 \gset
reset role;
select id as q1 from public.pos_outbox where order_id = :'o1' \gset
select payload::text as p1 from public.pos_outbox where id = :'q1' \gset
select test.ok((select count(*) from public.pos_outbox where order_id = :'o1') = 1, 'an accepted order is queued once');
select test.ok((select status from public.pos_outbox where id = :'q1') = 'pending', 'pending');
select test.ok(:'p1'::jsonb ->> 'event' = 'order.accepted' and :'p1'::jsonb ->> 'idempotency_key' = 'pativ-order-' || :'o1',
  'the payload says order.accepted with an idempotency key per order');
select test.ok(:'p1'::jsonb #>> '{cafe,name}' = 'Սրճարան Պ' and :'p1'::jsonb #>> '{table,label}' = '4', 'it names the café and the table');
select test.ok(:'p1'::jsonb #>> '{order,items,0,name}' = 'Հավի խորոված' and (:'p1'::jsonb #>> '{order,items,0,quantity}')::int = 2
               and (:'p1'::jsonb #>> '{order,items,0,unit_price}')::int = 3300
               and :'p1'::jsonb #>> '{order,items,0,note}' = 'առանց սոխի', 'each line: Armenian name, quantity, price, note');
select test.ok(:'p1'::jsonb #> '{order,items,0,external_id}' = 'null'::jsonb, 'an unmatched dish has external_id null');
select test.ok(:'p1'::jsonb #>> '{order,items,0,modifiers,0,name}' = 'Մեծ' and (:'p1'::jsonb #>> '{order,items,0,modifiers,0,price_delta}')::int = 500,
  'with its option');
select test.ok((:'p1'::jsonb ->> 'total')::int = 7600, 'and the total');

-- A QR order waiting for the waiter is queued when it is accepted, not before.
update public.locations set require_acceptance = true where id = :'lp';
select test.act_as('f9300000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok5', 'hy') as g5 \gset
select api.guest_place_order(:'g5', 'f9300000-0000-0000-0000-0000000000b1', :'one_tolma'::jsonb, null) as o2 \gset
reset role;
select test.ok(not exists (select 1 from public.pos_outbox where order_id = :'o2'), 'a QR order waiting for acceptance is not queued');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.accept_order(:'o2') is null as acc \gset
select api.accept_order(:'o2') is null as acc2 \gset
reset role;
select test.ok((select count(*) from public.pos_outbox where order_id = :'o2') = 1, 'accepting it queues it, once even when accepted twice');
select id as q2 from public.pos_outbox where order_id = :'o2' \gset

-- ===========================================================================
-- The worker: waits without the app's address, then signs each POST
-- ===========================================================================
select count(*) as req0 from net._stub_requests \gset
select private.run_pos() as n0 \gset
select test.ok(:n0 = 0 and (select count(*) from net._stub_requests) = :req0, 'without app_base_url in Vault the rows wait');
select vault.create_secret('https://preview.example', 'app_base_url', 'test') is not null as base \gset
select private.run_notifications() is not null as ran \gset
select test.ok((select count(*) from net._stub_requests where url = 'https://preview.example/api/pos') = 2,
  'the 10-second job posts each due row to /api/pos');
select test.ok((select status from public.pos_outbox where id = :'q1') = 'sending' and (select attempts from public.pos_outbox where id = :'q1') = 1,
  'the row is sending, attempt 1');
select (body ->> 'sig') as sig1 from net._stub_requests where url like '%/api/pos' and (body ->> 'id')::bigint = :q1 \gset
select test.ok(:'sig1' = private.pos_sig(:q1, 1) and :'sig1' ~ '^[A-Za-z0-9_-]{43}$', 'the body carries a signature of id and attempt');
select test.ok(private.run_pos() = 0, 'a second run sends nothing more while they are out');

-- Claiming
select test.act_as_anon();
select test.fails(format('select api.pos_claim(%s, 1, %L)', :q1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), 'forbidden', 'a wrong signature is refused');
select test.fails(format('select api.pos_claim(%s, 2, %L)', :q1, :'sig1'), 'forbidden', 'a signature is for one attempt only');
select test.fails(format('select api.pos_claim(%s, 1, %L)', :q2, :'sig1'), 'forbidden', 'and for one row only');
select api.pos_claim(:q1, 1, :'sig1')::text as claim1 \gset
select test.ok(:'claim1'::jsonb ->> 'vendor' = 'test' and :'claim1'::jsonb #>> '{payload,order,id}' = :'o1',
  'the signed claim returns the vendor and the payload');
select test.fails(format('select api.pos_report(%s, 1, %L, true, %L, null)', :q1, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'TEST-1'),
  'forbidden', 'a report with a wrong signature is refused');
select api.pos_report(:q1, 1, :'sig1', true, 'TEST-1', null) is null as rep1 \gset
select test.fails(format('select api.pos_report(%s, 1, %L, true, %L, null)', :q1, :'sig1', 'TEST-1'),
  'not_in_flight', 'the same attempt cannot be reported twice');
reset role;
select test.ok((select status = 'sent' and external_order_id = 'TEST-1' and sent_at is not null from public.pos_outbox where id = :'q1'),
  'a good report marks it sent with the POS order id');
select test.ok(exists (select 1 from realtime.messages where topic = 'loc:' || :'lp' and event = 'pos' and payload ->> 'status' = 'sent'),
  'the waiter screens hear about it');

-- Failing and backing off
select (body ->> 'sig') as sig2 from net._stub_requests where url like '%/api/pos' and (body ->> 'id')::bigint = :q2 \gset
select test.act_as_anon();
select api.pos_report(:q2, 1, :'sig2', false, null, 'http 502') is null as rep2 \gset
reset role;
select test.ok((select status = 'failed' and last_error = 'http 502' and next_attempt_at > now() + interval '20 seconds'
                from public.pos_outbox where id = :'q2'), 'a failure waits 30 s before the next try');
select test.ok(private.run_pos() = 0, 'not before');
update public.pos_outbox set next_attempt_at = now() - interval '1 second' where id = :'q2';
select private.run_pos() as n_again \gset
select test.ok(:n_again = 1 and (select attempts from public.pos_outbox where id = :'q2') = 2, 'then it goes again as attempt 2');
-- No report at all: the lease runs out.
update public.pos_outbox set lease_until = now() - interval '1 second' where id = :'q2';
select private.run_pos() as n_lease \gset
select test.ok((select status = 'failed' and last_error = 'no_response' from public.pos_outbox where id = :'q2'),
  'a POST that never reported counts as a failure');
-- Attempts 3, 4, 5 fail: dead.
do $$
declare v_id bigint := (select id from public.pos_outbox where status = 'failed' and last_error = 'no_response' limit 1); v_sig text;
begin
  for i in 3..5 loop
    update public.pos_outbox set next_attempt_at = now() - interval '1 second' where id = v_id;
    perform private.run_pos();
    v_sig := private.pos_sig(v_id, i);
    perform set_config('role', 'anon', false);
    perform api.pos_report(v_id, i, v_sig, false, null, 'http 500');
    reset role;
  end loop;
end $$;
select test.ok((select status = 'dead' and attempts = 5 from public.pos_outbox where id = :'q2'), 'after the 5th failure it is dead');
select test.ok(private.pos_backoff(1) = interval '30 seconds' and private.pos_backoff(4) = interval '5 minutes',
  'backoff 30 s, 1, 3, 5 minutes (about ten minutes in all)');

-- Manual retry
select test.act_as('f9300000-0000-0000-0000-000000000003');
select test.fails(format('select api.pos_retry(%s)', :q2), 'forbidden', 'another café cannot retry our send');
select test.act_as('f9300000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.pos_retry(%s)', :q2), 'forbidden', 'nor can the kitchen tablet');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.pos_retry(:q2) is null as retried \gset
reset role;
select test.ok((select status = 'pending' and attempts = 0 and last_error is null from public.pos_outbox where id = :'q2'),
  'the waiter''s «Կրկին ուղարկել» puts a dead send back in the queue');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.pos_retry(:q2) is null as retried2 \gset
select api.pos_retry(:q1) is null as retried_sent \gset
reset role;
select test.ok((select status from public.pos_outbox where id = :'q1') = 'sent', 'retrying a sent order does nothing (never twice)');

-- A permanent error (unmapped dishes) is not retried by itself.
select private.run_pos() as n_r \gset
select attempts as q2a from public.pos_outbox where id = :'q2' \gset
select private.pos_sig(:q2, :q2a) as sig3 \gset
select test.act_as_anon();
select api.pos_report(:q2, :q2a, :'sig3', false, null, 'unmapped: Տոլմա', false) is null as rep3 \gset
reset role;
select test.ok((select status = 'failed' and next_attempt_at = 'infinity' from public.pos_outbox where id = :'q2'),
  'a failure retrying cannot fix stays failed until someone retries');

-- ===========================================================================
-- Matching: dishes and options carry the POS ids into later payloads
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000001');
select api.pos_save_item_links(:'conn', jsonb_build_array(
  jsonb_build_object('item_id', :'khorovats', 'external_id', 'P-101', 'external_name', 'Chicken BBQ', 'auto_matched', true,
                     'modifiers', jsonb_build_object(:'big', jsonb_build_object('external_id', 'M-7', 'group_id', 'G-1'))))) as nlinks \gset
select api.pos_save_table_links(:'conn', jsonb_build_array(jsonb_build_object('table_id', :'t4', 'external_table_id', 'T-4'))) as ntl \gset
select test.ok(:nlinks = 1 and :ntl = 1, 'the owner saves the matches');
select test.act_as('f9300000-0000-0000-0000-000000000003');
select test.fails(format('select api.pos_save_item_links(%L, ''[]'')', :'conn'), 'forbidden', 'another café cannot change them');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t4', 'f9300000-0000-0000-0000-0000000000a4', :'two_khorovats_big'::jsonb) as o3 \gset
reset role;
select payload::text as p3 from public.pos_outbox where order_id = :'o3' \gset
select test.ok(:'p3'::jsonb #>> '{order,items,0,external_id}' = 'P-101'
               and :'p3'::jsonb #>> '{order,items,0,modifiers,0,external_id}' = 'M-7'
               and :'p3'::jsonb #>> '{order,items,0,modifiers,0,external_group_id}' = 'G-1'
               and :'p3'::jsonb #>> '{table,external_id}' = 'T-4', 'a matched dish, option and table carry the POS ids');

-- Send test order: no order, nothing for the kitchen
select count(*) as tickets0 from public.kitchen_tickets where restaurant_id = :'rp' \gset
select count(*) as orders0 from public.orders where restaurant_id = :'rp' \gset
select test.act_as('f9300000-0000-0000-0000-000000000006');
select api.pos_send_test(:'conn') as qt \gset
reset role;
select test.ok((select is_test and order_id is null and status = 'pending' from public.pos_outbox where id = :'qt'), 'a test send is queued');
select test.ok((select payload #>> '{order,items,0,external_id}' from public.pos_outbox where id = :'qt') = 'P-101',
  'with a matched dish');
select test.ok((select count(*) from public.kitchen_tickets where restaurant_id = :'rp') = :tickets0
               and (select count(*) from public.orders where restaurant_id = :'rp') = :orders0, 'and no order or kitchen ticket');

-- ===========================================================================
-- The secret: write-only, never readable through tables, other cafés locked out
-- ===========================================================================
select test.act_as('f9300000-0000-0000-0000-000000000001');
select api.pos_save_connection(:'lp', 'webhook', '{"url": "https://pos.example.am/pativ"}') = :'conn' as same \gset
select test.ok((select vendor = 'webhook' and not is_active and not has_secret from public.pos_connections where id = :'conn'),
  'changing the vendor switches the connection off and starts over');
select test.ok(not exists (select 1 from public.pos_item_links where connection_id = :'conn'), 'without the old matches');
select test.fails(format('select api.pos_set_active(%L, true)', :'conn'), 'pos_no_secret', 'a webhook cannot go on without its secret');
select api.pos_set_secret(:'conn', 'whsec_0123456789abcdef') is null as s1 \gset
select api.pos_set_secret(:'conn', 'whsec_new_0123456789abcdef') is null as s2 \gset
reset role;
select test.ok((select count(*) from vault.secrets where name = 'pos_secret_' || :'conn') = 1
               and private.secret('pos_secret_' || :'conn') = 'whsec_new_0123456789abcdef', 'the secret is in Vault, replaced in place');
select test.ok(not exists (select 1 from public.pos_connections where settings::text like '%whsec%'), 'and nowhere in the table');
select test.ok((select has_secret from public.pos_connections where id = :'conn'), 'the row only says one is saved');

select test.act_as('f9300000-0000-0000-0000-000000000001');
select test.ok(api.pos_connection_secret(:'conn') = 'whsec_new_0123456789abcdef', 'the owner''s server action can read their own key');
select test.fails('select * from vault.decrypted_secrets', '%permission denied%', 'but not Vault itself');
select test.act_as('f9300000-0000-0000-0000-000000000003');
select test.fails(format('select api.pos_connection_secret(%L)', :'conn'), 'forbidden', 'another café''s owner cannot read our key');
select test.fails(format('select api.pos_set_secret(%L, %L)', :'conn', 'attacker-key-123'), 'forbidden', 'nor replace it');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.pos_connection_secret(%L)', :'conn'), 'forbidden', 'nor can the waiter tablet');
select test.act_as_anon();
select test.fails(format('select api.pos_connection_secret(%L)', :'conn'), '%permission denied%', 'nor anon');

-- RLS: reading the tables
select test.act_as('f9300000-0000-0000-0000-000000000003');
select test.ok((select count(*) from public.pos_connections) = 0 and (select count(*) from public.pos_outbox) = 0
               and (select count(*) from public.pos_item_links) = 0 and (select count(*) from public.pos_table_links) = 0,
  'another café''s owner reads none of our connection, matches or sends');
select test.fails('select * from public.pos_session_orders', '%permission denied%', 'nor the session order ids');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select test.ok((select count(*) from public.pos_outbox where location_id = :'lp') >= 4, 'the waiter tablet reads the sends of its location');
select test.ok((select count(*) from public.pos_connections) = 0, 'but not the connection itself');
select test.act_as('f9300000-0000-0000-0000-000000000005', true);
select test.ok((select count(*) from public.pos_outbox) = 0, 'the kitchen tablet reads no sends');
select test.act_as('f9300000-0000-0000-0000-000000000004', true);
select test.ok((select count(*) from public.pos_outbox) = 0 and (select count(*) from public.pos_connections) = 0, 'nor does a guest');
select test.act_as('f9300000-0000-0000-0000-000000000001');
select test.fails(format('update public.pos_connections set is_active = true where id = %L', :'conn'), '%permission denied%',
  'nobody writes the tables directly, not even the owner');
select test.fails(format('insert into public.pos_outbox (restaurant_id, location_id, connection_id, vendor, is_test, idempotency_key, payload) values (%L, %L, %L, ''test'', true, ''x'', ''{}'')',
                         :'rp', :'lp', :'conn'), '%permission denied%', 'nor queues a send');

-- Switched off: queued rows are skipped, not sent
select api.pos_save_connection(:'lp', 'test', '{}') is not null as back \gset
select api.pos_set_active(:'conn', true) is null as on2 \gset
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t4', 'f9300000-0000-0000-0000-0000000000a5', :'one_tolma'::jsonb) as o4 \gset
select test.act_as('f9300000-0000-0000-0000-000000000001');
select api.pos_set_active(:'conn', false) is null as off \gset
reset role;
select private.run_pos() as n_off \gset
select test.ok((select status from public.pos_outbox where order_id = :'o4') = 'skipped', 'a send of a connection switched off is skipped');

-- iiko: one round of a table session at a time, later rounds join its POS order
reset role;
update public.pos_connections set vendor = 'iiko', is_active = true, has_secret = true,
  settings = '{"organization_id": "org", "terminal_group_id": "tg"}' where id = :'conn';
update public.pos_outbox set status = 'sent' where connection_id = :'conn' and status in ('pending', 'failed', 'sending');
select test.act_as('f9300000-0000-0000-0000-000000000002', true);
select api.place_waiter_order(:'t5', 'f9300000-0000-0000-0000-0000000000a6', :'one_tolma'::jsonb) as r1 \gset
select api.place_waiter_order(:'t5', 'f9300000-0000-0000-0000-0000000000a7', :'one_tolma'::jsonb) as r2 \gset
reset role;
select id as qr1 from public.pos_outbox where order_id = :'r1' \gset
select id as qr2 from public.pos_outbox where order_id = :'r2' \gset
select private.run_pos() as n_iiko \gset
select test.ok((select status from public.pos_outbox where id = :'qr1') = 'sending' and (select status from public.pos_outbox where id = :'qr2') = 'pending',
  'iiko: the second round of a table waits while the first is out');
select private.pos_sig(:qr1, 1) as sigr1 \gset
select test.act_as_anon();
select api.pos_report(:qr1, 1, :'sigr1', true, 'iiko-order-1', null) is null as rr1 \gset
reset role;
select private.run_pos() as n_iiko2 \gset
select private.pos_sig(:qr2, 1) as sigr2 \gset
select test.act_as_anon();
select api.pos_claim(:qr2, 1, :'sigr2') ->> 'session_order_id' as sess2 \gset
reset role;
select test.ok(:'sess2' = 'iiko-order-1', 'then goes with the POS order of the session, so it is added to it');

-- The waiter's own orders never fail because of the POS
reset role;
select test.ok((select count(*) from public.orders where restaurant_id = :'rp' and status = 'accepted') >= 6, 'every order was accepted');

-- Leave Vault as the later test files expect it.
delete from vault.secrets where name = 'app_base_url';
update public.pos_connections set is_active = false where id = :'conn';
