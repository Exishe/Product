-- Guest event tracking (ADR-072): what anon may record, what is refused, who
-- reads, the derived cart_abandoned, the served time and the 90-day purge.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('ae000000-0000-0000-0000-000000000001', 'owner-ev-a@example.am', false),
  ('ae000000-0000-0000-0000-000000000002', 'owner-ev-b@example.am', false),
  ('ae000000-0000-0000-0000-000000000003', 'manager-ev-a@example.am', false),
  ('ae000000-0000-0000-0000-000000000004', null, true),   -- a guest
  ('ae000000-0000-0000-0000-000000000005', null, true);   -- a guest at the table

select test.act_as('ae000000-0000-0000-0000-000000000001');
select api.create_restaurant('Events A', 'ev-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('ae000000-0000-0000-0000-000000000002');
select api.create_restaurant('Events B', 'ev-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ev-cafe-a-waiter' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'ae000000-0000-0000-0000-000000000003', 'manager', 'Manager A');

-- Café A: two dishes and a table. Café B: one dish. Both published.
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as ma \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'ma', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'ma', 1) returning id as ca \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'ca', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'ca', 3200) returning id as tolma \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'ca', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'tolma', 'hy', 'Տոլմա'), (:'ra', :'coffee', 'hy', 'Սուրճ');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
insert into public.menus (restaurant_id, internal_name) values (:'rb', 'Main') returning id as mb \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rb', :'mb', :'lb');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rb', :'mb', 1) returning id as cb \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rb', :'cb', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rb', :'cb', 900) returning id as foreign_item \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rb', :'foreign_item', 'hy', 'Խաշ');
select test.act_as('ae000000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pa \gset
select api.table_qr_token(:'t1') as tok1 \gset
select test.act_as('ae000000-0000-0000-0000-000000000002');
select api.publish_menu(:'lb') is not null as pb \gset
reset role;

\set view '[{"kind": "item_view", "item_id": "' :tolma '"}]'
\set add '[{"kind": "item_add", "item_id": "' :tolma '", "meta": {"qty": 2}}]'
\set pair '[{"kind": "suggestion_shown", "item_id": "' :coffee '", "meta": {"from": "' :tolma '"}}, {"kind": "suggestion_accepted", "item_id": "' :coffee '", "meta": {"from": "' :tolma '", "via": "sheet"}}]'
\set foreign '[{"kind": "item_view", "item_id": "' :foreign_item '"}]'

-- ---------------------------------------------------------------------------
-- Anon records valid events
-- ---------------------------------------------------------------------------
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select api.record_guest_events(:'la', 'visit-aaaaaaaa1', :'view'::jsonb) ->> 'recorded' as n1 \gset
select api.record_guest_events(:'la', 'visit-aaaaaaaa1', :'add'::jsonb) ->> 'recorded' as n2 \gset
select api.record_guest_events(:'la', 'visit-aaaaaaaa1', :'pair'::jsonb) ->> 'recorded' as n3 \gset
select api.record_guest_events(:'la', 'visit-aaaaaaaa1', '[]'::jsonb) ->> 'recorded' as n0 \gset
reset role;
select test.ok(:'n1' = '1' and :'n2' = '1' and :'n3' = '2' and :'n0' = '0', 'a guest records views, adds and suggestions');
select test.ok((select count(*) from public.guest_events where session_key = 'visit-aaaaaaaa1' and restaurant_id = :'ra' and location_id = :'la') = 4,
               'four rows, with the café filled in by the server');
select test.ok((select meta ->> 'qty' from public.guest_events where kind = 'item_add') = '2', 'meta is kept');

-- A client time is ignored.
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select api.record_guest_events(:'la', 'visit-bbbbbbbb2',
  jsonb_build_array(jsonb_build_object('kind', 'item_view', 'item_id', :'tolma'::text, 'at', '2001-01-01T00:00:00Z'))) is not null as t \gset
reset role;
select test.ok((select at > now() - interval '1 minute' from public.guest_events where session_key = 'visit-bbbbbbbb2'), 'the server clock is the time, not the client''s');

-- ---------------------------------------------------------------------------
-- Refused
-- ---------------------------------------------------------------------------
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "order_placed", "item_id": "' || :'tolma' || '"}]'), 'guest_events_bad_kind', 'a kind outside the allowlist is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3', :'foreign'),
  'guest_events_bad_item', 'a dish of another café is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "item_view", "item_id": "not-a-uuid"}]'), 'guest_events_bad_item', 'a made-up id is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "item_view"}]'), 'guest_events_bad_item', 'a missing dish is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'lb', 'visit-cccccccc3', :'view'),
  'guest_events_bad_item', 'and a café''s dish sent for another café');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "item_view", "item_id": "' || :'tolma' || '", "meta": {"name": "Ani"}}]'), 'guest_events_bad_meta', 'meta keys outside the allowlist (anything personal) are refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "item_view", "item_id": "' || :'tolma' || '", "meta": {"via": "a very long free text here"}}]'), 'guest_events_bad_meta', 'free text in meta is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'x', :'view'),
  'guest_events_bad_session', 'a session key that is too short is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'a b; drop table', :'view'),
  'guest_events_bad_session', 'or has odd characters');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', 'ac000000-0000-0000-0000-0000000000ff', 'visit-cccccccc3', :'view'),
  'guest_events_unknown_location', 'an unknown café is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3', '{"kind": "item_view"}'),
  'guest_events_bad_events', 'an object instead of an array is refused');
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  (select jsonb_agg(jsonb_build_object('kind', 'item_view', 'item_id', :'tolma'::text)) from generate_series(1, 21))::text),
  'guest_events_too_many', 'more than 20 events in a call is refused');
-- One bad event refuses the whole call.
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-cccccccc3',
  '[{"kind": "item_view", "item_id": "' || :'tolma' || '"}, {"kind": "nope", "item_id": "' || :'tolma' || '"}]'),
  'guest_events_bad_kind', 'one bad event refuses the batch');
reset role;
select test.ok((select count(*) from public.guest_events where session_key = 'visit-cccccccc3') = 0, 'and nothing of it is stored');

-- Flood: 60 a minute per session, a total per café.
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select api.record_guest_events(:'la', 'visit-flood0001', (select jsonb_agg(jsonb_build_object('kind', 'item_view', 'item_id', :'tolma'::text)) from generate_series(1, 20))) is not null as f1 \gset
select api.record_guest_events(:'la', 'visit-flood0001', (select jsonb_agg(jsonb_build_object('kind', 'item_view', 'item_id', :'tolma'::text)) from generate_series(1, 20))) is not null as f2 \gset
select api.record_guest_events(:'la', 'visit-flood0001', (select jsonb_agg(jsonb_build_object('kind', 'item_view', 'item_id', :'tolma'::text)) from generate_series(1, 20))) is not null as f3 \gset
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-flood0001', :'view'),
  'guest_events_rate_limited', 'a session that sent 60 events in a minute is stopped');
select api.record_guest_events(:'la', 'visit-other0002', :'view'::jsonb) is not null as other_ok \gset
reset role;
select test.ok(:'other_ok', 'another session is not affected');
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id)
select :'ra', :'la', 'botsess-' || g, 'item_view', :'tolma' from generate_series(1, 1200) g;
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.record_guest_events(%L, %L, %L::jsonb)', :'la', 'visit-newbie003', :'view'),
  'guest_events_rate_limited', 'a flood of new sessions is stopped by the café cap');
reset role;
select test.ok((select count(*) from public.guest_events where session_key = 'visit-newbie003') = 0, 'and stores nothing');
delete from public.guest_events where session_key like 'botsess-%' or session_key = 'visit-flood0001';

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select test.ok(has_function_privilege('anon', 'api.record_guest_events(uuid, text, jsonb)', 'execute'), 'anon can record');
select test.ok(not has_function_privilege('anon', 'api.event_timeline(uuid, timestamptz, timestamptz, integer)', 'execute'), 'anon cannot read the timeline');
select test.ok(not has_table_privilege('anon', 'public.guest_events', 'select,insert,update,delete'), 'anon has no table privilege');
select test.ok(not has_table_privilege('authenticated', 'public.guest_events', 'insert,update,delete'), 'nobody writes the table directly');
select test.ok(not has_function_privilege('authenticated', 'private.purge_guest_events(integer)', 'execute'), 'the purge is not callable by users');

-- ---------------------------------------------------------------------------
-- Who reads
-- ---------------------------------------------------------------------------
select test.act_as('ae000000-0000-0000-0000-000000000001');
select count(*) as c_owner from public.guest_events \gset
select count(*) as t_owner from api.event_timeline(:'la') \gset
select test.act_as('ae000000-0000-0000-0000-000000000003');
select count(*) as c_mgr from public.guest_events \gset
select count(*) as t_mgr from api.event_timeline(:'la') \gset
select test.act_as(:'u_waiter');
select count(*) as c_waiter from public.guest_events \gset
select test.fails(format('select * from api.event_timeline(%L)', :'la'), 'forbidden', 'a waiter login cannot read the timeline');
select test.act_as('ae000000-0000-0000-0000-000000000002');
select count(*) as c_other from public.guest_events where restaurant_id = :'ra' \gset
select test.fails(format('select * from api.event_timeline(%L)', :'la'), 'forbidden', 'another café''s owner cannot read the timeline');
select test.act_as('ae000000-0000-0000-0000-000000000004', true);
select count(*) as c_guest from public.guest_events \gset
select test.fails(format('select * from api.event_timeline(%L)', :'la'), 'forbidden', 'a guest cannot read the timeline');
reset role;
select test.ok(:'c_guest'::int = 0, 'nor a single row of the table');
select test.ok(:'c_owner'::int = 6 and :'c_mgr'::int = 6, 'the owner and the manager read the café''s events');
select test.ok(:'t_owner'::int = 6 and :'t_mgr'::int = 6, 'and the timeline');
select test.ok(:'c_waiter'::int = 0 and :'c_other'::int = 0, 'staff logins and other cafés read none');

-- ---------------------------------------------------------------------------
-- Order times in the timeline, served included
-- ---------------------------------------------------------------------------
select test.act_as('ae000000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok1', 'hy') as gs \gset
select api.guest_place_order(:'gs', 'ae100000-0000-0000-0000-000000000001',
  ('[{"item_id": "' || :'coffee' || '", "quantity": 1}]')::jsonb, null) as o1 \gset
select api.guest_service_request(:'gs', 'call_waiter') is not null as c1 \gset
select api.guest_service_request(:'gs', 'bring_bill') is not null as c2 \gset
reset role;
select id as k1 from public.kitchen_tickets where order_id = :'o1' \gset
select test.act_as('ae000000-0000-0000-0000-000000000001');
select api.set_ticket_status(:'k1', 'new', 'ready') = 'ready' as r \gset
select api.set_ticket_status(:'k1', 'ready', 'served') = 'served' as s \gset
select string_agg(kind, ',' order by kind) as kinds from api.event_timeline(:'la')
  where kind in ('order_placed', 'order_accepted', 'order_ready', 'order_served', 'waiter_called', 'bill_requested') \gset
reset role;
select test.ok((select served_at is not null and ready_at is not null from public.orders where id = :'o1'), 'serving stamps the order''s served time (and ready time)');
select test.ok(:'kinds' = 'bill_requested,order_accepted,order_placed,order_ready,order_served,waiter_called',
               'the timeline carries the order lifecycle, the call and the bill: ' || :'kinds');

-- ---------------------------------------------------------------------------
-- cart_abandoned is derived: an add with no order within 30 minutes
-- ---------------------------------------------------------------------------
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at) values
  (:'ra', :'la', 'abandon-one-1', 'item_add', :'tolma', now() - interval '50 minutes'),
  (:'ra', :'la', 'abandon-one-1', 'item_add', :'coffee', now() - interval '45 minutes'),   -- the last of its run
  (:'ra', :'la', 'abandon-new-2', 'item_add', :'tolma', now() - interval '10 minutes'),    -- still inside the window
  (:'ra', :'la', :'gs', 'item_add', :'coffee', now() - interval '40 minutes');             -- this session orders below
update public.orders set placed_at = now() - interval '35 minutes' where id = :'o1';
select test.act_as('ae000000-0000-0000-0000-000000000001');
select count(*) as ab_n, min(session_key) as ab_s, min(item_id::text) as ab_i from api.event_timeline(:'la') where kind = 'cart_abandoned' \gset
select (min(at) between now() - interval '15 minutes 5 seconds' and now() - interval '14 minutes 55 seconds') as ab_at
  from api.event_timeline(:'la') where kind = 'cart_abandoned' \gset
reset role;
select test.ok(:'ab_n' = '1' and :'ab_s' = 'abandon-one-1' and :'ab_i' = :'coffee', 'only the run with no order and a closed window is abandoned, once, at its last add');
select test.ok(:'ab_at' = 't', 'at 30 minutes after that last add');
select test.ok((select count(*) from public.guest_events where kind not in ('item_view', 'item_add', 'suggestion_shown', 'suggestion_accepted')) = 0,
               'and nothing derived is ever stored');

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at)
select :'ra', :'la', 'oldsess-' || g, 'item_view', :'tolma', now() - interval '91 days' - g * interval '1 minute' from generate_series(1, 5200) g;
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at) values
  (:'ra', :'la', 'edge-days-89', 'item_view', :'tolma', now() - interval '89 days'),
  (:'rb', :'lb', 'edge-days-0', 'item_view', :'foreign_item', now());
select count(*) as before_n from public.guest_events \gset
select private.purge_guest_events() as purged \gset
select test.ok(:'purged'::int = 5200, 'the purge removes every row older than 90 days, in batches');
select test.ok((select count(*) from public.guest_events) = :'before_n'::int - 5200
               and exists (select 1 from public.guest_events where session_key = 'edge-days-89')
               and exists (select 1 from public.guest_events where session_key = 'edge-days-0'), 'and only those');
select test.ok(exists (select 1 from cron.job where jobname = 'pativ-purge-guest-events' and command like '%purge_guest_events%'), 'a daily job is scheduled');
