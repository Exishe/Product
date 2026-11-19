-- ADR-065: the dark-background wordmark (restaurants.brand.wordmark_dark) and
-- Mrs Saint Delafield in the font list. Uses the test.* helpers of
-- 90-smoke-test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('a9000000-0000-0000-0000-000000000001', 'owner-d@example.am', false),
  ('a9000000-0000-0000-0000-000000000002', 'owner-e@example.am', false),
  ('a9000000-0000-0000-0000-000000000003', null, true);   -- a guest

-- Café D with a published menu, and café E whose folder D must not use
select test.act_as('a9000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Դ', 'brand-d', 'Main', 'Dina') as rd \gset
select id as ld from public.locations where restaurant_id = :'rd' \gset
reset role;
insert into public.menus (restaurant_id, internal_name) values (:'rd', 'Main') returning id as md \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rd', :'md', :'ld');
insert into public.categories (restaurant_id, menu_id) values (:'rd', :'md');
select test.act_as('a9000000-0000-0000-0000-000000000001');
select api.publish_menu(:'ld') is not null as published \gset
select test.act_as('a9000000-0000-0000-0000-000000000002');
select api.create_restaurant('Cafe E', 'brand-e', 'Main', 'Emma') as re \gset

-- Both wordmarks and the new script font are saved and read by guests
select test.act_as('a9000000-0000-0000-0000-000000000001');
select api.set_brand(:'rd', jsonb_build_object(
  'colors', jsonb_build_object('header', '#3e312f'),
  'script_font', 'Mrs Saint Delafield',
  'wordmark', :'rd' || '/brand/1.webp',
  'wordmark_dark', :'rd' || '/brand/2.webp'));
reset role;
select test.ok((select brand ->> 'wordmark' = :'rd' || '/brand/1.webp'
                       and brand ->> 'wordmark_dark' = :'rd' || '/brand/2.webp'
                       and brand ->> 'script_font' = 'Mrs Saint Delafield'
                from public.restaurants where id = :'rd'), 'the owner saves both wordmarks and the new script font');
select test.ok((select api.public_menu('brand-d', 'main') -> 'restaurant' -> 'brand' ->> 'wordmark_dark')
               = :'rd' || '/brand/2.webp', 'guests read the dark wordmark with the menu');

-- The dark one alone is a brand too; an empty string means "not set"
select test.act_as('a9000000-0000-0000-0000-000000000001');
select api.set_brand(:'rd', jsonb_build_object('wordmark_dark', :'rd' || '/brand/3.webp'));
reset role;
select test.ok((select brand = jsonb_build_object('wordmark_dark', :'rd' || '/brand/3.webp')
                from public.restaurants where id = :'rd'), 'a dark wordmark alone is saved');
select test.act_as('a9000000-0000-0000-0000-000000000001');
select api.set_brand(:'rd', jsonb_build_object('wordmark', :'rd' || '/brand/1.webp', 'wordmark_dark', ''));
reset role;
select test.ok((select brand = jsonb_build_object('wordmark', :'rd' || '/brand/1.webp')
                from public.restaurants where id = :'rd'), 'an empty dark wordmark is dropped, the light one stays');

-- Bad values
select test.act_as('a9000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', jsonb_build_object('wordmark_dark', :'re' || '/brand/1.webp')),
  '%restaurants_brand_wordmark_dark_scoped%', 'the dark wordmark cannot point into another café''s folder');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', jsonb_build_object('wordmark_dark', :'rd' || '/../x.webp')),
  '%restaurants_brand_wordmark_dark_scoped%', 'the dark wordmark path cannot climb out');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', '{"wordmark_dark": 7}'), 'invalid_brand', 'the dark wordmark is a string');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', '{"wordmark_dark": {"path": "x"}}'), 'invalid_brand', 'not an object');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', '{"wordmark_light": "x"}'), 'invalid_brand', 'other keys are still refused');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', '{"script_font": "Mrs Saint Delafeld"}'), 'invalid_brand', 'a font outside the list is still refused');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', jsonb_build_object('wordmark', :'re' || '/brand/1.webp')),
  '%restaurants_brand_wordmark_scoped%', 'the light wordmark keeps its own folder rule');
reset role;
select test.fails(format('update public.restaurants set brand = %L where id = %L', jsonb_build_object('wordmark_dark', :'re' || '/w.webp'), :'rd'),
  '%restaurants_brand_wordmark_dark_scoped%', 'the table itself keeps the dark wordmark in the café''s folder');

-- Who may not
select test.act_as('a9000000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_brand(%L, %L)', :'rd', jsonb_build_object('wordmark_dark', :'rd' || '/brand/9.webp')),
  'forbidden', 'another café''s owner cannot set it');
select test.act_as('a9000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.set_brand(%L, %L)', :'rd', jsonb_build_object('wordmark_dark', :'rd' || '/brand/9.webp')),
  'forbidden', 'nor a guest');
select test.act_as_anon();
select test.fails(format('select api.set_brand(%L, null)', :'rd'), 'permission denied%', 'anonymous callers still cannot call set_brand');

-- The replaced functions kept their privileges and settings
reset role;
select test.ok(not has_function_privilege('authenticated', 'private.brand_shape_ok(jsonb)', 'execute')
               and not has_function_privilege('anon', 'private.brand_shape_ok(jsonb)', 'execute'), 'the shape check stays private');
select test.ok(not has_function_privilege('authenticated', 'private.brand_fonts()', 'execute')
               and not has_function_privilege('anon', 'private.brand_fonts()', 'execute'), 'and the font list');
select test.ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc
                where oid in ('private.brand_shape_ok(jsonb)'::regprocedure, 'private.brand_fonts()'::regprocedure)),
  'both keep an empty search_path');
select test.ok('Mrs Saint Delafield' = any (private.brand_fonts()) and cardinality(private.brand_fonts()) = 28,
  'the font list has 28 families');

select set_config('request.jwt.claims', '', false);
\echo 'BRAND WORDMARK DARK TESTS PASSED'
