-- Availability controls (ADR-068): category time windows, pause with and
-- without minutes, kitchen closed for today, who may change them, and the
-- status guests poll. Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('ac000000-0000-0000-0000-000000000001', 'owner-ac-a@example.am', false),
  ('ac000000-0000-0000-0000-000000000002', 'owner-ac-b@example.am', false),
  ('ac000000-0000-0000-0000-000000000003', 'manager-ac-a@example.am', false),
  ('ac000000-0000-0000-0000-000000000004', null, true),   -- guest 1
  ('ac000000-0000-0000-0000-000000000005', null, true),   -- guest 2
  ('ac000000-0000-0000-0000-000000000006', null, true);   -- guest 3

select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.create_restaurant('Controls A', 'ac-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('ac000000-0000-0000-0000-000000000002');
select api.create_restaurant('Controls B', 'ac-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ac-cafe-a-waiter' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'ac000000-0000-0000-0000-000000000003', 'manager', 'Manager A');

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat_bk \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 2) returning id as cat_all \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values
  (:'ra', :'cat_bk', 'en', 'Breakfast'), (:'ra', :'cat_all', 'en', 'All day');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat_bk', 1800) returning id as eggs \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat_all', 700) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'eggs', 'en', 'Eggs'), (:'ra', :'coffee', 'en', 'Coffee');
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', '1') returning id as t1 \gset
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.publish_menu(:'la') is not null as published \gset
select api.table_qr_token(:'t1') as tok1 \gset
reset role;

select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok1', 'en') as g1 \gset
select test.act_as('ac000000-0000-0000-0000-000000000005', true);
select api.guest_join_table(:'tok1', 'en') as g2 \gset
select test.act_as('ac000000-0000-0000-0000-000000000006', true);
select api.guest_join_table(:'tok1', 'en') as g3 \gset
reset role;

\set eggs_line '[{"item_id": "' :eggs '", "quantity": 1}]'
\set coffee_line '[{"item_id": "' :coffee '", "quantity": 1}]'

-- ---------------------------------------------------------------------------
-- The window arithmetic, including a window that spans midnight
-- ---------------------------------------------------------------------------
select test.ok(private.in_daily_window('09:00', '08:00', '12:00'), 'inside a morning window');
select test.ok(not private.in_daily_window('12:00', '08:00', '12:00'), 'the end is exclusive');
select test.ok(private.in_daily_window('08:00', '08:00', '12:00'), 'the start is inclusive');
select test.ok(not private.in_daily_window('15:00', '08:00', '12:00'), 'outside a morning window');
select test.ok(private.in_daily_window('23:30', '22:00', '02:00') and private.in_daily_window('01:00', '22:00', '02:00'), 'a window may span midnight');
select test.ok(not private.in_daily_window('12:00', '22:00', '02:00'), 'and excludes the middle of the day');
select test.ok(private.in_daily_window('12:00', null, null), 'no window means always');

-- ---------------------------------------------------------------------------
-- Time window, in the café's time zone, enforced when the order is placed
-- ---------------------------------------------------------------------------
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_category_window(:'cat_bk',
  ((now() at time zone 'Asia/Yerevan')::time - interval '1 hour')::time,
  ((now() at time zone 'Asia/Yerevan')::time + interval '1 hour')::time);
reset role;
select test.ok((select available_from is not null and available_to is not null from public.categories where id = :'cat_bk'), 'the window is stored');
select test.ok(not (private.hidden_categories(:'la') @> array[:'cat_bk'::uuid]), 'inside the window the category is not hidden');
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', 'ac100000-0000-0000-0000-000000000001', :'eggs_line'::jsonb, null) as o_in \gset
reset role;
select test.ok(:'o_in' is not null, 'inside the window the breakfast dish can be ordered');

-- Outside: the window is two hours ahead.
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_category_window(:'cat_bk',
  ((now() at time zone 'Asia/Yerevan')::time + interval '2 hours')::time,
  ((now() at time zone 'Asia/Yerevan')::time + interval '3 hours')::time);
reset role;
select test.ok(private.hidden_categories(:'la') = array[:'cat_bk'::uuid], 'outside the window the category is hidden from guests');
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'hidden_categories') @> to_jsonb(:'cat_bk'::text), 'the guest menu lists it as hidden');
select test.ok((api.public_menu_status(:'la') -> 'hidden_categories') @> to_jsonb(:'cat_bk'::text), 'and so does the status guests poll');
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g1', 'ac100000-0000-0000-0000-000000000002', :'eggs_line'),
  'category_unavailable', 'outside the window the database refuses the dish');
select api.guest_place_order(:'g1', 'ac100000-0000-0000-0000-000000000003', :'coffee_line'::jsonb, null) as o_coffee \gset
reset role;
select test.ok(:'o_coffee' is not null, 'an all-day dish is still orderable');
select test.ok(not exists (select 1 from public.orders where idempotency_key = 'ac100000-0000-0000-0000-000000000002'), 'the refused order left nothing behind');

-- A mixed order is refused as a whole.
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g1', 'ac100000-0000-0000-0000-000000000004',
  '[{"item_id": "' || :'coffee' || '", "quantity": 1}, {"item_id": "' || :'eggs' || '", "quantity": 1}]'),
  'category_unavailable', 'one dish outside its window refuses the whole order');
reset role;

-- The window uses the café's time zone, not the server's.
update public.locations set timezone = 'Pacific/Kiritimati' where id = :'la';   -- UTC+14
select ((now() at time zone 'Pacific/Kiritimati')::time - interval '1 hour')::time as kir_from \gset
select ((now() at time zone 'Pacific/Kiritimati')::time + interval '1 hour')::time as kir_to \gset
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_category_window(:'cat_bk', :'kir_from', :'kir_to');
select test.act_as('ac000000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ac100000-0000-0000-0000-000000000005', :'eggs_line'::jsonb, null) as o_kir \gset
reset role;
select test.ok(:'o_kir' is not null, 'a window around the local time of another zone is open when the café is in that zone');
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_category_window(:'cat_bk',
  ((now() at time zone 'Asia/Yerevan')::time - interval '1 hour')::time,
  ((now() at time zone 'Asia/Yerevan')::time + interval '1 hour')::time);
reset role;
select test.ok(private.hidden_categories(:'la') = array[:'cat_bk'::uuid], 'the same window is closed when the café is ten hours away from it');
update public.locations set timezone = 'Asia/Yerevan' where id = :'la';

-- Removing the window; bad windows.
select test.act_as('ac000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_category_window(%L, %L, null)', :'cat_bk', '08:00'), 'invalid_window', 'a window needs both ends');
select test.fails(format('select api.set_category_window(%L, %L, %L)', :'cat_bk', '08:00', '08:00'), 'invalid_window', 'and cannot be empty');
select api.set_category_window(:'cat_bk', null, null);
reset role;
select test.ok((select available_from is null and available_to is null from public.categories where id = :'cat_bk'), 'a window can be removed');
select test.ok(private.hidden_categories(:'la') = '{}', 'and nothing is hidden');

-- ---------------------------------------------------------------------------
-- Pause ordering: with minutes it resumes by itself, without it holds
-- ---------------------------------------------------------------------------
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_ordering_pause(:'la', true, 20) as paused_until \gset
reset role;
select test.ok(:'paused_until'::timestamptz between now() + interval '19 minutes' and now() + interval '21 minutes', 'pausing for 20 minutes returns the time it resumes');
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'location' -> 'paused' ->> 'until') is not null, 'guests see the pause with its end time');
select test.ok((api.public_menu_status(:'la') -> 'paused' ->> 'until') is not null, 'and so does the status');
select test.act_as('ac000000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g2', 'ac100000-0000-0000-0000-000000000006', :'coffee_line'),
  'ordering_paused', 'a paused café refuses a guest order in the database');
reset role;
select test.ok(not exists (select 1 from public.orders where idempotency_key = 'ac100000-0000-0000-0000-000000000006'), 'nothing was created');

-- The time passes: the pause ends without anyone pressing resume.
update public.locations set ordering_paused_until = now() - interval '1 second' where id = :'la';
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'location' -> 'paused') = 'null'::jsonb, 'after the minutes pass, guests no longer see a pause');
select test.act_as('ac000000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ac100000-0000-0000-0000-000000000006', :'coffee_line'::jsonb, null) as o_after \gset
reset role;
select test.ok(:'o_after' is not null, 'a timed pause expires by itself and orders go through');

-- Without minutes it holds, however long it has been.
select test.act_as('ac000000-0000-0000-0000-000000000003');   -- the manager
select api.set_ordering_pause(:'la', true) is null as no_end \gset
reset role;
select test.ok(:'no_end', 'a pause without minutes has no end time');
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'location' -> 'paused') = jsonb_build_object('until', null), 'guests see an open-ended pause');
select test.act_as('ac000000-0000-0000-0000-000000000006', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g3', 'ac100000-0000-0000-0000-000000000007', :'coffee_line'),
  'ordering_paused', 'an open-ended pause holds');
reset role;

-- A retry of an order that was already placed still returns it.
select test.act_as('ac000000-0000-0000-0000-000000000005', true);
select api.guest_place_order(:'g2', 'ac100000-0000-0000-0000-000000000006', :'coffee_line'::jsonb, null) = :'o_after'::uuid as same \gset
reset role;
select test.ok(:'same', 'a replay of an order placed before the pause returns the same order');

select test.act_as('ac000000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_ordering_pause(%L, true, 0)', :'la'), 'invalid_minutes', 'zero minutes is refused');
select test.fails(format('select api.set_ordering_pause(%L, true, 100000)', :'la'), 'invalid_minutes', 'so is a day and more');
select test.fails(format('select api.set_ordering_pause(%L, false, 10)', :'la'), 'invalid_minutes', 'minutes make no sense when resuming');
select api.set_ordering_pause(:'la', false) is null as resumed \gset
reset role;
select test.ok(:'resumed', 'resume returns no end time');
select test.ok(not (select ordering_paused from public.locations where id = :'la'), 'and clears the pause');
select test.act_as('ac000000-0000-0000-0000-000000000006', true);
select api.guest_place_order(:'g3', 'ac100000-0000-0000-0000-000000000007', :'coffee_line'::jsonb, null) as o_resumed \gset
reset role;
select test.ok(:'o_resumed' is not null, 'after resume, orders go through');

-- ---------------------------------------------------------------------------
-- Close the kitchen for today: blocked until the next business-day opening
-- ---------------------------------------------------------------------------
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_kitchen_closed_today(:'la', true) as closed_until \gset
reset role;
select test.ok(:'closed_until'::timestamptz > now() and :'closed_until'::timestamptz <= now() + interval '24 hours 1 minute',
               'it reopens within a day');
select test.ok((:'closed_until'::timestamptz at time zone 'Asia/Yerevan')::time = '05:00', 'at the café''s business-day start (05:00)');
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'location' -> 'closed' ->> 'until') is not null, 'guests see the closed kitchen');
select test.ok((api.public_menu_status(:'la') -> 'closed' ->> 'until') is not null, 'and the status says so');
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.guest_place_order(%L, %L, %L::jsonb, null)', :'g1', 'ac100000-0000-0000-0000-000000000008', :'coffee_line'),
  'kitchen_closed', 'a closed kitchen refuses a guest order in the database');
reset role;

-- Different business-day start and zone: the boundary follows the café.
update public.locations set business_day_starts = '03:30', timezone = 'Asia/Tbilisi' where id = :'la';
select test.act_as('ac000000-0000-0000-0000-000000000001');
select api.set_kitchen_closed_today(:'la', true) as closed2 \gset
reset role;
select test.ok((:'closed2'::timestamptz at time zone 'Asia/Tbilisi')::time = '03:30', 'it follows the café''s own business-day start and zone');
update public.locations set business_day_starts = '05:00', timezone = 'Asia/Yerevan' where id = :'la';

-- The opening time passes: orders go through again with nobody reopening.
update public.locations set kitchen_closed_until = now() - interval '1 second' where id = :'la';
select test.ok((api.public_menu('ac-cafe-a', 'main') -> 'location' -> 'closed') = 'null'::jsonb, 'after the opening time, the kitchen shows as open');
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'g1', 'ac100000-0000-0000-0000-000000000008', :'coffee_line'::jsonb, null) as o_open \gset
reset role;
select test.ok(:'o_open' is not null, 'once the next opening has passed, guests can order again');

-- Reopen at once.
select test.act_as('ac000000-0000-0000-0000-000000000003');
select api.set_kitchen_closed_today(:'la', true) is not null as c \gset
select api.set_kitchen_closed_today(:'la', false) is null as reopened \gset
reset role;
select test.ok(:'reopened' and (select kitchen_closed_until is null from public.locations where id = :'la'), 'the manager reopens at once');
select test.ok(private.ordering_block(:'la') is null, 'nothing blocks ordering now');

-- ---------------------------------------------------------------------------
-- Who may change what
-- ---------------------------------------------------------------------------
select test.act_as(:'u_waiter');
select test.fails(format('select api.set_ordering_pause(%L, true, 10)', :'la'), 'forbidden', 'a staff login cannot pause ordering');
select test.fails(format('select api.set_kitchen_closed_today(%L, true)', :'la'), 'forbidden', 'a staff login cannot close the kitchen');
select test.fails(format('select api.set_category_window(%L, %L, %L)', :'cat_bk', '08:00', '12:00'), 'forbidden', 'a staff login cannot set a window');
select test.act_as('ac000000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_ordering_pause(%L, true, 10)', :'la'), 'forbidden', 'another café''s owner cannot pause ordering');
select test.fails(format('select api.set_kitchen_closed_today(%L, true)', :'la'), 'forbidden', 'nor close the kitchen');
select test.fails(format('select api.set_category_window(%L, %L, %L)', :'cat_bk', '08:00', '12:00'), 'forbidden', 'nor set a window');
select test.act_as('ac000000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.set_ordering_pause(%L, true, 10)', :'la'), 'forbidden', 'a guest cannot pause ordering');
select test.fails(format('select api.set_kitchen_closed_today(%L, true)', :'la'), 'forbidden', 'nor close the kitchen');
select test.fails(format('select api.set_category_window(%L, %L, %L)', :'cat_bk', '08:00', '12:00'), 'forbidden', 'nor set a window');
select test.fails(format('update public.locations set ordering_paused = true where id = %L', :'la'), 'permission denied%', 'and cannot write the columns directly');
reset role;
select test.ok(not (select ordering_paused from public.locations where id = :'la') and (select kitchen_closed_until is null from public.locations where id = :'la'),
               'none of those attempts changed anything');
select test.act_as('ac000000-0000-0000-0000-000000000001');
select test.fails(format('update public.locations set ordering_paused = true where id = %L', :'la'), 'permission denied%', 'even the owner changes it only through the functions');
select test.fails(format('update public.categories set available_from = %L, available_to = %L where id = %L', '08:00', '08:00', :'cat_bk'), '%categories_window_not_empty%', 'the table refuses an empty window');
reset role;

select test.ok((select count(*) from public.audit_log where location_id = :'la'
                and action in ('ordering.paused', 'ordering.resumed', 'kitchen.closed_today', 'kitchen.reopened')) >= 6,
               'pauses, resumes, closings and reopenings are in the audit log');
select test.ok((select count(*) from public.audit_log where restaurant_id = :'ra' and action = 'category.window') >= 3, 'so are window changes');

-- ---------------------------------------------------------------------------
-- Status endpoint and privileges
-- ---------------------------------------------------------------------------
select test.act_as('ac000000-0000-0000-0000-000000000006', true);
select test.ok((api.public_menu_status(:'la') ->> 'version')::integer >= 1, 'a guest reads the status');
select test.ok(api.public_menu_status(:'la') ?& array['version', 'ordering', 'paused', 'closed', 'sold_out', 'hidden_categories', 'kitchen_busy'], 'with exactly the fields the page watches');
select test.ok(api.public_menu_status('ac000000-0000-0000-0000-0000000000ff') is null, 'an unknown location has no status');
reset role;
select test.ok(not has_function_privilege('anon', 'api.set_ordering_pause(uuid, boolean, integer)', 'execute'), 'anon cannot call set_ordering_pause');
select test.ok(not has_function_privilege('anon', 'api.set_kitchen_closed_today(uuid, boolean)', 'execute'), 'anon cannot call set_kitchen_closed_today');
select test.ok(not has_function_privilege('anon', 'api.set_category_window(uuid, time, time)', 'execute'), 'anon cannot call set_category_window');
select test.ok(has_function_privilege('anon', 'api.public_menu_status(uuid)', 'execute'), 'anon can read the status');
select test.ok(not has_function_privilege('anon', 'private.ordering_block(uuid)', 'execute'), 'the helpers are not callable from outside');
select test.ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc
                where oid in ('api.set_ordering_pause(uuid, boolean, integer)'::regprocedure,
                              'api.set_kitchen_closed_today(uuid, boolean)'::regprocedure,
                              'api.set_category_window(uuid, time, time)'::regprocedure,
                              'api.public_menu_status(uuid)'::regprocedure)),
               'security definer with an empty search_path');

select set_config('request.jwt.claims', '', false);
\echo 'AVAILABILITY CONTROLS TESTS PASSED'
