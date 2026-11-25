-- Promotions (ADR-070): who may create, switch and delete a promo, the limit of
-- three, the window in the café's time zone, and what guests can read.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('ad000000-0000-0000-0000-000000000001', 'owner-pr-a@example.am', false),
  ('ad000000-0000-0000-0000-000000000002', 'owner-pr-b@example.am', false),
  ('ad000000-0000-0000-0000-000000000003', 'manager-pr-a@example.am', false),
  ('ad000000-0000-0000-0000-000000000004', null, true);   -- a guest

select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.create_restaurant('Promo A', 'pr-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('ad000000-0000-0000-0000-000000000002');
select api.create_restaurant('Promo B', 'pr-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'pr-cafe-a-waiter' \gset
select user_id as u_kitchen from public.staff_logins where username = 'pr-cafe-a-kitchen' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'ad000000-0000-0000-0000-000000000003', 'manager', 'Manager A');

-- A published menu so api.public_menu answers.
insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'hy', 'Սուրճ');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 700) returning id as item \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'ra', :'item', 'hy', 'Սուրճ');
select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as pub \gset
reset role;

-- ---------------------------------------------------------------------------
-- Owner creates, switches, edits
-- ---------------------------------------------------------------------------
select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.save_promo(:'la', null, '{"hy": "  Երջանիկ ժամեր ", "ru": "Счастливые часы", "xx": "ignored"}'::jsonb,
  '{"hy": "Սուրճը՝ կես գնով", "en": ""}'::jsonb, ' -20% ') as p1 \gset
reset role;
select test.ok(:'p1' is not null, 'the owner creates a promo');
select test.ok((select not is_on and title = '{"hy": "Երջանիկ ժամեր", "ru": "Счастливые часы"}'::jsonb
                       and body = '{"hy": "Սուրճը՝ կես գնով"}'::jsonb and badge = '-20%'
                from public.promos where id = :'p1'), 'it starts off, texts are trimmed, unknown languages and empty lines dropped');
select test.ok((api.public_menu('pr-cafe-a', 'main') -> 'promos') = '[]'::jsonb, 'an off promo is not in the guest menu');
select test.ok((api.public_menu_status(:'la') -> 'promos') = '[]'::jsonb, 'nor in the status guests poll');
select test.ok(exists (select 1 from public.audit_log where entity = 'promo' and entity_id = :'p1' and action = 'promo.created'), 'creating is in the audit log');

select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.set_promo_on(:'p1', true) as live \gset
reset role;
select test.ok(:'live', 'switching on returns that guests see it now');
select test.ok((api.public_menu('pr-cafe-a', 'main') -> 'promos' -> 0 ->> 'id') = :'p1', 'the guest menu lists the live promo');
select test.ok((api.public_menu_status(:'la') -> 'promos' -> 0 -> 'title' ->> 'hy') = 'Երջանիկ ժամեր', 'so does the status, with the texts');
select test.ok((api.public_menu_status(:'la') -> 'promos' -> 0 ->> 'badge') = '-20%', 'and the badge');
select test.ok(exists (select 1 from public.audit_log where entity_id = :'p1' and action = 'promo.on'), 'switching on is audited');

-- The manager may switch it too.
select test.act_as('ad000000-0000-0000-0000-000000000003');
select api.set_promo_on(:'p1', false) as live_m \gset
reset role;
select test.ok(not :'live_m' and (api.public_menu_status(:'la') -> 'promos') = '[]'::jsonb, 'a manager switches it off');

-- ---------------------------------------------------------------------------
-- The window is read in the café's time zone
-- ---------------------------------------------------------------------------
select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.set_promo_on(:'p1', true) is not null as on_again \gset
select api.save_promo(:'la', :'p1', '{"hy": "Երջանիկ ժամեր"}'::jsonb, null, null,
  (now() at time zone 'Asia/Yerevan') + interval '1 hour', (now() at time zone 'Asia/Yerevan') + interval '2 hours') is not null as saved \gset
reset role;
select test.ok((select is_on from public.promos where id = :'p1'), 'saving keeps the switch (p_is_on null)');
select test.ok((api.public_menu_status(:'la') -> 'promos') = '[]'::jsonb, 'on but starting in an hour: not shown yet');
select test.ok((api.public_menu('pr-cafe-a', 'main') -> 'promos') = '[]'::jsonb, 'in the guest menu either');
update public.promos set starts_at = (now() at time zone 'Asia/Yerevan') - interval '1 hour',
                         ends_at = (now() at time zone 'Asia/Yerevan') + interval '1 hour' where id = :'p1';
select test.ok(jsonb_array_length(api.public_menu_status(:'la') -> 'promos') = 1, 'inside the window it is shown');
update public.promos set starts_at = (now() at time zone 'Asia/Yerevan') - interval '2 hours',
                         ends_at = (now() at time zone 'Asia/Yerevan') - interval '1 second' where id = :'p1';
select test.ok((api.public_menu_status(:'la') -> 'promos') = '[]'::jsonb, 'after its end it disappears by itself');
-- The same wall-clock window means different instants in another zone.
update public.promos set starts_at = (now() at time zone 'Asia/Yerevan') - interval '1 hour',
                         ends_at = (now() at time zone 'Asia/Yerevan') + interval '1 hour' where id = :'p1';
update public.locations set timezone = 'Pacific/Kiritimati' where id = :'la';   -- 10 hours ahead of Yerevan
select test.ok((api.public_menu_status(:'la') -> 'promos') = '[]'::jsonb, 'the window is the café''s wall clock, not the server''s');
update public.locations set timezone = 'Asia/Yerevan' where id = :'la';
select test.ok(jsonb_array_length(api.public_menu_status(:'la') -> 'promos') = 1, 'and back');

select test.act_as('ad000000-0000-0000-0000-000000000001');
select test.fails(format('select api.save_promo(%L, %L, %L::jsonb, null, null, %L, %L)', :'la', :'p1', '{"hy": "x"}',
  '2026-12-01 10:00', '2026-12-01 09:00'), 'invalid_window', 'an end before the start is refused');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', '{"ru": "Только русский"}'),
  'name_required', 'the Armenian title is required');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', jsonb_build_object('hy', repeat('x', 81))),
  'promo_text_too_long', 'a long title is refused');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb, null, %L)', :'la', '{"hy": "x"}', repeat('9', 17)),
  'promo_text_too_long', 'and a long badge');
select test.fails(format('select api.set_promo_on(%L, null)', :'p1'), 'invalid_value', 'on/off needs a value');

-- Up to three per location.
select api.save_promo(:'la', null, '{"hy": "Երկրորդ"}'::jsonb) as p2 \gset
select api.save_promo(:'la', null, '{"hy": "Երրորդ"}'::jsonb) as p3 \gset
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', '{"hy": "Չորրորդ"}'), 'promo_limit', 'a fourth promo is refused');
select api.set_promo_on(:'p2', true) is not null as on2 \gset
select api.set_promo_on(:'p3', true) is not null as on3 \gset
reset role;
select test.ok(jsonb_array_length(api.public_menu_status(:'la') -> 'promos') = 3, 'any number of them may be on at once');

-- ---------------------------------------------------------------------------
-- Who may not
-- ---------------------------------------------------------------------------
select test.act_as('ad000000-0000-0000-0000-000000000002');   -- owner of café B
select test.fails(format('select api.set_promo_on(%L, false)', :'p1'), 'forbidden', 'another café''s owner cannot switch a promo');
select test.fails(format('select api.delete_promo(%L)', :'p1'), 'forbidden', 'nor delete it');
select test.fails(format('select api.save_promo(%L, %L, %L::jsonb)', :'la', :'p1', '{"hy": "x"}'), 'forbidden', 'nor edit it');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', '{"hy": "x"}'), 'forbidden', 'nor create one in café A');
select test.fails(format('select api.save_promo(%L, %L, %L::jsonb)', :'lb', :'p1', '{"hy": "x"}'), 'forbidden', 'nor edit it by passing their own café');
select test.ok((select count(*) from public.promos) = 0, 'and sees none of A''s rows');

select test.act_as(:'u_waiter');
select test.fails(format('select api.set_promo_on(%L, false)', :'p1'), 'forbidden', 'a waiter login cannot switch a promo');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', '{"hy": "x"}'), 'forbidden', 'nor create one');
select test.fails(format('select api.delete_promo(%L)', :'p1'), 'forbidden', 'nor delete');
select test.ok((select count(*) from public.promos) = 0, 'nor read the table');
select test.act_as(:'u_kitchen');
select test.fails(format('select api.set_promo_on(%L, false)', :'p1'), 'forbidden', 'a kitchen login cannot switch a promo');
select test.fails(format('select api.delete_promo(%L)', :'p1'), 'forbidden', 'nor delete');

select test.act_as('ad000000-0000-0000-0000-000000000004', true);   -- a guest
select test.fails(format('select api.set_promo_on(%L, false)', :'p1'), 'forbidden', 'a guest cannot switch a promo');
select test.fails(format('select api.save_promo(%L, null, %L::jsonb)', :'la', '{"hy": "x"}'), 'forbidden', 'nor create one');
select test.ok((select count(*) from public.promos) = 0, 'a guest cannot read the table');
select test.fails('insert into public.promos (restaurant_id, location_id, title) values (gen_random_uuid(), gen_random_uuid(), ''{"hy": "x"}'')',
  '%permission denied%', 'nor write it directly');
select test.ok(jsonb_array_length(api.public_menu_status(:'la') -> 'promos') = 3, 'but reads the live ones through the status');
reset role;

select test.ok(not has_function_privilege('anon', 'api.set_promo_on(uuid, boolean)', 'execute'), 'anon cannot call set_promo_on');
select test.ok(not has_function_privilege('anon', 'api.save_promo(uuid, uuid, jsonb, jsonb, text, timestamp, timestamp, boolean)', 'execute'), 'nor save_promo');
select test.ok(not has_function_privilege('anon', 'api.delete_promo(uuid)', 'execute'), 'nor delete_promo');
select test.ok(not has_function_privilege('authenticated', 'private.live_promos(uuid)', 'execute'), 'the private helper is not callable');

-- Still three live; the audit shows what was done; a promo can be deleted.
select test.act_as('ad000000-0000-0000-0000-000000000001');
select api.delete_promo(:'p3');
reset role;
select test.ok(not exists (select 1 from public.promos where id = :'p3'), 'the owner deletes a promo');
select test.ok(jsonb_array_length(api.public_menu_status(:'la') -> 'promos') = 2, 'and it leaves the guest menu');
select test.ok(exists (select 1 from public.audit_log where entity_id = :'p3' and action = 'promo.deleted'), 'deleting is audited');
-- Deleting a location's promos with the café leaves nothing behind (cascade).
select test.ok((select count(*) from public.promos where location_id = :'lb') = 0, 'café B has no promos');

select set_config('request.jwt.claims', '', false);
\echo 'PROMOS TESTS PASSED'
