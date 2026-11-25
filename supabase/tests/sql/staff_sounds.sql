-- Staff sounds (ADR-088): the two per-café sound names, their defaults and
-- check constraint, who may change them, validation, audit, and that café
-- members can read them through the location row but not write them directly.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('5d5d0000-0000-0000-0000-000000000001', 'owner-ss-a@example.am', false),
  ('5d5d0000-0000-0000-0000-000000000002', 'owner-ss-b@example.am', false),
  ('5d5d0000-0000-0000-0000-000000000003', 'manager-ss-a@example.am', false),
  ('5d5d0000-0000-0000-0000-000000000004', null, true);   -- a guest

select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select api.create_restaurant('Sounds A', 'ss-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('5d5d0000-0000-0000-0000-000000000002');
select api.create_restaurant('Sounds B', 'ss-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select user_id as u_waiter from public.staff_logins where username = 'ss-cafe-a-waiter' \gset
select user_id as u_kitchen from public.staff_logins where username = 'ss-cafe-a-kitchen' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', '5d5d0000-0000-0000-0000-000000000003', 'manager', 'Manager A');

-- Defaults
select test.ok((select order_sound = 'alarmclock' and call_sound = 'doorbell' from public.locations where id = :'la'),
               'a new café starts with the alarm clock for orders and the doorbell for calls');

-- Staff read the two names through the location row they already load
select test.act_as(:'u_kitchen', false);
select test.ok((select order_sound = 'alarmclock' from public.locations where id = :'la'), 'a kitchen login reads the order sound');
reset role;
select test.act_as(:'u_waiter', false);
select test.ok((select call_sound = 'doorbell' from public.locations where id = :'la'), 'a waiter login reads the call sound');
select test.fails(format('select api.set_staff_sounds(%L, ''chime'', ''alarm'')', :'la'), 'forbidden', 'a waiter login cannot change them');
reset role;
select test.act_as('5d5d0000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.set_staff_sounds(%L, ''chime'', ''alarm'')', :'la'), 'forbidden', 'a guest cannot change them');
reset role;
select test.act_as(:'u_kitchen', false);
select test.fails(format('select api.set_staff_sounds(%L, ''chime'', ''alarm'')', :'la'), 'forbidden', 'a kitchen login cannot change them');
reset role;

-- No direct write
select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select test.fails(format('update public.locations set order_sound = ''gong'' where id = %L', :'la'), 'permission denied%', 'the owner cannot write the column directly');
reset role;

-- The owner and a manager
select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select api.set_staff_sounds(:'la', 'marimba', 'alarm');
reset role;
select test.ok((select order_sound = 'marimba' and call_sound = 'alarm' from public.locations where id = :'la'), 'the owner chooses both sounds');
select test.ok((select count(*) from public.audit_log where action = 'sounds.settings' and location_id = :'la') = 1, 'and it is audited');
select test.ok((select data = '{"order_sound": "marimba", "call_sound": "alarm"}'::jsonb from public.audit_log where action = 'sounds.settings' and location_id = :'la'),
               'with both names in the entry');
select test.act_as('5d5d0000-0000-0000-0000-000000000003');
select api.set_staff_sounds(:'la', 'pop', 'gong');
reset role;
select test.ok((select order_sound = 'pop' and call_sound = 'gong' from public.locations where id = :'la'), 'a manager may too');

-- Another café
select test.act_as('5d5d0000-0000-0000-0000-000000000002');
select test.fails(format('select api.set_staff_sounds(%L, ''chime'', ''alarm'')', :'la'), 'forbidden', 'another café''s owner cannot');
reset role;
select test.ok((select order_sound = 'alarmclock' and call_sound = 'doorbell' from public.locations where id = :'lb'), 'café B is untouched');

-- Validation
select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select test.fails(format('select api.set_staff_sounds(%L, ''foghorn'', ''alarm'')', :'la'), 'invalid_order_sound', 'an unknown order sound is refused');
select test.fails(format('select api.set_staff_sounds(%L, ''bell'', ''foghorn'')', :'la'), 'invalid_call_sound', 'an unknown call sound is refused');
select test.fails(format('select api.set_staff_sounds(%L, null, ''bell'')', :'la'), 'invalid_order_sound', 'null is refused');
select test.fails(format('select api.set_staff_sounds(%L, ''bell'', null)', :'la'), 'invalid_call_sound', 'for the call sound too');
reset role;
select test.ok((select order_sound = 'pop' and call_sound = 'gong' from public.locations where id = :'la'), 'a refused call changes nothing');
select test.fails(format('update public.locations set call_sound = ''x'' where id = %L', :'la'), '%locations_call_sound_known%', 'the table itself refuses an unknown name');

-- Grants
select test.ok(not has_function_privilege('anon', 'api.set_staff_sounds(uuid, text, text)', 'execute'), 'anon cannot execute the function');
select test.ok(has_function_privilege('authenticated', 'api.set_staff_sounds(uuid, text, text)', 'execute'), 'authenticated can');

-- The loud set (20261124170000) is accepted
select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select api.set_staff_sounds(:'la', 'smoke', 'siren');
reset role;
select test.ok((select order_sound = 'smoke' and call_sound = 'siren' from public.locations where id = :'la'), 'a loud sound can be chosen for both');

-- The recorded alarm clock (20261124190000) is accepted too
select test.act_as('5d5d0000-0000-0000-0000-000000000001');
select api.set_staff_sounds(:'la', 'alarmclock', 'bell');
reset role;
select test.ok((select order_sound = 'alarmclock' and call_sound = 'bell' from public.locations where id = :'la'), 'the alarm clock can be chosen');
