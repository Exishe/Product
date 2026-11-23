-- "This dish contains none of the 14 allergens" (ADR-083): the backfill, how
-- api.save_item sets items.allergens_confirmed, that the published snapshot
-- carries it, and who may set it.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('a1e90000-0000-0000-0000-000000000001', 'owner-al-a@example.am', false),
  ('a1e90000-0000-0000-0000-000000000002', 'owner-al-b@example.am', false);

select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.create_restaurant('Allergen A', 'al-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('a1e90000-0000-0000-0000-000000000002');
select api.create_restaurant('Allergen B', 'al-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select user_id as u_waiter from public.staff_logins where username = 'al-cafe-a-waiter' \gset

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'All');

-- ---------------------------------------------------------------------------
-- The column: a new dish is not reviewed; the migration's backfill rule
-- (a dish with allergens counts as reviewed) is the update below, re-run here.
-- ---------------------------------------------------------------------------
insert into public.items (restaurant_id, category_id, price, allergens) values (:'ra', :'cat', 1000, '{milk}') returning id as d_old_list \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1000) returning id as d_old_empty \gset
select test.ok((select not allergens_confirmed from public.items where id = :'d_old_list'),
  'a row written directly starts unreviewed (the default)');
update public.items set allergens_confirmed = true where cardinality(allergens) > 0;
select test.ok((select allergens_confirmed from public.items where id = :'d_old_list')
  and (select not allergens_confirmed from public.items where id = :'d_old_empty'),
  'backfill: confirmed where a list exists, unreviewed where it is empty');

-- ---------------------------------------------------------------------------
-- save_item
-- ---------------------------------------------------------------------------
select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.save_item(:'ra', jsonb_build_object('category_id', :'cat', 'price', 1000, 'names', '{"hy": "Սուրճ"}'::jsonb)) as d_new \gset
select api.save_item(:'ra', jsonb_build_object('category_id', :'cat', 'price', 1000, 'names', '{"hy": "Ջուր"}'::jsonb,
  'allergens_confirmed', true)) as d_none \gset
select api.save_item(:'ra', jsonb_build_object('category_id', :'cat', 'price', 1000, 'names', '{"hy": "Կաթ"}'::jsonb,
  'allergens', '["milk"]'::jsonb)) as d_list \gset
reset role;
select test.ok((select not allergens_confirmed and allergens = '{}' from public.items where id = :'d_new'),
  'a new dish saved without the key is unreviewed');
select test.ok((select allergens_confirmed and allergens = '{}' from public.items where id = :'d_none'),
  'a new dish saved with allergens_confirmed true and no list is reviewed: none');
select test.ok((select allergens_confirmed and allergens = '{milk}' from public.items where id = :'d_list'),
  'saving a non-empty list confirms it');

select test.act_as('a1e90000-0000-0000-0000-000000000001');
-- A missing key keeps the stored value (the editor of an older build, the toggle of sold out etc.).
select api.save_item(:'ra', jsonb_build_object('id', :'d_none', 'category_id', :'cat', 'price', 1100,
  'names', '{"hy": "Ջուր"}'::jsonb)) as s1 \gset
reset role;
select test.ok((select allergens_confirmed and allergens = '{}' from public.items where id = :'d_none'),
  'a save without the key keeps the stored confirmation');
select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.save_item(:'ra', jsonb_build_object('id', :'d_none', 'category_id', :'cat', 'price', 1100,
  'names', '{"hy": "Ջուր"}'::jsonb, 'allergens_confirmed', false)) as s2 \gset
reset role;
select test.ok((select not allergens_confirmed from public.items where id = :'d_none'), 'the key false withdraws the confirmation');
select test.act_as('a1e90000-0000-0000-0000-000000000001');
-- Emptying the list without saying "none" must not turn into a claim of none.
select api.save_item(:'ra', jsonb_build_object('id', :'d_list', 'category_id', :'cat', 'price', 1000,
  'names', '{"hy": "Կաթ"}'::jsonb, 'allergens', '[]'::jsonb)) as s3 \gset
reset role;
select test.ok((select not allergens_confirmed and allergens = '{}' from public.items where id = :'d_list'),
  'a list emptied without the key goes back to unreviewed');
select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.save_item(:'ra', jsonb_build_object('id', :'d_list', 'category_id', :'cat', 'price', 1000,
  'names', '{"hy": "Կաթ"}'::jsonb, 'allergens', '[]'::jsonb, 'allergens_confirmed', true)) as s4 \gset
select api.save_item(:'ra', jsonb_build_object('id', :'d_none', 'category_id', :'cat', 'price', 1100,
  'names', '{"hy": "Ջուր"}'::jsonb, 'allergens', '["eggs"]'::jsonb, 'allergens_confirmed', false)) as s5 \gset
reset role;
select test.ok((select allergens_confirmed and allergens = '{}' from public.items where id = :'d_list'),
  'an empty list with the key true is reviewed: none');
select test.ok((select allergens_confirmed and allergens = '{eggs}' from public.items where id = :'d_none'),
  'a non-empty list always counts as confirmed, whatever the key says');

-- ---------------------------------------------------------------------------
-- Who may set it
-- ---------------------------------------------------------------------------
select test.act_as(:'u_waiter');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'ra',
  jsonb_build_object('id', :'d_new', 'category_id', :'cat', 'price', 1000, 'names', '{"hy": "Սուրճ"}'::jsonb, 'allergens_confirmed', true)),
  '%forbidden%', 'a waiter cannot set it');
select test.act_as('a1e90000-0000-0000-0000-000000000002');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'ra',
  jsonb_build_object('id', :'d_new', 'category_id', :'cat', 'price', 1000, 'names', '{"hy": "Սուրճ"}'::jsonb, 'allergens_confirmed', true)),
  '%forbidden%', 'another café''s owner cannot set it');
reset role;
select test.ok((select not allergens_confirmed from public.items where id = :'d_new'), 'and nothing changed');

-- ---------------------------------------------------------------------------
-- The published menu
-- ---------------------------------------------------------------------------
select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub1 \gset
select api.public_menu('al-cafe-a', 'main') as m1 \gset
select test.ok((:'m1'::jsonb #> array['menu', 'items', :'d_list', 'allergens_confirmed']) = 'true'::jsonb
  and (:'m1'::jsonb #> array['menu', 'items', :'d_list', 'allergens']) = '[]'::jsonb,
  'the snapshot carries confirmed with an empty list: none');
select test.ok((:'m1'::jsonb #> array['menu', 'items', :'d_new', 'allergens_confirmed']) = 'false'::jsonb,
  'the snapshot carries false for an unreviewed dish');
select test.ok((:'m1'::jsonb #> array['menu', 'items', :'d_none', 'allergens_confirmed']) = 'true'::jsonb
  and (:'m1'::jsonb #> array['menu', 'items', :'d_none', 'allergens']) = '["eggs"]'::jsonb,
  'the snapshot carries the list with confirmed true');
select test.ok((:'m1'::jsonb #> array['menu', 'items', :'d_list']) ?& array['name', 'price', 'tags', 'allergens', 'groups'],
  'the rest of the dish in the snapshot is as before');
-- A row that a script wrote with a list but without the flag still publishes as confirmed.
reset role;
update public.items set allergens = '{nuts}', allergens_confirmed = false where id = :'d_new';
select test.act_as('a1e90000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub2 \gset
select test.ok((api.public_menu('al-cafe-a', 'main') #> array['menu', 'items', :'d_new', 'allergens_confirmed']) = 'true'::jsonb,
  'a dish with a list is always published as confirmed');

reset role;
select set_config('request.jwt.claims', '', false);
\echo
\echo ALLERGEN REVIEW TESTS PASSED
