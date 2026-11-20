-- Staff logins (ADR-067): ready-made waiter and kitchen logins with a username
-- and a password. Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous, created_at) values
  ('5a000000-0000-0000-0000-00000000000a', 'owner-sl-a@example.am', false, now() - interval '3 days'),
  ('5a000000-0000-0000-0000-00000000000b', 'owner-sl-b@example.am', false, now()),
  ('5a000000-0000-0000-0000-00000000000c', 'manager-sl-a@example.am', false, now()),
  ('5a000000-0000-0000-0000-00000000000d', 'e2e-sl-test@pativ.test', false, now() - interval '3 days'),
  ('5a000000-0000-0000-0000-00000000000e', 'squatter@staff.pativ.invalid', false, now());

select test.act_as('5a000000-0000-0000-0000-00000000000a');
select api.create_restaurant('Staff A', 'sl-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('5a000000-0000-0000-0000-00000000000b');
select api.create_restaurant('Staff B', 'sl-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
select id as st_a from public.stations where location_id = :'la' and is_default \gset
select id as st_b from public.stations where location_id = :'lb' and is_default \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', '5a000000-0000-0000-0000-00000000000c', 'manager', 'Manager A');

-- ---------------------------------------------------------------------------
-- Ready-made: a new café comes with a waiter and a kitchen login
-- ---------------------------------------------------------------------------
select test.ok((select string_agg(username, ',' order by username) from public.staff_logins where restaurant_id = :'ra')
               = 'sl-cafe-a-kitchen,sl-cafe-a-waiter', 'a new café gets a waiter and a kitchen login');
select test.ok((select count(*) from public.staff_logins sl join public.members m on m.id = sl.member_id
                where sl.restaurant_id = :'ra' and m.kind = 'person' and m.is_active
                  and ((sl.username like '%waiter' and m.role = 'waiter')
                    or (sl.username like '%kitchen' and m.role = 'kitchen' and sl.station_id = :'st_a'))) = 2,
               'they are active people, the kitchen one bound to the default station');
select test.ok(not exists (select 1 from public.staff_logins where password_set and restaurant_id = :'ra'),
               'nobody has set their password yet');
select test.ok((select count(*) from auth.users where email in ('sl-cafe-a-waiter@staff.pativ.invalid', 'sl-cafe-a-kitchen@staff.pativ.invalid')
                  and encrypted_password like '$2%' and email_confirmed_at is not null) = 2,
               'their auth users use the reserved address and hold a bcrypt hash');
select test.ok(not exists (select 1 from auth.users where lower(email) like '%@pativ.test' and id in (select user_id from public.staff_logins)),
               'no staff login uses a @pativ.test address');

-- ---------------------------------------------------------------------------
-- Owner and manager: create, list, set a password, switch off and on
-- ---------------------------------------------------------------------------
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select api.create_staff_login(:'la', 'kitchen', 'Tulip-4821', 'bar', null) ->> 'username' as u1 \gset
select test.ok(:'u1' = 'sl-cafe-a-bar', 'the owner creates a login with an own ending');
select api.create_staff_login(:'la', 'kitchen', 'Tulip-4822', null, :'st_a') ->> 'username' as u2 \gset
select test.ok(:'u2' = 'sl-cafe-a-kitchen-2', 'without an ending the next free one is taken (kitchen-2)');
select api.create_staff_login(:'la', 'waiter', 'Tulip-4823', null, null) ->> 'username' as u3 \gset
select test.ok(:'u3' = 'sl-cafe-a-waiter-2', 'and for a waiter (waiter-2)');
reset role;
select test.ok((select extensions.crypt('Tulip-4821', encrypted_password) = encrypted_password from auth.users where email = 'sl-cafe-a-bar@staff.pativ.invalid'),
               'the typed password is stored as a bcrypt hash that checks');
select test.ok(not exists (select 1 from auth.users where raw_user_meta_data::text like '%Tulip%' or encrypted_password like '%Tulip%'),
               'no password is stored in clear');
select test.ok((select password_set from public.staff_logins where username = 'sl-cafe-a-bar'), 'a typed password counts as set');
select user_id as u_bar from public.staff_logins where username = 'sl-cafe-a-bar' \gset
select member_id as m_bar from public.staff_logins where username = 'sl-cafe-a-bar' \gset
select member_id as m_wait from public.staff_logins where username = 'sl-cafe-a-waiter' \gset
select member_id as m_kit from public.staff_logins where username = 'sl-cafe-a-kitchen' \gset
select user_id as u_kit from public.staff_logins where username = 'sl-cafe-a-kitchen' \gset
select user_id as u_wait from public.staff_logins where username = 'sl-cafe-a-waiter' \gset
select member_id as m_b_wait from public.staff_logins where username = 'sl-cafe-b-waiter' \gset

-- Username format and uniqueness
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''bar'', null)', :'la'), '%username_taken%',
  'a taken username is refused');
select test.fails(format('select api.create_staff_login(%L, ''kitchen'', ''Tulip-4824'', ''bar'', null)', :'la'), '%username_taken%',
  'also for the other role');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''bad_name'', null)', :'la'), '%invalid_username%',
  'an underscore is refused');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''-x'', null)', :'la'), '%invalid_username%',
  'a leading hyphen is refused');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', %L, null)', :'la', repeat('a', 16)), '%invalid_username%',
  'an ending over 15 characters is refused');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''Ünï'', null)', :'la'), '%invalid_username%',
  'non-ASCII letters are refused');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''abc'', ''short'', null)', :'la'), '%weak_password%',
  'a password under 8 characters is refused');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', null, ''short'', null)', :'la'), '%weak_password%',
  'no password is refused');
select test.fails(format('select api.create_staff_login(%L, ''manager'', ''Tulip-4824'', ''boss'', null)', :'la'), '%invalid_staff_role%',
  'a staff login is a waiter or kitchen, never a manager');
select test.fails(format('select api.create_staff_login(%L, ''owner'', ''Tulip-4824'', ''boss'', null)', :'la'), '%invalid_staff_role%',
  'never an owner');
select test.fails(format('select api.create_staff_login(%L, ''kitchen'', ''Tulip-4824'', ''x1'', %L)', :'la', :'st_b'), '%forbidden%',
  'a station of another café is refused');
reset role;
-- A user registered the address on their own: never adopted, the name counts as taken.
-- (Supabase has a unique index on the address; the stub has none, so the test adds one for this domain.)
create unique index sl_test_staff_email_key on auth.users (lower(email)) where email like '%@staff.pativ.invalid';
insert into auth.users (id, email) values ('5a000000-0000-0000-0000-0000000000f1', 'sl-cafe-a-squat@staff.pativ.invalid');
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''squat'', null)', :'la'), '%username_taken%',
  'an address a stranger registered is not adopted');
reset role;
drop index auth.sl_test_staff_email_key;
select test.act_as('5a000000-0000-0000-0000-00000000000a');

-- The list shows them, with the status and the station
select test.ok(jsonb_array_length(api.list_staff_logins(:'la')) = 5, 'the list shows the five logins of the café');
select test.ok((select e ->> 'station_name' from jsonb_array_elements(api.list_staff_logins(:'la')) e where e ->> 'username' = 'sl-cafe-a-bar') = 'Kitchen', 'with the station name');
select test.ok((select count(*) from jsonb_array_elements(api.list_staff_logins(:'la')) e where (e ->> 'is_active')::boolean) = 5, 'all of them active');

-- Set a new password: hash changes, sessions end
reset role;
insert into auth.sessions (user_id) values (:'u_kit');
insert into auth.refresh_tokens (user_id, token, revoked) values (:'u_kit', 'rt-sl-1', false);
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select api.set_staff_password(:'m_kit', 'Maple-7733') is null as r1 \gset
reset role;
select test.ok((select extensions.crypt('Maple-7733', encrypted_password) = encrypted_password from auth.users where id = :'u_kit'),
               'the owner sets a new password');
select test.ok((select password_set from public.staff_logins where member_id = :'m_kit'), 'it counts as set now');
select test.ok(not exists (select 1 from auth.refresh_tokens where user_id = :'u_kit'::text and not coalesce(revoked, false))
  and not exists (select 1 from auth.sessions where user_id = :'u_kit' and (not_after is null or not_after > now())),
  'sessions and refresh tokens of that login end');
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select test.fails(format('select api.set_staff_password(%L, ''short'')', :'m_kit'), '%weak_password%', 'a short new password is refused');
select test.fails(format('select api.set_staff_password(%L, %L)', :'m_kit', repeat('a', 73)), '%weak_password%', 'a password over 72 bytes is refused');

-- Switch off: refused at once by every waiter and kitchen function, signed out, banned
reset role;
insert into auth.sessions (user_id) values (:'u_wait');
select test.act_as(:'u_wait');
select test.ok((select count(*) from private.my_location_ids('{waiter}')) = 1, 'before: the waiter login sees its location');
select test.ok(api.my_staff_login() ->> 'role' = 'waiter', 'and my_staff_login says waiter');
select test.act_as('5a000000-0000-0000-0000-00000000000c');   -- a manager switches it off
select api.set_staff_login_active(:'m_wait', false) is null as off1 \gset
select test.act_as(:'u_wait');
select test.ok((select count(*) from private.my_location_ids()) = 0, 'after: the switched-off login has no location');
select test.ok(api.my_staff_login() is null, 'and my_staff_login is empty');
select test.fails(format('select api.set_kitchen_busy(%L, 20)', :'la'), '%forbidden%', 'the kitchen function refuses it');
reset role;
select test.ok((select banned_until > now() + interval '10 years' from auth.users where id = :'u_wait'), 'the auth user is banned from signing in');
select test.ok(not exists (select 1 from auth.sessions where user_id = :'u_wait' and (not_after is null or not_after > now())),
               'its sessions end');
select test.ok(not (select is_active from public.members where id = :'m_wait'), 'the member is inactive');
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select api.set_staff_login_active(:'m_wait', true) is null as on1 \gset
reset role;
select test.ok((select banned_until is null from auth.users where id = :'u_wait') and (select is_active from public.members where id = :'m_wait'),
               'switching on lifts the ban and the member works again');

-- An active kitchen login works through the kitchen functions
select test.act_as(:'u_kit');
select test.ok(api.set_kitchen_busy(:'la', 20) is not null, 'an active kitchen login may use the kitchen functions');
select test.ok(api.my_staff_login() ->> 'station_id' = :'st_a', 'and lands on its station');
reset role;
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select api.set_staff_login_active(:'m_kit', false) is null as off2 \gset
select test.act_as(:'u_kit');
select test.fails(format('select api.set_kitchen_busy(%L, 20)', :'la'), '%forbidden%', 'a switched-off kitchen login is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Who may not
-- ---------------------------------------------------------------------------
-- A staff login cannot call any admin function, for its own café or another
select test.act_as(:'u_wait');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''sneaky'', null)', :'la'), '%forbidden%',
  'a waiter login cannot create logins');
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')', :'m_bar'), '%forbidden%',
  'a waiter login cannot set a password');
select test.fails(format('select api.set_staff_login_active(%L, false)', :'m_bar'), '%forbidden%',
  'a waiter login cannot switch off a login');
select test.fails(format('select api.list_staff_logins(%L)', :'la'), '%forbidden%', 'a waiter login cannot list the logins');
select test.fails(format('select api.create_device_pairing(%L, ''waiter'', ''x'')', :'la'), '%forbidden%', 'nor pair a device');
select test.fails(format('select api.create_invitation(%L, ''waiter'')', :'ra'), '%forbidden%', 'nor invite');
select test.fails(format('select api.table_qr_token(%L)', gen_random_uuid()), '%forbidden%', 'nor print QR codes');
select test.fails('select api.create_restaurant(''Mine'', ''sl-mine'', ''Main'', ''Me'')', '%forbidden%', 'nor start a café of its own');
select test.ok(not exists (select 1 from private.my_restaurant_ids('{owner,manager}')), 'it is no owner or manager anywhere');
select test.ok((select count(*) from public.staff_logins) = 0, 'and it reads no staff login rows (RLS)');
reset role;
select test.act_as(:'u_kit');
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')', :'m_bar'), '%forbidden%',
  'a kitchen login cannot set a password');
reset role;

-- Café B's owner cannot touch café A, and A's people cannot touch B
select test.act_as('5a000000-0000-0000-0000-00000000000b');
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''intruder'', null)', :'la'), '%forbidden%',
  'another café''s owner cannot create a login here');
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')', :'m_bar'), '%forbidden%',
  'cannot set a password');
select test.fails(format('select api.set_staff_login_active(%L, false)', :'m_bar'), '%forbidden%', 'cannot switch off');
select test.fails(format('select api.list_staff_logins(%L)', :'la'), '%forbidden%', 'cannot list');
select test.ok((select count(*) from public.staff_logins where restaurant_id = :'ra') = 0, 'cannot read them either');
select test.ok((select count(*) from public.staff_logins where restaurant_id = :'rb') = 2, 'its own two are readable');
reset role;
select test.act_as('5a000000-0000-0000-0000-00000000000a');
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')', :'m_b_wait'), '%forbidden%',
  'the owner of A cannot set the password of a login of B');
select test.fails(format('select api.set_staff_login_active(%L, false)', :'m_b_wait'), '%forbidden%', 'nor switch it off');
select test.fails(format('select api.set_staff_login_active(%L, false)', gen_random_uuid()), '%forbidden%', 'an unknown member is forbidden, not an error that leaks');
-- A person who is not a staff login is not a staff login: no password reset through here
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')',
  (select id from public.members where restaurant_id = :'ra' and role = 'manager')), '%forbidden%',
  'a manager (a real person) cannot have a password set through the staff-login function');
reset role;
-- A manager of the same café can
select test.act_as('5a000000-0000-0000-0000-00000000000c');
select api.set_staff_password(:'m_bar', 'Cedar-9911') is null as mgr1 \gset
select api.set_staff_login_active(:'m_bar', false) is null as mgr2 \gset
select api.set_staff_login_active(:'m_bar', true) is null as mgr3 \gset
select api.create_staff_login(:'la', 'waiter', 'Cedar-9912', 'patio', null) ->> 'username' as mgr4 \gset
select test.ok(:'mgr4' = 'sl-cafe-a-patio', 'a manager of the café may create, reset and switch off and on');
reset role;
-- Anonymous (guest, device) sessions and anon cannot call them
select test.act_as('5a000000-0000-0000-0000-0000000000f1', true);
select test.fails(format('select api.create_staff_login(%L, ''waiter'', ''Tulip-4824'', ''anon1'', null)', :'la'), '%forbidden%', 'an anonymous session cannot create');
reset role;
set role anon;
select test.fails(format('select api.set_staff_password(%L, ''Tulip-4825'')', :'m_bar'), '%permission denied%', 'anon cannot execute it');
reset role;

-- ---------------------------------------------------------------------------
-- The purge leaves a café with staff logins and a real owner alone
-- ---------------------------------------------------------------------------
update public.restaurants set created_at = now() - interval '3 days' where id in (:'ra', :'rb');
update auth.users set created_at = now() - interval '3 days' where id in (select user_id from public.staff_logins);
select test.act_as('5a000000-0000-0000-0000-00000000000d');
select api.create_restaurant('Staff T', 'sl-cafe-t', 'Main', 'Tester') as rt \gset
reset role;
update public.restaurants set created_at = now() - interval '3 days' where id = :'rt';
update auth.users set created_at = now() - interval '3 days' where id in (select user_id from public.staff_logins);
select test.ok((select count(*) from public.staff_logins where restaurant_id = :'rt') = 2, 'the test café has its two logins too');
select private.purge_test_cafes() as pg1 \gset
select test.ok(exists (select 1 from public.restaurants where id = :'ra') and exists (select 1 from public.restaurants where id = :'rb'),
               'a café with a real owner and staff logins is left alone');
select test.ok((select count(*) from public.staff_logins where restaurant_id in (:'ra', :'rb')) = 8
               and (select count(*) from auth.users where email like '%@staff.pativ.invalid' and id in (select user_id from public.staff_logins where restaurant_id in (:'ra', :'rb'))) = 8,
               'and so are its login users');
select test.ok(not exists (select 1 from public.restaurants where id = :'rt'), 'a test café (all owners @pativ.test) is still purged');
select test.ok(not exists (select 1 from auth.users where email like 'sl-cafe-t-%@staff.pativ.invalid'), 'with its staff-login users');
select test.ok((select count(*) from auth.users where email like '%@staff.pativ.invalid') >= 10, 'login users of existing cafés were not matched');

-- Deleting a café takes its logins with it (members cascade, the login rows follow)
select test.ok(not exists (select 1 from public.staff_logins where restaurant_id = :'rt'), 'no login rows are left for the purged café');
