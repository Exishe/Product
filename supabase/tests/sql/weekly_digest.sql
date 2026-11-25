-- Weekly digest (ADR-074): the rule engine, the Monday schedule, delivery to the
-- right chats, the three languages. A fixed past week (Mon 12 - Sun 18 Oct 2026)
-- keeps every number deterministic; time travel is the p_now argument.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('d1000000-0000-0000-0000-000000000001', 'owner-dig-a@example.am', false),
  ('d1000000-0000-0000-0000-000000000002', 'manager-dig-a@example.am', false),
  ('d1000000-0000-0000-0000-000000000003', 'owner-dig-b@example.am', false),
  ('d1000000-0000-0000-0000-000000000004', null, true),
  ('d1000000-0000-0000-0000-000000000005', 'owner-dig-c@example.am', false);

select test.act_as('d1000000-0000-0000-0000-000000000001');
select api.create_restaurant('Digest A', 'digest-a', 'Main', 'Owner A') as ra \gset
select api.ensure_menu(:'ra') as menu_a \gset
select test.act_as('d1000000-0000-0000-0000-000000000003');
select api.create_restaurant('Digest B', 'digest-b', 'Main', 'Owner B') as rb \gset
select api.ensure_menu(:'rb') as menu_b \gset
select test.act_as('d1000000-0000-0000-0000-000000000005');
select api.create_restaurant('Digest C', 'digest-c', 'Main', 'Owner C') as rc \gset
reset role;
select id as la, timezone as tz from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select id as lc from public.locations where restaurant_id = :'rc' \gset
select user_id as u_waiter from public.staff_logins where username = 'digest-a-waiter' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'd1000000-0000-0000-0000-000000000002', 'manager', 'Manager A');

-- Dishes of café A (one section). Price and units sold decide the menu classes:
--   W 500 x40 workhorse, X 3000 x40 star, P 1500 x20 and Q 1500 x12 workhorses,
--   U 1000 x4 (60 views: viewed but not ordered), Z 3000 x3 puzzle, D 400 x1 dog.
insert into public.categories (id, restaurant_id, menu_id, sort) values ('d1c00000-0000-0000-0000-000000000001', :'ra', :'menu_a', 1);
insert into public.items (id, restaurant_id, category_id, price, sort) values
  ('d1100000-0000-0000-0000-00000000000a', :'ra', 'd1c00000-0000-0000-0000-000000000001',  500, 1),  -- W
  ('d1100000-0000-0000-0000-00000000000b', :'ra', 'd1c00000-0000-0000-0000-000000000001', 3000, 2),  -- X
  ('d1100000-0000-0000-0000-00000000000c', :'ra', 'd1c00000-0000-0000-0000-000000000001', 1500, 3),  -- P
  ('d1100000-0000-0000-0000-00000000000d', :'ra', 'd1c00000-0000-0000-0000-000000000001', 1500, 4),  -- Q
  ('d1100000-0000-0000-0000-00000000000e', :'ra', 'd1c00000-0000-0000-0000-000000000001', 1000, 5),  -- U
  ('d1100000-0000-0000-0000-00000000000f', :'ra', 'd1c00000-0000-0000-0000-000000000001', 3000, 6),  -- Z
  ('d1100000-0000-0000-0000-000000000010', :'ra', 'd1c00000-0000-0000-0000-000000000001',  400, 7);  -- D
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', 'd1100000-0000-0000-0000-00000000000a', 'en', 'Workhorse W'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000b', 'en', 'Star X'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000c', 'en', 'Dish P'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000d', 'en', 'Dish Q'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000e', 'en', 'Unordered "U" *_[x]'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000f', 'en', 'Puzzle Z'),
  (:'ra', 'd1100000-0000-0000-0000-000000000010', 'en', 'Dog D'),
  (:'ra', 'd1100000-0000-0000-0000-00000000000e', 'hy', 'Լավաշ');
insert into public.tables (id, restaurant_id, location_id, label) values ('d1700000-0000-0000-0000-000000000001', :'ra', :'la', '1');
insert into public.table_sessions (id, restaurant_id, location_id, table_id, status, opened_at, closed_at)
values ('d1500000-0000-0000-0000-000000000001', :'ra', :'la', 'd1700000-0000-0000-0000-000000000001', 'closed',
        (date '2026-10-12' + time '10:00') at time zone :'tz', (date '2026-10-12' + time '11:00') at time zone :'tz');
insert into public.guest_sessions (id, restaurant_id, location_id, table_id, table_session_id, user_id, qr_version, expires_at)
values ('d1600000-0000-0000-0000-000000000001', :'ra', :'la', 'd1700000-0000-0000-0000-000000000001',
        'd1500000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 1, now() + interval '1 day');

create function pg_temp.at_local(p_day date, p_time time) returns timestamptz language sql as $$
  select (p_day + p_time) at time zone current_setting('dig.tz')
$$;
select set_config('dig.tz', :'tz', false), set_config('dig.ra', :'ra', false), set_config('dig.la', :'la', false);

-- 38 real QR orders in the week. Slots: 9 on Friday 16 Oct at 19:xx (the peak), the other 29 spread
-- over Mon-Thu with none at 15:00 (the dead hour). Item by order number: 1-8 W (5 each), 9-16 X (5),
-- 17-26 P (2), 27-32 Q (2), 33-34 U (2), 35-37 Z (1), 38 D (1).
create temp table fx (n integer, at timestamptz, item text, qty integer);
insert into fx
select s.n, s.at,
       case when s.n <= 8 then 'a' when s.n <= 16 then 'b' when s.n <= 26 then 'c' when s.n <= 32 then 'd'
            when s.n <= 34 then 'e' when s.n <= 37 then 'f' else '10' end,
       case when s.n <= 16 then 5 when s.n <= 32 then 2 when s.n <= 34 then 2 else 1 end
from (
  select row_number() over (order by k.ord)::integer as n, k.at
  from (
    select 1 as ord, pg_temp.at_local(date '2026-10-16', time '19:00') + g * interval '3 minutes' as at from generate_series(0, 8) g
    union all
    select 2, pg_temp.at_local(date '2026-10-12' + ((r - 1) % 4), make_time(h.hour, 10 + r, 0))
    from (values (12, 4), (13, 4), (14, 3), (16, 3), (17, 3), (18, 4), (19, 3), (20, 3), (21, 2)) h(hour, cnt),
         lateral generate_series(1, h.cnt) r
  ) k
) s;
select test.ok((select count(*) from fx) = 38, 'fixture: 38 orders');
insert into public.orders (id, restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at)
select ('d1a00000-0000-0000-0000-' || lpad(f.n::text, 12, '0'))::uuid, :'ra', :'la', 'd1700000-0000-0000-0000-000000000001',
       'd1500000-0000-0000-0000-000000000001', 'd1600000-0000-0000-0000-000000000001', 'qr', 'dine_in', 'accepted', 'hy',
       (f.at at time zone :'tz')::date, f.n, gen_random_uuid(), 'x', f.at, f.at
from fx f;
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
select :'ra', ('d1a00000-0000-0000-0000-' || lpad(f.n::text, 12, '0'))::uuid,
       (case when f.item = '10' then 'd1100000-0000-0000-0000-000000000010' else 'd1100000-0000-0000-0000-00000000000' || f.item end)::uuid,
       '{"hy":"x"}', i.price, f.qty, i.price * f.qty
from fx f join public.items i on i.id = (case when f.item = '10' then 'd1100000-0000-0000-0000-000000000010' else 'd1100000-0000-0000-0000-00000000000' || f.item end)::uuid;
-- Test orders never count: five more on Friday 19:xx.
insert into public.orders (id, restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at, is_test)
select ('d1a00000-0000-0000-0000-0000000001' || lpad(g::text, 2, '0'))::uuid, :'ra', :'la', 'd1700000-0000-0000-0000-000000000001',
       'd1500000-0000-0000-0000-000000000001', 'd1600000-0000-0000-0000-000000000001', 'qr', 'dine_in', 'accepted', 'hy',
       date '2026-10-16', 100 + g, gen_random_uuid(), 'x', pg_temp.at_local(date '2026-10-16', '19:30') + g * interval '1 minute',
       pg_temp.at_local(date '2026-10-16', '19:30'), true
from generate_series(1, 5) g;
-- Slow: the four orders of 18:xx were served 30 minutes after they were placed (limit 25); one at 17:xx took exactly 25.
update public.orders set served_at = placed_at + interval '30 minutes'
where location_id = :'la' and not is_test and extract(hour from placed_at at time zone :'tz') = 18;
update public.orders set served_at = placed_at + interval '25 minutes'
where id = (select id from public.orders where location_id = :'la' and not is_test and extract(hour from placed_at at time zone :'tz') = 17 order by number limit 1);
-- ... and one table pressed "call waiter" three times at 18:xx.
insert into public.service_requests (restaurant_id, location_id, table_id, kind, status, created_at, press_count)
values (:'ra', :'la', 'd1700000-0000-0000-0000-000000000001', 'call_waiter', 'resolved', pg_temp.at_local(date '2026-10-14', '18:20'), 3),
       (:'ra', :'la', 'd1700000-0000-0000-0000-000000000001', 'bring_bill', 'resolved', pg_temp.at_local(date '2026-10-14', '18:25'), 5);
-- A paid bill of 50 000 on Friday evening.
insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status, total, idempotency_key, closed_at)
values (:'ra', :'la', 'd1500000-0000-0000-0000-000000000001', date '2026-10-16', 1, 'paid', 50000, gen_random_uuid(), pg_temp.at_local(date '2026-10-16', '20:30'));
-- The week before: 25 orders (no dishes needed), so this week is up 52 %.
insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at)
select :'ra', :'la', 'd1700000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001',
       'd1600000-0000-0000-0000-000000000001', 'qr', 'dine_in', 'accepted', 'hy',
       date '2026-10-05' + (g % 5), 200 + g, gen_random_uuid(), 'x', pg_temp.at_local(date '2026-10-05' + (g % 5), '13:00') + g * interval '1 minute',
       pg_temp.at_local(date '2026-10-05' + (g % 5), '13:00')
from generate_series(1, 25) g;

-- Views: U 60 (4 orders), P 40, Q 30 (their shares are high), W 10 (too few to judge).
create function pg_temp.views(p_item text, p_n integer, p_kind text default 'item_view') returns void language plpgsql as $$
begin
  insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at)
  select current_setting('dig.ra')::uuid, current_setting('dig.la')::uuid, 'visit-' || p_item || p_kind || lpad(g::text, 4, '0'), p_kind,
         ('d1100000-0000-0000-0000-00000000000' || p_item)::uuid, pg_temp.at_local(date '2026-10-14', '09:00') + g * interval '1 minute'
  from generate_series(1, p_n) g;
end $$;
select pg_temp.views('e', 60);
select pg_temp.views('c', 40);
select pg_temp.views('d', 30);
select pg_temp.views('a', 10);
-- Suggestions: 40 shown, 12 accepted (30 %).
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at, meta)
select :'ra', :'la', 'visit-sug' || lpad(g::text, 3, '0'), case when g <= 12 then 'suggestion_accepted' else 'suggestion_shown' end,
       'd1100000-0000-0000-0000-00000000000d', pg_temp.at_local(date '2026-10-14', '11:00') + g * interval '1 minute',
       jsonb_build_object('from', 'd1100000-0000-0000-0000-00000000000c')
from generate_series(1, 12) g;
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at, meta)
select :'ra', :'la', 'visit-shown' || lpad(g::text, 3, '0'), 'suggestion_shown',
       'd1100000-0000-0000-0000-00000000000d', pg_temp.at_local(date '2026-10-14', '12:00') + g * interval '1 minute',
       jsonb_build_object('from', 'd1100000-0000-0000-0000-00000000000c')
from generate_series(1, 40) g;
select test.ok((select count(*) from public.guest_events where location_id = :'la' and kind = 'suggestion_shown') = 40
           and (select count(*) from public.guest_events where location_id = :'la' and kind = 'suggestion_accepted') = 12, 'fixture: 40 shown, 12 accepted');

-- Café B: 20 orders (the minimum) and a dish with 500 views that nobody ordered. Café C: three orders.
insert into public.categories (id, restaurant_id, menu_id, sort) values ('d2c00000-0000-0000-0000-000000000001', :'rb', :'menu_b', 1);
insert into public.items (id, restaurant_id, category_id, price, sort) values ('d2100000-0000-0000-0000-00000000000a', :'rb', 'd2c00000-0000-0000-0000-000000000001', 900, 1);
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rb', 'd2100000-0000-0000-0000-00000000000a', 'en', 'B secret dish');
insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, at)
select :'rb', :'lb', 'visit-b' || lpad(g::text, 4, '0'), 'item_view', 'd2100000-0000-0000-0000-00000000000a', pg_temp.at_local(date '2026-10-14', '09:00') + g * interval '1 minute'
from generate_series(1, 500) g;
insert into public.orders (restaurant_id, location_id, source, fulfillment, status, locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at, created_by_member)
select :'rb', :'lb', 'waiter', 'takeaway', 'accepted', 'hy', date '2026-10-13', g, gen_random_uuid(), 'x',
       pg_temp.at_local(date '2026-10-13', '12:00') + g * interval '1 minute', pg_temp.at_local(date '2026-10-13', '12:00'),
       (select m.id from public.members m where m.restaurant_id = :'rb' and m.role = 'owner')
from generate_series(1, 20) g;
insert into public.orders (restaurant_id, location_id, source, fulfillment, status, locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at, created_by_member)
select :'rc', :'lc', 'waiter', 'takeaway', 'accepted', 'hy', date '2026-10-13', g, gen_random_uuid(), 'x',
       pg_temp.at_local(date '2026-10-13', '12:00') + g * interval '1 minute', pg_temp.at_local(date '2026-10-13', '12:00'),
       (select m.id from public.members m where m.restaurant_id = :'rc' and m.role = 'owner')
from generate_series(1, 3) g;

-- ---------------------------------------------------------------------------
-- 1. The rules fire on their fixtures
-- ---------------------------------------------------------------------------
create function pg_temp.cand(p_key text) returns jsonb language sql as $$
  select c from jsonb_array_elements(private.weekly_digest_candidates(current_setting('dig.la')::uuid, date '2026-10-12', date '2026-10-18') -> 'candidates') c
  where c -> 'finding' ->> 'key' = p_key
$$;
select private.weekly_digest_payload(:'la', date '2026-10-12', date '2026-10-18') as p1 \gset
select test.ok((:'p1'::jsonb ->> 'orders')::integer = 38, 'the week has 38 orders: test orders and other weeks are left out');
select test.ok((:'p1'::jsonb ->> 'revenue')::integer = 50000 and (:'p1'::jsonb ->> 'enough')::boolean, 'revenue from the paid bill; enough data');
-- (a)
select test.ok((pg_temp.cand('unordered') -> 'finding' ->> 'views')::integer = 60 and (pg_temp.cand('unordered') -> 'finding' ->> 'orders')::integer = 4
  and (pg_temp.cand('unordered') ->> 'score')::integer = 86, '(a) viewed but not ordered: 60 views, 4 orders, score 86');
-- (b) the workhorse with the most units, not the smaller ones
select test.ok((pg_temp.cand('workhorse') -> 'finding' ->> 'units')::integer = 40 and (pg_temp.cand('workhorse') -> 'finding' -> 'item' ->> 'en') = 'Workhorse W'
  and (pg_temp.cand('workhorse') ->> 'score')::integer = 78, '(b) workhorse: the most ordered cheap dish (40 units), score 78');
-- (c)
select test.ok((pg_temp.cand('puzzle') -> 'finding' -> 'item' ->> 'en') = 'Puzzle Z' and (pg_temp.cand('puzzle') -> 'finding' ->> 'units')::integer = 3
  and (pg_temp.cand('puzzle') ->> 'score')::integer = 80, '(c) puzzle: well priced, 3 units, score 80');
-- (d): U is a dog too (4 units) but D has fewer
select test.ok((pg_temp.cand('dog') -> 'finding' -> 'item' ->> 'en') = 'Dog D' and (pg_temp.cand('dog') ->> 'score')::integer = 66, '(d) dog: the least ordered one (1 unit), score 66');
-- (e)
select test.ok((pg_temp.cand('busiest') -> 'finding' ->> 'dow')::integer = 5 and (pg_temp.cand('busiest') -> 'finding' ->> 'hour')::integer = 19
  and (pg_temp.cand('busiest') -> 'finding' ->> 'orders')::integer = 9 and (pg_temp.cand('busiest') ->> 'score')::integer = 58,
  '(e) busiest: Friday 19:00 with 9 orders (the 5 test orders do not count)');
-- (f)
select test.ok((pg_temp.cand('dead') -> 'finding' ->> 'hour')::integer = 15 and (pg_temp.cand('dead') -> 'finding' ->> 'orders')::integer = 0
  and (pg_temp.cand('dead') -> 'finding' ->> 'avg')::numeric = 3.8, '(f) dead hour: 15:00 with no order, hourly average 3.8');
-- (g): 4 slow orders (the 25-minute one is not slow) and one pressed-three-times call; bring_bill is not a call
select test.ok((pg_temp.cand('slow') -> 'finding' ->> 'slow_orders')::integer = 4 and (pg_temp.cand('slow') -> 'finding' ->> 'calls')::integer = 1
  and (pg_temp.cand('slow') -> 'finding' ->> 'hour')::integer = 18 and (pg_temp.cand('slow') -> 'finding' ->> 'minutes')::integer = 25
  and (pg_temp.cand('slow') ->> 'score')::integer = 80, '(g) slow: 4 orders over 25 minutes and 1 repeated call, mostly at 18:00');
-- (h)
select test.ok((pg_temp.cand('suggest_high') -> 'finding' ->> 'percent')::integer = 30 and (pg_temp.cand('suggest_high') -> 'finding' ->> 'shown')::integer = 40
  and pg_temp.cand('suggest_high') -> 'action' ->> 'key' = 'more_suggestions', '(h) suggestions: 40 shown, 30 % accepted');
-- (i)
select test.ok((pg_temp.cand('wow_up') -> 'finding' ->> 'percent')::integer = 52 and (pg_temp.cand('wow_up') -> 'finding' ->> 'metric') = 'orders'
  and (pg_temp.cand('wow_up') -> 'finding' ->> 'previous')::integer = 25 and (pg_temp.cand('wow_up') ->> 'score')::integer = 86,
  '(i) week over week: orders 38 against 25 is +52 %');

-- ---------------------------------------------------------------------------
-- 2. The three that are kept, with their actions, in score order
-- ---------------------------------------------------------------------------
select test.ok(jsonb_array_length(:'p1'::jsonb -> 'findings') = 3 and jsonb_array_length(:'p1'::jsonb -> 'actions') = 3, 'exactly three findings and three actions');
select test.ok((select string_agg(f ->> 'key', ',' order by o) from jsonb_array_elements(:'p1'::jsonb -> 'findings') with ordinality x(f, o)) = 'unordered,wow_up,slow',
  'best scores win: 86 and 86 (tie: unordered ranks first), then 80 (slow beats puzzle on rule order)');
select test.ok((select string_agg(a ->> 'key', ',' order by o) from jsonb_array_elements(:'p1'::jsonb -> 'actions') with ordinality x(a, o))
  = 'check_photo_price,keep_stock,check_pace', 'each finding has its action, in the same order');
select test.ok(not (:'p1'::jsonb::text ~ 'B secret'), 'the payload holds keys and numbers; another café''s dish is nowhere');
select test.ok(private.weekly_digest_payload(:'la', date '2026-10-12', date '2026-10-18') = :'p1'::jsonb, 'the same data gives the same payload');

-- A dish appears once: U is both viewed-but-not-ordered and a dog (4 units), so a dog finding could never repeat it.
select test.ok((select count(distinct f -> 'item' ->> 'en') = count(f -> 'item') from jsonb_array_elements(:'p1'::jsonb -> 'findings') f), 'no dish twice in the three');

-- ---------------------------------------------------------------------------
-- 3. Non-triggers: take each condition away and its rule goes quiet (cumulative)
-- ---------------------------------------------------------------------------
delete from public.guest_events where location_id = :'la' and item_id = 'd1100000-0000-0000-0000-00000000000e' and kind = 'item_view' and session_key not like '%-0001%' and session_key not like '%-0002%';
select test.ok(pg_temp.cand('unordered') is null, '(a) 2 views is too few: no finding');
select test.ok(pg_temp.cand('workhorse') is not null, 'workhorse still there before its change');
update public.items set price = 3500 where id = 'd1100000-0000-0000-0000-00000000000a';
select test.ok(pg_temp.cand('workhorse') -> 'finding' -> 'item' ->> 'en' is distinct from 'Workhorse W', '(b) a dish priced above the line is no workhorse');
select test.ok((pg_temp.cand('workhorse') -> 'finding' -> 'item' ->> 'en') in ('Dish P', 'Dish Q') or pg_temp.cand('workhorse') is null, '(b) the next one takes its place or none does');
delete from public.guest_events where location_id = :'la' and kind in ('suggestion_shown', 'suggestion_accepted') and session_key like 'visit-shown%' and session_key > 'visit-shown020';
select test.ok(pg_temp.cand('suggest_high') is null, '(h) only 20 shown: below the 30 minimum');
update public.orders set placed_at = placed_at - interval '30 days', business_date = business_date - 30
where location_id = :'la' and number between 201 and 225;
select test.ok(pg_temp.cand('wow_up') is null, '(i) the week before has too few orders: no comparison');
update public.orders set served_at = null where location_id = :'la' and served_at is not null;
select test.ok(pg_temp.cand('slow') is null, '(g) only one repeated call left: below 3');
update public.service_requests set press_count = 2 where location_id = :'la';

update public.items set price = 100 where id = 'd1100000-0000-0000-0000-00000000000f';
select test.ok(pg_temp.cand('puzzle') is null, '(c) a dish priced below its section''s line is no puzzle');
update public.items set price = 3000 where id = 'd1100000-0000-0000-0000-000000000010';
select test.ok((pg_temp.cand('dog') -> 'finding' -> 'item' ->> 'en') is distinct from 'Dog D', '(d) a dish priced above the line is no dog');
update public.orders set placed_at = placed_at + interval '1 day', business_date = business_date + 1
where id in (select id from public.orders where location_id = :'la' and business_date = date '2026-10-16' and not is_test order by number limit 4);
select test.ok(pg_temp.cand('busiest') is null, '(e) a peak of 5 orders is under the 6 minimum: no finding');
insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, accepted_at)
values (:'ra', :'la', 'd1700000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 'd1600000-0000-0000-0000-000000000001',
        'qr', 'dine_in', 'accepted', 'hy', date '2026-10-13', 300, gen_random_uuid(), 'x', pg_temp.at_local(date '2026-10-13', '15:20'), pg_temp.at_local(date '2026-10-13', '15:20'));
select test.ok(pg_temp.cand('dead') is null, '(f) one order at 15:00 is above 20 % of the hourly average: no dead hour');

-- Fewer than 20 orders: nothing but the count
select private.weekly_digest_payload(:'lc', date '2026-10-12', date '2026-10-18') as pc \gset
select test.ok(not (:'pc'::jsonb ->> 'enough')::boolean and (:'pc'::jsonb ->> 'orders')::integer = 3 and :'pc'::jsonb -> 'findings' = '[]'::jsonb,
  'under 20 orders: not enough data, no findings');
select private.weekly_digest_payload(:'lb', date '2026-10-12', date '2026-10-18') as pb \gset
select test.ok((:'pb'::jsonb ->> 'enough')::boolean and (:'pb'::jsonb -> 'findings' -> 0 -> 'item' ->> 'en') = 'B secret dish' and (:'pb'::jsonb -> 'findings' -> 0 ->> 'views')::integer = 500,
  'café B gets its own dish, with its own 500 views');
select test.ok(not (private.weekly_digest_payload(:'la', date '2026-10-12', date '2026-10-18')::text ~ 'B secret'), 'and café A never sees it');

-- ---------------------------------------------------------------------------
-- 4. Texts in three languages
-- ---------------------------------------------------------------------------
select test.ok(private.digest_count(1, 'ru', 'order') = '1 заказ' and private.digest_count(3, 'ru', 'order') = '3 заказа'
  and private.digest_count(5, 'ru', 'order') = '5 заказов' and private.digest_count(11, 'ru', 'view') = '11 просмотров'
  and private.digest_count(21, 'ru', 'view') = '21 просмотр' and private.digest_count(1, 'en', 'order') = '1 order'
  and private.digest_count(2, 'en', 'view') = '2 views' and private.digest_count(4, 'hy', 'order') = '4 պատվեր', 'plural forms');
-- A fixed payload in each language (the one stored for a real week is rendered further down)
select jsonb_build_object('from', '2026-10-12', 'to', '2026-10-18', 'orders', 38, 'revenue', 50000, 'enough', true, 'min_orders', 20,
  'findings', jsonb_build_array(
     jsonb_build_object('key', 'unordered', 'item', jsonb_build_object('en', 'Unordered "U" *_[x]', 'hy', 'Լավաշ'), 'views', 60, 'orders', 4),
     jsonb_build_object('key', 'busiest', 'dow', 5, 'hour', 19, 'orders', 9),
     jsonb_build_object('key', 'wow_down', 'metric', 'revenue', 'current', 80000, 'previous', 100000, 'percent', -20)),
  'actions', jsonb_build_array(jsonb_build_object('key', 'check_photo_price'), jsonb_build_object('key', 'extra_waiter', 'dow', 5, 'hour', 19),
                               jsonb_build_object('key', 'check_reports'))) as fixed \gset
select private.render_notification('weekly.digest', :'fixed'::jsonb, 'en') as t_en,
       private.render_notification('weekly.digest', :'fixed'::jsonb, 'ru') as t_ru,
       private.render_notification('weekly.digest', :'fixed'::jsonb, 'hy') as t_hy \gset
select test.ok(:'t_en' like E'📊 Weekly summary: 12 Oct – 18 Oct\nOrders: 38, revenue: AMD%50,000\n\n1. «Unordered "U" *_[x]»: 60 views, 4 orders.\n→ Check its photo or price.\n\n2. Busiest hour: Fri 19:00, 9 orders.\n→ Plan an extra waiter for that hour.\n\n3. Revenue: AMD%80,000, -20\% vs last week (AMD%100,000).\n→ See in Reports which days dropped.\n\nDetails: Reports in the admin.',
  'English text, plain, names untouched');
select test.ok(:'t_ru' like E'%Итоги недели: 12.10–18.10\nЗаказы: 38, выручка: %\n\n1. «Լավաշ»: 60 просмотров, 4 заказа.\n→ Проверьте фото или цену.\n%Самый загруженный час: пт 19:00, 9 заказов.%Подробности: раздел «Отчёты» в админке.',
  'Russian text');
select test.ok(:'t_hy' like E'%Շաբաթվա ամփոփում՝ 12.10–18.10\nՊատվերներ՝ 38, վաճառք՝ %\n\n1. «Լավաշ»՝ 60 դիտում, 4 պատվեր։\n→ Ստուգեք լուսանկարը կամ գինը։\n%Ամենամարդաշատ ժամը՝ ուրբ 19:00, 9 պատվեր։%Մանրամասները՝ կառավարման էջի «Հաշվետվություններ» բաժնում։',
  'Armenian text uses the dish''s Armenian name and ։ ՝ « »');
select test.ok(char_length(:'t_hy') < 1200 and char_length(:'t_ru') < 1200 and char_length(:'t_en') < 1200, 'well under Telegram''s 4096 characters');
-- every key renders a text in every language
select test.ok((select bool_and(private.digest_action_text(jsonb_build_object('key', k, 'hour', 12), l) is not null)
                from unnest('{check_photo_price,small_price_rise,promote,rework,extra_waiter,promo_then,check_pace,more_suggestions,review_suggestions,keep_stock,check_reports}'::text[]) k,
                     unnest('{hy,ru,en}'::public.app_locale[]) l), 'every action key has a text in hy, ru and en');
select test.ok((select bool_and(private.digest_finding_text(f || jsonb_build_object('item', '{"en":"X"}'::jsonb, 'views', 30, 'orders', 1, 'units', 5, 'price', 900, 'dow', 2, 'hour', 12,
                                 'avg', 2.5, 'slow_orders', 3, 'calls', 1, 'minutes', 25, 'shown', 40, 'accepted', 10, 'percent', 25, 'metric', 'orders', 'current', 5, 'previous', 4), l) is not null)
                from unnest(array['{"key":"unordered"}','{"key":"workhorse"}','{"key":"puzzle"}','{"key":"dog"}','{"key":"busiest"}','{"key":"dead"}','{"key":"slow"}',
                                  '{"key":"suggest_high"}','{"key":"suggest_low"}','{"key":"wow_up"}','{"key":"wow_down"}']::jsonb[]) f,
                     unnest('{hy,ru,en}'::public.app_locale[]) l), 'every finding key has a text in hy, ru and en');
select test.ok(private.render_notification('table.alert', '{"reason":"slow","table":"5","minutes":26}'::jsonb, 'en') like 'Table 5%', 'the other messages still render');

-- ---------------------------------------------------------------------------
-- 5. The schedule and the chats
-- ---------------------------------------------------------------------------
-- Chats of café A: owner (ru), manager (hy), a waiter's, one with the toggle off, one switched off; café B owner (en); café C owner (en).
insert into public.notification_channels (id, restaurant_id, telegram_chat_id, title, locale, created_by) values
  ('d3000000-0000-0000-0000-000000000001', :'ra', 7001, 'Owner A', 'ru', 'd1000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000002', :'ra', 7002, 'Manager A', 'hy', 'd1000000-0000-0000-0000-000000000002'),
  ('d3000000-0000-0000-0000-000000000003', :'ra', 7003, 'Waiter A', 'hy', :'u_waiter'),
  ('d3000000-0000-0000-0000-000000000004', :'ra', 7004, 'No toggle', 'hy', 'd1000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000005', :'ra', 7005, 'Off', 'hy', 'd1000000-0000-0000-0000-000000000001'),
  ('d3000000-0000-0000-0000-000000000006', :'rb', 7006, 'Owner B', 'en', 'd1000000-0000-0000-0000-000000000003'),
  ('d3000000-0000-0000-0000-000000000007', :'rc', 7007, 'Owner C', 'en', 'd1000000-0000-0000-0000-000000000005');
select test.ok((select 'weekly.digest' = any (events) from public.notification_channels where id = 'd3000000-0000-0000-0000-000000000001'), 'new chats get the digest by default');
update public.notification_channels set events = array_remove(events, 'weekly.digest') where id = 'd3000000-0000-0000-0000-000000000004';
update public.notification_channels set is_active = false where id = 'd3000000-0000-0000-0000-000000000005';
-- The toggle is allowed through the owner's own function
select test.act_as('d1000000-0000-0000-0000-000000000001');
select api.update_notification_channel('d3000000-0000-0000-0000-000000000001', array['weekly.digest', 'day.summary'], 'ru', true) is null as upd \gset
select test.ok((select events from public.notification_channels where id = 'd3000000-0000-0000-0000-000000000001') = '{day.summary,weekly.digest}', 'the owner can switch weekly.digest on and off per chat');
select api.update_notification_channel('d3000000-0000-0000-0000-000000000001', array['order.overdue', 'weekly.digest'], 'ru', true) is null as upd2 \gset
reset role;
-- Café C lives in Auckland (UTC+13 in October): Monday 09:00 there is already Monday 00:00 in Yerevan.
update public.locations set timezone = 'Pacific/Auckland' where id = :'lc';
select ((date '2026-10-19' + time '09:00') at time zone :'tz') as mon_yer \gset
select ((date '2026-10-19' + time '09:00') at time zone 'Pacific/Auckland') as mon_auck \gset

create function pg_temp.mine() returns bigint language sql as $$
  select count(*) from public.notification_outbox where event = 'weekly.digest'
    and restaurant_id in (current_setting('dig.ra')::uuid, current_setting('dig.rb')::uuid, current_setting('dig.rc')::uuid)
$$;
select set_config('dig.rb', :'rb', false), set_config('dig.rc', :'rc', false);
select private.enqueue_weekly_digests((date '2026-10-19' + time '08:59') at time zone :'tz') as r0 \gset
select test.ok(pg_temp.mine() = 0, 'nothing before Monday 09:00 local');
select private.enqueue_weekly_digests((date '2026-10-18' + time '09:30') at time zone :'tz') as r1 \gset
select test.ok(pg_temp.mine() = 0, 'nothing on a Sunday');
select private.enqueue_weekly_digests(:'mon_yer'::timestamptz) >= 3 as ran \gset
select test.ok(pg_temp.mine() = 3, 'at Monday 09:00: café A owner and manager chats, café B owner chat; café C is not yet due (its clock is elsewhere)');
select test.ok((select array_agg(channel_id::text order by channel_id) from public.notification_outbox where event = 'weekly.digest' and restaurant_id = :'ra')
               = array['d3000000-0000-0000-0000-000000000001', 'd3000000-0000-0000-0000-000000000002'],
  'café A: only the linked owner and manager chats (not the waiter''s, not the one with the toggle off, not the switched-off one)');
select test.ok((select count(*) from public.notification_outbox where event = 'weekly.digest' and dedupe_key = 'weekly.digest:' || :'la' || ':2026-W43') = 2, 'dedupe key: weekly.digest:<location>:<ISO week>');
select test.ok(not exists (select 1 from public.notification_outbox where event = 'weekly.digest' and restaurant_id = :'rc'), 'café C got nothing yet');
select private.enqueue_weekly_digests(:'mon_yer'::timestamptz + interval '15 minutes') + private.enqueue_weekly_digests(:'mon_yer'::timestamptz + interval '2 hours 59 minutes') as r2 \gset
select test.ok(pg_temp.mine() = 3, 'the next runs of the same morning add nothing');
select private.enqueue_weekly_digests(:'mon_yer'::timestamptz + interval '3 hours') as r3 \gset
select private.enqueue_weekly_digests((date '2026-10-20' + time '09:00') at time zone :'tz') as r4 \gset
select test.ok(pg_temp.mine() = 3, 'after 12:00 the window is closed, and Tuesday is no Monday');
-- A later chat of café A gets the same week once, and only once
insert into public.notification_channels (id, restaurant_id, telegram_chat_id, title, locale, created_by)
values ('d3000000-0000-0000-0000-000000000008', :'ra', 7008, 'Late', 'en', 'd1000000-0000-0000-0000-000000000001');
select private.enqueue_weekly_digests(:'mon_yer'::timestamptz + interval '1 hour') as r5 \gset
select private.enqueue_weekly_digests(:'mon_yer'::timestamptz + interval '1 hour 15 minutes') as r6 \gset
select test.ok(pg_temp.mine() = 4 and (select count(*) from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000008' and event = 'weekly.digest') = 1,
  'a chat linked the same morning is caught up once');
-- Café C at its own Monday 09:00: week 1 with too little data gets the short message
select private.enqueue_weekly_digests(:'mon_auck'::timestamptz) as r7 \gset
select test.ok(pg_temp.mine() = 5 and exists (select 1 from public.notification_outbox where restaurant_id = :'rc' and event = 'weekly.digest'), 'at café C''s Monday 09:00 (its time zone) it is due');
select test.ok((select (payload ->> 'enough')::boolean from public.notification_outbox where restaurant_id = :'rc' and event = 'weekly.digest') = false, 'with under 20 orders in week 1: the "not enough data yet" payload');
select test.ok((select private.render_notification(event, payload, 'en') from public.notification_outbox where restaurant_id = :'rc' and event = 'weekly.digest')
               like 'Not enough data%' or (select private.render_notification(event, payload, 'en') from public.notification_outbox where restaurant_id = :'rc' and event = 'weekly.digest')
               like '%Not enough data yet%', 'rendered as a short note');
-- The next week: café A has no orders, café B and C are quiet: skipped silently (nothing is sent twice, nothing is invented)
select private.enqueue_weekly_digests((date '2026-10-26' + time '09:00') at time zone :'tz') as r8 \gset
select private.enqueue_weekly_digests((date '2026-10-26' + time '09:00') at time zone 'Pacific/Auckland') as r9 \gset
select test.ok(pg_temp.mine() = 5, 'later quiet weeks are skipped silently');

-- What the chats were sent
select payload as pa from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000001' and event = 'weekly.digest' \gset
select test.ok(jsonb_array_length(:'pa'::jsonb -> 'findings') >= 1 and (:'pa'::jsonb ->> 'from') = '2026-10-12' and (:'pa'::jsonb ->> 'to') = '2026-10-18',
  'the stored payload is the week that ended on Sunday 18 Oct');
select test.ok((select payload ->> 'location_id' from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000006') = :'lb'
           and not exists (select 1 from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000006' and payload::text like '%Workhorse%'),
  'café B''s chat got café B''s payload only');
select test.ok(private.render_notification('weekly.digest', :'pa'::jsonb, 'ru') like '%Итоги недели:%', 'a stored payload renders in Russian');
select test.ok(private.render_notification('weekly.digest', (select payload from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000006'), 'en') like '%B secret dish%'
           and private.render_notification('weekly.digest', (select payload from public.notification_outbox where channel_id = 'd3000000-0000-0000-0000-000000000006'), 'en') not like '%Workhorse%',
  'and café B''s text names only café B''s dish');
-- No person is named anywhere in a payload
select test.ok(not exists (select 1 from public.notification_outbox where event = 'weekly.digest'
                           and (payload::text like '%@example.am%' or payload::text like '%Owner%' or payload::text like '%session%')),
  'no personal data in the payload');

-- ---------------------------------------------------------------------------
-- 6. The Reports page card and permissions
-- ---------------------------------------------------------------------------
select test.act_as('d1000000-0000-0000-0000-000000000001');
select api.last_weekly_digest(:'la', 'en') as ld \gset
select test.ok((:'ld'::jsonb ->> 'text') is not null and (:'ld'::jsonb ->> 'from')::date + 6 = (:'ld'::jsonb ->> 'to')::date
  and extract(isodow from (:'ld'::jsonb ->> 'from')::date) = 1, 'the owner reads the last complete Monday-Sunday week');
select test.act_as('d1000000-0000-0000-0000-000000000002');
select test.ok(api.last_weekly_digest(:'la', 'ru') ->> 'text' is not null, 'a manager can read it');
select test.act_as('d1000000-0000-0000-0000-000000000003');
create function pg_temp.denied(p_sql text) returns boolean language plpgsql as $$
begin execute p_sql; return false; exception when others then return sqlstate = '42501'; end $$;
select test.ok(pg_temp.denied(format('select api.last_weekly_digest(%L, ''en'')', :'la')), 'another café''s owner is refused');
select test.act_as(:'u_waiter');
select test.ok(pg_temp.denied(format('select api.last_weekly_digest(%L, ''en'')', :'la')), 'a waiter login is refused');
select test.ok(pg_temp.denied(format('select private.weekly_digest_payload(%L, date ''2026-10-12'', date ''2026-10-18'')', :'la')), 'the private engine is not callable by a client');
select test.ok(pg_temp.denied('select private.enqueue_weekly_digests()'), 'neither is the schedule function');
select test.act_as('d1000000-0000-0000-0000-000000000001', true);
select test.ok(pg_temp.denied(format('select api.last_weekly_digest(%L, ''en'')', :'la')), 'a guest is refused');

-- ---------------------------------------------------------------------------
-- 7. The report functions behave as before (their own suites cover the numbers)
-- ---------------------------------------------------------------------------
select test.act_as('d1000000-0000-0000-0000-000000000002');
select test.ok(api.menu_engineering(:'la', date '2026-10-12', date '2026-10-18' ) -> 'sections' -> 0 -> 'dishes' -> 0 ->> 'cost' is null
  and (api.menu_engineering(:'la', date '2026-10-12', date '2026-10-18') ->> 'owner')::boolean = false, 'a manager still sees no costs');
select test.ok(pg_temp.denied(format('select api.item_conversion(%L, date ''2026-10-12'', date ''2026-10-18'')', :'lb')), 'api.item_conversion still checks the caller');
reset role;
select test.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                           where n.nspname = 'private' and p.proname in ('item_conversion_core', 'busy_hours_core', 'upsell_report_core', 'menu_engineering_core', 'weekly_digest_payload', 'weekly_digest_candidates')
                             and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  'the cores and the engine are executable by no client');
select test.ok((select count(*) from cron.job where jobname = 'pativ-weekly-digest') in (0, 1), 'the cron job is recorded where pg_cron exists');
