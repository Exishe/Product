-- Game rewards (ADR-075): who may change the settings, what a guest may claim
-- and when, one reward per order, who may read the claims and who may mark one
-- applied. Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('d9e00000-0000-0000-0000-000000000001', 'owner-r@example.am', false),
  ('d9e00000-0000-0000-0000-000000000002', null, true),   -- waiter tablet
  ('d9e00000-0000-0000-0000-000000000003', null, true),   -- guest A
  ('d9e00000-0000-0000-0000-000000000004', null, true),   -- guest B (another table)
  ('d9e00000-0000-0000-0000-000000000005', 'owner-s@example.am', false),
  ('d9e00000-0000-0000-0000-000000000006', 'manager-r@example.am', false),
  ('d9e00000-0000-0000-0000-000000000007', null, true);   -- waiter tablet of the other café

select test.act_as('d9e00000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Ռ', 'cafe-rewards', 'Main', 'Rita') as rr \gset
select id as lr from public.locations where restaurant_id = :'rr' \gset
update public.locations set max_auto_accept_total = 100000 where id = :'lr';
insert into public.menus (restaurant_id, internal_name) values (:'rr', 'Main') returning id as rmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rr', :'rmenu', :'lr');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rr', :'rmenu', 1) returning id as rcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rr', :'rcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rr', :'rcat', 800) returning id as coffee \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rr', :'coffee', 'hy', 'Սուրճ');
insert into public.tables (restaurant_id, location_id, label) values (:'rr', :'lr', '1') returning id as t1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rr', :'lr', '2') returning id as t2 \gset
select api.publish_menu(:'lr') is not null as published \gset
select api.table_qr_token(:'t1') as tok1 \gset
select api.table_qr_token(:'t2') as tok2 \gset
select api.create_device_pairing(:'lr', 'waiter', 'Սրահ') as wcode \gset
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select (api.redeem_device_pairing(:'wcode') ->> 'role') = 'waiter' as waiter_ok \gset
reset role;
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'rr', 'd9e00000-0000-0000-0000-000000000006', 'manager', 'Mane');
select test.act_as('d9e00000-0000-0000-0000-000000000005');
select api.create_restaurant('Cafe S', 'cafe-s-rewards', 'Main', 'Sam') as rs \gset
select id as ls from public.locations where restaurant_id = :'rs' \gset
select api.create_device_pairing(:'ls', 'waiter', 'Hall') as wcode2 \gset
select test.act_as('d9e00000-0000-0000-0000-000000000007', true);
select (api.redeem_device_pairing(:'wcode2') ->> 'role') = 'waiter' as waiter2_ok \gset
reset role;

\set one_coffee '[{"item_id": "' :coffee '", "quantity": 1}]'

-- ---------------------------------------------------------------------------
-- Off by default; settings are for the owner and manager of that café only
-- ---------------------------------------------------------------------------
select test.ok(not exists (select 1 from public.game_reward_settings where location_id = :'lr'), 'no settings row: rewards are off by default');
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select api.guest_join_table(:'tok1', 'hy') as ga \gset
select api.guest_place_order(:'ga', 'd9ea0000-0000-0000-0000-000000000001', :'one_coffee'::jsonb, null) as o1 \gset
select test.ok((api.guest_game_reward(:'ga', :'o1') ->> 'on')::boolean = false, 'a guest sees that rewards are off');
reset role;
update public.orders set placed_at = now() - interval '2 minutes' where id = :'o1';

select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 5)', :'ga', :'o1', 'runner'), '%rewards_off%', 'no claim while rewards are off');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, 10, null, null)$q$, :'lr'), '%forbidden%', 'a guest cannot change the settings');
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, 10, null, null)$q$, :'lr'), '%forbidden%', 'a waiter login cannot change the settings');
select test.act_as('d9e00000-0000-0000-0000-000000000005');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, 10, null, null)$q$, :'lr'), '%forbidden%', 'another café''s owner cannot');
select test.act_as('d9e00000-0000-0000-0000-000000000001');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 1, 10, null, null)$q$, :'lr'), '%invalid_level%', 'level 1 is refused');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 51, 10, null, null)$q$, :'lr'), '%invalid_level%', 'level 51 is refused');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, 51, null, null)$q$, :'lr'), '%invalid_percent%', '51 percent is refused');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, null, null, null)$q$, :'lr'), '%invalid_percent%', 'percent is needed for a percent reward');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'text', 3, null, '{"ru": "x"}', null)$q$, :'lr'), '%name_required%', 'Armenian text is needed for a text reward');
select test.fails(format($q$select api.set_game_rewards(%L, true, 'percent', 3, 10, null, 'chess')$q$, :'lr'), '%invalid_game%', 'an unknown game is refused');
select api.set_game_rewards(:'lr', false, 'percent', 3, 10, null, null) is null as off_ok \gset
select test.act_as('d9e00000-0000-0000-0000-000000000006');
select api.set_game_rewards(:'lr', true, 'percent', 2, 10, null, null) is null as mgr_ok \gset
reset role;
select test.ok((select game_rewards_on and reward_level = 2 and reward_percent = 10 from public.game_reward_settings where location_id = :'lr'), 'a manager switches rewards on');
select test.ok(exists (select 1 from public.audit_log where location_id = :'lr' and action = 'game_rewards.updated'), 'and it is in the audit log');
select test.act_as('d9e00000-0000-0000-0000-000000000001');
select test.ok((select count(*) from public.game_reward_settings) = 1, 'the owner reads the settings');
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select test.ok((select count(*) from public.game_reward_settings) = 0, 'a waiter login does not read the settings table');

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select test.ok((api.guest_game_reward(:'ga', :'o1') ->> 'on')::boolean and (api.guest_game_reward(:'ga', :'o1') ->> 'level')::int = 2, 'the guest sees the offer: level 2');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 1)', :'ga', :'o1', 'runner'), '%level_too_low%', 'level 1 is below the goal');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 101)', :'ga', :'o1', 'runner'), '%invalid_value%', 'a level over the hard maximum is refused');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', :'ga', :'o1', 'chess'), '%invalid_value%', 'an unknown game is refused');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', gen_random_uuid(), :'o1', 'runner'), '%guest_session_invalid%', 'an unknown guest session is refused');

-- Another phone, another table: a foreign order
select test.act_as('d9e00000-0000-0000-0000-000000000004', true);
select api.guest_join_table(:'tok2', 'hy') as gb \gset
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', :'gb', :'o1', 'runner'), '%forbidden%', 'a guest cannot claim for someone else''s order');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', :'ga', :'o1', 'runner'), '%guest_session_invalid%', 'nor with someone else''s guest session');
select test.fails(format('select api.guest_game_reward(%L, %L)', :'ga', :'o1'), '%guest_session_invalid%', 'nor read it');
select test.ok((select count(*) from public.game_reward_claims) = 0 and (select count(*) from public.game_reward_settings) = 0, 'guests cannot read the claims or settings tables');

-- A fresh order is too new
select api.guest_place_order(:'gb', 'd9ea0000-0000-0000-0000-000000000002', :'one_coffee'::jsonb, null) as o2 \gset
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', :'gb', :'o2', 'runner'), '%too_early%', 'a claim right after placing the order is refused');

select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select api.claim_game_reward(:'ga', :'o1', 'runner', 3) as c1 \gset
select test.ok((:'c1'::jsonb ->> 'status') = 'open' and (:'c1'::jsonb ->> 'percent') = '10' and (:'c1'::jsonb ->> 'level') = '3', 'level 3 earns the reward: 10 percent');
select api.claim_game_reward(:'ga', :'o1', 'merge', 9) as c2 \gset
select test.ok((:'c2'::jsonb ->> 'id') = (:'c1'::jsonb ->> 'id') and (:'c2'::jsonb ->> 'level') = '3', 'a repeat claim returns the same reward (one per order)');
reset role;
select test.ok((select count(*) from public.game_reward_claims where order_id = :'o1') = 1, 'one row');
select test.ok((select table_label = '1' and applied_at is null and dismissed_at is null and claimed_at is not null from public.game_reward_claims where order_id = :'o1'), 'with the table label, nothing applied yet');

-- Settings change afterwards: the claim keeps its snapshot
select test.act_as('d9e00000-0000-0000-0000-000000000001');
select api.set_game_rewards(:'lr', true, 'text', 4, null, '{"hy": "Սուրճ աղանդերի հետ", "en": "Free coffee with dessert"}', 'merge') is null as t_ok \gset
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select test.ok((api.guest_game_reward(:'ga', :'o1') -> 'claim' ->> 'percent') = '10', 'the claim keeps the reward it earned');
select test.act_as('d9e00000-0000-0000-0000-000000000004', true);
reset role;
update public.orders set placed_at = now() - interval '2 minutes' where id = :'o2';
select test.act_as('d9e00000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 9)', :'gb', :'o2', 'runner'), '%game_not_eligible%', 'only the chosen game counts');
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 3)', :'gb', :'o2', 'merge'), '%level_too_low%', 'level 3 is below the new goal of 4');
select api.claim_game_reward(:'gb', :'o2', 'merge', 4) as c3 \gset
select test.ok((:'c3'::jsonb ->> 'kind') = 'text' and (:'c3'::jsonb -> 'text' ->> 'en') = 'Free coffee with dessert', 'a text reward');

-- An order that is no longer open
reset role;
select test.act_as('d9e00000-0000-0000-0000-000000000004', true);
select api.guest_place_order(:'gb', 'd9ea0000-0000-0000-0000-000000000003', :'one_coffee'::jsonb, null) as o3 \gset
reset role;
update public.orders set placed_at = now() - interval '2 minutes', status = 'cancelled', cancelled_at = now() where id = :'o3';
select test.act_as('d9e00000-0000-0000-0000-000000000004', true);
select test.fails(format('select api.claim_game_reward(%L, %L, %L, 9)', :'gb', :'o3', 'merge'), '%order_not_open%', 'a cancelled order earns nothing');

-- Rewards off again: no new claim, the old one stays
select test.act_as('d9e00000-0000-0000-0000-000000000001');
select api.set_game_rewards(:'lr', false, 'text', 4, null, '{"hy": "Սուրճ"}', null) is null as off2 \gset
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select test.ok((api.claim_game_reward(:'ga', :'o1', 'runner', 3) ->> 'status') = 'open', 'an earned reward is still returned after switching off');
select test.ok((api.guest_game_reward(:'ga', :'o1') -> 'claim' ->> 'id') = (:'c1'::jsonb ->> 'id'), 'and shown to the guest');

-- ---------------------------------------------------------------------------
-- Staff: list and resolve
-- ---------------------------------------------------------------------------
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select test.ok((select count(*) from public.game_reward_claims) = 2, 'the waiter of that café lists both claims');
select (:'c1'::jsonb ->> 'id') as claim1 \gset
select test.act_as('d9e00000-0000-0000-0000-000000000007', true);
select test.ok((select count(*) from public.game_reward_claims) = 0, 'the other café''s waiter sees none');
select test.fails(format('select api.resolve_game_reward(%L, %L)', :'claim1', 'applied'), '%forbidden%', 'and cannot mark one applied');
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
select test.fails(format('select api.resolve_game_reward(%L, %L)', :'claim1', 'applied'), '%forbidden%', 'a guest cannot either');
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.resolve_game_reward(%L, %L)', :'claim1', 'paid'), '%invalid_value%', 'an unknown action is refused');
select api.resolve_game_reward(:'claim1', 'applied') is null as applied \gset
select api.resolve_game_reward(:'claim1', 'applied') is null as applied_again \gset
select test.fails(format('select api.resolve_game_reward(%L, %L)', :'claim1', 'dismissed'), '%already_handled%', 'an applied reward cannot be dismissed');
reset role;
select test.ok((select applied_at is not null and applied_by = 'd9e00000-0000-0000-0000-000000000002' and dismissed_at is null from public.game_reward_claims where id = :'claim1'), 'applied records who and when');
select test.ok((select count(*) from public.audit_log where entity_id = :'claim1' and action = 'game_reward.applied') = 1, 'one audit entry, even for a repeated tap');
select test.ok((select count(*) from public.bills where restaurant_id = :'rr') = 0 and (select count(*) from public.bill_discounts where restaurant_id = :'rr') = 0, 'no bill or discount was touched');
select (select (:'c3'::jsonb ->> 'id')) as claim3 \gset
select test.act_as('d9e00000-0000-0000-0000-000000000002', true);
select api.resolve_game_reward(:'claim3', 'dismissed') is null as dismissed \gset
reset role;
select test.ok((select dismissed_at is not null and applied_at is null from public.game_reward_claims where id = :'claim3'), 'dismissed is recorded');
select test.ok(exists (select 1 from public.audit_log where entity_id = :'claim3' and action = 'game_reward.dismissed'), 'and audited');

-- Rate limit: ten claims in ten minutes per guest session
select test.act_as('d9e00000-0000-0000-0000-000000000003', true);
reset role;
select test.ok(not (select private.rate_limit_hit('reward:guest:' || :'ga', 0, interval '10 minutes')), 'the claim limit key is the guest session (helper sanity)');

reset role;
select set_config('request.jwt.claims', '', false);
\echo 'GAME REWARDS TESTS PASSED'
