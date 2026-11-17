-- Guest theme per café (ADR-052): restaurants.guest_theme, its place in
-- api.public_menu and api.set_guest_appearance. Uses the test.* helpers of
-- 90-smoke-test.sql.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
insert into auth.users (id, email, is_anonymous) values
  ('a7000000-0000-0000-0000-000000000001', 'owner-t@example.am', false),
  ('a7000000-0000-0000-0000-000000000002', 'manager-t@example.am', false),
  ('a7000000-0000-0000-0000-000000000003', null, true),   -- café T's waiter tablet
  ('a7000000-0000-0000-0000-000000000004', null, true),   -- a guest
  ('a7000000-0000-0000-0000-000000000005', 'owner-u@example.am', false);

-- Café T with a published (empty) menu, a manager and a waiter tablet
select test.act_as('a7000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Թ', 'cafe-t', 'Main', 'Tigran') as rt \gset
select id as lt from public.locations where restaurant_id = :'rt' \gset
select api.publish_menu(:'lt') is not null as published \gset
select api.create_device_pairing(:'lt', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('a7000000-0000-0000-0000-000000000003', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rt', 'a7000000-0000-0000-0000-000000000002', 'manager', 'Mariam');

-- Café U, whose owner must not touch café T
select test.act_as('a7000000-0000-0000-0000-000000000005');
select api.create_restaurant('Cafe U', 'cafe-u', 'Main', 'Uma') as ru \gset

-- A new café wears Evening, and guests read it with the menu
reset role;
select test.ok((select guest_theme from public.restaurants where id = :'rt') = 'evening', 'a new café starts with the Evening theme');
select test.ok((select api.public_menu('cafe-t', 'main') -> 'restaurant' ->> 'guest_theme') = 'evening',
  'guests read the theme with the menu');
select test.ok((select api.public_menu('cafe-t', 'main') -> 'restaurant') ? 'brand_color'
               and (select api.public_menu('cafe-t', 'main') -> 'restaurant') ? 'logo',
  'brand colour and logo stay in the menu');

-- The owner picks Wine with a brand colour and a logo
select test.act_as('a7000000-0000-0000-0000-000000000001');
select api.set_guest_appearance(:'rt', 'wine', '#C2185B', :'rt' || '/logo/1.webp');
reset role;
select test.ok((select guest_theme = 'wine' and brand_color = '#c2185b' and logo_path = :'rt' || '/logo/1.webp'
                from public.restaurants where id = :'rt'), 'the owner sets theme, colour (stored lowercase) and logo');
select test.ok((select api.public_menu('cafe-t', 'main') -> 'restaurant' ->> 'guest_theme') = 'wine', 'guests see Wine');
select test.ok((select count(*) from public.audit_log where restaurant_id = :'rt' and action = 'restaurant.appearance'
                and actor_user_id = 'a7000000-0000-0000-0000-000000000001') = 1, 'the change is written to the audit log');

-- A manager may change it too; null clears the colour and the logo
select test.act_as('a7000000-0000-0000-0000-000000000002');
select api.set_guest_appearance(:'rt', 'soft', null, null);
reset role;
select test.ok((select guest_theme = 'soft' and brand_color is null and logo_path is null
                from public.restaurants where id = :'rt'), 'a manager switches to Soft and clears colour and logo');

-- Bad values
select test.act_as('a7000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', :'rt', 'coffee'), 'invalid_theme', 'an unknown theme is refused');
select test.fails(format('select api.set_guest_appearance(%L, null, null, null)', :'rt'), 'invalid_theme', 'a missing theme is refused');
select test.fails(format('select api.set_guest_appearance(%L, %L, %L, null)', :'rt', 'wine', 'red'), 'invalid_color', 'a colour must be #rrggbb');
select test.fails(format('select api.set_guest_appearance(%L, %L, null, %L)', :'rt', 'wine', :'ru' || '/logo.webp'),
  '%restaurants_logo_path_scoped%', 'the logo cannot point into another café''s folder');
reset role;
select test.fails(format('update public.restaurants set guest_theme = %L where id = %L', 'neon', :'rt'),
  '%restaurants_guest_theme_check%', 'the table itself refuses an unknown theme');

-- Who may not
select test.act_as('a7000000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', :'rt', 'wine'), 'forbidden', 'a waiter tablet cannot change it');
select test.act_as('a7000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', :'rt', 'wine'), 'forbidden', 'a guest cannot change it');
select test.act_as('a7000000-0000-0000-0000-000000000005');
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', :'rt', 'wine'), 'forbidden', 'another café''s owner cannot change it');
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', gen_random_uuid(), 'wine'), 'forbidden', 'an unknown café is refused');
select test.fails(format('update public.restaurants set guest_theme = %L where id = %L', 'wine', :'ru'),
  'permission denied%', 'owners change the theme only through the function');
select test.act_as_anon();
select test.fails(format('select api.set_guest_appearance(%L, %L, null, null)', :'rt', 'wine'), 'permission denied%', 'anonymous callers cannot even call it');

reset role;
select test.ok((select guest_theme from public.restaurants where id = :'rt') = 'soft', 'refused calls changed nothing');
select test.ok(not has_function_privilege('anon', 'api.set_guest_appearance(uuid, text, text, text)', 'execute'), 'anon has no execute grant');
select test.ok(has_function_privilege('authenticated', 'api.set_guest_appearance(uuid, text, text, text)', 'execute'), 'authenticated has the named grant');
select test.ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                where oid = 'api.set_guest_appearance(uuid, text, text, text)'::regprocedure),
  'security definer with an empty search_path');
select test.ok(has_function_privilege('anon', 'api.public_menu(text, text)', 'execute'), 'guests can still read the menu');

select set_config('request.jwt.claims', '', false);
\echo 'GUEST THEME TESTS PASSED'
