-- Milestone 10: the owner's sales dashboard, metrics_daily and the platform
-- admin. Seeds café M with known orders, bills and tickets and checks the
-- numbers metrics.md defines. Runs after 90-smoke-test.sql (test.* helpers).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('a1000000-0000-0000-0000-000000000001', 'owner-m@example.am', false),
  ('a1000000-0000-0000-0000-000000000002', null, true),                  -- a guest
  ('a1000000-0000-0000-0000-000000000003', 'owner-n@example.am', false),  -- another café's owner
  ('a1000000-0000-0000-0000-000000000004', 'platform@example.am', false);

select test.act_as('a1000000-0000-0000-0000-000000000003');
select api.create_restaurant('Սրճարան Ն', 'cafe-dash-n', 'Main', 'Nare') as rn \gset
select test.act_as('a1000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Մ', 'cafe-dash-m', 'Main', 'Mher') as rm \gset
reset role;
select id as lm from public.locations where restaurant_id = :'rm' \gset
select id as mowner from public.members where restaurant_id = :'rm' and role = 'owner' \gset
select id as st from public.stations where location_id = :'lm' and is_default \gset
select private.business_date(:'lm') as d \gset

insert into public.menus (restaurant_id, internal_name) values (:'rm', 'Main') returning id as mmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rm', :'mmenu', :'lm');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rm', :'mmenu', 1) returning id as mcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rm', :'mcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price, sort) values (:'rm', :'mcat', 3200, 1) returning id as tolma \gset
insert into public.items (restaurant_id, category_id, price, sort) values (:'rm', :'mcat', 800, 2) returning id as coffee \gset
insert into public.items (restaurant_id, category_id, price, sort) values (:'rm', :'mcat', 1600, 3) returning id as salad \gset
insert into public.items (restaurant_id, category_id, price, sort) values (:'rm', :'mcat', 900, 4) returning id as gata \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'rm', :'tolma', 'hy', 'Տոլմա'), (:'rm', :'coffee', 'hy', 'Սուրճ'),
  (:'rm', :'salad', 'hy', 'Աղցան'), (:'rm', :'gata', 'hy', 'Գաթա'), (:'rm', :'gata', 'en', 'Gata');
insert into public.tables (restaurant_id, location_id, label) values (:'rm', :'lm', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rm', :'lm', '2') returning id as t2 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rm', :'lm', '3') returning id as t3 \gset

-- Table 1: closed, paid 9 600. Table 2: still open. Table 3: closed, paid 3 000.
insert into public.table_sessions (restaurant_id, location_id, table_id, status) values (:'rm', :'lm', :'t1', 'closed') returning id as s1 \gset
insert into public.table_sessions (restaurant_id, location_id, table_id, status) values (:'rm', :'lm', :'t2', 'open') returning id as s2 \gset
insert into public.table_sessions (restaurant_id, location_id, table_id, status) values (:'rm', :'lm', :'t3', 'closed') returning id as s3 \gset
insert into public.guest_sessions (restaurant_id, location_id, table_id, table_session_id, user_id, qr_version, expires_at)
values (:'rm', :'lm', :'t1', :'s1', 'a1000000-0000-0000-0000-000000000002', 1, now() + interval '1 hour') returning id as g1 \gset
insert into public.guest_sessions (restaurant_id, location_id, table_id, table_session_id, user_id, qr_version, expires_at)
values (:'rm', :'lm', :'t2', :'s2', 'a1000000-0000-0000-0000-000000000002', 1, now() + interval '1 hour') returning id as g2 \gset

-- Local times on business day :d (Yerevan, UTC+4).
create temp table seed_orders (k text primary key, id uuid);
grant all on seed_orders to public;

with ins as (
  insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id, created_by_member,
                             source, status, locale, business_date, number, idempotency_key, request_hash,
                             total, subtotal, item_count, placed_at, accepted_at, is_test, reject_reason)
  values
    (:'rm', :'lm', :'t1', :'s1', null, :'mowner', 'waiter', 'accepted', 'hy', :'d', 1, gen_random_uuid(), 'x', 7200, 7200, 3,
     (:'d'::date + time '10:15') at time zone 'Asia/Yerevan', (:'d'::date + time '10:15') at time zone 'Asia/Yerevan', false, null),
    (:'rm', :'lm', :'t1', :'s1', :'g1', null, 'qr', 'accepted', 'en', :'d', 2, gen_random_uuid(), 'x', 2400, 2400, 3,
     (:'d'::date + time '10:40') at time zone 'Asia/Yerevan', (:'d'::date + time '10:41') at time zone 'Asia/Yerevan', false, null),
    (:'rm', :'lm', :'t2', :'s2', :'g2', null, 'qr', 'accepted', 'hy', :'d', 3, gen_random_uuid(), 'x', 4800, 4800, 2,
     (:'d'::date + time '12:05') at time zone 'Asia/Yerevan', (:'d'::date + time '12:05') at time zone 'Asia/Yerevan', false, null),
    (:'rm', :'lm', :'t3', null, null, :'mowner', 'waiter', 'rejected', 'hy', :'d', 4, gen_random_uuid(), 'x', 800, 800, 1,
     (:'d'::date + time '13:00') at time zone 'Asia/Yerevan', null, false, 'Փակ ենք'),
    (:'rm', :'lm', :'t3', null, null, :'mowner', 'waiter', 'accepted', 'hy', :'d', 5, gen_random_uuid(), 'x', 16000, 16000, 5,
     (:'d'::date + time '09:00') at time zone 'Asia/Yerevan', (:'d'::date + time '09:00') at time zone 'Asia/Yerevan', true, null),
    -- a week ago: one before this time of day, one after
    (:'rm', :'lm', :'t3', null, null, :'mowner', 'waiter', 'accepted', 'hy', :'d'::date - 7, 1, gen_random_uuid(), 'x', 5000, 5000, 1,
     now() - interval '7 days 1 hour', now() - interval '7 days 1 hour', false, null),
    (:'rm', :'lm', :'t3', null, null, :'mowner', 'waiter', 'accepted', 'hy', :'d'::date - 7, 2, gen_random_uuid(), 'x', 3000, 3000, 1,
     now() - interval '7 days' + interval '1 hour', now() - interval '7 days' + interval '1 hour', false, null)
  returning id, number, business_date)
insert into seed_orders select case when business_date = :'d' then 'o' else 'p' end || number, id from ins;
select id as o1 from seed_orders where k = 'o1' \gset
select id as o2 from seed_orders where k = 'o2' \gset
select id as o3 from seed_orders where k = 'o3' \gset
select id as o4 from seed_orders where k = 'o4' \gset
select id as o5 from seed_orders where k = 'o5' \gset

insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, station_id, unit_price, quantity, cancelled_quantity, line_total) values
  (:'rm', :'o1', :'tolma', '{"hy": "Տոլմա"}', :'st', 3200, 2, 0, 6400),
  (:'rm', :'o1', :'coffee', '{"hy": "Սուրճ"}', :'st', 800, 1, 0, 800),
  (:'rm', :'o2', :'coffee', '{"hy": "Սուրճ"}', :'st', 800, 3, 0, 2400),
  (:'rm', :'o3', :'salad', '{"hy": "Աղցան"}', :'st', 1600, 1, 0, 1600),
  (:'rm', :'o3', :'tolma', '{"hy": "Տոլմա"}', :'st', 3200, 2, 1, 3200),
  (:'rm', :'o4', :'coffee', '{"hy": "Սուրճ"}', :'st', 800, 1, 0, 800),
  (:'rm', :'o5', :'tolma', '{"hy": "Տոլմա"}', :'st', 3200, 5, 0, 16000);
insert into public.order_status_history (restaurant_id, order_id, entity, to_status, actor_kind, reason)
values (:'rm', :'o3', 'order_item', 'cancelled:1', 'member', 'Հյուրը փոխեց միտքը');

-- Kitchen: 12 minutes and 25 minutes (over the 20-minute limit); the screen
-- drew the tickets 1 s and 3 s after the order.
insert into public.kitchen_tickets (restaurant_id, location_id, order_id, station_id, number, status, created_at, ready_at, first_seen_at) values
  (:'rm', :'lm', :'o1', :'st', 1, 'ready', (:'d'::date + time '10:15') at time zone 'Asia/Yerevan',
   (:'d'::date + time '10:27') at time zone 'Asia/Yerevan', (:'d'::date + time '10:15:01') at time zone 'Asia/Yerevan'),
  (:'rm', :'lm', :'o3', :'st', 3, 'ready', (:'d'::date + time '12:05') at time zone 'Asia/Yerevan',
   (:'d'::date + time '12:30') at time zone 'Asia/Yerevan', (:'d'::date + time '12:05:03') at time zone 'Asia/Yerevan');

insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status, subtotal, total, idempotency_key, closed_at) values
  (:'rm', :'lm', :'s1', :'d', 1, 'paid', 9600, 9600, gen_random_uuid(), now()),
  (:'rm', :'lm', :'s3', :'d', 2, 'paid', 3000, 3000, gen_random_uuid(), now()),
  (:'rm', :'lm', null, :'d', 3, 'void', 2000, 2000, gen_random_uuid(), now()),
  (:'rm', :'lm', null, :'d'::date - 7, 1, 'paid', 5000, 5000, gen_random_uuid(), now() - interval '7 days 1 hour'),
  (:'rm', :'lm', null, :'d'::date - 7, 2, 'paid', 3000, 3000, gen_random_uuid(), now() - interval '7 days' + interval '1 hour');

-- ---------------------------------------------------------------------------
-- The owner's dashboard for today
-- ---------------------------------------------------------------------------
select test.act_as('a1000000-0000-0000-0000-000000000001');
select api.sales_dashboard(:'lm', :'d', :'d') as dash \gset
reset role;
create temp table dash as select :'dash'::jsonb as j;
select test.ok((select (j -> 'summary' ->> 'revenue')::int from dash) = 12600, 'revenue is the sum of paid bills (void bills left out)');
select test.ok((select (j -> 'summary' ->> 'bills')::int from dash) = 2, 'two paid bills');
select test.ok((select (j -> 'summary' ->> 'avg_bill')::int from dash) = 6300, 'average bill is the mean of paid bills');
select test.ok((select (j -> 'summary' ->> 'orders')::int from dash) = 3, 'real orders: rejected and test orders do not count');
select test.ok((select (j -> 'summary' ->> 'qr_orders')::int from dash) = 2, 'two QR orders');
select test.ok((select (j -> 'summary' ->> 'waiter_orders')::int from dash) = 1, 'one waiter order');
select test.ok((select (j ->> 'partial')::boolean from dash), 'today is a partial day');
select test.ok((select (j ->> 'shift_days')::int from dash) = 7, 'one day compares with the same weekday last week');
select test.ok((select (j -> 'compare' ->> 'orders')::int from dash) = 1, 'last week counts only orders up to this time of day');
select test.ok((select (j -> 'compare' ->> 'revenue')::int from dash) = 5000, 'and only bills closed up to this time of day');
select test.ok((select (j -> 'open_tables' ->> 'count')::int from dash) = 1, 'one table is still open');
select test.ok((select (j -> 'open_tables' ->> 'total')::int from dash) = 4800, 'with 4 800 on it');
select test.ok((select (j -> 'hourly' -> 10 ->> 'orders')::int from dash) = 2, 'two orders between 10:00 and 11:00 local time');
select test.ok((select (j -> 'hourly' -> 12 ->> 'orders')::int from dash) = 1, 'one order between 12:00 and 13:00');
select test.ok((select (j -> 'hourly' -> 9 ->> 'orders')::int from dash) = 0, 'the test order at 09:00 is not on the chart');
select test.ok((select sum((h ->> 'compare_orders')::int) from dash, jsonb_array_elements(j -> 'hourly') h) = 2,
  'the hourly comparison shows the whole day a week ago');
select test.ok((select j -> 'top_dishes' -> 0 -> 'name' ->> 'hy' from dash) = 'Տոլմա', 'tolma is the best dish by revenue');
select test.ok((select (j -> 'top_dishes' -> 0 ->> 'qty')::int from dash) = 3, 'three tolmas sold (one cancelled, test order left out)');
select test.ok((select (j -> 'top_dishes' -> 0 ->> 'revenue')::int from dash) = 9600, 'for 9 600');
select test.ok((select (j -> 'top_dishes' -> 1 ->> 'qty')::int from dash) = 4, 'four coffees (the rejected one left out)');
select test.ok((select jsonb_array_length(j -> 'top_dishes') from dash) = 3, 'three dishes sold');
select test.ok((select j -> 'weak_dishes' -> 0 -> 'name' ->> 'en' from dash) = 'Gata', 'the weakest dish is one nobody ordered');
select test.ok((select (j -> 'weak_dishes' -> 0 ->> 'qty')::int from dash) = 0, 'with zero sold');
select test.ok((select (j -> 'kitchen' -> 0 ->> 'tickets')::int from dash) = 2, 'two tickets were ready');
select test.ok((select (j -> 'kitchen' -> 0 ->> 'avg_seconds')::int from dash) = 1110, 'average kitchen time is 18.5 minutes');
select test.ok((select (j -> 'kitchen' -> 0 ->> 'over_limit')::int from dash) = 1, 'one ticket took over 20 minutes');
select test.ok((select (j -> 'kitchen' -> 0 ->> 'is_default')::boolean from dash), 'the default station is marked so the UI can name it');
select test.ok((select (j -> 'cancellations' ->> 'items')::int from dash) = 1, 'one dish was cancelled');
select test.ok((select j -> 'cancellations' -> 'reasons' -> 0 ->> 'reason' from dash) = 'Հյուրը փոխեց միտքը', 'with its reason');
select test.ok((select (j -> 'cancellations' ->> 'rejected_orders')::int from dash) = 1, 'one order was rejected');

-- the same numbers as the metrics.md query
select test.ok((select round(100.0 * count(*) filter (where o.source = 'qr') / count(*), 0) from public.orders o
                where o.location_id = :'lm' and o.business_date = :'d' and o.status = 'accepted' and not o.is_test) = 67,
  'QR share by the metrics.md query is 67 %');

-- A week: two weeks back for comparison is not needed, one week is.
select test.act_as('a1000000-0000-0000-0000-000000000001');
select test.ok((select (api.sales_dashboard(:'lm', :'d'::date - 6, :'d') ->> 'shift_days')::int) = 7, 'a 7-day range compares with the 7 days before');
select test.ok((select (api.sales_dashboard(:'lm', :'d'::date - 9, :'d') ->> 'shift_days')::int) = 14, 'a 10-day range shifts by whole weeks');
select test.ok((select (api.sales_dashboard(:'lm', :'d'::date - 7, :'d'::date - 7) -> 'summary' ->> 'revenue')::int) = 8000,
  'a past day counts all its bills');
select test.ok((select (api.sales_dashboard(:'lm', :'d'::date - 7, :'d'::date - 7) ->> 'partial')::boolean) = false, 'a past day is not partial');
select test.fails(format('select api.sales_dashboard(%L, %L, %L)', :'lm', :'d', (:'d'::date - 1)), 'invalid_range', 'from after to is refused');
select test.fails(format('select api.sales_dashboard(%L, %L, %L)', :'lm', (:'d'::date - 100), :'d'), 'invalid_range', 'more than three months is refused');

select test.act_as('a1000000-0000-0000-0000-000000000003');
select test.fails(format('select api.sales_dashboard(%L, %L, %L)', :'lm', :'d', :'d'), 'forbidden', 'another café''s owner cannot read our sales');
select test.act_as('a1000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.sales_dashboard(%L, %L, %L)', :'lm', :'d', :'d'), 'forbidden', 'a guest cannot read sales');

-- ---------------------------------------------------------------------------
-- metrics_daily
-- ---------------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', false);
select private.compute_metrics_daily(:'d') > 0 as ok \gset
select private.compute_metrics_daily(:'d') as rows2 \gset
select test.ok((select count(*) from public.metrics_daily where location_id = :'lm' and business_date = :'d') = 1, 'running it twice keeps one row');
select test.ok((select orders = 3 and qr_orders = 2 and waiter_orders = 1 from public.metrics_daily where location_id = :'lm' and business_date = :'d'),
  'metrics_daily counts real orders by source');
select test.ok((select revenue = 12600 and bills = 2 and avg_bill = 6300 from public.metrics_daily where location_id = :'lm' and business_date = :'d'),
  'and paid bills');
select test.ok((select tickets_ready = 2 and tickets_over_limit = 1 and kitchen_avg_s = 1110 from public.metrics_daily
                where location_id = :'lm' and business_date = :'d'), 'and kitchen time');
select test.ok((select screen_p50_s = 2 and screen_p95_s = 2.9 from public.metrics_daily where location_id = :'lm' and business_date = :'d'),
  'order to kitchen screen p50 2 s and p95 2.9 s, as the metrics.md query');
select test.ok((select accept_p90_s = 60 from public.metrics_daily where location_id = :'lm' and business_date = :'d'),
  'waiter acceptance wait (the QR order accepted after a minute)');
select test.ok((select orders = 0 from public.metrics_daily where restaurant_id = :'rn'),
  'a café with no orders gets a row of zeros');
select test.ok((select schedule = '30 1 * * *' and command like '%compute_metrics_daily%' from cron.job
                where jobname = 'pativ-metrics-daily'), 'pg_cron recomputes yesterday at 05:30 Yerevan (01:30 UTC)');

select test.act_as('a1000000-0000-0000-0000-000000000001');
select test.ok((select count(*) from public.metrics_daily where location_id = :'lm') = 1, 'the owner reads their own daily metrics');
select test.ok((select count(*) from public.metrics_daily where restaurant_id = :'rn') = 0, 'but not another café''s');
select test.fails(format('select private.compute_metrics_daily(%L)', :'d'), 'permission denied%', 'clients cannot recompute metrics');
select test.fails(format('insert into public.metrics_daily (restaurant_id, location_id, business_date) values (%L, %L, %L)', :'rm', :'lm', '2020-01-01'),
  'permission denied%', 'clients cannot write metrics');

-- ---------------------------------------------------------------------------
-- Platform admin
-- ---------------------------------------------------------------------------
select test.fails('select api.platform_cafes()', 'forbidden', 'a café owner is not a platform admin');
select test.fails(format('select api.platform_set_plan(%L, %L, %L)', :'lm', 'service', 'active'), 'forbidden', 'and cannot change plans');
select test.fails('select api.platform_problems()', 'forbidden', 'or see delivery problems');

reset role;
insert into public.platform_admins (user_id) values ('a1000000-0000-0000-0000-000000000004');
select test.act_as('a1000000-0000-0000-0000-000000000004');
select test.ok((select count(*) from jsonb_array_elements(api.platform_cafes()) c where c ->> 'location_id' = :'lm') = 1,
  'the platform admin lists every café');
select test.ok((select c ->> 'plan' = 'service' and c ->> 'status' = 'trialing' from jsonb_array_elements(api.platform_cafes()) c
                where c ->> 'location_id' = :'lm'), 'with its plan');
select test.ok((select (c ->> 'orders_per_open_day')::numeric = 3 and (c ->> 'qr_share_pct')::int = 67
                from jsonb_array_elements(api.platform_cafes()) c where c ->> 'location_id' = :'lm'),
  'and orders per open day and QR share from metrics_daily');

select test.act_as('a1000000-0000-0000-0000-000000000001');
select api.publish_menu(:'lm') as mv \gset
reset role;
select test.ok((select (api.public_menu('cafe-dash-m', 'main') -> 'location' ->> 'ordering')::boolean), 'in the free month guests can order');

select test.act_as('a1000000-0000-0000-0000-000000000004');
select api.platform_set_plan(:'lm', 'menu', 'active');
reset role;
select test.ok((select plan = 'menu' and price_amd = 0 from public.subscriptions where location_id = :'lm'), 'the admin moves a café to the Menu plan');
select test.ok((select (api.public_menu('cafe-dash-m', 'main') -> 'location' ->> 'ordering')::boolean) = false,
  'on the Menu plan the guest menu still opens and says ordering is off');
select test.ok((select api.public_menu('cafe-dash-m', 'main') -> 'menu') is not null, 'the menu itself is still there');

select test.act_as('a1000000-0000-0000-0000-000000000004');
select api.platform_set_plan(:'lm', 'service', 'active');
reset role;
select test.ok((select plan = 'service' and status = 'active' and price_amd = 15000 and converted_at is not null
                       and current_period_end > now() from public.subscriptions where location_id = :'lm'),
  'a paid Service plan costs 15 000 and records the conversion');
select test.ok((select count(*) from public.audit_log where location_id = :'lm' and action = 'subscription.changed'
                and actor_kind = 'platform_admin') = 2, 'every plan change is in the audit log');
update public.subscriptions set price_amd = 10000 where location_id = :'lm';
select test.act_as('a1000000-0000-0000-0000-000000000004');
select api.platform_set_plan(:'lm', 'service', 'past_due');
select test.fails(format('select api.platform_set_plan(%L, %L, %L)', :'lm', 'gold', 'active'), 'invalid_plan', 'unknown plans are refused');
reset role;
select test.ok((select price_amd from public.subscriptions where location_id = :'lm') = 10000, 'a founding café keeps its price');

insert into public.notification_channels (restaurant_id, telegram_chat_id) values (:'rm', 42) returning id as ch \gset
insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload, status, attempts, last_error)
values (:'rm', :'ch', 'order.overdue', 'x:1', '{}', 'dead', 8, 'Forbidden: bot was blocked by the user');
select test.act_as('a1000000-0000-0000-0000-000000000004');
select test.ok((select p -> 'dead_letters' -> 0 ->> 'last_error' from api.platform_problems() p) = 'Forbidden: bot was blocked by the user',
  'the platform admin sees dead Telegram messages');
select test.ok((select p -> 'dead_letters' -> 0 ->> 'restaurant_name' from api.platform_problems() p) = 'Սրճարան Մ', 'with the café''s name');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'DASHBOARD AND PLATFORM TESTS PASSED'
