-- Guest hints (ADR-060): dishes ordered together and the usual wait, as
-- aggregates of the café's own orders. Runs after 90-smoke-test.sql and
-- adr038.sql and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('9a000000-0000-0000-0000-000000000001', 'owner-h@example.am', false);

-- Café H: eggs and pancakes (breakfast), coffee and tea (drinks).
select test.act_as('9a000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Հ', 'cafe-hints', 'Main', 'Hasmik') as rh \gset
select id as lh from public.locations where restaurant_id = :'rh' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rh', 'Main') returning id as hmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rh', :'hmenu', :'lh');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rh', :'hmenu', 1) returning id as food \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'rh', :'hmenu', 2) returning id as drinks \gset
insert into public.items (restaurant_id, category_id, price) values (:'rh', :'food', 2500) returning id as eggs \gset
insert into public.items (restaurant_id, category_id, price) values (:'rh', :'food', 1900) returning id as pancakes \gset
insert into public.items (restaurant_id, category_id, price) values (:'rh', :'drinks', 900) returning id as coffee \gset
insert into public.items (restaurant_id, category_id, price) values (:'rh', :'drinks', 700) returning id as tea \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'rh', :'eggs', 'hy', 'Ձվածեղ'), (:'rh', :'pancakes', 'hy', 'Բլիթ'),
  (:'rh', :'coffee', 'hy', 'Սուրճ'), (:'rh', :'tea', 'hy', 'Թեյ');
insert into public.tables (restaurant_id, location_id, label) values (:'rh', :'lh', '1') returning id as th \gset

select test.act_as_anon();
select api.public_menu_hints('cafe-hints', 'main') is null as unpublished \gset
select test.ok(:'unpublished', 'nothing for a location without a published menu');

select test.act_as('9a000000-0000-0000-0000-000000000001');
select api.publish_menu(:'lh') is not null as published \gset

select test.act_as_anon();
select test.ok(api.public_menu_hints('cafe-hints', 'main') = '{"pairs": {}, "wait": null}'::jsonb,
               'a new café: no pairs and no wait yet');
select test.ok(api.public_menu_hints('cafe-hints', 'nope') is null, 'an unknown location gives nothing');

-- Rounds written as the server would, with set times.
reset role;
select id as hmember from public.members where restaurant_id = :'rh' and user_id = '9a000000-0000-0000-0000-000000000001' \gset
create function test.h_round(p_n integer, p_items uuid[], p_placed timestamptz, p_ready timestamptz,
                             p_status public.order_status default 'accepted') returns uuid
language plpgsql as $$
declare v_order uuid; v_item uuid;
begin
  insert into public.orders (restaurant_id, location_id, table_id, created_by_member, source, status, locale,
                             business_date, number, idempotency_key, request_hash, placed_at, ready_at)
  select l.restaurant_id, l.id, t.id, m.id, 'waiter', p_status, 'hy', p_placed::date, p_n,
         gen_random_uuid(), 'test', p_placed, p_ready
  from public.locations l, public.tables t, public.members m
  where l.slug = 'main' and l.restaurant_id = (select id from public.restaurants where slug = 'cafe-hints')
    and t.location_id = l.id and m.restaurant_id = l.restaurant_id
  limit 1
  returning id into v_order;
  foreach v_item in array p_items loop
    insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
    select i.restaurant_id, v_order, i.id, '{"hy": "x"}', i.price, 1, i.price from public.items i where i.id = v_item;
  end loop;
  return v_order;
end $$;

-- Eggs with coffee 4 times, eggs with tea twice, pancakes with eggs 5 times
-- (same section, never a pair), coffee with pancakes 3 times in rejected
-- rounds (do not count). Each ready 10–20 min after sending, 30 days back.
select test.h_round(n, array[:'eggs', :'coffee']::uuid[], now() - interval '2 days' - n * interval '1 hour',
                    now() - interval '2 days' - n * interval '1 hour' + interval '12 minutes')
from generate_series(1, 4) n;
select test.h_round(10 + n, array[:'eggs', :'tea']::uuid[], now() - interval '3 days' - n * interval '1 hour',
                    now() - interval '3 days' - n * interval '1 hour' + interval '18 minutes')
from generate_series(1, 2) n;
select test.h_round(20 + n, array[:'eggs', :'pancakes']::uuid[], now() - interval '4 days' - n * interval '1 hour',
                    now() - interval '4 days' - n * interval '1 hour' + interval '14 minutes')
from generate_series(1, 5) n;
select test.h_round(30 + n, array[:'pancakes', :'coffee']::uuid[], now() - interval '5 days' - n * interval '1 hour',
                    null, 'rejected')
from generate_series(1, 3) n;
-- A round forgotten for 5 hours does not count as a wait.
select test.h_round(40, array[:'tea']::uuid[], now() - interval '6 days', now() - interval '6 days' + interval '5 hours');

select test.act_as_anon();
select api.public_menu_hints('cafe-hints', 'main') as h \gset
select test.ok((:'h'::jsonb -> 'pairs' -> :'eggs') = jsonb_build_array(:'coffee'::uuid),
               'eggs pair with coffee (4 rounds); tea (2) is under the threshold');
select test.ok((:'h'::jsonb -> 'pairs' -> :'coffee') = jsonb_build_array(:'eggs'::uuid), 'and coffee with eggs');
select test.ok(not (:'h'::jsonb -> 'pairs' ? :'pancakes'),
               'no pairs within one section, nor from rejected rounds');
select test.ok((:'h'::jsonb -> 'wait') = '{"low": 15, "high": 15}'::jsonb,
               '11 rounds over 30 days, median 14 min: "about 15 min"');

-- Five rounds in the last 3 hours, slower: the recent ones decide.
reset role;
select test.h_round(50 + n, array[:'coffee']::uuid[], now() - interval '2 hours',
                    now() - interval '2 hours' + (20 + n * 3) * interval '1 minute')
from generate_series(1, 5) n;
select test.act_as_anon();
select test.ok((api.public_menu_hints('cafe-hints', 'main') -> 'wait') = '{"low": 30, "high": 35}'::jsonb,
               'a busy evening: the last 3 hours (23–35 min) give "30–35 min"');

-- Not for a suspended location.
reset role;
update public.locations set status = 'suspended' where id = :'lh';
select test.act_as_anon();
select test.ok(api.public_menu_hints('cafe-hints', 'main') is null, 'a suspended location gives nothing');
reset role;
update public.locations set status = 'active' where id = :'lh';
drop function test.h_round(integer, uuid[], timestamptz, timestamptz, public.order_status);
select test.ok(has_function_privilege('anon', 'api.public_menu_hints(text, text)', 'execute'),
               'anon may read the hints');
select set_config('request.jwt.claims', '', false);
\echo 'GUEST HINTS TESTS PASSED'
