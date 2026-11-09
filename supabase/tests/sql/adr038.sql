-- ADR-038: table QR tokens signed in the database, guest writes through api.*,
-- devices paired by code, invitations and revocation, with no secret key in the
-- app. Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

create function test.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  perform set_config('role', 'anon', false);
end $$;
grant execute on function test.act_as_anon() to public;

insert into auth.users (id, email, is_anonymous) values
  ('d0000000-0000-0000-0000-000000000001', 'owner-d@example.am', false),
  ('d0000000-0000-0000-0000-000000000002', null, true),   -- a guest's phone
  ('d0000000-0000-0000-0000-000000000003', null, true),   -- kitchen tablet, signed in anonymously
  ('d0000000-0000-0000-0000-000000000004', 'manager-d@example.am', false),
  ('d0000000-0000-0000-0000-000000000005', null, true),   -- a stranger guessing codes
  ('d0000000-0000-0000-0000-000000000006', 'owner-e@example.am', false);
insert into auth.refresh_tokens (user_id, token, revoked) values ('d0000000-0000-0000-0000-000000000003', 'kitchen-refresh', false);

-- Café D: one dish, table 7, published menu
select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Դ', 'cafe-d', 'Main', 'Davit') as rd \gset
select id as ld from public.locations where restaurant_id = :'rd' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rd', 'Main') returning id as dmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rd', :'dmenu', :'ld');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rd', :'dmenu', 1) returning id as dcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rd', :'dcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rd', :'dcat', 3200) returning id as tolma \gset
insert into public.item_translations (restaurant_id, item_id, locale, name, source) values (:'rd', :'tolma', 'hy', 'Տոլմա', 'owner');
insert into public.tables (restaurant_id, location_id, label) values (:'rd', :'ld', '7') returning id as t7 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rd', :'ld', '8') returning id as t8 \gset
select api.publish_menu(:'ld') as dv1 \gset

-- Café E, to forge tokens against
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.create_restaurant('Cafe E', 'cafe-e', 'Main', 'Eva') as re \gset
select id as le from public.locations where restaurant_id = :'re' \gset
insert into public.tables (restaurant_id, location_id, label) values (:'re', :'le', '1') returning id as te1 \gset

-- ---------------------------------------------------------------------------
-- QR tokens
-- ---------------------------------------------------------------------------
select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.table_qr_token(:'t7') as tok7 \gset
select test.ok(:'tok7' ~ '^[A-Za-z0-9_-]{46}$', 'a table token is 46 URL-safe characters');

select test.act_as('d0000000-0000-0000-0000-000000000006');
select test.fails(format('select api.table_qr_token(%L)', :'t7'), 'forbidden', 'another café''s owner cannot print our QR');

select test.act_as_anon();
select test.ok((select api.resolve_table_token(:'tok7') ->> 'restaurant_slug') = 'cafe-d', 'an anonymous visitor resolves the token to the café');
select test.ok((select api.resolve_table_token(:'tok7') ->> 'table_label') = '7', 'the token names the table');
select test.ok((select api.resolve_table_token(:'tok7') ->> 'location_slug') = 'main', 'the token names the location');

-- one flipped character in the signature part
select overlay(:'tok7' placing (case substr(:'tok7', 40, 1) when 'A' then 'B' else 'A' end) from 40 for 1) as tampered \gset
select test.fails(format('select api.resolve_table_token(%L)', :'tampered'), 'invalid_table_token', 'a tampered signature is refused');
select test.fails(format('select api.resolve_table_token(%L)', 'not-a-token'), 'invalid_table_token', 'a malformed token is refused');

-- the same signature with café E's table id swapped in
reset role;
select private.b64url(overlay(private.b64url_decode(:'tok7') placing decode(replace(:'te1', '-', ''), 'hex') from 3 for 16)) as forged \gset
select test.act_as_anon();
select test.fails(format('select api.resolve_table_token(%L)', :'forged'), 'invalid_table_token', 'another table id inside a signed token is refused');

-- ---------------------------------------------------------------------------
-- Guests join and order through api.*
-- ---------------------------------------------------------------------------
select test.act_as('d0000000-0000-0000-0000-000000000002', true);
select test.ok(not private.is_real_user(), 'a guest is not a real user');
select api.guest_join_table(:'tok7', 'en') as gs \gset
select test.ok((select user_id from public.guest_sessions where id = :'gs') = 'd0000000-0000-0000-0000-000000000002', 'the guest session belongs to the caller');
\set dlines '[{"item_id": "' :tolma '", "quantity": 2}]'
select api.guest_place_order(:'gs', '33333333-0000-0000-0000-000000000001', :'dlines'::jsonb, null) as dord \gset
select test.ok((select total from public.orders where id = :'dord') = 6400, 'the guest order is priced in the database: 2 x 3200');
select test.ok(api.guest_place_order(:'gs', '33333333-0000-0000-0000-000000000001', :'dlines'::jsonb, null) = :'dord',
  'a retry with the same idempotency key returns the same order');
select test.fails(format('select api.accept_order(%L)', :'dord'), 'forbidden', 'a guest cannot accept orders');
select test.fails(format('select api.table_qr_token(%L)', :'t7'), 'forbidden', 'a guest cannot print QR codes');
select test.fails(format('select api.create_device_pairing(%L, %L, %L)', :'ld', 'kitchen', 'x'), 'forbidden', 'a guest cannot pair devices');

-- another guest cannot use this guest's session
select test.act_as('d0000000-0000-0000-0000-000000000005', true);
select test.fails(format('select api.guest_place_order(%L, gen_random_uuid(), %L::jsonb, null)', :'gs', :'dlines'),
  'guest_session_invalid', 'a guest session is useless to anyone else');

-- reprinting table 7 kills the printed sticker and the open guest session
select test.act_as('d0000000-0000-0000-0000-000000000001');
update public.tables set qr_version = qr_version + 1 where id = :'t7';
select test.act_as_anon();
select test.fails(format('select api.resolve_table_token(%L)', :'tok7'), 'invalid_table_token', 'an old sticker stops working after a reprint');
select test.act_as('d0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.guest_join_table(%L, %L)', :'tok7', 'en'), 'invalid_table_token', 'an old sticker cannot open a session');

-- a retired key stops every sticker printed with it
reset role;
update private.qr_keys set retired_at = now();
select test.act_as_anon();
select test.act_as('d0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.table_qr_token(%L)', :'t8'), '%no_current_qr_key%', 'nothing is signed without a current key');
reset role;
insert into private.qr_keys (kid, is_current) values (2, false);
select private.rotate_qr_key() as kid2 \gset
select test.ok(:'kid2'::int = 3, 'rotation creates the next key id');
select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.table_qr_token(:'t8') as tok8 \gset
reset role;
update private.qr_keys set retired_at = now() where kid = :'kid2'::int;
select test.act_as_anon();
select test.fails(format('select api.resolve_table_token(%L)', :'tok8'), 'invalid_table_token', 'a sticker signed with a retired key is refused');
reset role;
update private.qr_keys set retired_at = null where kid = :'kid2'::int;

-- ---------------------------------------------------------------------------
-- Pairing a kitchen tablet
-- ---------------------------------------------------------------------------
select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.create_device_pairing(:'ld', 'kitchen', 'Խոհանոցի պլանշետ') as code \gset
select test.ok(:'code' ~ '^[0-9]{6}$', 'a pairing code is six digits');
select test.ok((select count(*) from public.device_pairings where code_hash = :'code') = 0, 'the code is stored hashed');

select test.act_as('d0000000-0000-0000-0000-000000000004');
select test.ok((api.redeem_device_pairing(:'code') ->> 'error') = 'anonymous_session_required', 'a signed-in person cannot turn into a device');

select test.act_as('d0000000-0000-0000-0000-000000000003', true);
select test.ok(not private.is_real_user(), 'the tablet is not a member before pairing');
select test.ok((select count(*) from public.kitchen_tickets where restaurant_id = :'rd') = 0, 'the tablet sees nothing before pairing');
select api.redeem_device_pairing(:'code') as paired \gset
select test.ok((:'paired'::jsonb ->> 'role') = 'kitchen', 'the redeemed code makes the tablet a kitchen device');
select test.ok((:'paired'::jsonb ->> 'location_id') = :'ld', 'the device belongs to café D''s location');
select test.ok(private.is_real_user(), 'an active device member counts as staff');
select test.ok((select count(*) from public.kitchen_tickets where restaurant_id = :'rd') >= 1, 'the kitchen tablet sees café D''s tickets');
select test.ok((select count(*) from public.kitchen_tickets where restaurant_id <> :'rd') = 0, 'and nothing of any other café');

select test.act_as('d0000000-0000-0000-0000-000000000005', true);
select test.ok((api.redeem_device_pairing(:'code') ->> 'error') = 'invalid_pairing_code', 'a used code fails');
select test.ok((api.redeem_device_pairing('000001') ->> 'error') = 'invalid_pairing_code', 'wrong code 2');
select test.ok((api.redeem_device_pairing('000002') ->> 'error') = 'invalid_pairing_code', 'wrong code 3');
select test.ok((api.redeem_device_pairing('000003') ->> 'error') = 'invalid_pairing_code', 'wrong code 4');
select test.ok((api.redeem_device_pairing('000004') ->> 'error') = 'invalid_pairing_code', 'wrong code 5');
select test.ok((api.redeem_device_pairing('000005') ->> 'error') = 'rate_limited', 'the sixth wrong code in 10 minutes is rate limited');

-- revoking the tablet
select test.act_as('d0000000-0000-0000-0000-000000000001');
select api.revoke_member((:'paired'::jsonb ->> 'member_id')::uuid);
select test.act_as('d0000000-0000-0000-0000-000000000003', true);
select test.ok((select count(*) from public.kitchen_tickets where restaurant_id = :'rd') = 0, 'a revoked tablet reads nothing at once');
reset role;
select test.ok((select bool_and(revoked) from auth.refresh_tokens where user_id = 'd0000000-0000-0000-0000-000000000003'), 'its refresh tokens are revoked');
select test.act_as('d0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.revoke_member(%L)', (select id from public.members where restaurant_id = :'rd' and role = 'owner')),
  'cannot_revoke_owner', 'the owner cannot be revoked');

-- ---------------------------------------------------------------------------
-- Inviting a manager
-- ---------------------------------------------------------------------------
select api.create_invitation(:'rd', 'manager', null, null) as inv \gset
select test.act_as('d0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.accept_invitation(%L, %L)', :'inv', 'Guest'), 'forbidden', 'a guest cannot accept an invitation');
select test.act_as('d0000000-0000-0000-0000-000000000004');
select api.accept_invitation(:'inv', 'Մարիամ') as mgr \gset
select test.ok((select role from public.members where id = :'mgr') = 'manager', 'the invited person becomes a manager');
select test.fails(format('select api.accept_invitation(%L, %L)', :'inv', 'Again'), 'invitation_invalid', 'an invitation works once');
select test.act_as('d0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.create_invitation(%L, %L, null, null)', :'rd', 'owner'), '%invitations_role_check%', 'nobody can be invited as owner');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'ADR-038 TESTS PASSED'
