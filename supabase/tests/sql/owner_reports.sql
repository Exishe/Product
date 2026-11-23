-- Owner reports (ADR-073): api.item_conversion, api.busy_hours, api.upsell_report.
-- Deterministic fixtures: one café, yesterday's business day, fixed local times.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('b1000000-0000-0000-0000-000000000001', 'owner-rep-a@example.am', false),
  ('b1000000-0000-0000-0000-000000000002', 'manager-rep-a@example.am', false),
  ('b1000000-0000-0000-0000-000000000003', 'owner-rep-b@example.am', false),
  ('b1000000-0000-0000-0000-000000000004', null, true),   -- a guest at the table
  ('b1000000-0000-0000-0000-000000000005', null, true);   -- an unrelated guest

select test.act_as('b1000000-0000-0000-0000-000000000001');
select api.create_restaurant('Reports A', 'reports-a', 'Main', 'Owner A') as ra \gset
select api.ensure_menu(:'ra') as menu_a \gset
select test.act_as('b1000000-0000-0000-0000-000000000003');
select api.create_restaurant('Reports B', 'reports-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la, timezone as tz from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'reports-a-waiter' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'b1000000-0000-0000-0000-000000000002', 'manager', 'Manager A');

insert into public.categories (id, restaurant_id, menu_id, sort)
values ('b1c00000-0000-0000-0000-000000000001', :'ra', :'menu_a', 1);
insert into public.items (id, restaurant_id, category_id, price, sort) values
  ('b1100000-0000-0000-0000-00000000000a', :'ra', 'b1c00000-0000-0000-0000-000000000001', 1000, 1),
  ('b1100000-0000-0000-0000-00000000000b', :'ra', 'b1c00000-0000-0000-0000-000000000001', 1000, 2),
  ('b1100000-0000-0000-0000-00000000000c', :'ra', 'b1c00000-0000-0000-0000-000000000001', 1000, 3),
  ('b1100000-0000-0000-0000-00000000000d', :'ra', 'b1c00000-0000-0000-0000-000000000001', 1000, 4),
  ('b1100000-0000-0000-0000-00000000000e', :'ra', 'b1c00000-0000-0000-0000-000000000001', 800, 5),
  ('b1100000-0000-0000-0000-00000000000f', :'ra', 'b1c00000-0000-0000-0000-000000000001', 1000, 6);
insert into public.item_translations (restaurant_id, item_id, locale, name)
select :'ra', i.id, 'en', 'Dish ' || right(i.id::text, 1) from public.items i where i.restaurant_id = :'ra';
insert into public.tables (id, restaurant_id, location_id, label)
values ('b1700000-0000-0000-0000-000000000001', :'ra', :'la', '1');

-- Yesterday's business day. Local time helper: yday at hh:mm (and next-day times before 05:00 still belong to it).
select private.business_date(:'la') - 1 as yday \gset
create function pg_temp.at_local(p_day date, p_time time) returns timestamptz language sql as $$
  select (p_day + p_time) at time zone current_setting('rep.tz')
$$;
select set_config('rep.tz', :'tz', false);

-- Table sessions: s1 90 min, s2 60 min, s3 24 h (forgotten), s4 test only, s5 no orders.
insert into public.table_sessions (id, restaurant_id, location_id, table_id, status, opened_at, closed_at) values
  ('b1500000-0000-0000-0000-000000000001', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001', 'closed', pg_temp.at_local(:'yday', '12:00'), pg_temp.at_local(:'yday', '13:30')),
  ('b1500000-0000-0000-0000-000000000002', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001', 'closed', pg_temp.at_local(:'yday', '18:00'), pg_temp.at_local(:'yday', '19:00')),
  ('b1500000-0000-0000-0000-000000000003', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001', 'closed', pg_temp.at_local(:'yday', '10:00'), pg_temp.at_local((:'yday'::date + 1), '10:00')),
  ('b1500000-0000-0000-0000-000000000004', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001', 'closed', pg_temp.at_local(:'yday', '14:00'), pg_temp.at_local(:'yday', '14:30')),
  ('b1500000-0000-0000-0000-000000000005', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001', 'closed', pg_temp.at_local(:'yday', '15:00'), pg_temp.at_local(:'yday', '15:20'));
insert into public.guest_sessions (id, restaurant_id, location_id, table_id, table_session_id, user_id, qr_version, expires_at)
values ('b1600000-0000-0000-0000-000000000001', :'ra', :'la', 'b1700000-0000-0000-0000-000000000001',
        'b1500000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 1, now() + interval '1 day');

-- QR orders, one dish each: A x10 (s3), B x12 (s1), C x4 (s1), E x5 (s2), F x2 (s2); a test order B x30 (s4).
create temp table fx (n integer, item text, qty integer, session text, at timestamptz, is_test boolean);
insert into fx values
  (1, 'a', 10, '3', pg_temp.at_local(:'yday', '13:05'), false),
  (2, 'b', 12, '1', pg_temp.at_local(:'yday', '13:30'), false),
  (3, 'c',  4, '1', pg_temp.at_local(:'yday', '13:45'), false),
  (4, 'e',  5, '2', pg_temp.at_local(:'yday', '19:10'), false),
  (5, 'f',  2, '2', pg_temp.at_local(:'yday', '19:20'), false),
  (6, 'b', 30, '4', pg_temp.at_local(:'yday', '14:10'), true);
insert into public.orders (id, restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at, is_test)
select ('b1a00000-0000-0000-0000-00000000000' || f.n)::uuid, :'ra', :'la', 'b1700000-0000-0000-0000-000000000001',
       ('b1500000-0000-0000-0000-00000000000' || f.session)::uuid, 'b1600000-0000-0000-0000-000000000001',
       'qr', 'dine_in', 'accepted', 'hy', :'yday', f.n, gen_random_uuid(), 'x', f.at, f.at, f.is_test
from fx f;
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
select :'ra', ('b1a00000-0000-0000-0000-00000000000' || f.n)::uuid, ('b1100000-0000-0000-0000-00000000000' || f.item)::uuid,
       '{"hy":"x"}', i.price, f.qty, i.price * f.qty
from fx f join public.items i on i.id = ('b1100000-0000-0000-0000-00000000000' || f.item)::uuid;
-- A waiter order that must not count towards conversion (not a guest view).
insert into public.orders (id, restaurant_id, location_id, created_by_member, source, fulfillment, status, locale,
                           business_date, number, idempotency_key, request_hash, placed_at, accepted_at)
select 'b1a00000-0000-0000-0000-0000000000a1', :'ra', :'la', m.id, 'waiter', 'takeaway', 'accepted', 'hy', :'yday', 20,
       gen_random_uuid(), 'x', pg_temp.at_local(:'yday', '16:00'), pg_temp.at_local(:'yday', '16:00')
from public.members m where m.restaurant_id = :'ra' and m.role = 'owner';
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
values (:'ra', 'b1a00000-0000-0000-0000-0000000000a1', 'b1100000-0000-0000-0000-00000000000d', '{"hy":"x"}', 1000, 7, 7000);

-- Bills: 5 000 at 13:20 (s1), 3 000 at 19:10 (s2), a test bill of 9 999 (s4, only a test order).
insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status, total, idempotency_key, closed_at) values
  (:'ra', :'la', 'b1500000-0000-0000-0000-000000000001', :'yday', 1, 'paid', 5000, gen_random_uuid(), pg_temp.at_local(:'yday', '13:20')),
  (:'ra', :'la', 'b1500000-0000-0000-0000-000000000002', :'yday', 2, 'paid', 3000, gen_random_uuid(), pg_temp.at_local(:'yday', '19:10')),
  (:'ra', :'la', 'b1500000-0000-0000-0000-000000000004', :'yday', 3, 'paid', 9999, gen_random_uuid(), pg_temp.at_local(:'yday', '14:20'));

-- Events. Views: A 40 (one at 04:59 the next morning still counts, one at 04:59 that morning does not),
-- B 30, C 50, D 25, E 10, F 5.
create function pg_temp.views(p_item text, p_n integer, p_kind text default 'item_view') returns void language plpgsql as $$
begin
  insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at)
  select current_setting('rep.ra')::uuid, current_setting('rep.la')::uuid, 'visit-' || p_item || lpad(g::text, 4, '0'), p_kind,
         ('b1100000-0000-0000-0000-00000000000' || p_item)::uuid,
         pg_temp.at_local(current_setting('rep.yday')::date, '09:00') + g * interval '1 minute'
  from generate_series(1, p_n) g;
end $$;
select set_config('rep.ra', :'ra', false), set_config('rep.la', :'la', false), set_config('rep.yday', :'yday', false);
select pg_temp.views('a', 38);
select pg_temp.views('b', 30);
select pg_temp.views('c', 50);
select pg_temp.views('d', 25);
select pg_temp.views('e', 10);
select pg_temp.views('f', 5);
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at) values
  (:'ra', :'la', 'visit-edge-in-1', 'item_view', 'b1100000-0000-0000-0000-00000000000a', pg_temp.at_local(:'yday', '05:00')),
  (:'ra', :'la', 'visit-edge-in-2', 'item_view', 'b1100000-0000-0000-0000-00000000000a', pg_temp.at_local((:'yday'::date + 1), '04:59')),
  (:'ra', :'la', 'visit-edge-out-1', 'item_view', 'b1100000-0000-0000-0000-00000000000a', pg_temp.at_local(:'yday', '04:59')),
  (:'ra', :'la', 'visit-edge-out-2', 'item_view', 'b1100000-0000-0000-0000-00000000000a', pg_temp.at_local((:'yday'::date + 1), '05:00'));
select pg_temp.views('a', 3, 'item_add');

-- Suggestions: E shown 10 times, accepted 4 (two by the guest session at 19:00 and 19:05, one at 12:00, one by
-- a visit with no order); F shown 5, accepted once by the guest session at 19:15.
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at, meta)
select :'ra', :'la', 'visit-sug-e' || lpad(g::text, 3, '0'), 'suggestion_shown', 'b1100000-0000-0000-0000-00000000000e',
       pg_temp.at_local(:'yday', '11:00') + g * interval '1 minute', jsonb_build_object('from', 'b1100000-0000-0000-0000-00000000000a')
from generate_series(1, 10) g;
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at, meta)
select :'ra', :'la', 'visit-sug-f' || lpad(g::text, 3, '0'), 'suggestion_shown', 'b1100000-0000-0000-0000-00000000000f',
       pg_temp.at_local(:'yday', '11:00') + g * interval '1 minute', jsonb_build_object('from', 'b1100000-0000-0000-0000-00000000000a')
from generate_series(1, 5) g;
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at, meta) values
  (:'ra', :'la', 'b1600000-0000-0000-0000-000000000001', 'suggestion_accepted', 'b1100000-0000-0000-0000-00000000000e', pg_temp.at_local(:'yday', '19:00'), '{"from": "b1100000-0000-0000-0000-00000000000a"}'),
  (:'ra', :'la', 'b1600000-0000-0000-0000-000000000001', 'suggestion_accepted', 'b1100000-0000-0000-0000-00000000000e', pg_temp.at_local(:'yday', '19:05'), '{"from": "b1100000-0000-0000-0000-00000000000a"}'),
  (:'ra', :'la', 'b1600000-0000-0000-0000-000000000001', 'suggestion_accepted', 'b1100000-0000-0000-0000-00000000000e', pg_temp.at_local(:'yday', '12:00'), '{"from": "b1100000-0000-0000-0000-00000000000a"}'),
  (:'ra', :'la', 'visit-nobody-0001', 'suggestion_accepted', 'b1100000-0000-0000-0000-00000000000e', pg_temp.at_local(:'yday', '19:07'), '{"from": "b1100000-0000-0000-0000-00000000000a"}'),
  (:'ra', :'la', 'b1600000-0000-0000-0000-000000000001', 'suggestion_accepted', 'b1100000-0000-0000-0000-00000000000f', pg_temp.at_local(:'yday', '19:15'), '{"from": "b1100000-0000-0000-0000-00000000000a"}');

-- ---------------------------------------------------------------------------
-- 1. Viewed but not ordered
-- ---------------------------------------------------------------------------
select test.act_as('b1000000-0000-0000-0000-000000000001');
select api.item_conversion(:'la', :'yday', :'yday') as c1 \gset
create function pg_temp.dish(p jsonb, p_id text) returns jsonb language sql as $$
  select i from jsonb_array_elements(p -> 'items') i where i ->> 'id' = 'b1100000-0000-0000-0000-00000000000' || p_id
$$;
select test.ok((pg_temp.dish(:'c1', 'a') ->> 'views')::integer = 40, 'views count inside the business day only (05:00 start, edges both ways)');
select test.ok((pg_temp.dish(:'c1', 'a') ->> 'adds')::integer = 3, 'adds are counted');
select test.ok((pg_temp.dish(:'c1', 'a') ->> 'orders')::integer = 10, 'orders are units of accepted QR orders');
select test.ok((pg_temp.dish(:'c1', 'a') ->> 'conversion')::numeric = 0.25, 'conversion = orders / views (10 / 40)');
select test.ok((pg_temp.dish(:'c1', 'b') ->> 'orders')::integer = 12 and (pg_temp.dish(:'c1', 'b') ->> 'conversion')::numeric = 0.4,
  'the test order (30 units) is left out');
select test.ok((:'c1'::jsonb ->> 'median')::numeric = 0.325, 'median conversion of dishes with at least 5 views: (0.25 + 0.4) / 2');
select test.ok((pg_temp.dish(:'c1', 'c') ->> 'flagged')::boolean and pg_temp.dish(:'c1', 'c') -> 'reason' ->> 'key' = 'low_share',
  '50 views, 4 orders (0.08 < half the median 0.1625): flagged low_share');
select test.ok(not (pg_temp.dish(:'c1', 'a') ->> 'flagged')::boolean and pg_temp.dish(:'c1', 'a') -> 'reason' ->> 'key' = 'ok',
  '0.25 is above half the median: not flagged');
select test.ok((pg_temp.dish(:'c1', 'd') ->> 'flagged')::boolean and pg_temp.dish(:'c1', 'd') -> 'reason' ->> 'key' = 'never_ordered'
  and (pg_temp.dish(:'c1', 'd') ->> 'orders')::integer = 0,
  '25 views, none ordered (a waiter order of it is not a guest order): flagged never_ordered');
select test.ok(pg_temp.dish(:'c1', 'e') -> 'reason' ->> 'key' = 'few_views' and not (pg_temp.dish(:'c1', 'e') ->> 'flagged')::boolean,
  'under 20 views is too few to judge');
select test.ok((:'c1'::jsonb -> 'items' -> 0 ->> 'flagged')::boolean and (:'c1'::jsonb -> 'items' -> 1 ->> 'flagged')::boolean
  and not (:'c1'::jsonb -> 'items' -> 2 ->> 'flagged')::boolean
  and (:'c1'::jsonb -> 'items' -> 0 ->> 'id') = 'b1100000-0000-0000-0000-00000000000c',
  'flagged dishes come first, most viewed first');
select test.ok(not jsonb_path_exists(:'c1'::jsonb, '$.items[*].reason.text'), 'reasons are keys, never free text');
-- Period boundaries in the café's time zone: the day before has only the one view at 04:59; two days before nothing.
select api.item_conversion(:'la', (:'yday'::date - 2), (:'yday'::date - 2)) as c0 \gset
select test.ok(jsonb_array_length(:'c0'::jsonb -> 'items') = 0 and (:'c0'::jsonb -> 'median') = 'null'::jsonb, 'a day with nothing is empty, no median');
-- A manager reads the same.
select test.act_as('b1000000-0000-0000-0000-000000000002');
select test.ok(jsonb_array_length(api.item_conversion(:'la', :'yday', :'yday') -> 'items') = 6, 'a manager can read it');

-- ---------------------------------------------------------------------------
-- 2. Busy hours
-- ---------------------------------------------------------------------------
select test.act_as('b1000000-0000-0000-0000-000000000001');
select api.busy_hours(:'la', :'yday', :'yday') as b1 \gset
select extract(isodow from :'yday'::date)::integer as ydow \gset
create function pg_temp.cell(p jsonb, p_hour integer, p_key text) returns numeric language sql as $$
  select (c ->> p_key)::numeric from jsonb_array_elements(p -> 'cells') c where (c ->> 'hour')::integer = p_hour
$$;
select test.ok((:'b1'::jsonb ->> 'orders')::integer = 6 and pg_temp.cell(:'b1', 13, 'orders') = 3 and pg_temp.cell(:'b1', 19, 'orders') = 2
  and pg_temp.cell(:'b1', 16, 'orders') = 1, 'orders by local hour; the test order is left out');
select test.ok((:'b1'::jsonb ->> 'revenue')::integer = 8000 and pg_temp.cell(:'b1', 13, 'revenue') = 5000
  and pg_temp.cell(:'b1', 19, 'revenue') = 3000 and pg_temp.cell(:'b1', 14, 'revenue') is null,
  'revenue = paid bills by the hour they were closed; the test bill (9 999) is left out');
select test.ok((select bool_and((c ->> 'dow')::integer = :ydow) from jsonb_array_elements(:'b1'::jsonb -> 'cells') c), 'weekday is the local weekday');
select test.ok(:'b1'::jsonb -> 'weekday_days' ->> (:ydow - 1) = '1' and (select sum(v::integer) from jsonb_array_elements_text(:'b1'::jsonb -> 'weekday_days') v) = 1,
  'weekday_days counts the days of each weekday in the period');
select test.ok((:'b1'::jsonb -> 'table_time' ->> 'avg_minutes')::integer = 75 and (:'b1'::jsonb -> 'table_time' ->> 'sessions')::integer = 2,
  'average table time: 90 and 60 minutes; not the 24 h one, the test-only one or the one without orders');
select test.ok((:'b1'::jsonb -> 'table_time' -> 'by_weekday' -> 0 ->> 'dow')::integer = :ydow
  and (:'b1'::jsonb -> 'table_time' -> 'by_weekday' -> 0 ->> 'avg_minutes')::integer = 75, 'table time by weekday');
-- Over two days the average stays and the weekday counts add up.
select api.busy_hours(:'la', (:'yday'::date - 6), :'yday') as b7 \gset
select test.ok((select sum(v::integer) from jsonb_array_elements_text(:'b7'::jsonb -> 'weekday_days') v) = 7
  and (select bool_and(v::integer = 1) from jsonb_array_elements_text(:'b7'::jsonb -> 'weekday_days') v), 'a week holds each weekday once');

-- ---------------------------------------------------------------------------
-- 3. Upsell
-- ---------------------------------------------------------------------------
select api.upsell_report(:'la', :'yday', :'yday') as u1 \gset
select test.ok((:'u1'::jsonb ->> 'shown')::integer = 15 and (:'u1'::jsonb ->> 'accepted')::integer = 5, 'shown and accepted counts');
select test.ok((:'u1'::jsonb ->> 'accept_rate')::numeric = 0.3333, 'accept rate = accepted / shown');
select test.ok((:'u1'::jsonb ->> 'orders_with_suggestion')::integer = 2,
  'two orders held an accepted dish (E at 19:10 and F at 19:20); the 12:00 acceptance and the unknown visit do not match, each order counts once');
select test.ok((:'u1'::jsonb ->> 'revenue')::integer = 5 * 800 + 2 * 1000, 'revenue of the accepted dishes in those orders, each line once');
select test.ok((:'u1'::jsonb -> 'pairs' -> 0 ->> 'shown')::integer = 10 and (:'u1'::jsonb -> 'pairs' -> 0 ->> 'accepted')::integer = 4
  and (:'u1'::jsonb -> 'pairs' -> 0 -> 'from_name' ->> 'en') = 'Dish a' and (:'u1'::jsonb -> 'pairs' -> 0 -> 'item_name' ->> 'en') = 'Dish e',
  'the most shown pair first, with names');
select api.upsell_report(:'la', (:'yday'::date - 2), (:'yday'::date - 2)) as u0 \gset
select test.ok((:'u0'::jsonb ->> 'shown')::integer = 0 and (:'u0'::jsonb -> 'accept_rate') = 'null'::jsonb, 'no suggestions: rate is null');

-- ---------------------------------------------------------------------------
-- Who may call
-- ---------------------------------------------------------------------------
select test.act_as('b1000000-0000-0000-0000-000000000003');
select test.fails(format('select api.item_conversion(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'another café''s owner cannot read conversion');
select test.fails(format('select api.busy_hours(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'another café''s owner cannot read busy hours');
select test.fails(format('select api.upsell_report(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'another café''s owner cannot read upsell');
select test.act_as(:'u_waiter');
select test.fails(format('select api.item_conversion(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'a waiter login cannot read conversion');
select test.fails(format('select api.busy_hours(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'a waiter login cannot read busy hours');
select test.fails(format('select api.upsell_report(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'a waiter login cannot read upsell');
select test.act_as('b1000000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.item_conversion(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'a guest cannot read conversion');
select test.fails(format('select api.upsell_report(%L, %L, %L)', :'la', :'yday', :'yday'), 'forbidden', 'a guest cannot read upsell');
select test.act_as('b1000000-0000-0000-0000-000000000001');
select test.fails(format('select api.busy_hours(%L, %L, %L)', :'la', :'yday', :'yday'::date + 100), 'invalid_range', 'the range is at most 93 days');
select test.fails(format('select api.upsell_report(%L, %L, %L)', :'la', :'yday', :'yday'::date - 1), 'invalid_range', 'from after to is refused');
select test.fails(format('select api.item_conversion(%L, %L, %L)', :'lb', :'yday', :'yday'), 'forbidden', 'the owner of A cannot read café B');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'OWNER REPORTS TESTS PASSED'
