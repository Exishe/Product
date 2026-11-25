-- Approximate calories and the chefs_pick tag (ADR-082): the calculation (g, ml,
-- pcs with a piece weight, missing values, rounding), when the number reaches
-- the published menu, who may read and set it, and tag validation.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('ac1d0000-0000-0000-0000-000000000001', 'owner-kc-a@example.am', false),
  ('ac1d0000-0000-0000-0000-000000000002', 'owner-kc-b@example.am', false);

select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select api.create_restaurant('Kcal A', 'kc-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('ac1d0000-0000-0000-0000-000000000002');
select api.create_restaurant('Kcal B', 'kc-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select user_id as u_waiter from public.staff_logins where username = 'kc-cafe-a-waiter' \gset

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'All');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_grams \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_pcs \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_missing \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_nopiece \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_empty \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as d_water \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'d_grams', 'en', 'Grams'), (:'ra', :'d_pcs', 'en', 'Pieces'), (:'ra', :'d_missing', 'en', 'Missing'),
  (:'ra', :'d_nopiece', 'en', 'No piece'), (:'ra', :'d_empty', 'en', 'Empty'), (:'ra', :'d_water', 'en', 'Water');

select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select api.save_ingredient(:'ra', null, '{"hy": "Բրինձ"}'::jsonb, 'g', 0, 365) as rice \gset
select api.save_ingredient(:'ra', null, '{"hy": "Յուղ"}'::jsonb, 'ml', 0, 884) as oil \gset
select api.save_ingredient(:'ra', null, '{"hy": "Ձու"}'::jsonb, 'pcs', 0, 143) as egg \gset
select api.save_ingredient(:'ra', null, '{"hy": "Գաջ"}'::jsonb, 'g') as nokcal \gset
select api.save_ingredient(:'ra', null, '{"hy": "Ջուր"}'::jsonb, 'ml', 0, 0) as water \gset
reset role;
select test.act_as('ac1d0000-0000-0000-0000-000000000002');
select api.save_ingredient(:'rb', null, '{"hy": "Այլ"}'::jsonb, 'g', 0, 100) as other_b \gset
reset role;

-- ---------------------------------------------------------------------------
-- The calculation
-- ---------------------------------------------------------------------------
select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select api.set_item_ingredient(:'d_grams', :'rice', 150), api.set_item_ingredient(:'d_grams', :'oil', 10);
select api.set_item_ingredient(:'d_pcs', :'egg', 2), api.set_item_ingredient(:'d_pcs', :'rice', 100);
select api.set_item_ingredient(:'d_missing', :'rice', 100), api.set_item_ingredient(:'d_missing', :'nokcal', 50);
select api.set_item_ingredient(:'d_nopiece', :'egg', 1);
select api.set_item_ingredient(:'d_water', :'water', 250);

select api.item_kcal(:'d_grams') as k_grams \gset
select test.ok((:'k_grams'::jsonb ->> 'kcal')::int = 640 and :'k_grams'::jsonb -> 'missing' = '[]'::jsonb,
  'g and ml: 150 g rice + 10 ml oil = 635.9, rounded up to 640');
select api.item_kcal(:'d_nopiece') as k_np \gset
select test.ok((:'k_np'::jsonb -> 'kcal') = 'null'::jsonb
  and :'k_np'::jsonb -> 'missing' = jsonb_build_array(jsonb_build_object('id', :'egg', 'reason', 'weight')),
  'pcs without a piece weight: no number, and it says the weight is missing');
select api.set_ingredient_kcal(:'egg', 143, 55);
select test.ok((api.item_kcal(:'d_pcs') ->> 'kcal')::int = 520, 'pcs with a piece weight: 2 x 55 g eggs + 100 g rice = 522.3, rounded down to 520');
select test.ok((api.item_kcal(:'d_nopiece') ->> 'kcal')::int = 80, 'one 55 g egg = 78.65, rounded to 80');
select api.item_kcal(:'d_missing') as k_miss \gset
select test.ok((:'k_miss'::jsonb -> 'kcal') = 'null'::jsonb
  and :'k_miss'::jsonb -> 'missing' = jsonb_build_array(jsonb_build_object('id', :'nokcal', 'reason', 'kcal')),
  'one ingredient without calories: no partial total, and it names the ingredient');
select test.ok((api.item_kcal(:'d_empty') -> 'kcal') = 'null'::jsonb, 'a dish with no ingredients has no number');
select test.ok((api.item_kcal(:'d_water') -> 'kcal') = 'null'::jsonb, 'a total that rounds to 0 is not shown');
-- Substitutes are not applied: a key ingredient with a replacement keeps the normal recipe.
select api.set_item_ingredient(:'d_grams', :'rice', 150, true, :'water', 0);
select test.ok((api.item_kcal(:'d_grams') ->> 'kcal')::int = 640, 'substitutes are not applied');

-- ---------------------------------------------------------------------------
-- Publish: the number is in the snapshot after Publish, not before
-- ---------------------------------------------------------------------------
select api.set_item_ingredient(:'d_missing', :'nokcal', 50);
select api.publish_menu(:'la') is not null as pub1 \gset
select api.public_menu('kc-cafe-a', 'main') as m1 \gset
select test.ok((:'m1'::jsonb #>> array['menu', 'items', :'d_grams', 'kcal'])::int = 640
  and (:'m1'::jsonb #>> array['menu', 'items', :'d_pcs', 'kcal'])::int = 520,
  'after Publish the snapshot carries kcal for dishes with a complete recipe');
select test.ok(not (:'m1'::jsonb #> array['menu', 'items', :'d_missing'] ? 'kcal')
  and not (:'m1'::jsonb #> array['menu', 'items', :'d_empty'] ? 'kcal')
  and not (:'m1'::jsonb #> array['menu', 'items', :'d_water'] ? 'kcal'),
  'dishes with no number have no kcal key at all');
select test.ok((:'m1'::jsonb #> array['menu', 'items', :'d_grams']) ?& array['name', 'price', 'tags', 'allergens', 'groups'],
  'the rest of the dish in the snapshot is as before');

-- Changing an ingredient does not reach guests until the next Publish.
select api.set_ingredient_kcal(:'nokcal', 200, null);
select test.ok((api.item_kcal(:'d_missing') ->> 'kcal')::int = 470, 'the owner preview follows at once: 365 + 100 = 465 -> 470');
select test.ok(not (api.public_menu('kc-cafe-a', 'main') #> array['menu', 'items', :'d_missing'] ? 'kcal'),
  'the published menu has not changed before Publish');
select api.publish_menu(:'la') is not null as pub2 \gset
select test.ok((api.public_menu('kc-cafe-a', 'main') #>> array['menu', 'items', :'d_missing', 'kcal'])::int = 470,
  'after the next Publish guests get it');
select api.set_ingredient_kcal(:'nokcal', null, null);   -- null clears
select test.ok((api.item_kcal(:'d_missing') -> 'kcal') = 'null'::jsonb, 'clearing the calories removes the number again');

-- ---------------------------------------------------------------------------
-- Who may do what
-- ---------------------------------------------------------------------------
reset role;
select test.act_as(:'u_waiter');
select test.fails(format('select api.item_kcal(%L)', :'d_grams'), '%forbidden%', 'a waiter cannot read the preview');
select test.fails(format('select api.set_ingredient_kcal(%L, 10, null)', :'rice'), '%forbidden%', 'a waiter cannot set calories');
reset role;
select test.act_as('ac1d0000-0000-0000-0000-000000000002');
select test.fails(format('select api.item_kcal(%L)', :'d_grams'), '%forbidden%', 'another café cannot read the preview');
select test.fails(format('select api.set_ingredient_kcal(%L, 10, null)', :'rice'), '%forbidden%', 'another café cannot change our ingredient');
select api.set_ingredient_kcal(:'other_b', 120, 30);
reset role;
select test.ok((select grams_per_piece = 30 and kcal_per_100g = 120 from public.ingredients where id = :'other_b'), 'its own ingredient it can');
select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_ingredient_kcal(%L, 1001, null)', :'rice'), '%invalid_value%', 'calories above 1000 per 100 g are refused');
select test.fails(format('select api.set_ingredient_kcal(%L, -1, null)', :'rice'), '%invalid_value%', 'negative calories are refused');
select test.fails(format('select api.set_ingredient_kcal(%L, 10, 0)', :'rice'), '%invalid_value%', 'a zero piece weight is refused');
select test.fails(format('select api.set_ingredient_kcal(%L, 10, 20000)', :'rice'), '%invalid_value%', 'a huge piece weight is refused');
reset role;
select test.act_as('ac1d0000-0000-0000-0000-000000000001', true);   -- an anonymous guest
select test.fails(format('select api.set_ingredient_kcal(%L, 10, null)', :'rice'), '%', 'a guest cannot set calories');
reset role;
select test.ok(not has_function_privilege('anon', 'api.item_kcal(uuid)', 'execute')
  and not has_function_privilege('anon', 'api.set_ingredient_kcal(uuid, numeric, numeric)', 'execute')
  and not has_function_privilege('authenticated', 'private.item_kcal_detail(uuid)', 'execute'),
  'anonymous callers cannot run the new api functions, and the private one is not callable from outside');

-- ---------------------------------------------------------------------------
-- The tag chefs_pick
-- ---------------------------------------------------------------------------
select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select api.save_item(:'ra', jsonb_build_object('id', :'d_grams', 'category_id', :'cat', 'price', 1500,
  'names', '{"hy": "Ճաշ"}'::jsonb, 'tags', '["chefs_pick", "spicy"]'::jsonb)) as saved \gset
reset role;
select test.ok((select tags = array['chefs_pick', 'spicy'] from public.items where id = :'d_grams'), 'chefs_pick is accepted and stored');
select test.act_as('ac1d0000-0000-0000-0000-000000000001');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'ra',
  jsonb_build_object('id', :'d_grams', 'category_id', :'cat', 'price', 1500, 'names', '{"hy": "Ճաշ"}'::jsonb, 'tags', '["chef_pick"]'::jsonb)),
  '%invalid_tag%', 'a misspelled tag is still refused');
select test.fails(format('select api.save_item(%L, %L::jsonb)', :'ra',
  jsonb_build_object('id', :'d_grams', 'category_id', :'cat', 'price', 1500, 'names', '{"hy": "Ճաշ"}'::jsonb, 'tags', '["gluten_free", "halal"]'::jsonb)),
  '%invalid_tag%', 'an unknown tag is refused');
select api.save_item(:'ra', jsonb_build_object('id', :'d_grams', 'category_id', :'cat', 'price', 1500,
  'names', '{"hy": "Ճաշ"}'::jsonb, 'tags', '["vegan", "vegetarian", "gluten_free", "lactose_free", "new", "popular"]'::jsonb)) is not null as old_ok \gset
select test.ok(:'old_ok', 'the earlier tags still work');
select api.publish_menu(:'la') is not null as pub3 \gset
select api.save_item(:'ra', jsonb_build_object('id', :'d_grams', 'category_id', :'cat', 'price', 1500,
  'names', '{"hy": "Ճաշ"}'::jsonb, 'tags', '["chefs_pick"]'::jsonb)) is not null as again \gset
select api.publish_menu(:'la') is not null as pub4 \gset
select test.ok((api.public_menu('kc-cafe-a', 'main') #> array['menu', 'items', :'d_grams', 'tags']) = '["chefs_pick"]'::jsonb,
  'the published dish carries the tag');

reset role;
select set_config('request.jwt.claims', '', false);
\echo
\echo CALORIES AND TAGS TESTS PASSED
