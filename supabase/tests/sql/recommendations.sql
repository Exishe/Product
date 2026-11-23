-- "Goes well with" recommendations (ADR-077): item types, the compatibility
-- table, owner pairings, category and time rules, learned pairs, and the guest
-- read path api.public_suggestions. Runs after 90-smoke-test.sql and adr038.sql
-- and reuses their test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('c5e00000-0000-0000-0000-000000000001', 'owner-reco@example.am', false),
  ('c5e00000-0000-0000-0000-000000000002', 'owner-reco-b@example.am', false),
  ('c5e00000-0000-0000-0000-000000000003', 'manager-reco@example.am', false),
  ('c5e00000-0000-0000-0000-000000000004', 'waiter-reco@example.am', false);

select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Ռ', 'cafe-reco', 'Main', 'Ruzan') as ra \gset
select id as la from public.locations where restaurant_id = :'ra' \gset
select test.act_as('c5e00000-0000-0000-0000-000000000002');
select api.create_restaurant('Սրճարան Ռ2', 'cafe-reco-b', 'Main', 'Ruben') as rb \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name) values
  (:'ra', 'c5e00000-0000-0000-0000-000000000003', 'manager', 'Mane'),
  (:'ra', 'c5e00000-0000-0000-0000-000000000004', 'waiter', 'Vaho');

-- Café A: sections and dishes. sort decides the order among equals.
reset role;
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
create function test.rc5_cat(p_name text, p_sort integer) returns uuid language plpgsql as $$
declare v_c uuid;
begin
  insert into public.categories (restaurant_id, menu_id, sort)
  select r.id, m.id, p_sort from public.restaurants r, public.menus m where r.slug = 'cafe-reco' and m.restaurant_id = r.id returning id into v_c;
  insert into public.category_translations (restaurant_id, category_id, locale, name)
  select r.id, v_c, 'hy', p_name from public.restaurants r where r.slug = 'cafe-reco';
  return v_c;
end $$;
create function test.rc5_item(p_cat uuid, p_name text, p_sort integer) returns uuid language plpgsql as $$
declare v_i uuid;
begin
  insert into public.items (restaurant_id, category_id, price, sort)
  select c.restaurant_id, c.id, 1000, p_sort from public.categories c where c.id = p_cat returning id into v_i;
  insert into public.item_translations (restaurant_id, item_id, locale, name)
  select i.restaurant_id, i.id, 'hy', p_name from public.items i where i.id = v_i;
  return v_i;
end $$;
reset role;
select test.rc5_cat('Հիմնական ուտեստներ', 1) as c_main \gset
select test.rc5_cat('Կողմնակի ուտեստներ', 2) as c_side \gset
select test.rc5_cat('Ըմպելիքներ', 3) as c_drink \gset
select test.rc5_cat('Աղցաններ', 4) as c_salad \gset
select test.rc5_cat('Աղանդեր', 5) as c_dessert \gset
select test.rc5_cat('Սուրճ և թեյ', 6) as c_coffee \gset
select test.rc5_cat('Այլ', 7) as c_other \gset
select test.rc5_item(:'c_main', 'Տոլմա', 1) as steak \gset
select test.rc5_item(:'c_side', 'Կարտոֆիլ ֆրի', 1) as fries \gset
select test.rc5_item(:'c_side', 'Կետչուպ', 2) as ketchup \gset
select test.rc5_item(:'c_side', 'Մայոնեզ', 3) as mayo \gset
select test.rc5_item(:'c_drink', 'Կոլա', 3) as cola \gset
select test.rc5_item(:'c_drink', 'Գարեջուր', 4) as beer \gset
select test.rc5_item(:'c_salad', 'Ամառային աղցան', 4) as salad \gset
select test.rc5_item(:'c_dessert', 'Տորթ', 1) as cake \gset
select test.rc5_item(:'c_coffee', 'Լատտե', 1) as latte \gset
select test.rc5_item(:'c_coffee', 'Կրուասան', 2) as croissant \gset
select test.rc5_item(:'c_other', 'Առեղծված', 1) as mystery \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1');

-- ---------------------------------------------------------------------------
-- Defaults and the matrix
-- ---------------------------------------------------------------------------
reset role;
select test.ok((select count(*) from public.item_type_compat_defaults) = 18, 'the default table has the owner''s 18 pairs');
select test.ok(exists (select 1 from public.item_type_compat_defaults where from_type = 'main' and to_type = 'side')
               and exists (select 1 from public.item_type_compat_defaults where from_type = 'coffee_tea' and to_type = 'pastry_snack')
               and exists (select 1 from public.item_type_compat_defaults where from_type = 'breakfast' and to_type = 'cold_drink')
               and exists (select 1 from public.item_type_compat_defaults where from_type = 'dessert' and to_type = 'coffee_tea')
               and exists (select 1 from public.item_type_compat_defaults where from_type = 'cold_drink' and to_type = 'side'),
               'main -> side, coffee -> pastry, breakfast -> drink, dessert -> coffee, drink -> side are in');
select test.ok(not exists (select 1 from public.item_type_compat_defaults where from_type = 'main' and to_type in ('main', 'dessert'))
               and not exists (select 1 from public.item_type_compat_defaults where from_type = 'coffee_tea' and to_type in ('main', 'soup', 'alcohol'))
               and not exists (select 1 from public.item_type_compat_defaults where from_type = 'dessert' and to_type in ('main', 'side', 'soup', 'sauce'))
               and not exists (select 1 from public.item_type_compat_defaults where from_type = 'breakfast' and to_type in ('alcohol', 'dessert'))
               and not exists (select 1 from public.item_type_compat_defaults where from_type in ('starter_salad', 'soup') and to_type = 'dessert')
               and not exists (select 1 from public.item_type_compat_defaults where from_type = 'cold_drink' and to_type = 'main'),
               'and the "never" column is out');

select test.act_as('c5e00000-0000-0000-0000-000000000001');
select test.ok((select count(*) from api.compat_matrix(:'la')) = 121 and (select count(*) from api.compat_matrix(:'la') where allowed) = 18
               and (select count(*) from api.compat_matrix(:'la') where is_custom) = 0,
               'the matrix lists 11 x 11 pairs, 18 allowed, none customised');

-- ---------------------------------------------------------------------------
-- Types: setter, proposals
-- ---------------------------------------------------------------------------
select test.ok((select item_type is null from public.items where id = :'steak'), 'a new dish has no type');
select test.ok(api.public_suggestions(:'la', :'steak') = '{"suggestions": []}'::jsonb, 'nothing is suggested before the menu is published');
select api.publish_menu(:'la') is not null as published \gset

select test.fails(format('select api.set_item_type(%L, ''pizza'')', :'steak'), 'invalid_type', 'an unknown type is refused');
select test.fails(format('select api.set_compat_rule(%L, ''main'', ''pizza'', true)', :'la'), 'invalid_type', 'also in the table');

-- "Suggest types" proposes from section names and saves nothing.
select test.ok((select string_agg(distinct s.suggested_type collate "C", ',' order by s.suggested_type collate "C") from api.suggest_item_types(:'la') s)
               = 'coffee_tea,cold_drink,dessert,main,side,starter_salad',
               'proposals from the section names: main, side, drink, salad, dessert, coffee and tea');
select test.ok((select count(*) from api.suggest_item_types(:'la') s where s.item_id = :'mystery') = 0, 'a section with no keyword gets no proposal');
select test.ok((select count(*) from public.items where restaurant_id = :'ra' and item_type is not null) = 0, 'and nothing is applied by asking');
reset role;
select test.ok((private.guess_item_type('Hot drinks'), private.guess_item_type('Cold drinks'), private.guess_item_type('Кофе и чай'),
                private.guess_item_type('Салаты'), private.guess_item_type('Супы'), private.guess_item_type('Десерты'),
                private.guess_item_type('Wine and beer'), private.guess_item_type('Breakfast'), private.guess_item_type('Sauces'),
                private.guess_item_type('Սուրճ'), private.guess_item_type('Ապուրներ'), private.guess_item_type('Pastry'),
                private.guess_item_type('Specials'))::text
               = '(coffee_tea,cold_drink,coffee_tea,starter_salad,soup,dessert,alcohol,breakfast,sauce,coffee_tea,soup,pastry_snack,)',
               'keywords in hy, ru and en, hot drinks before cold ones');

select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_item_type(:'steak', 'main');
select api.set_item_type(:'fries', 'side');
select api.set_item_type(:'ketchup', 'sauce');
select api.set_item_type(:'mayo', 'sauce');
select api.set_item_type(:'cola', 'cold_drink');
select api.set_item_type(:'beer', 'alcohol');
select api.set_item_type(:'salad', 'starter_salad');
select api.set_item_type(:'cake', 'dessert');
select api.set_item_type(:'latte', 'coffee_tea');
select api.set_item_type(:'croissant', 'pastry_snack');
select test.ok((select item_type from public.items where id = :'steak') = 'main', 'the owner sets a type');
select api.set_item_type(:'beer', null);
select test.ok((select item_type is null from public.items where id = :'beer'), 'and clears it');
select api.set_item_type(:'beer', 'alcohol');

-- Who may set things: owner and manager of that café only.
select test.act_as('c5e00000-0000-0000-0000-000000000003');
select api.set_item_type(:'steak', 'main');
select test.ok(true, 'a manager may set a type');
select test.act_as('c5e00000-0000-0000-0000-000000000004');
select test.fails(format('select api.set_item_type(%L, ''main'')', :'steak'), 'forbidden', 'a waiter login may not');
select test.fails(format('select api.set_compat_rule(%L, ''main'', ''sauce'', false)', :'la'), 'forbidden', 'nor change the table');
select test.fails(format('select api.set_item_pairing(%L, %L, 0)', :'steak', :'cola'), 'forbidden', 'nor pair dishes');
select test.fails(format('select * from api.suggest_item_types(%L)', :'la'), 'forbidden', 'nor ask for proposals');
select test.fails(format('select * from api.compat_matrix(%L)', :'la'), 'forbidden', 'nor read the matrix');
select test.fails(format('select api.save_time_rule(%L, null, ''08:00'', ''11:00'', null, ''coffee_tea'', null)', :'la'), 'forbidden', 'nor save a time rule');
select test.act_as('c5e00000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_item_type(%L, ''main'')', :'steak'), 'forbidden', 'the owner of another café may not set a type');
select test.fails(format('select api.set_compat_rule(%L, ''main'', ''sauce'', false)', :'la'), 'forbidden', 'nor change the table');
select test.fails(format('select api.reset_compat_rules(%L)', :'la'), 'forbidden', 'nor reset it');
select test.fails(format('select api.set_item_pairing(%L, %L, 0)', :'steak', :'cola'), 'forbidden', 'nor pair dishes');
select test.fails(format('select api.remove_item_pairing(%L, %L)', :'steak', :'cola'), 'forbidden', 'nor remove a pairing');
select test.fails(format('select api.save_suggestion_rule(%L, null, null, ''main'', null, ''sauce'')', :'ra'), 'forbidden', 'nor save a rule');
select test.fails(format('select api.save_time_rule(%L, null, ''08:00'', ''11:00'', null, ''coffee_tea'', null)', :'la'), 'forbidden', 'nor a time rule');
select test.fails(format('select * from api.suggest_item_types(%L)', :'la'), 'forbidden', 'nor ask for proposals');
select test.ok((select count(*) from public.item_pairings) = 0 and (select count(*) from public.item_type_compat) = 0, 'and sees none of A''s rows');
select test.fails(format('insert into public.item_pairings (restaurant_id, item_id, suggest_item_id) values (%L, %L, %L)', :'rb', :'steak', :'cola'),
                  '%permission denied%', 'no direct writes to the pairings');
select test.fails('select * from public.item_type_compat_defaults', '%permission denied%', 'the global table is functions-only');
select test.act_as_anon();
select test.fails(format('select api.set_item_type(%L, ''main'')', :'steak'), '%permission denied%', 'anon cannot set a type');
select test.fails('select * from public.item_pairings', '%permission denied%', 'nor read the tables');
select test.fails('select * from public.suggestion_time_rules', '%permission denied%', 'any of them');
select test.fails(format('select * from api.compat_matrix(%L)', :'la'), '%permission denied%', 'nor the matrix');

-- ---------------------------------------------------------------------------
-- Read path: the table alone (tier 5), one per type, deterministic
-- ---------------------------------------------------------------------------
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s1 \gset
select test.ok(jsonb_array_length(:'s1'::jsonb -> 'suggestions') = 3, 'a main suggests three dishes');
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s1'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'fries'::text, :'ketchup'::text, :'cola'::text),
               'side, sauce and drink in menu order (salad is fourth; mayo is a second sauce)');
select test.ok((select bool_and(e ->> 'reason' = 'perfect_with_type' and e ->> 'with_type' = 'main' and e ->> 'with_item_id' = :'steak')
                from jsonb_array_elements(:'s1'::jsonb -> 'suggestions') e), 'reason keys carry the dish and its type');
select test.ok((select count(distinct e ->> 'type') from jsonb_array_elements(:'s1'::jsonb -> 'suggestions') e) = 3, 'one per type');
select test.ok(api.public_suggestions(:'la', :'steak') = :'s1'::jsonb, 'the same call gives the same answer');
select test.ok(not exists (select 1 from jsonb_array_elements(:'s1'::jsonb -> 'suggestions') e where e ->> 'item_id' in (:'beer', :'cake', :'latte', :'mayo')),
               'never a type the table forbids (alcohol, dessert, coffee), nor a second sauce');

-- A cart: dishes in it and the dish itself never come back.
select api.public_suggestions(:'la', :'steak', array[:'fries', :'cola', null, :'fries']::uuid[]) as s2 \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s2'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'ketchup'::text, :'salad'::text), 'items already in the cart are skipped (nulls and repeats tolerated)');
select test.ok(api.public_suggestions(:'la', :'steak', null) = :'s1'::jsonb, 'a null cart is an empty cart');
select test.ok(not exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak', array[:'steak']::uuid[]) -> 'suggestions') e
                           where e ->> 'item_id' = :'steak'), 'the dish just added is never suggested');

-- Bad input: an empty list, no error.
select test.ok(api.public_suggestions(null, :'steak') = '{"suggestions": []}'::jsonb
               and api.public_suggestions(:'la', null) = '{"suggestions": []}'::jsonb
               and api.public_suggestions(gen_random_uuid(), :'steak') = '{"suggestions": []}'::jsonb
               and api.public_suggestions(:'la', gen_random_uuid()) = '{"suggestions": []}'::jsonb
               and api.public_suggestions(:'lb', :'steak') = '{"suggestions": []}'::jsonb,
               'unknown ids, another café''s ids and nulls give an empty list');

-- An untyped dish gets no table-based suggestions.
select test.ok(api.public_suggestions(:'la', :'mystery') = '{"suggestions": []}'::jsonb, 'an untyped dish: nothing from the table');

-- ---------------------------------------------------------------------------
-- Per-venue override
-- ---------------------------------------------------------------------------
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_compat_rule(:'la', 'main', 'sauce', false);
select test.ok((select allowed = false and is_custom from api.compat_matrix(:'la') where from_type = 'main' and to_type = 'sauce'), 'the matrix shows the change');
select test.act_as_anon();
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'fries'::text, :'cola'::text, :'salad'::text), 'main -> sauce switched off here: the salad takes its place');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_compat_rule(:'la', 'main', 'dessert', true);
select test.act_as_anon();
select test.ok(exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'cake'),
               'main -> dessert switched on: the cake joins');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_compat_rule(:'la', 'main', 'dessert', false);   -- back to the default: nothing stored
select test.ok((select count(*) from public.item_type_compat where location_id = :'la') = 1, 'a choice equal to the default is not stored');
select test.act_as('c5e00000-0000-0000-0000-000000000002');
select test.ok((select count(*) from api.compat_matrix(:'lb') where is_custom) = 0, 'another café keeps the defaults');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.reset_compat_rules(:'la');
select test.ok((select count(*) from public.item_type_compat where location_id = :'la') = 0, 'reset to defaults');
select test.act_as_anon();
select test.ok(api.public_suggestions(:'la', :'steak') = :'s1'::jsonb, 'and the answer is the default one again');

-- ---------------------------------------------------------------------------
-- Owner pairings bypass the table, come first, one per type, at most 6 each
-- ---------------------------------------------------------------------------
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_item_pairing(%L, %L, 0)', :'steak', :'steak'), 'invalid_value', 'a dish cannot pair with itself');
select test.fails(format('select api.set_item_pairing(%L, %L, 0)', :'steak', gen_random_uuid()), 'forbidden', 'nor with an unknown dish');
select api.set_item_pairing(:'steak', :'beer', 0);     -- alcohol: main -> alcohol is "never" in the table
select api.set_item_pairing(:'steak', :'mayo', 1);
select api.set_item_pairing(:'steak', :'ketchup', 2);  -- a second sauce: hidden behind the first
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s3 \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s3'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'beer'::text, :'mayo'::text, :'fries'::text),
               'owner pairings first (beer bypasses the table), one sauce only, then the table fills the third place');
select test.ok((select e ->> 'reason' from jsonb_array_elements(:'s3'::jsonb -> 'suggestions') e where e ->> 'item_id' = :'beer') = 'pairs_with_dish'
               and (select e ->> 'with_item_id' from jsonb_array_elements(:'s3'::jsonb -> 'suggestions') e where e ->> 'item_id' = :'beer') = :'steak',
               'with the reason pairs_with_dish');
select test.ok(jsonb_array_length(:'s3'::jsonb -> 'suggestions') <= 3, 'never more than three');
-- Pairings also work for an untyped dish.
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_item_pairing(:'mystery', :'cake', 0);
select test.act_as_anon();
select test.ok((select jsonb_agg(e ->> 'item_id') from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') e)
               = jsonb_build_array(:'cake'::text), 'an untyped dish still gets its owner pairing');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_item_pairing(:'steak', :'ketchup');
select test.ok((select count(*) from public.item_pairings where item_id = :'steak') = 2, 'a pairing can be removed');
select api.set_item_pairing(:'cake', :'latte', 0);
select api.set_item_pairing(:'cake', :'cola', 1);
select api.set_item_pairing(:'cake', :'beer', 2);
select api.set_item_pairing(:'cake', :'fries', 3);
select api.set_item_pairing(:'cake', :'salad', 4);
select api.set_item_pairing(:'cake', :'ketchup', 5);
select test.fails(format('select api.set_item_pairing(%L, %L, 6)', :'cake', :'croissant'), 'too_many_pairings', 'six pairings per dish at most');
select api.set_item_pairing(:'cake', :'latte', 9);     -- changing one is fine
select api.remove_item_pairing(:'cake', :'latte'); select api.remove_item_pairing(:'cake', :'cola');
select api.remove_item_pairing(:'cake', :'beer'); select api.remove_item_pairing(:'cake', :'fries');
select api.remove_item_pairing(:'cake', :'salad'); select api.remove_item_pairing(:'cake', :'ketchup');

-- ---------------------------------------------------------------------------
-- Category and type rules (after pairings, before the table), obeying the table
-- ---------------------------------------------------------------------------
select api.save_suggestion_rule(:'ra', null, :'c_main', null, :'c_side', null, 5) as rule_cat \gset
-- rule_bad is main -> dessert, which the table forbids
select api.save_suggestion_rule(:'ra', null, null, 'main', null, 'cold_drink', 6) as rule_type \gset
select api.save_suggestion_rule(:'ra', null, null, 'main', :'c_dessert', null, 7) as rule_bad \gset
select test.fails(format('select api.save_suggestion_rule(%L, null, null, ''main'', null, null)', :'ra'), 'invalid_value', 'a rule needs both ends');
select test.fails(format('select api.save_suggestion_rule(%L, null, %L, ''main'', null, ''sauce'')', :'ra', :'c_main'), 'invalid_value', 'and only one of category or type on each');
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s4 \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s4'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'beer'::text, :'mayo'::text, :'fries'::text),
               'pairings, then the section rule (fries; one side per type)');
select test.ok((select e ->> 'reason' from jsonb_array_elements(:'s4'::jsonb -> 'suggestions') e where e ->> 'item_id' = :'fries') = 'pairs_with_dish',
               'a section rule says pairs_with_dish');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_item_pairing(:'steak', :'mayo');
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s5 \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s5'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'beer'::text, :'fries'::text, :'ketchup'::text),
               'the section rule offers its whole section, one per type; the main -> dessert rule is dropped by the table');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_suggestion_rule(:'rule_cat');
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s5b \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s5b'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'beer'::text, :'cola'::text, :'fries'::text),
               'with the type rule alone: pairing, the type rule, then the table');
select test.ok((select e ->> 'reason' from jsonb_array_elements(:'s5b'::jsonb -> 'suggestions') e where e ->> 'item_id' = :'cola') = 'perfect_with_type',
               'a type rule says perfect_with_type');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_item_pairing(:'mystery', :'cake');
select api.remove_suggestion_rule(:'rule_type'); select api.remove_suggestion_rule(:'rule_bad');
select api.remove_item_pairing(:'steak', :'beer');
select test.ok((select count(*) from public.suggestion_rules where restaurant_id = :'ra') = 0, 'rules can be removed');
select test.act_as('c5e00000-0000-0000-0000-000000000002');
select test.fails(format('select api.remove_suggestion_rule(%L)', :'rule_cat'), 'forbidden', 'another café cannot remove them (and they are gone anyway)');

-- ---------------------------------------------------------------------------
-- Learned pairs (ADR-060 logic), filtered by the table
-- ---------------------------------------------------------------------------
reset role;
select id as amember from public.members where restaurant_id = :'ra' and user_id = 'c5e00000-0000-0000-0000-000000000001' \gset
create function test.rc5_round(p_n integer, p_items uuid[]) returns void language plpgsql as $$
declare v_order uuid; v_item uuid; v_loc uuid; v_rest uuid; v_table uuid; v_member uuid;
begin
  select l.id, l.restaurant_id into v_loc, v_rest from public.locations l join public.restaurants r on r.id = l.restaurant_id where r.slug = 'cafe-reco';
  select t.id into v_table from public.tables t where t.location_id = v_loc limit 1;
  select m.id into v_member from public.members m where m.restaurant_id = v_rest and m.role = 'owner';
  insert into public.orders (restaurant_id, location_id, table_id, created_by_member, source, status, locale,
                             business_date, number, idempotency_key, request_hash, placed_at)
  values (v_rest, v_loc, v_table, v_member, 'waiter', 'accepted', 'hy', current_date - 1, 500 + p_n, gen_random_uuid(), 'test', now() - interval '1 day')
  returning id into v_order;
  foreach v_item in array p_items loop
    insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
    select i.restaurant_id, v_order, i.id, '{"hy": "x"}', i.price, 1, i.price from public.items i where i.id = v_item;
  end loop;
end $$;
-- steak + cake 5 times (main -> dessert: the table forbids), steak + latte 4 times
-- (main -> coffee: forbidden), steak + salad 3 times (allowed), steak + mystery 3 times
-- (an untyped dish cannot be checked), mystery + cake 3 times.
select test.rc5_round(n, array[:'steak', :'cake']::uuid[]) from generate_series(1, 5) n;
select test.rc5_round(10 + n, array[:'steak', :'latte']::uuid[]) from generate_series(1, 4) n;
select test.rc5_round(20 + n, array[:'steak', :'salad']::uuid[]) from generate_series(1, 3) n;
select test.rc5_round(30 + n, array[:'steak', :'mystery']::uuid[]) from generate_series(1, 3) n;
select test.rc5_round(40 + n, array[:'mystery', :'cake']::uuid[]) from generate_series(1, 3) n;
select test.act_as_anon();
select api.public_suggestions(:'la', :'steak') as s6 \gset
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(:'s6'::jsonb -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'salad'::text, :'fries'::text, :'ketchup'::text),
               'the learned salad comes before the table''s picks; the cake and latte pairs (forbidden) and the untyped one are dropped');
select test.ok((select e ->> 'reason' from jsonb_array_elements(:'s6'::jsonb -> 'suggestions') e where e ->> 'item_id' = :'salad') = 'often_together',
               'with the reason often_together');
select test.ok((select array_agg(e ->> 'item_id' order by e ->> 'item_id') from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') e)
               = (select array_agg(x order by x) from unnest(array[:'cake'::text, :'steak'::text]) x),
               'for an untyped dish its learned pairs are kept (nothing to check against); its owner pairing was removed above');
select test.ok((select bool_and(e ->> 'reason' = 'often_together') from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') e),
               'with the reason often_together');
-- The hints function still answers the same.
select test.ok((api.public_menu_hints('cafe-reco', 'main') -> 'pairs' -> :'steak') is not null, 'api.public_menu_hints still works on the shared logic');

-- ---------------------------------------------------------------------------
-- Availability: nothing unavailable is ever suggested
-- ---------------------------------------------------------------------------
reset role;
delete from public.orders where restaurant_id = :'ra';
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_item_pairing(:'steak', :'cola', 0);
select api.set_item_pairing(:'steak', :'fries', 1);
select api.set_item_pairing(:'steak', :'salad', 2);
select api.set_item_pairing(:'steak', :'beer', 3);
select test.act_as_anon();
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'cola'::text, :'fries'::text, :'salad'::text), 'baseline: cola, fries, salad (beer is a fourth)');
-- Stop list
select test.act_as('c5e00000-0000-0000-0000-000000000001');
insert into public.stop_list (restaurant_id, location_id, item_id) values (:'ra', :'la', :'cola');
select test.act_as_anon();
select test.ok(not exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'cola'),
               'a dish on the stop list is not suggested');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
update public.stop_list set until = now() - interval '1 minute' where item_id = :'cola';
select test.act_as_anon();
select test.ok(exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'cola'),
               'a stop-list entry that has ended does not block');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
delete from public.stop_list where item_id = :'cola';
-- Hidden dish
update public.items set is_active = false where id = :'fries';
select test.act_as_anon();
select test.ok(not exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'fries'),
               'a hidden dish is not suggested');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
update public.items set is_active = true where id = :'fries';
-- Out of ingredients (a key ingredient with no substitute)
select api.save_ingredient(:'ra', null, '{"hy": "Լոլիկ"}'::jsonb, 'g') as tomato \gset
select api.set_item_ingredient(:'salad', :'tomato', 100, true);
select api.set_ingredient_out(:'la', :'tomato', true) is not null as out_set \gset
select test.act_as_anon();
select test.ok(not exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'salad'),
               'a dish blocked by an ingredient outage is not suggested');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_ingredient_out(:'la', :'tomato', false) is null as out_cleared \gset
select test.act_as_anon();
select test.ok(exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' = :'salad'),
               'and comes back with the ingredient');
-- Closed section window
reset role;
select to_char((now() at time zone timezone) + interval '2 hours', 'HH24:MI') as w_from,
       to_char((now() at time zone timezone) + interval '3 hours', 'HH24:MI') as w_to from public.locations where id = :'la' \gset
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_category_window(:'c_drink', :'w_from'::time, :'w_to'::time);
select test.act_as_anon();
select test.ok(not exists (select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e where e ->> 'item_id' in (:'cola', :'beer')),
               'a section outside its window is not suggested from');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.set_category_window(:'c_drink', null, null);
-- Not on the published menu (made after the last publish)
select test.rc5_item(:'c_side', 'Նոր', 9) as fresh \gset
select api.set_item_type(:'fresh', 'side');
select api.set_item_pairing(:'cake', :'fresh', 0);
select test.act_as_anon();
select test.ok(api.public_suggestions(:'la', :'cake') = '{"suggestions": []}'::jsonb or not exists (
                 select 1 from jsonb_array_elements(api.public_suggestions(:'la', :'cake') -> 'suggestions') e where e ->> 'item_id' = :'fresh'),
               'a dish that is not on the published menu is not suggested');
select test.ok(api.public_suggestions(:'la', :'fresh') = '{"suggestions": []}'::jsonb, 'nor suggested from');

-- ---------------------------------------------------------------------------
-- Time rules, in the café's time zone
-- ---------------------------------------------------------------------------
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_item_pairing(:'cake', :'fresh');
reset role;
update public.locations set timezone = 'Pacific/Kiritimati' where id = :'la';   -- UTC+14
select to_char((now() at time zone 'Pacific/Kiritimati') - interval '1 hour', 'HH24:MI') as t_from,
       to_char((now() at time zone 'Pacific/Kiritimati') + interval '1 hour', 'HH24:MI') as t_to,
       extract(isodow from now() at time zone 'Pacific/Kiritimati')::int as dow \gset
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select test.fails(format('select api.save_time_rule(%L, null, %L, %L, null, ''coffee_tea'', %L)', :'la', :'t_from', :'t_to', :'latte'), 'invalid_value', 'a time rule has a type or a dish, not both');
select test.fails(format('select api.save_time_rule(%L, null, ''08:00'', ''08:00'', null, ''coffee_tea'', null)', :'la'), 'invalid_value', 'and a window that is not empty');
select test.fails(format('select api.save_time_rule(%L, null, ''08:00'', ''10:00'', array[0, 8]::smallint[], ''coffee_tea'', null)', :'la'), 'invalid_value', 'weekdays are 1 to 7');
select api.save_time_rule(:'la', null, :'t_from'::time, :'t_to'::time, null, 'coffee_tea', null, 0) as tr1 \gset
select api.save_time_rule(:'la', null, :'t_from'::time, :'t_to'::time, array[:'dow']::smallint[], null, :'croissant', 1) as tr2 \gset
select test.act_as_anon();
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'latte'::text, :'croissant'::text), 'inside the window (café time) a time rule adds its candidates');
select test.ok((select bool_and(e ->> 'reason' = 'time_rule' and e ->> 'with_item_id' is null) from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') e),
               'with the reason time_rule');
select test.ok((select jsonb_agg(e ->> 'item_id') from jsonb_array_elements(api.public_suggestions(:'la', :'steak') -> 'suggestions') e)::text not like '%' || :'latte' || '%',
               'time rules obey the table: a main does not get the latte');
-- The same clock window in another time zone is not "now"
reset role;
update public.locations set timezone = 'Etc/GMT+12' where id = :'la';          -- UTC-12: 26 hours behind
select test.act_as_anon();
select test.ok(api.public_suggestions(:'la', :'mystery') = '{"suggestions": []}'::jsonb, 'the window is read in the café''s time zone: elsewhere it is not open');
reset role;
update public.locations set timezone = 'Pacific/Kiritimati' where id = :'la';
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.save_time_rule(:'la', :'tr2', :'t_from'::time, :'t_to'::time, array[(:'dow' % 7) + 1]::smallint[], null, :'croissant', 1) is not null as moved \gset
select test.act_as_anon();
select test.ok((select jsonb_agg(e ->> 'item_id' order by o) from jsonb_array_elements(api.public_suggestions(:'la', :'mystery') -> 'suggestions') with ordinality x(e, o))
               = jsonb_build_array(:'latte'::text), 'a rule for another weekday does not apply today');
select test.act_as('c5e00000-0000-0000-0000-000000000001');
select api.remove_time_rule(:'tr1'); select api.remove_time_rule(:'tr2');
select test.act_as_anon();
select test.ok(api.public_suggestions(:'la', :'mystery') = '{"suggestions": []}'::jsonb, 'removed rules add nothing; an empty editor is fine');
reset role;
update public.locations set timezone = 'Asia/Yerevan' where id = :'la';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
select test.ok(has_function_privilege('anon', 'api.public_suggestions(uuid, uuid, uuid[])', 'execute'), 'anon may call public_suggestions');
select test.ok(not has_function_privilege('anon', 'api.set_item_type(uuid, text)', 'execute')
               and not has_function_privilege('anon', 'api.set_item_pairing(uuid, uuid, integer)', 'execute')
               and not has_function_privilege('anon', 'api.compat_matrix(uuid)', 'execute')
               and not has_function_privilege('anon', 'api.suggest_item_types(uuid)', 'execute')
               and not has_function_privilege('anon', 'private.learned_pairs(uuid, uuid)', 'execute')
               and not has_function_privilege('authenticated', 'private.guess_item_type(text)', 'execute'),
               'and nothing else of this feature');
select test.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'public' and c.relname in ('item_type_compat', 'item_pairings', 'suggestion_rules', 'suggestion_time_rules', 'item_type_compat_defaults')
                             and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'insert,update,delete'))),
               'anon reads none of the tables and nobody writes them directly');

-- ---------------------------------------------------------------------------
-- Speed (ADR-077 addendum): the cache gives the same answers, the hot path
-- does not read orders, nobody but the functions can read the cache
-- ---------------------------------------------------------------------------
reset role;
select test.rc5_round(70 + n, array[:'steak', :'salad']::uuid[]) from generate_series(1, 4) n;
select test.rc5_round(80 + n, array[:'steak', :'fries']::uuid[]) from generate_series(1, 3) n;
-- a line whose dish was deleted (item_id null) must not break the refresh
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, line_total)
select o.restaurant_id, o.id, null, '{"hy": "x"}', 100, 1, 100 from public.orders o where o.location_id = :'la' limit 1;
select test.ok(not exists (select 1 from private.suggestion_cache_state where location_id = :'la'),
               'no cache yet for this café: the strip is computed live');
select api.public_suggestions(:'la', :'steak') as live_steak, api.public_suggestions(:'la', :'mystery') as live_myst,
       api.public_menu_hints('cafe-reco', 'main') as live_hints \gset
select private.refresh_suggestion_caches() >= 1 as refreshed \gset
select test.ok(:'refreshed', 'the refresh job function ran for the café with orders');
select count(*) as n_pairs, coalesce(sum(n), 0) as sum_pairs from private.learned_pair_cache where location_id = :'la' \gset
select count(*) as n_pop, coalesce(sum(n), 0) as sum_pop from private.item_popularity_cache where location_id = :'la' \gset
select test.ok(:n_pairs > 0 and :n_pop > 0, 'the cache holds pairs and popularity');
select test.act_as_anon();
select test.ok(api.public_suggestions(:'la', :'steak') = :'live_steak'::jsonb
               and api.public_suggestions(:'la', :'mystery') = :'live_myst'::jsonb
               and api.public_menu_hints('cafe-reco', 'main') = :'live_hints'::jsonb,
               'cache and live give identical suggestions and hints');
reset role;
select test.ok((select count(*) from private.learned_pairs_live(:'la')) = (select count(*) from private.learned_pairs(:'la'))
               and not exists (select 1 from private.learned_pairs_live(:'la') l
                               full join private.learned_pairs(:'la') c on c.item_id = l.item_id and c.other_id = l.other_id
                               where l.n is distinct from c.n),
               'the cached pairs equal the live pairs row by row');
select private.refresh_suggestion_cache(:'la');
select private.refresh_suggestion_cache(:'la');
select test.ok((select count(*) from private.learned_pair_cache where location_id = :'la') = :n_pairs
               and (select sum(n) from private.item_popularity_cache where location_id = :'la') = :sum_pop
               and (select count(*) from private.suggestion_cache_state where location_id = :'la') = 1,
               'refreshing again changes nothing (idempotent)');
-- New orders do not change the answer until the next refresh: the hot path reads the cache.
select test.rc5_round(60 + n, array[:'steak', :'beer']::uuid[]) from generate_series(1, 3) n;
select test.ok(not exists (select 1 from private.learned_pairs(:'la', :'steak') where other_id = :'beer')
               and exists (select 1 from private.learned_pairs_live(:'la', :'steak') where other_id = :'beer'),
               'orders after the refresh are not read by the hot path');
select test.ok(pg_get_functiondef('api.public_suggestions(uuid, uuid, uuid[])'::regprocedure) !~ 'public\.orders'
               and pg_get_functiondef('api.public_suggestions(uuid, uuid, uuid[])'::regprocedure) ~ 'private\.item_popularity'
               and pg_get_functiondef('private.learned_pairs(uuid, uuid)'::regprocedure) ~ 'learned_pair_cache',
               'public_suggestions never names the orders table; it reads the cache');
select private.refresh_suggestion_cache(:'la');
select test.ok(exists (select 1 from private.learned_pairs(:'la', :'steak') where other_id = :'beer'), 'the next refresh picks them up');
-- Rights
select test.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                           where n.nspname = 'private' and c.relname in ('learned_pair_cache', 'item_popularity_cache', 'suggestion_cache_state')
                             and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
                                  or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))
                             or not c.relrowsecurity and c.relname in ('learned_pair_cache', 'item_popularity_cache', 'suggestion_cache_state')),
               'the cache tables have row level security and no client can read or write them');
select test.ok(not has_function_privilege('anon', 'private.refresh_suggestion_caches()', 'execute')
               and not has_function_privilege('authenticated', 'private.refresh_suggestion_cache(uuid)', 'execute')
               and not has_function_privilege('authenticated', 'private.item_popularity(uuid)', 'execute'),
               'clients cannot run the refresh or read the cache through functions');
select test.ok(not exists (select 1 from cron.job where jobname = 'pativ-refresh-suggestion-cache') is false
               or not exists (select 1 from pg_namespace where nspname = 'cron'),
               'the refresh is scheduled every 15 minutes where pg_cron exists');
select test.ok((select schedule from cron.job where jobname = 'pativ-refresh-suggestion-cache') = '*/15 * * * *', 'every 15 minutes');

drop function test.rc5_round(integer, uuid[]);
drop function test.rc5_item(uuid, text, integer);
drop function test.rc5_cat(text, integer);
select set_config('request.jwt.claims', '', false);
\echo 'RECOMMENDATIONS TESTS PASSED'
