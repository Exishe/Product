-- The demo café seed (supabase/seed.sql): what a demo and the e2e tests rely on.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
select id as r from public.restaurants where slug = 'demo-cafe' \gset
select id as l from public.locations where restaurant_id = :'r' \gset

select test.ok((select name from public.restaurants where id = :'r') = 'Դեմո սրճարան', 'the demo café exists');
select test.ok((select v.item_count from public.locations x join public.menu_versions v on v.id = x.published_menu_version_id
                where x.id = :'l') = 41, 'its published menu has 41 dishes');
select test.ok((select count(*) from public.items i
                where i.restaurant_id = :'r'
                  and (select count(distinct t.locale) from public.item_translations t where t.item_id = i.id) <> 3) = 0,
  'every dish has Armenian, Russian and English names');
select test.ok((select count(*) from public.categories c where c.restaurant_id = :'r'
                  and (select count(*) from public.category_translations t where t.category_id = c.id) <> 3) = 0,
  'every category has three names');
select test.ok((select s.name from public.items i
                join public.item_translations t on t.item_id = i.id and t.locale = 'en' and t.name = 'Cappuccino'
                join public.categories c on c.id = i.category_id
                join public.station_prep_areas sp on sp.prep_area_id = c.prep_area_id
                join public.stations s on s.id = sp.station_id
                where i.restaurant_id = :'r') = 'Bar', 'coffee goes to the bar station');
select test.ok((select count(*) from public.tables where location_id = :'l') = 12, '12 tables');
select test.ok((select count(*) from public.areas where location_id = :'l') = 2, 'in two areas');
select test.ok((select count(*) from public.item_modifier_groups g
                join public.item_translations t on t.item_id = g.item_id and t.locale = 'en' and t.name = 'Cappuccino') = 2,
  'cappuccino has a size and a milk option group');
select test.ok((select min_select = 1 and max_select = 1 from public.modifier_groups g
                join public.item_modifier_groups ig on ig.group_id = g.id
                join public.item_translations t on t.item_id = ig.item_id and t.locale = 'en' and t.name = 'Cappuccino'
                join public.modifier_group_translations gt on gt.group_id = g.id and gt.locale = 'en' and gt.name = 'Size'),
  'the size is a required single choice');
select test.ok((select status from public.subscriptions where location_id = :'l') = 'active', 'the demo never runs out of its plan');
select test.ok((select (api.public_menu('demo-cafe', 'main') -> 'location' ->> 'ordering')::boolean), 'guests can order at the demo café');
select test.ok((select count(*) from public.item_translations t join public.items i on i.id = t.item_id
                where i.restaurant_id = :'r' and t.source = 'ai' and t.reviewed_at is not null) >= 2,
  'some reviewed AI translations exercise the publish rule');

\i supabase/seed.sql
select test.ok((select count(*) from public.restaurants where slug = 'demo-cafe') = 1, 'running the seed again changes nothing');

\echo 'SEED TESTS PASSED'
