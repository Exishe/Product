-- Ingredients, substitutes and "ingredient out" (ADR-072): the data rules, who may
-- mark an ingredient out, the live effect on the guest menu and status, and the
-- order (hidden dish refused, substitution stored with its price, subs_ack).
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('a1b20000-0000-0000-0000-000000000001', 'owner-ig-a@example.am', false),
  ('a1b20000-0000-0000-0000-000000000002', 'owner-ig-b@example.am', false),
  ('a1b20000-0000-0000-0000-000000000004', null, true),   -- guests
  ('a1b20000-0000-0000-0000-000000000005', null, true),
  ('a1b20000-0000-0000-0000-000000000006', null, true),
  ('a1b20000-0000-0000-0000-000000000007', null, true),
  ('a1b20000-0000-0000-0000-000000000008', null, true),
  ('a1b20000-0000-0000-0000-000000000009', null, true);

select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.create_restaurant('Ingr A', 'ig-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select api.create_restaurant('Ingr B', 'ig-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ig-cafe-a-waiter' \gset
select user_id as u_kitchen from public.staff_logins where username = 'ig-cafe-a-kitchen' \gset

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'All');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as latte \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 2000) returning id as cake \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 700) returning id as tea \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 2500) returning id as bowl \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'latte', 'en', 'Latte'), (:'ra', :'cake', 'en', 'Cake'), (:'ra', :'tea', 'en', 'Tea'), (:'ra', :'bowl', 'en', 'Bowl');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset

-- A café B ingredient for the tampering tests.
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select api.save_ingredient(:'rb', null, '{"hy": "Ալյուր"}'::jsonb, 'g') as ing_b \gset
reset role;

-- ---------------------------------------------------------------------------
-- Ingredients: three names, kcal, the reference list
-- ---------------------------------------------------------------------------
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.save_ingredient(:'ra', null, '{"hy": "Կաթ", "ru": "Молоко", "en": "Milk"}'::jsonb, 'ml', 0.4, 61) as milk \gset
select api.save_ingredient(:'ra', null, '{"hy": "Վարսակի կաթ", "ru": "Овсяное молоко", "en": "Oat milk"}'::jsonb, 'ml', 0.9, 45) as oat \gset
select api.save_ingredient(:'ra', null, '{"hy": "Սերուցք", "en": "Cream"}'::jsonb, 'ml') as cream \gset
select api.save_ingredient(:'ra', null, '{"hy": "Շոկոլադ", "ru": "Шоколад"}'::jsonb, 'g') as choc \gset
select api.save_ingredient(:'ra', null, '{"hy": "Ընկույզ"}'::jsonb, 'g') as nut \gset
reset role;
select test.ok((select name = 'Կաթ' and name_i18n = '{"ru": "Молоко", "en": "Milk"}'::jsonb and kcal_per_100g = 61
                from public.ingredients where id = :'milk'), 'an ingredient keeps the Armenian name and the other two languages, and its kcal');
select test.ok(private.ingredient_names(:'cream') = '{"hy": "Սերուցք", "ru": "Սերուցք", "en": "Cream"}'::jsonb,
               'a missing language falls back to the Armenian name');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.fails(format('select api.save_ingredient(%L, null, %L::jsonb, ''g'')', :'ra', '{"hy": "կաթ"}'), 'ingredient_exists', 'the same name twice is refused (case-insensitive)');
select test.fails(format('select api.save_ingredient(%L, null, %L::jsonb, ''g'')', :'ra', '{"ru": "Соль"}'), 'name_required', 'the Armenian name is required');
select test.fails(format('select api.save_ingredient(%L, null, %L::jsonb, ''kg'')', :'ra', '{"hy": "Աղ"}'), 'invalid_value', 'a bad unit is refused');
select test.fails(format('select api.save_ingredient(%L, null, %L::jsonb, ''g'', 0, 5000)', :'ra', '{"hy": "Աղ"}'), 'invalid_value', 'and an impossible kcal');
select test.fails(format('select api.save_ingredient(%L, %L, %L::jsonb, ''g'')', :'ra', :'ing_b', '{"hy": "Ալյուր2"}'), 'forbidden', 'one cannot edit another café''s ingredient');
select test.fails(format('select api.save_ingredient(%L, null, %L::jsonb, ''g'')', :'rb', '{"hy": "Աղ"}'), 'forbidden', 'nor add one to another café');
select api.save_ingredient(:'ra', :'milk', '{"hy": "Կաթ", "ru": "Молоко", "en": "Whole milk"}'::jsonb, 'ml', 0.4, 61) = :'milk'::uuid as edited \gset
select count(*) as n_cat from api.ingredient_catalog() \gset
select count(*) as n_cat_ru from api.ingredient_catalog('молоко') \gset
select api.add_catalog_ingredient(:'ra', 'honey') as honey \gset
select api.add_catalog_ingredient(:'ra', 'honey') = :'honey'::uuid as honey_again \gset
reset role;
select test.ok(:'edited' and (select name_i18n ->> 'en' from public.ingredients where id = :'milk') = 'Whole milk', 'an ingredient is edited');
select test.ok((select count(*) from public.ingredient_catalog) >= 95, 'the reference list has about a hundred ingredients');
select test.ok(:'n_cat' = 120 or :'n_cat' = (select count(*) from public.ingredient_catalog), 'the catalog call lists them (at most 120)');
select test.ok(:'n_cat_ru' >= 1, 'and filters by a Russian word');
select test.ok((select kcal_per_100g = 304 and unit = 'g' and name_i18n ->> 'en' = 'Honey' from public.ingredients where id = :'honey') and :'honey_again',
               'copying one reference ingredient creates it once, with its kcal');
select test.ok(not exists (select 1 from public.ingredient_catalog where name_i18n ->> 'ru' is null or name_i18n ->> 'en' is null),
               'every reference ingredient has Russian and English names');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.fails('select count(*) from public.ingredient_catalog', 'permission denied%', 'the reference table itself is not readable (functions only)');
select test.act_as('a1b20000-0000-0000-0000-000000000004', true);
select test.fails('select * from api.ingredient_catalog()', 'forbidden', 'a guest cannot list the reference ingredients');
reset role;

-- ---------------------------------------------------------------------------
-- The recipe: key ingredient, substitute, price difference
-- ---------------------------------------------------------------------------
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.set_item_ingredient(:'latte', :'milk', 200, true, :'oat', 300) is not null as l1 \gset
select api.set_item_ingredient(:'cake', :'cream', 50, true) is not null as l2 \gset
-- (the chocolate line is not key: its substitute is dropped)
select api.set_item_ingredient(:'cake', :'choc', 30, false, :'nut', 100) is not null as l3 \gset
select api.set_item_ingredient(:'bowl', :'milk', 100, true, :'oat', -50) is not null as l4 \gset
select api.set_item_ingredient(:'bowl', :'choc', 20, true, :'nut') is not null as l5 \gset
reset role;
select test.ok(:'l1' and :'l2' and :'l3', 'the owner sets a key ingredient, with and without a substitute');
select test.ok((select is_key and substitute_ingredient_id = :'oat' and substitute_price_delta = 300 from public.recipe_lines where item_id = :'latte'),
               'the substitute and its price difference are stored');
select test.ok((select not is_key and substitute_ingredient_id is null and substitute_price_delta is null
                from public.recipe_lines where item_id = :'cake' and ingredient_id = :'choc'),
               'a line that is not key keeps no substitute');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true, %L, null)', :'latte', :'ing_b', :'oat'), 'forbidden', 'another café''s ingredient is refused');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true, %L, null)', :'latte', :'milk', :'ing_b'), 'forbidden', 'so is another café''s substitute');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true, %L, 5)', :'latte', :'milk', :'milk'), 'invalid_value', 'an ingredient cannot replace itself');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true, null, 5)', :'latte', :'milk'), 'invalid_value', 'a price difference needs a substitute');
select test.fails(format('select api.set_item_ingredient(%L, %L, 0, true)', :'latte', :'milk'), 'invalid_value', 'the quantity must be positive');
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true)', :'latte', :'ing_b'), 'forbidden', 'the owner of B cannot change A''s dish');
select test.fails(format('select api.remove_item_ingredient(%L, %L)', :'latte', :'milk'), 'forbidden', 'nor remove its lines');
select test.act_as(:'u_waiter');
select test.fails(format('select api.set_item_ingredient(%L, %L, 10, true)', :'latte', :'milk'), 'forbidden', 'a waiter cannot edit recipes');
reset role;
select test.act_as(:'u_waiter');
select test.ok((select count(*) from public.recipe_lines) = 0 and (select count(*) from public.ingredients) = 0, 'staff logins read no recipes or ingredient list directly');
reset role;
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.set_item_ingredient(:'tea', :'choc', 5, true, :'nut') as tmp \gset
select api.remove_item_ingredient(:'tea', :'choc') is null as removed \gset
reset role;
select test.ok(not exists (select 1 from public.recipe_lines where item_id = :'tea'), 'a line is removed');

-- Publish, then everything is as before while nothing is out.
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub \gset
select api.table_qr_token(:'t1') as tok1 \gset
reset role;
select test.ok(not (api.public_menu('ig-cafe-a', 'main') ?| array['outages', 'substitutions']), 'nothing out: the menu has no outage fields');
select test.ok(not (api.public_menu_status(:'la') ? 'outages'), 'nor the status');
select api.public_menu('ig-cafe-a', 'main') as menu_before \gset

select test.act_as('a1b20000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok1', 'en') as g2 \gset
select test.act_as('a1b20000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok1', 'en') as g3 \gset
select test.act_as('a1b20000-0000-0000-0000-000000000007', true);
select api.guest_join_table(:'tok1', 'en') as g4 \gset
select test.act_as('a1b20000-0000-0000-0000-000000000008', true);
select api.guest_join_table(:'tok1', 'en') as g5 \gset
select test.act_as('a1b20000-0000-0000-0000-000000000009', true);
select api.guest_join_table(:'tok1', 'en') as g6 \gset
reset role;
\set latte_line '[{"item_id": "' :latte '", "quantity": 2}]'
\set cake_line '[{"item_id": "' :cake '", "quantity": 1}]'
\set tea_line '[{"item_id": "' :tea '", "quantity": 1}]'
\set bowl_line '[{"item_id": "' :bowl '", "quantity": 1}]'

select test.act_as('a1b20000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', 'ae100000-0000-0000-0000-000000000001', :'latte_line'::jsonb, null) as o_old \gset
select api.guest_place_order(:'g1', 'ae100000-0000-0000-0000-000000000002', :'tea_line'::jsonb, null, '[]'::jsonb) as o_old2 \gset
reset role;
select test.ok(:'o_old' is not null and :'o_old2' is not null, 'old-style orders (no subs_ack) work when nothing is out');
select test.ok((select unit_price = 1500 and substitution is null from public.order_items where order_id = :'o_old'), 'at the menu price, with no substitution');

-- ---------------------------------------------------------------------------
-- Who may mark an ingredient out
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'milk', true) as until_milk \gset
reset role;
select test.ok(:'until_milk'::timestamptz > now() and :'until_milk'::timestamptz <= now() + interval '24 hours 1 minute', 'a kitchen login marks an ingredient out until the day ends');
select test.ok((:'until_milk'::timestamptz at time zone 'Asia/Yerevan')::time = '05:00', 'at the café''s business-day start (05:00)');
select test.ok((select source = 'kitchen' and set_by_user = :'u_kitchen' and set_by_member is not null and until = :'until_milk'::timestamptz
                from public.ingredient_outages where location_id = :'la' and ingredient_id = :'milk'), 'the outage records who, which channel and until when');
select test.ok(exists (select 1 from public.audit_log where entity = 'ingredient' and entity_id = :'milk' and action = 'ingredient.out'), 'and it is in the audit log');

select test.act_as(:'u_waiter');
select api.set_ingredient_out(:'la', :'cream', true) is not null as waiter_ok \gset
select api.set_ingredient_out(:'la', :'cream', false) is null as waiter_back \gset
reset role;
select test.ok(:'waiter_ok' and :'waiter_back', 'a waiter may too (the same people as the stop list)');
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_ingredient_out(%L, %L, true)', :'la', :'milk'), 'forbidden', 'the owner of another café cannot');
select test.fails(format('select api.set_ingredient_out(%L, %L, true)', :'lb', :'milk'), 'forbidden', 'nor use A''s ingredient in their own café');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_ingredient_out(%L, %L, true)', :'la', :'ing_b'), 'forbidden', 'the owner cannot mark another café''s ingredient');
select test.fails(format('select api.set_ingredient_out(%L, %L, null)', :'la', :'milk'), 'invalid_value', 'a missing value is refused');
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.set_ingredient_out(%L, %L, true)', :'la', :'cream'), 'forbidden', 'a guest cannot');
select test.fails(format('select api.search_ingredients(%L, ''a'')', :'la'), 'forbidden', 'nor search the café''s ingredients');
select test.fails(format('insert into public.ingredient_outages (restaurant_id, location_id, ingredient_id, until, source) values (%L, %L, %L, now(), ''admin'')', :'ra', :'la', :'cream'),
  'permission denied%', 'and nobody writes the table directly');
select test.act_as(:'u_kitchen');
select test.fails(format('insert into public.ingredient_outages (restaurant_id, location_id, ingredient_id, until, source) values (%L, %L, %L, now(), ''admin'')', :'ra', :'la', :'cream'),
  'permission denied%', 'not even the kitchen');
select test.ok((select count(*) from public.ingredient_outages) = 1, 'but the kitchen reads the active outages of its café');
reset role;
set role anon;
select test.fails(format('select api.set_ingredient_out(%L, %L, true)', :'la', :'milk'), 'permission denied%', 'anon cannot call it');
reset role;

-- ---------------------------------------------------------------------------
-- Effects: a substituted dish stays with a note and the price; one with no substitute leaves
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'cream', true) is not null as cream_out \gset
reset role;
select api.public_menu('ig-cafe-a', 'main') as menu_out \gset
select api.public_menu_status(:'la') as st_out \gset
select test.ok((:'menu_out'::jsonb #> array['menu', 'items', :'latte', 'price'])::integer = 1800, 'the substituted dish shows the price with the difference');
select test.ok((:'menu_out'::jsonb -> 'substitutions' -> :'latte') =
               jsonb_build_object('from', jsonb_build_object('id', :'milk'::uuid, 'name', '{"hy": "Կաթ", "ru": "Молоко", "en": "Whole milk"}'::jsonb),
                                  'to', jsonb_build_object('id', :'oat'::uuid, 'name', '{"hy": "Վարսակի կաթ", "ru": "Овсяное молоко", "en": "Oat milk"}'::jsonb),
                                  'price_delta', 300),
               'and a note with both ingredients in three languages and the difference');
select test.ok(not (:'menu_out'::jsonb #> array['menu', 'items']) ? :'cake' and not (:'menu_out'::jsonb #>> array['menu', 'menus']) like '%' || :'cake' || '%',
               'a dish with a key ingredient out and no substitute is gone from the menu (not greyed)');
select test.ok(not (:'menu_out'::jsonb -> 'sold_out') ? :'cake', 'and not on the sold-out list either');
select test.ok((:'menu_out'::jsonb ->> 'outages') is not null and (:'menu_out'::jsonb ->> 'outages') = (:'st_out'::jsonb ->> 'outages'),
               'the menu and the status carry the same outage version');
select test.ok((:'menu_out'::jsonb #> array['menu', 'items', :'tea']) is not null, 'other dishes are untouched');
select test.ok((:'menu_out'::jsonb #>> array['menu', 'items', :'bowl', 'price']) = '2450', 'a negative difference lowers the price');
select test.ok((:'menu_out'::jsonb -> 'sold_out') = (:'menu_before'::jsonb -> 'sold_out'), 'the stop list is as it was');

-- The status changes when the outages change, so open menus reload within one poll.
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'cream', false) is null as cream_back \gset
reset role;
select test.ok((api.public_menu_status(:'la') ->> 'outages') is distinct from (:'st_out'::jsonb ->> 'outages'), 'the status changes when an outage ends');
select test.ok((api.public_menu('ig-cafe-a', 'main') #> array['menu', 'items', :'cake']) is not null, 'and the dish is back');
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'cream', true) is not null as cream_out2 \gset
reset role;
select test.ok((api.public_menu_status(:'la') ->> 'outages') = (:'st_out'::jsonb ->> 'outages'), 'the same outages give the same version');

-- A dish with two key ingredients needing a replacement cannot be explained by one note: hidden.
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'choc', true) is not null as choc_out \gset
reset role;
select test.ok((api.public_menu('ig-cafe-a', 'main') #> array['menu', 'items', :'bowl']) is null,
               'two key ingredients out on one dish: hidden (milk has a substitute, chocolate''s nut does too)');
-- ... and when the substitute is out too.
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'choc', false) is null as choc_back \gset
select api.set_ingredient_out(:'la', :'oat', true) is not null as oat_out \gset
reset role;
select test.ok((api.public_menu('ig-cafe-a', 'main') #> array['menu', 'items', :'latte']) is null,
               'a dish whose substitute is out as well is hidden');
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'oat', false) is null as oat_back \gset
reset role;

-- ---------------------------------------------------------------------------
-- The order
-- ---------------------------------------------------------------------------
-- Not acknowledged: asked again, with what to show.
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g2', 'ae100000-0000-0000-0000-000000000010', :'latte_line'),
  'substitution_changed', 'a dish with a substitution is refused until the guest has accepted it');
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null, ''[]'')', :'g2', 'ae100000-0000-0000-0000-000000000010', :'latte_line'),
  'substitution_changed', 'an empty subs_ack is the same');
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null, %L::jsonb)', :'g2', 'ae100000-0000-0000-0000-000000000010', :'latte_line', json_build_array(:'oat')::text),
  'substitution_changed', 'acknowledging some other ingredient does not count');
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null, ''{"a": 1}'')', :'g2', 'ae100000-0000-0000-0000-000000000010', :'latte_line'),
  'invalid_lines', 'a subs_ack that is not a list is refused');
reset role;
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select set_config('x.g2', :'g2', false) is not null as c1, set_config('x.latte', :'latte', false) is not null as c2 \gset
do $$ declare v_detail text; begin
  begin
    perform api.guest_place_order(current_setting('x.g2')::uuid, 'ae100000-0000-0000-0000-000000000010',
      format('[{"item_id": "%s", "quantity": 1}]', current_setting('x.latte'))::jsonb, null);
  exception when others then
    get stacked diagnostics v_detail = pg_exception_detail;
    perform set_config('x.detail', v_detail, false);
  end;
end $$;
reset role;
select test.ok((current_setting('x.detail')::jsonb -> 0 ->> 'item_id') = :'latte'
               and (current_setting('x.detail')::jsonb -> 0 #>> '{from,id}') = :'milk'
               and (current_setting('x.detail')::jsonb -> 0 #>> '{to,name,ru}') = 'Овсяное молоко'
               and (current_setting('x.detail')::jsonb -> 0 ->> 'price_delta') = '300',
               'the refusal carries the dish, both ingredients in three languages and the difference');

-- Acknowledged: stored on the line, the price includes the difference.
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ae100000-0000-0000-0000-000000000011', :'latte_line'::jsonb, null, json_build_array(:'milk')::text::jsonb) as o_sub \gset
reset role;
select test.ok((select unit_price = 1800 and line_total = 3600 and substitution ->> 'price_delta' = '300'
                       and substitution #>> '{from,id}' = :'milk' and substitution #>> '{to,id}' = :'oat'
                       and substitution #>> '{from,name,en}' = 'Whole milk' and substitution #>> '{to,name,hy}' = 'Վարսակի կաթ'
                from public.order_items where order_id = :'o_sub'), 'the order line stores the substitution and the price with the difference');
select test.ok((select total = 3600 and subtotal = 3600 from public.orders where id = :'o_sub'), 'and the order total includes it');
-- A retry of the same order, even without the acknowledgement, returns the same order.
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ae100000-0000-0000-0000-000000000011', :'latte_line'::jsonb, null) = :'o_sub'::uuid as replay \gset
reset role;
select test.ok(:'replay', 'a replay of the order returns it (the retry never fails on the question)');
select test.act_as(:'u_waiter');
select api.accept_order(:'o_sub') is not null as acc \gset
reset role;
select test.ok(exists (select 1 from public.kitchen_ticket_items kti join public.order_items oi on oi.id = kti.order_item_id
                       where oi.order_id = :'o_sub' and oi.substitution is not null), 'the kitchen ticket line carries it');

-- The hidden dish is refused with the usual code.
select test.act_as('a1b20000-0000-0000-0000-000000000006', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g3', 'ae100000-0000-0000-0000-000000000012', :'cake_line'),
  'item_unavailable', 'a dish hidden by an outage is refused as unavailable');
reset role;
select test.ok(exists (select 1 from public.orders where idempotency_key = 'ae100000-0000-0000-0000-000000000012') = false, 'and no order is left behind');
select test.act_as('a1b20000-0000-0000-0000-000000000006', true);
select api.guest_place_order(:'g3', 'ae100000-0000-0000-0000-000000000013', :'tea_line'::jsonb, null, json_build_array(:'milk')::text::jsonb) as o_tea \gset
reset role;
select test.ok(:'o_tea' is not null and (select substitution is null from public.order_items where order_id = :'o_tea'), 'other dishes order as always (an extra acknowledgement is ignored)');

-- A waiter orders the same dish without the question; the substitution is stored.
select test.act_as(:'u_waiter');
select api.place_waiter_order(:'t1', 'ae100000-0000-0000-0000-000000000014', :'latte_line'::jsonb) as o_w \gset
reset role;
select test.ok((select substitution ->> 'price_delta' = '300' and unit_price = 1800 from public.order_items where order_id = :'o_w'),
               'a waiter''s order stores the substitution and the price too');
select test.act_as(:'u_waiter');
select test.fails(format('select api.place_waiter_order(%L, %L, %L::jsonb)', :'t1', 'ae100000-0000-0000-0000-000000000015', :'cake_line'),
  'item_unavailable', 'and cannot order a hidden dish');
reset role;

-- ---------------------------------------------------------------------------
-- Display setting: show the usual "sold out" label instead of hiding
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_out_ingredient_display(%L, ''sold_out'')', :'la'), 'forbidden', 'the kitchen cannot change the display setting');
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_out_ingredient_display(%L, ''sold_out'')', :'la'), 'forbidden', 'nor another café''s owner');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_out_ingredient_display(%L, ''gone'')', :'la'), 'invalid_value', 'an unknown mode is refused');
select api.set_out_ingredient_display(:'la', 'sold_out') is null as set_so \gset
reset role;
select api.public_menu('ig-cafe-a', 'main') as menu_so \gset
select test.ok((select out_ingredient_display = 'sold_out' from public.locations where id = :'la'), 'the owner changes the setting');
select test.ok((:'menu_so'::jsonb -> 'sold_out') ? :'cake' and (:'menu_so'::jsonb #> array['menu', 'items', :'cake']) is not null,
               'the blocked dish stays on the menu, marked sold out');
select test.ok((api.public_menu_status(:'la') -> 'sold_out') ? :'cake', 'and the status lists it as sold out');
select test.ok((api.public_menu_status(:'la') ->> 'outages') <> (:'st_out'::jsonb ->> 'outages'), 'the status version changes with the setting');
select test.act_as('a1b20000-0000-0000-0000-000000000006', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g3', 'ae100000-0000-0000-0000-000000000016', :'cake_line'),
  'item_sold_out', 'ordering it says sold out, as the stop list does');
reset role;
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select api.set_out_ingredient_display(:'la', 'hide') is null as set_hide \gset
reset role;
select test.ok(exists (select 1 from public.audit_log where entity = 'location' and entity_id = :'la' and action = 'ingredient.display'), 'the setting change is in the audit log');

-- ---------------------------------------------------------------------------
-- Time: it ends by itself at the end of the business day
-- ---------------------------------------------------------------------------
update public.ingredient_outages set until = now() - interval '1 second' where location_id = :'la';
select test.ok(not (api.public_menu('ig-cafe-a', 'main') ?| array['outages', 'substitutions'])
               and (api.public_menu('ig-cafe-a', 'main') #>> array['menu', 'items', :'latte', 'price']) = '1500'
               and (api.public_menu('ig-cafe-a', 'main') #> array['menu', 'items', :'cake']) is not null,
               'after the day ends the menu is back to normal with nobody doing anything');
select test.ok(not (api.public_menu_status(:'la') ? 'outages'), 'and the status says nothing is out');
select test.act_as('a1b20000-0000-0000-0000-000000000006', true);
select api.guest_place_order(:'g3', 'ae100000-0000-0000-0000-000000000017', :'cake_line'::jsonb, null) is not null as cake_ok \gset
reset role;
select test.ok(:'cake_ok', 'an expired outage no longer blocks an order');
select test.ok(private.purge_old_outages() is null, 'the nightly tidy runs');
select test.ok((select count(*) from public.ingredient_outages where until < now() - interval '2 days') = 0, 'and leaves nothing older than two days');

-- The boundary follows the café's own zone and business-day start.
update public.locations set business_day_starts = '03:30', timezone = 'Asia/Tbilisi' where id = :'la';
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'milk', true) as until_tb \gset
reset role;
select test.ok((:'until_tb'::timestamptz at time zone 'Asia/Tbilisi')::time = '03:30', 'it follows the café''s zone and business-day start');
update public.locations set business_day_starts = '05:00', timezone = 'Asia/Yerevan' where id = :'la';
-- An outage marked again moves its end and the person; back removes it.
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'milk', true) as until_again \gset
select api.set_ingredient_out(:'la', :'milk', false) is null as milk_back \gset
reset role;
select test.ok((:'until_again'::timestamptz at time zone 'Asia/Yerevan')::time = '05:00' and :'milk_back'
               and not exists (select 1 from public.ingredient_outages where location_id = :'la' and ingredient_id = :'milk'), 'marking again re-times it; back removes it');
select test.ok((select count(*) from public.audit_log where restaurant_id = :'ra' and action in ('ingredient.out', 'ingredient.back')) >= 6, 'every change is in the audit log');

-- ---------------------------------------------------------------------------
-- Search: the café's ingredients, any language, most used first
-- ---------------------------------------------------------------------------
select test.act_as(:'u_kitchen');
select test.ok((select count(*) from api.search_ingredients(:'la', 'MILK')) = 2, 'English text finds both milks (case-insensitive)');
select test.ok((select count(*) from api.search_ingredients(:'la', 'молоко')) = 2 and (select count(*) from api.search_ingredients(:'la', 'Овсяное')) = 1, 'Russian text matches');
select test.ok((select name from api.search_ingredients(:'la', 'կաթ') limit 1) = 'Կաթ' and (select count(*) from api.search_ingredients(:'la', 'կաթ')) = 2, 'and Armenian');
select test.ok((select array_agg(name order by ord) from (select name, row_number() over () as ord from api.search_ingredients(:'la', '')) s where ord <= 2) = array['Կաթ', 'Շոկոլադ']
               or (select name from api.search_ingredients(:'la', '') limit 1) = 'Կաթ', 'the most used in recipes comes first');
select test.ok((select count(*) from api.search_ingredients(:'la', 'zzzz')) = 0, 'no match, no rows');
reset role;
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'cream', true) is not null as cr \gset
reset role;
select test.act_as(:'u_kitchen');
select test.ok((select is_out from api.search_ingredients(:'la', 'cream')) and not (select is_out from api.search_ingredients(:'la', 'oat milk')), 'each result says whether it is out');
select test.ok(not exists (select 1 from api.search_ingredients(:'la', '') where id = :'ing_b'), 'another café''s ingredients never show');
reset role;
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select count(api.save_ingredient(:'ra', null, jsonb_build_object('hy', 'Նյութ ' || n, 'en', 'Thing ' || n), 'g')) as made
from generate_series(1, 40) n \gset
select test.ok((select count(*) from api.search_ingredients(:'la', 'thing')) = 30, 'at most 30 are returned');
select test.fails(format('select * from api.search_ingredients(%L, ''a'')', :'lb'), 'forbidden', 'one cannot search another café''s location');
reset role;
delete from public.ingredient_outages;

-- ---------------------------------------------------------------------------
-- The list of what is out now (api.list_ingredient_outages)
-- ---------------------------------------------------------------------------
reset role;
-- An outage that already ended stays in the table until it is overwritten; it must not be listed.
insert into public.ingredient_outages (restaurant_id, location_id, ingredient_id, out_at, until, source)
values (:'ra', :'la', :'choc', now() - interval '2 days', now() - interval '1 day', 'admin');
select test.act_as(:'u_kitchen');
select api.set_ingredient_out(:'la', :'oat', true) is not null as oat_out \gset
select count(*) as n_outs from api.list_ingredient_outages(:'la') \gset
select id as first_out from api.list_ingredient_outages(:'la') limit 1 \gset
select names ->> 'ru' as first_ru from api.list_ingredient_outages(:'la') limit 1 \gset
select count(*) as n_choc from api.list_ingredient_outages(:'la') where id = :'choc' \gset
reset role;
select count(*) as n_active from public.ingredient_outages where location_id = :'la' and until > now() \gset
select test.ok(:'n_outs' = :'n_active' and :'n_outs' >= 1 and :'n_choc' = 0, 'the kitchen lists the active outages of its café, and an ended one is absent');
select test.ok(:'first_out' = :'oat' and :'first_ru' = 'Овсяное молоко', 'newest first, with the three names');
select test.act_as(:'u_waiter');
select test.ok((select count(*) from api.list_ingredient_outages(:'la')) = :'n_active', 'a waiter may list too');
select test.act_as('a1b20000-0000-0000-0000-000000000001');
select test.ok((select count(*) from api.list_ingredient_outages(:'la')) = :'n_active', 'and the owner');
select test.act_as('a1b20000-0000-0000-0000-000000000002');
select test.fails(format('select * from api.list_ingredient_outages(%L)', :'la'), 'forbidden', 'the owner of another café cannot list them');
select test.ok((select count(*) from api.list_ingredient_outages(:'lb')) = 0, 'and sees none of A''s in their own café');
select test.act_as('a1b20000-0000-0000-0000-000000000005', true);
select test.fails(format('select * from api.list_ingredient_outages(%L)', :'la'), 'forbidden', 'a guest cannot');
reset role;
set role anon;
select test.fails(format('select * from api.list_ingredient_outages(%L)', :'la'), 'permission denied%', 'anon cannot call it');
reset role;
select test.ok(not has_function_privilege('anon', 'api.list_ingredient_outages(uuid)', 'execute')
               and has_function_privilege('authenticated', 'api.list_ingredient_outages(uuid)', 'execute')
               and (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid = 'api.list_ingredient_outages(uuid)'::regprocedure),
               'authenticated only, security definer with an empty search_path');

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
select test.ok(has_function_privilege('anon', 'api.public_menu(text, text)', 'execute') and has_function_privilege('anon', 'api.public_menu_status(uuid)', 'execute'),
               'guests still read the menu and the status');
select test.ok(not has_function_privilege('anon', 'api.set_ingredient_out(uuid, uuid, boolean)', 'execute')
               and not has_function_privilege('anon', 'api.search_ingredients(uuid, text)', 'execute')
               and not has_function_privilege('anon', 'api.save_ingredient(uuid, uuid, jsonb, text, numeric, numeric, boolean)', 'execute')
               and not has_function_privilege('anon', 'api.set_item_ingredient(uuid, uuid, numeric, boolean, uuid, numeric)', 'execute')
               and not has_function_privilege('anon', 'api.set_out_ingredient_display(uuid, text)', 'execute')
               and not has_function_privilege('anon', 'api.ingredient_catalog(text)', 'execute'), 'anon cannot call the staff functions');
select test.ok(not has_function_privilege('authenticated', 'private.apply_ingredient_out(uuid, uuid, boolean, text, public.actor_kind, uuid, uuid)', 'execute')
               and not has_function_privilege('authenticated', 'private.outage_overlay(uuid)', 'execute')
               and not has_function_privilege('anon', 'private.public_menu_base(text, text)', 'execute')
               and not has_function_privilege('authenticated', 'private.assert_subs_acked(uuid, jsonb, jsonb)', 'execute'), 'the rules and the bot''s core are not callable from outside');
select test.ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
                where oid in ('api.set_ingredient_out(uuid, uuid, boolean)'::regprocedure, 'api.search_ingredients(uuid, text)'::regprocedure,
                              'api.set_out_ingredient_display(uuid, text)'::regprocedure, 'api.public_menu(text, text)'::regprocedure,
                              'api.public_menu_status(uuid)'::regprocedure, 'api.guest_place_order(uuid, uuid, jsonb, text, jsonb)'::regprocedure,
                              'api.save_ingredient(uuid, uuid, jsonb, text, numeric, numeric, boolean)'::regprocedure,
                              'api.set_item_ingredient(uuid, uuid, numeric, boolean, uuid, numeric)'::regprocedure,
                              'private.outage_overlay(uuid)'::regprocedure)),
               'security definer with an empty search_path');
select test.ok((select count(*) from pg_proc where proname = 'guest_place_order' and pronamespace = 'api'::regnamespace) = 1, 'one guest_place_order, no overload');

reset role;
select set_config('request.jwt.claims', '', false);
\echo
\echo INGREDIENTS AND SUBSTITUTES TESTS PASSED
