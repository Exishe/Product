-- Menu editing functions (Task 3.1): one call saves a whole category, dish or
-- option group with its three languages. Runs after adr038.sql (cafés D and E).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
select id as rd from public.restaurants where slug = 'cafe-d' \gset
select id as re from public.restaurants where slug = 'cafe-e' \gset

-- A café without a menu gets one with three names, linked to its locations
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.ensure_menu(:'re') as emenu \gset
select test.ok((select count(*) from public.menu_translations where menu_id = :'emenu') = 3, 'a new menu has three names');
select test.ok((select count(*) from public.menu_locations where menu_id = :'emenu') = 1, 'and is linked to the café''s location');
select test.ok(api.ensure_menu(:'re') = :'emenu', 'ensure_menu returns the same menu next time');

-- Categories
select api.save_category(:'re', null, '{"hy": "Ուտեստներ", "ru": "Блюда"}', null) as ecat \gset
select test.ok((select count(*) from public.category_translations where category_id = :'ecat') = 2, 'a category keeps the names it was given');
select test.fails(format('select api.save_category(%L, null, %L, null)', :'re', '{"ru": "Без армянского"}'),
  'name_required', 'a category needs an Armenian name');

-- Dishes
select api.save_item(:'re', jsonb_build_object(
  'category_id', :'ecat', 'price', 3200, 'tags', '["popular"]'::jsonb,
  'names', '{"hy": "Տոլմա", "ru": "Толма", "en": "Tolma"}'::jsonb,
  'descriptions', '{"hy": "Խաղողի տերևի մեջ"}'::jsonb)) as tolma \gset
select test.ok((select price from public.items where id = :'tolma') = 3200, 'the dish is saved with its price');
select test.ok((select count(*) from public.item_translations where item_id = :'tolma') = 3, 'with three names');
select test.ok((select tags from public.items where id = :'tolma') = '{popular}', 'and its tags');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'re',
  jsonb_build_object('category_id', :'ecat', 'price', 1500.5, 'names', '{"hy": "Կես"}'::jsonb)), 'invalid_price', 'a price in fractions of a dram is refused');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'re',
  jsonb_build_object('category_id', :'ecat', 'price', -1, 'names', '{"hy": "Բացասական"}'::jsonb)), 'invalid_price', 'a negative price is refused');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'re',
  jsonb_build_object('category_id', :'ecat', 'price', 100, 'names', '{"en": "No Armenian"}'::jsonb)), 'name_required', 'a dish needs an Armenian name');

-- Editing: clearing English removes it; an edited AI translation becomes the owner's
reset role;
update public.item_translations set source = 'ai', reviewed_at = null where item_id = :'tolma' and locale = 'ru';
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.save_item(:'re', jsonb_build_object('id', :'tolma', 'category_id', :'ecat', 'price', 3300,
  'names', '{"hy": "Տոլմա", "ru": "Толма с мацуном"}'::jsonb)) as same \gset
select test.ok(:'same' = :'tolma', 'saving an existing dish keeps its id');
select test.ok((select count(*) from public.item_translations where item_id = :'tolma' and locale = 'en') = 0, 'a cleared language is removed');
select test.ok((select source from public.item_translations where item_id = :'tolma' and locale = 'ru') = 'owner', 'an AI text the owner rewrote becomes the owner''s');

reset role;
update public.item_translations set source = 'ai', reviewed_at = null where item_id = :'tolma' and locale = 'ru';
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.save_item(:'re', jsonb_build_object('id', :'tolma', 'category_id', :'ecat', 'price', 3300, 'mark_reviewed', true,
  'names', '{"hy": "Տոլմա", "ru": "Толма с мацуном"}'::jsonb));
select test.ok((select reviewed_at is not null and source = 'ai' from public.item_translations where item_id = :'tolma' and locale = 'ru'),
  'an unchanged AI text marked as checked is reviewed, not rewritten');

-- Option groups: sizes with two options; dropping one hides it
select api.save_modifier_group(:'re', jsonb_build_object('min_select', 1, 'max_select', 1,
  'names', '{"hy": "Չափ", "en": "Size"}'::jsonb,
  'options', jsonb_build_array(
    jsonb_build_object('names', '{"hy": "Փոքր", "en": "Small"}'::jsonb, 'price_delta', 0, 'is_default', true),
    jsonb_build_object('names', '{"hy": "Մեծ", "en": "Large"}'::jsonb, 'price_delta', 500)))) as sizes \gset
select test.ok((select count(*) from public.modifiers where group_id = :'sizes' and is_active) = 2, 'a group is saved with its options');
select id as small from public.modifiers where group_id = :'sizes' and price_delta = 0 \gset
select api.save_modifier_group(:'re', jsonb_build_object('id', :'sizes', 'min_select', 1, 'max_select', 1,
  'names', '{"hy": "Չափ"}'::jsonb,
  'options', jsonb_build_array(jsonb_build_object('id', :'small', 'names', '{"hy": "Փոքր"}'::jsonb, 'price_delta', 0, 'is_default', true))));
select test.ok((select count(*) from public.modifiers where group_id = :'sizes' and is_active) = 1, 'a dropped option is hidden');
select test.fails(format('select api.save_modifier_group(%L, %L::jsonb)', :'re',
  '{"min_select": 2, "max_select": 1, "names": {"hy": "Սխալ"}, "options": []}'), 'invalid_selection', 'min above max is refused');

-- Attaching groups to a dish, and reordering
select api.save_item(:'re', jsonb_build_object('id', :'tolma', 'category_id', :'ecat', 'price', 3300,
  'names', '{"hy": "Տոլմա"}'::jsonb, 'modifier_group_ids', jsonb_build_array(:'sizes')));
select test.ok((select count(*) from public.item_modifier_groups where item_id = :'tolma') = 1, 'a group is attached to the dish');
select api.save_item(:'re', jsonb_build_object('id', :'tolma', 'category_id', :'ecat', 'price', 3300,
  'names', '{"hy": "Տոլմա"}'::jsonb, 'modifier_group_ids', '[]'::jsonb));
select test.ok((select count(*) from public.item_modifier_groups where item_id = :'tolma') = 0, 'and detached again');
select api.save_category(:'re', null, '{"hy": "Խմիչքներ"}', null) as ecat2 \gset
select api.reorder(:'re', 'categories', array[:'ecat2', :'ecat']::uuid[]);
select test.ok((select sort from public.categories where id = :'ecat2') = 0 and (select sort from public.categories where id = :'ecat') = 1,
  'categories take the new order');

-- Other cafés, guests and devices can't edit
select test.act_as('d0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'re',
  jsonb_build_object('category_id', :'ecat', 'price', 100, 'names', '{"hy": "Օտար"}'::jsonb)), 'forbidden', 'another café''s owner cannot add dishes');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'rd',
  jsonb_build_object('category_id', :'ecat', 'price', 100, 'names', '{"hy": "Խառը"}'::jsonb)), 'forbidden', 'a category of another café cannot be used');
select test.act_as('d0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.save_category(%L, null, %L, null)', :'re', '{"hy": "Հյուր"}'), 'forbidden', 'a guest cannot edit menus');

-- The edited menu publishes
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.publish_menu((select id from public.locations where restaurant_id = :'re')) as ev1 \gset
select test.ok((select item_count from public.menu_versions where id = :'ev1') = 1, 'the edited menu publishes with its dish');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'MENU EDITOR TESTS PASSED'
