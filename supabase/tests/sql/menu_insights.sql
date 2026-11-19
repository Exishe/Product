-- Owner insights (ADR-057): api.set_item_cost, api.menu_engineering and
-- api.sales_heatmap. Uses the test.* helpers of 90-smoke-test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('e7000000-0000-0000-0000-000000000001', 'owner-m@example.am', false),
  ('e7000000-0000-0000-0000-000000000002', 'manager-m@example.am', false),
  ('e7000000-0000-0000-0000-000000000003', 'owner-n@example.am', false),
  ('e7000000-0000-0000-0000-000000000004', null, true);   -- a guest

select test.act_as('e7000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Մ', 'insights-m', 'Main', 'Mariam') as rm \gset
select api.ensure_menu(:'rm') as menu_m \gset
select test.act_as('e7000000-0000-0000-0000-000000000003');
select api.create_restaurant('Cafe N', 'insights-n', 'Main', 'Narek') as rn \gset

reset role;
select id as lm from public.locations where restaurant_id = :'rm' \gset
select id as owner_member from public.members where restaurant_id = :'rm' and role = 'owner' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rm', 'e7000000-0000-0000-0000-000000000002', 'manager', 'Mane');

-- One section with four dishes
insert into public.categories (id, restaurant_id, menu_id, sort)
values ('e7c00000-0000-0000-0000-000000000001', :'rm', :'menu_m', 1);
insert into public.items (id, restaurant_id, category_id, price, sort) values
  ('e7100000-0000-0000-0000-00000000000a', :'rm', 'e7c00000-0000-0000-0000-000000000001', 2000, 1),
  ('e7100000-0000-0000-0000-00000000000b', :'rm', 'e7c00000-0000-0000-0000-000000000001', 1500, 2),
  ('e7100000-0000-0000-0000-00000000000c', :'rm', 'e7c00000-0000-0000-0000-000000000001', 3000, 3),
  ('e7100000-0000-0000-0000-00000000000d', :'rm', 'e7c00000-0000-0000-0000-000000000001', 1000, 4);

-- Yesterday at 13:30 local: A ×10, B ×8, C ×2, D none. One more order today
-- and one test order must not count.
select private.business_date(:'lm') - 1 as yday \gset
select timezone as tz from public.locations where id = :'lm' \gset
create temp table fixture_orders (id uuid, d date, at timestamptz, is_test boolean);
insert into fixture_orders values
  ('e7a00000-0000-0000-0000-000000000001', :'yday', (:'yday'::date + time '13:30') at time zone :'tz', false),
  ('e7a00000-0000-0000-0000-000000000002', :'yday', (:'yday'::date + time '13:45') at time zone :'tz', false),
  ('e7a00000-0000-0000-0000-000000000003', :'yday', (:'yday'::date + time '19:10') at time zone :'tz', false),
  ('e7a00000-0000-0000-0000-000000000004', :'yday', (:'yday'::date + time '13:50') at time zone :'tz', true),
  ('e7a00000-0000-0000-0000-000000000005', :'yday'::date + 1, now(), false);
insert into public.orders (id, restaurant_id, location_id, created_by_member, source, fulfillment, status,
                           locale, business_date, number, idempotency_key, request_hash, placed_at, is_test)
select f.id, :'rm', :'lm', :'owner_member', 'waiter', 'takeaway', 'accepted', 'hy', f.d,
       row_number() over (partition by f.d order by f.id), gen_random_uuid(), 'x', f.at, f.is_test
from fixture_orders f;
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total) values
  (:'rm', 'e7a00000-0000-0000-0000-000000000001', 'e7100000-0000-0000-0000-00000000000a', '{"hy":"Ա"}', 2000, 10, 20000),
  (:'rm', 'e7a00000-0000-0000-0000-000000000002', 'e7100000-0000-0000-0000-00000000000b', '{"hy":"Բ"}', 1500, 8, 12000),
  (:'rm', 'e7a00000-0000-0000-0000-000000000003', 'e7100000-0000-0000-0000-00000000000c', '{"hy":"Գ"}', 3000, 2, 6000),
  (:'rm', 'e7a00000-0000-0000-0000-000000000004', 'e7100000-0000-0000-0000-00000000000d', '{"hy":"Դ"}', 1000, 9, 9000),
  (:'rm', 'e7a00000-0000-0000-0000-000000000005', 'e7100000-0000-0000-0000-00000000000d', '{"hy":"Դ"}', 1000, 9, 9000);

create function pg_temp.quadrant(p jsonb, p_item text) returns text language sql as $$
  select d ->> 'quadrant' from jsonb_array_elements(p -> 'sections' -> 0 -> 'dishes') d where d ->> 'id' = p_item
$$;

-- Without costs: popularity × price
select test.act_as('e7000000-0000-0000-0000-000000000001');
select api.menu_engineering(:'lm', :'yday', :'yday') as me1 \gset
select test.ok((:'me1'::jsonb -> 'sections' -> 0 ->> 'basis') = 'price', 'without costs the section is ranked by price');
select test.ok(pg_temp.quadrant(:'me1', 'e7100000-0000-0000-0000-00000000000a') = 'star', 'popular and above the average price: star');
select test.ok(pg_temp.quadrant(:'me1', 'e7100000-0000-0000-0000-00000000000b') = 'plowhorse', 'popular and cheap: plowhorse');
select test.ok(pg_temp.quadrant(:'me1', 'e7100000-0000-0000-0000-00000000000c') = 'puzzle', 'rarely ordered and dear: puzzle');
select test.ok(pg_temp.quadrant(:'me1', 'e7100000-0000-0000-0000-00000000000d') = 'dog',
  'never ordered (test and today''s orders do not count): dog');
select test.ok((:'me1'::jsonb -> 'sections' -> 0 ->> 'popularity_line')::numeric = 3.5, 'popular means 70 % of the section average');

-- Costs: owner only
reset role;
select max(updated_at) as items_before from public.items where restaurant_id = :'rm' \gset
select test.act_as('e7000000-0000-0000-0000-000000000002');
select test.fails($$select api.set_item_cost('e7100000-0000-0000-0000-00000000000a', 100)$$, 'forbidden',
  'a manager cannot set a cost price');
select test.act_as('e7000000-0000-0000-0000-000000000003');
select test.fails($$select api.set_item_cost('e7100000-0000-0000-0000-00000000000a', 100)$$, 'forbidden',
  'another café''s owner cannot set a cost price');
select test.act_as('e7000000-0000-0000-0000-000000000001');
select test.fails($$select api.set_item_cost('e7100000-0000-0000-0000-00000000000a', -1)$$, 'invalid_cost',
  'a cost price cannot be negative');
select api.set_item_cost('e7100000-0000-0000-0000-00000000000a', 1500);
select api.set_item_cost('e7100000-0000-0000-0000-00000000000b', 500);
select api.set_item_cost('e7100000-0000-0000-0000-00000000000c', 1000);
select api.menu_engineering(:'lm', :'yday', :'yday') as me2 \gset
select test.ok((:'me2'::jsonb -> 'sections' -> 0 ->> 'basis') = 'price', 'one dish without a cost keeps the section on price');
select api.set_item_cost('e7100000-0000-0000-0000-00000000000d', 800);
select api.set_item_cost('e7100000-0000-0000-0000-00000000000d', 900);
select api.menu_engineering(:'lm', :'yday', :'yday') as me3 \gset
select test.ok((:'me3'::jsonb -> 'sections' -> 0 ->> 'basis') = 'margin', 'with every cost entered the section is ranked by margin');
select test.ok(pg_temp.quadrant(:'me3', 'e7100000-0000-0000-0000-00000000000a') = 'plowhorse', 'popular with a thin margin: plowhorse');
select test.ok(pg_temp.quadrant(:'me3', 'e7100000-0000-0000-0000-00000000000b') = 'star', 'popular with a wide margin: star');
select test.ok((select count(*) from public.item_costs where restaurant_id = :'rm') = 4, 'the owner reads the costs');
select test.ok((select cost from public.item_costs where item_id = 'e7100000-0000-0000-0000-00000000000d') = 900,
  'setting a cost again replaces it');
select test.ok((select max(updated_at) from public.items where restaurant_id = :'rm') = :'items_before'::timestamptz,
  'a cost price does not mark the menu as edited');

-- The manager sees the matrix on price, without anyone's costs
select test.act_as('e7000000-0000-0000-0000-000000000002');
select api.menu_engineering(:'lm', :'yday', :'yday') as me4 \gset
select test.ok((:'me4'::jsonb -> 'sections' -> 0 ->> 'basis') = 'price'
  and not jsonb_path_exists(:'me4'::jsonb, '$.sections[*].dishes[*].cost ? (@ != null)'),
  'a manager gets no cost prices');
select test.ok((select count(*) from public.item_costs) = 0, 'a manager cannot read item_costs');

-- Others are refused
select test.act_as('e7000000-0000-0000-0000-000000000003');
select test.fails(format('select api.menu_engineering(%L, %L, %L)', :'lm', :'yday', :'yday'), 'forbidden',
  'another café''s owner cannot see the matrix');
select test.ok((select count(*) from public.item_costs) = 0, 'another café''s owner reads no costs');
select test.act_as('e7000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.sales_heatmap(%L, 4)', :'lm'), 'forbidden', 'a guest cannot see the heatmap');
select test.act_as('e7000000-0000-0000-0000-000000000001');
select test.fails(format('select api.menu_engineering(%L, %L, %L)', :'lm', :'yday', :'yday'::date + 100), 'invalid_range',
  'the matrix covers at most 93 days');

-- Heatmap: yesterday's weekday, 13:00 has two orders, 19:00 one
select api.sales_heatmap(:'lm', 1) as hm1 \gset
select api.sales_heatmap(:'lm', 2) as hm2 \gset
select extract(isodow from :'yday'::date)::integer as ydow \gset
select test.ok((:'hm1'::jsonb ->> 'orders')::integer = 3, 'the heatmap counts real orders up to yesterday');
select test.ok((select (c ->> 'orders')::integer from jsonb_array_elements(:'hm1'::jsonb -> 'cells') c
                where (c ->> 'dow')::integer = :ydow and (c ->> 'hour')::integer = 13) = 2,
  'two orders in the 13:00 hour, in local time');
select test.ok((select (c ->> 'avg')::numeric from jsonb_array_elements(:'hm2'::jsonb -> 'cells') c
                where (c ->> 'dow')::integer = :ydow and (c ->> 'hour')::integer = 13) = 1.0,
  'over two weeks the average per weekday halves');
select test.ok(jsonb_array_length(:'hm1'::jsonb -> 'cells') = 2, 'only non-empty cells are returned');
select test.fails(format('select api.sales_heatmap(%L, 27)', :'lm'), 'invalid_range', 'at most 26 weeks');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'MENU INSIGHTS TESTS PASSED'
