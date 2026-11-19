-- Per-café brand profile (ADR-058): restaurants.brand, api.set_brand,
-- api.set_section_cover and their place in api.public_menu. Uses the test.*
-- helpers of 90-smoke-test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('a8000000-0000-0000-0000-000000000001', 'owner-b@example.am', false),
  ('a8000000-0000-0000-0000-000000000002', 'manager-b@example.am', false),
  ('a8000000-0000-0000-0000-000000000003', null, true),   -- café B's waiter tablet
  ('a8000000-0000-0000-0000-000000000004', null, true),   -- a guest
  ('a8000000-0000-0000-0000-000000000005', 'owner-c@example.am', false);

-- Café B with a published menu of one section, a manager and a waiter tablet
select test.act_as('a8000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Բ', 'brand-b', 'Main', 'Bella') as rb \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select api.create_device_pairing(:'lb', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('a8000000-0000-0000-0000-000000000003', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rb', 'a8000000-0000-0000-0000-000000000002', 'manager', 'Mane');
insert into public.menus (restaurant_id, internal_name) values (:'rb', 'Main') returning id as mb \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rb', :'mb', :'lb');
insert into public.categories (restaurant_id, menu_id) values (:'rb', :'mb') returning id as cb \gset
insert into public.categories (restaurant_id, menu_id, is_active) values (:'rb', :'mb', false) returning id as cb_off \gset
select test.act_as('a8000000-0000-0000-0000-000000000001');
select api.publish_menu(:'lb') is not null as published \gset

-- Café C, whose owner must not touch café B
select test.act_as('a8000000-0000-0000-0000-000000000005');
select api.create_restaurant('Cafe C', 'brand-c', 'Main', 'Cora') as rc \gset
reset role;
insert into public.menus (restaurant_id, internal_name) values (:'rc', 'Main') returning id as mc \gset
insert into public.categories (restaurant_id, menu_id) values (:'rc', :'mc') returning id as cc \gset

-- No brand by default: guests get null and no covers
select test.ok((select brand is null from public.restaurants where id = :'rb'), 'a new café has no brand');
select test.ok((select api.public_menu('brand-b', 'main') -> 'restaurant' -> 'brand') = 'null'::jsonb,
  'guests read a null brand');
select test.ok((select api.public_menu('brand-b', 'main') -> 'covers') = '{}'::jsonb, 'and no covers');

-- The owner saves a full brand; colours are stored lowercase, blanks dropped
select test.act_as('a8000000-0000-0000-0000-000000000001');
select api.set_brand(:'rb', jsonb_build_object(
  'colors', jsonb_build_object('header', '#3E312F', 'accent', '#705d4c', 'highlight', '#c49871',
                               'line', '#ead7bf', 'page', '#f9f0e3'),
  'heading_font', 'Cormorant', 'body_font', 'Jost', 'script_font', '', 'plate', 'porcelain',
  'wordmark', :'rb' || '/brand/1.webp'));
reset role;
select test.ok((select brand -> 'colors' ->> 'header' = '#3e312f' and not brand ? 'script_font'
                       and brand ->> 'plate' = 'porcelain' and brand ->> 'wordmark' = :'rb' || '/brand/1.webp'
                from public.restaurants where id = :'rb'), 'the owner saves the brand (lowercase, blanks dropped)');
select test.ok((select api.public_menu('brand-b', 'main') -> 'restaurant' -> 'brand' ->> 'heading_font') = 'Cormorant',
  'guests read the brand with the menu');
select test.ok((select count(*) from public.audit_log where restaurant_id = :'rb' and action = 'restaurant.brand'
                and actor_user_id = 'a8000000-0000-0000-0000-000000000001') = 1, 'the change is written to the audit log');

-- A manager may change it too; null removes it, an empty object as well
select test.act_as('a8000000-0000-0000-0000-000000000002');
select api.set_brand(:'rb', '{"plate": "dark"}');
reset role;
select test.ok((select brand = '{"plate": "dark"}'::jsonb from public.restaurants where id = :'rb'),
  'a manager replaces the brand');
select test.act_as('a8000000-0000-0000-0000-000000000002');
select api.set_brand(:'rb', '{"colors": {"page": ""}}');
reset role;
select test.ok((select brand is null from public.restaurants where id = :'rb'), 'an all-empty brand is stored as none');
select test.act_as('a8000000-0000-0000-0000-000000000001');
select api.set_brand(:'rb', '{"colors": {"accent": "#705d4c"}}');
select api.set_brand(:'rb', null);
reset role;
select test.ok((select brand is null from public.restaurants where id = :'rb'), 'null removes the brand');

-- Bad values
select test.act_as('a8000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"colors": {"accent": "brown"}}'), 'invalid_brand', 'a colour must be #rrggbb');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"colors": {"sky": "#ffffff"}}'), 'invalid_brand', 'only the five colour roles');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"colors": "#ffffff"}'), 'invalid_brand', 'colours are an object');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"heading_font": "Comic Sans MS"}'), 'invalid_brand', 'fonts come from the curated list');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"plate": "gold"}'), 'invalid_brand', 'an unknown plate style is refused');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '{"logo_url": "x"}'), 'invalid_brand', 'unknown keys are refused');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', '[1]'), 'invalid_brand', 'the brand is an object');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', jsonb_build_object('wordmark', :'rc' || '/brand/1.webp')),
  '%restaurants_brand_wordmark_scoped%', 'the wordmark cannot point into another café''s folder');
select test.fails(format('select api.set_brand(%L, %L)', :'rb', jsonb_build_object('wordmark', :'rb' || '/../x.webp')),
  '%restaurants_brand_wordmark_scoped%', 'the wordmark path cannot climb out');
reset role;
select test.fails(format('update public.restaurants set brand = %L where id = %L', jsonb_build_object('wordmark', :'rc' || '/w.webp'), :'rb'),
  '%restaurants_brand_wordmark_scoped%', 'the table itself keeps the wordmark in the café''s folder');

-- Section covers
select test.act_as('a8000000-0000-0000-0000-000000000002');
select api.set_section_cover(:'cb', :'rb' || '/covers/' || :'cb' || '/17.webp');
select api.set_section_cover(:'cb_off', :'rb' || '/covers/' || :'cb_off' || '/18.webp');
reset role;
select test.ok((select api.public_menu('brand-b', 'main') -> 'covers' ->> :'cb') = :'rb' || '/covers/' || :'cb' || '/17.webp',
  'guests see a live section''s cover without a republish');
select test.ok(not ((select api.public_menu('brand-b', 'main') -> 'covers') ? :'cb_off'), 'a hidden section''s cover is not sent');
select test.ok((select count(*) from public.audit_log where restaurant_id = :'rb' and action = 'category.cover') = 2,
  'covers are written to the audit log');
select test.act_as('a8000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_section_cover(%L, %L)', :'cb', :'rb' || '/covers/' || :'cc' || '/1.webp'),
  'invalid_path', 'a cover must sit in its own section''s folder');
select test.fails(format('select api.set_section_cover(%L, %L)', :'cb', :'rb' || '/covers/' || :'cb' || '/1.png'),
  'invalid_path', 'a cover is a webp file');
select test.fails(format('select api.set_section_cover(%L, %L)', :'cc', :'rc' || '/covers/' || :'cc' || '/1.webp'),
  'forbidden', 'an owner cannot set another café''s cover');
select test.fails(format('select api.set_section_cover(%L, null)', gen_random_uuid()), 'forbidden', 'an unknown section is refused');
select api.set_section_cover(:'cb', null);
reset role;
select test.ok((select image_path is null from public.categories where id = :'cb'), 'null removes the cover');

-- Who may not
select test.act_as('a8000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.set_brand(%L, null)', :'rb'), 'forbidden', 'a waiter tablet cannot change the brand');
select test.fails(format('select api.set_section_cover(%L, null)', :'cb'), 'forbidden', 'a waiter tablet cannot change a cover');
select test.act_as('a8000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.set_brand(%L, null)', :'rb'), 'forbidden', 'a guest cannot change the brand');
select test.act_as('a8000000-0000-0000-0000-000000000005');
select test.fails(format('select api.set_brand(%L, null)', :'rb'), 'forbidden', 'another café''s owner cannot change it');
select test.fails(format('update public.restaurants set brand = null where id = %L', :'rc'),
  'permission denied%', 'owners change the brand only through the function');
with u as (update public.categories set image_path = null where id = :'cb' returning 1)
select test.ok((select count(*) from u) = 0, 'nor reach café B''s sections');
select test.act_as_anon();
select test.fails(format('select api.set_brand(%L, null)', :'rb'), 'permission denied%', 'anonymous callers cannot call set_brand');
select test.fails(format('select api.set_section_cover(%L, null)', :'cb'), 'permission denied%', 'nor set_section_cover');

reset role;
select test.ok(not has_function_privilege('anon', 'api.set_brand(uuid, jsonb)', 'execute'), 'anon has no execute grant');
select test.ok(has_function_privilege('authenticated', 'api.set_section_cover(uuid, text)', 'execute'), 'authenticated has the named grant');
select test.ok(not has_function_privilege('authenticated', 'private.brand_shape_ok(jsonb)', 'execute'), 'the shape check is private');
select test.ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
                where oid in ('api.set_brand(uuid, jsonb)'::regprocedure, 'api.set_section_cover(uuid, text)'::regprocedure)),
  'security definer with an empty search_path');
select test.ok(has_function_privilege('anon', 'api.public_menu(text, text)', 'execute'), 'guests can still read the menu');

select set_config('request.jwt.claims', '', false);
\echo 'BRAND PROFILE TESTS PASSED'
