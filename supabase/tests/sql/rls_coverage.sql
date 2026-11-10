-- RLS coverage (Task 11.2, docs/06-build/security-review.md). Catalog checks
-- for every table and function, then two cafés, A and B, with real data made
-- through the api.* functions, and a sweep over every public table for each
-- role: an owner of A never reads or changes B's rows, a guest reads no staff
-- table, a kitchen device reads no owner-only table, and anon reads nothing.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

-- ---------------------------------------------------------------------------
-- Catalog: every table, every function
-- ---------------------------------------------------------------------------
select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'api', 'private') and c.relkind in ('r', 'p') and not c.relrowsecurity
    and (n.nspname, c.relname) <> ('private', 'rate_limits')),
  'RLS is on for every table (private.rate_limits has no grants at all)');

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'private' and c.relkind in ('r', 'p', 'v', 'm')
    and (has_table_privilege('anon', c.oid, 'select,insert,update,delete')
         or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete'))),
  'no private table is granted to anon or authenticated');

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'api') and c.relkind in ('r', 'p', 'v', 'm')
    and has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate,references,trigger')),
  'anon holds no privilege on any table or view (it reads through api.* only)');

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'api') and c.relkind in ('v', 'm')),
  'no views (a view would run with its owner''s rights and skip RLS)');

select test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
    and (has_table_privilege('authenticated', c.oid, 'insert') or has_table_privilege('authenticated', c.oid, 'update'))),
  'a table without policies is not writable by authenticated either');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'private', 'public') and p.prosecdef
    and coalesce(p.proconfig, '{}') @> array['search_path=""'] is not true),
  'every SECURITY DEFINER function pins search_path to ''''');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('api', 'private', 'public')
    and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0))),
  'no function is executable by PUBLIC');

select test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('private', 'public') and has_function_privilege('anon', p.oid, 'execute')),
  'anon can execute nothing outside api');

select test.ok((select string_agg(p.proname, ',' order by p.proname)
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'api' and has_function_privilege('anon', p.oid, 'execute'))
               = 'public_menu,push_claim,push_report,resolve_table_token,telegram_update',
  'anon can call only the public menu, the table token and the two signed webhooks');

select test.ok((select string_agg(p.proname, ',' order by p.proname)
                from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute'))
               = 'is_platform_admin,is_real_user,my_guest_session_ids,my_location_ids,my_restaurant_ids',
  'authenticated can call only the RLS helpers in private');

-- ---------------------------------------------------------------------------
-- Two cafés with data in as many tables as the api allows
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, is_anonymous) values
  ('e1000000-0000-0000-0000-00000000000a', 'owner-rls-a@example.am', false),
  ('e1000000-0000-0000-0000-00000000000b', 'owner-rls-b@example.am', false),
  ('e1000000-0000-0000-0000-0000000000ad', null, true),   -- kitchen tablet of A
  ('e1000000-0000-0000-0000-0000000000bd', null, true),   -- kitchen tablet of B
  ('e1000000-0000-0000-0000-0000000000a9', null, true),   -- guest at A
  ('e1000000-0000-0000-0000-0000000000b9', null, true),   -- guest at B
  ('e1000000-0000-0000-0000-0000000000aa', 'manager-rls-a@example.am', false);

\set p256dh 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'
\set authkey 'tBHItJI5svbpez7KI4CCXg'

-- One café per owner, the same shape for both.
create function test.rc_cafe(p_owner uuid, p_kitchen uuid, p_guest uuid, p_slug text) returns uuid
language plpgsql as $$
declare
  v_r uuid; v_l uuid; v_menu uuid; v_cat uuid; v_item uuid; v_table uuid; v_tok text; v_code text; v_gs uuid;
begin
  perform test.act_as(p_owner);
  v_r := api.create_restaurant('Սրճարան ' || p_slug, p_slug, 'Main', 'Owner');
  select id into v_l from public.locations where restaurant_id = v_r;
  insert into public.menus (restaurant_id, internal_name) values (v_r, 'Main') returning id into v_menu;
  insert into public.menu_locations (restaurant_id, menu_id, location_id) values (v_r, v_menu, v_l);
  insert into public.categories (restaurant_id, menu_id, sort) values (v_r, v_menu, 1) returning id into v_cat;
  insert into public.category_translations (restaurant_id, category_id, locale, name) values (v_r, v_cat, 'hy', 'Ուտեստներ');
  insert into public.items (restaurant_id, category_id, price) values (v_r, v_cat, 3200) returning id into v_item;
  insert into public.item_translations (restaurant_id, item_id, locale, name) values (v_r, v_item, 'hy', 'Տոլմա');
  perform api.save_modifier_group(v_r, jsonb_build_object('names', jsonb_build_object('hy', 'Չափ'),
    'options', jsonb_build_array(jsonb_build_object('names', jsonb_build_object('hy', 'Մեծ'), 'price_delta', 300)),
    'min_select', 0, 'max_select', 1));
  insert into public.areas (restaurant_id, location_id, name) values (v_r, v_l, 'Սրահ');
  insert into public.tables (restaurant_id, location_id, label) values (v_r, v_l, '1') returning id into v_table;
  insert into public.stop_list (restaurant_id, location_id, item_id) values (v_r, v_l, v_item);
  delete from public.stop_list where item_id = v_item;
  perform api.publish_menu(v_l);
  v_tok := api.table_qr_token(v_table);
  perform api.create_invitation(v_r, 'waiter');
  perform api.create_telegram_link(v_r);
  perform api.save_push_subscription(v_r, 'https://fcm.googleapis.com/fcm/send/rls-' || p_slug, current_setting('rc.p256dh'),
                                     current_setting('rc.authkey'), 'Phone');
  v_code := api.create_device_pairing(v_l, 'kitchen', 'Խոհանոց');
  perform api.create_device_pairing(v_l, 'waiter', 'Սրահ');   -- left unredeemed

  perform test.act_as(p_kitchen, true);
  perform api.redeem_device_pairing(v_code);

  perform test.act_as(p_guest, true);
  v_gs := api.guest_join_table(v_tok, 'hy');
  perform api.guest_place_order(v_gs, gen_random_uuid(),
                                jsonb_build_array(jsonb_build_object('item_id', v_item, 'quantity', 1)), null);
  perform api.guest_service_request(v_gs, 'call_waiter');

  reset role;
  perform set_config('request.jwt.claims', '', false);
  -- What the server side writes: the audit trail, a realtime message, a file.
  insert into realtime.messages (topic, event, payload) values ('loc:' || v_l, 'order', '{}');
  insert into storage.objects (bucket_id, name) values ('menu-images', v_r || '/items/' || v_item || '/1.webp');
  return v_r;
end $$;

select set_config('rc.p256dh', :'p256dh', false) is not null as p \gset
select set_config('rc.authkey', :'authkey', false) is not null as a \gset
select test.rc_cafe('e1000000-0000-0000-0000-00000000000a', 'e1000000-0000-0000-0000-0000000000ad',
                    'e1000000-0000-0000-0000-0000000000a9', 'rls-cafe-a') as ra \gset
select test.rc_cafe('e1000000-0000-0000-0000-00000000000b', 'e1000000-0000-0000-0000-0000000000bd',
                    'e1000000-0000-0000-0000-0000000000b9', 'rls-cafe-b') as rb \gset
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset
insert into public.members (restaurant_id, user_id, role, display_name)
values (:'ra', 'e1000000-0000-0000-0000-0000000000aa', 'manager', 'Mane');

-- Rows of one café in every public table, as the current role sees them.
-- -1: the role may not even select from the table.
create function test.rc_rows(p_restaurant uuid) returns table (tbl text, n bigint)
language plpgsql as $$
declare
  t record;
  v_where text;
begin
  for t in select c.relname, exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'restaurant_id'
                                     and not a.attisdropped) as has_r
           from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
           where ns.nspname = 'public' and c.relkind = 'r' and c.relname <> 'platform_admins' order by c.relname loop
    v_where := case
      when t.has_r then 'restaurant_id = $1'
      when t.relname = 'restaurants' then 'id = $1'
      when t.relname = 'location_counters' then
        'location_id in (select l.id from public.locations l where l.restaurant_id = $1)'
    end;
    tbl := t.relname;
    begin
      execute format('select count(*) from public.%I where %s', t.relname, v_where) into n using p_restaurant;
    exception when insufficient_privilege then
      n := -1;
    end;
    return next;
  end loop;
end $$;

-- The same for writes: how many of the café's rows an UPDATE or DELETE would
-- touch. Each statement is rolled back right away; 0 also when not permitted.
create function test.rc_writes(p_restaurant uuid) returns table (tbl text, op text, n bigint)
language plpgsql as $$
declare
  t record;
  v_sql text;
  v_n bigint;
begin
  for t in select c.relname, exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'restaurant_id'
                                     and not a.attisdropped) as has_r
           from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
           where ns.nspname = 'public' and c.relkind = 'r' order by c.relname loop
    foreach op in array array['update', 'delete'] loop
      v_sql := case
        when t.relname = 'restaurants' and op = 'update' then 'update public.restaurants set name = name where id = $1'
        when t.relname = 'restaurants' then 'delete from public.restaurants where id = $1'
        when t.relname = 'locations' and op = 'update' then 'update public.locations set name = name where restaurant_id = $1'
        when not t.has_r then null
        when op = 'update' then format('update public.%I set restaurant_id = restaurant_id where restaurant_id = $1', t.relname)
        else format('delete from public.%I where restaurant_id = $1', t.relname)
      end;
      continue when v_sql is null;
      v_n := 0;
      begin
        execute v_sql using p_restaurant;
        get diagnostics v_n = row_count;
        raise exception using errcode = 'P0099';
      exception
        when sqlstate 'P0099' then null;
        when insufficient_privilege then v_n := 0;
        -- Any other error (a foreign key, a check) means a row was reached.
        when others then v_n := 1;
      end;
      tbl := t.relname;
      n := v_n;
      return next;
    end loop;
  end loop;
end $$;

-- How many rows of café B the server sees: the sweep is only as good as this.
select test.ok((select count(*) from test.rc_rows(:'rb') where n > 0) >= 30,
  'café B has rows in at least 30 public tables for the sweep (' ||
  (select count(*) from test.rc_rows(:'rb') where n > 0) || ')');
select test.ok((select string_agg(tbl, ',' order by tbl) from test.rc_rows(:'rb') where n = 0
                and tbl in ('audit_log', 'categories', 'device_pairings', 'guest_sessions', 'invitations',
                            'items', 'kitchen_ticket_items', 'kitchen_tickets', 'members', 'menu_versions',
                            'modifiers', 'notification_channels', 'order_items', 'orders', 'push_subscriptions',
                            'service_requests', 'subscriptions', 'table_sessions', 'tables', 'telegram_link_codes')) is null,
  'and in every table the roles below must not reach');

-- ---------------------------------------------------------------------------
-- Owner of A
-- ---------------------------------------------------------------------------
select test.act_as('e1000000-0000-0000-0000-00000000000a');
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'rb') where n > 0 \gset
select test.ok(:'bad' = '', 'the owner of A reads no row of café B in any table ' || :'bad');
select coalesce(string_agg(tbl || ' ' || op, ', '), '') as bad from test.rc_writes(:'rb') where n > 0 \gset
select test.ok(:'bad' = '', 'nor updates or deletes one ' || :'bad');
select test.ok((select count(*) from test.rc_rows(:'ra') where n > 0) >= 30, 'while reading their own café');
select test.ok((select count(*) from test.rc_writes(:'ra') where n > 0 and op = 'update') >= 15,
  'and changing it where the grants allow');

reset role;
select id as menu_b from public.menus where restaurant_id = :'rb' \gset
select id as cat_b from public.categories where restaurant_id = :'rb' \gset
select id as item_b from public.items where restaurant_id = :'rb' limit 1 \gset
select test.act_as('e1000000-0000-0000-0000-00000000000a');
select test.fails(format('insert into public.categories (restaurant_id, menu_id) values (%L, %L)', :'rb', :'menu_b'),
  '%row-level security%', 'the owner of A cannot add a category to B');
select test.fails(format('insert into public.items (restaurant_id, category_id, price) values (%L, %L, 100)', :'rb', :'cat_b'),
  '%row-level security%', 'nor a dish');
select test.fails(format('insert into public.item_translations (restaurant_id, item_id, locale, name) values (%L, %L, ''ru'', ''x'')', :'rb', :'item_b'),
  '%row-level security%', 'nor a translation of B''s dish');
select test.fails(format('insert into public.tables (restaurant_id, location_id, label) values (%L, %L, ''99'')', :'rb', :'lb'),
  '%row-level security%', 'nor a table');
select test.fails(format('insert into public.stop_list (restaurant_id, location_id, item_id) values (%L, %L, %L)', :'rb', :'lb', :'item_b'),
  '%row-level security%', 'nor put B''s dish on the stop list');
select test.fails(format('insert into public.stations (restaurant_id, location_id, name) values (%L, %L, ''x'')', :'rb', :'lb'),
  '%row-level security%', 'nor a station');
select test.fails(format('insert into public.menus (restaurant_id, internal_name) values (%L, ''x'')', :'rb'),
  '%row-level security%', 'nor a menu');
select test.fails(format('insert into public.members (restaurant_id, user_id, role, display_name) values (%L, %L, ''owner'', ''x'')',
                         :'rb', 'e1000000-0000-0000-0000-00000000000a'),
  '%permission denied%', 'nor make themselves a member of B');
select test.fails(format('update public.items set restaurant_id = %L where restaurant_id = %L', :'rb', :'ra'),
  '%row-level security%', 'nor move their own dish into B');
select test.fails(format('insert into storage.objects (bucket_id, name) values (''menu-images'', %L)', :'rb' || '/items/x/1.webp'),
  '%row-level security%', 'nor upload into B''s storage folder');
select test.ok((select count(*) from storage.objects where name like :'rb' || '/%') = 0, 'nor see B''s files');
select set_config('realtime.topic', 'loc:' || :'lb', false) is not null as t \gset
select test.ok((select count(*) from realtime.messages) = 0, 'nor join B''s realtime channel');
select set_config('realtime.topic', '', false) is not null as t \gset

-- The paths kept on menu rows stay in the café's folder (security review L-1).
select id as item_a from public.items where restaurant_id = :'ra' limit 1 \gset
select test.fails(format('update public.items set image_path = %L where id = %L', :'rb' || '/items/' || :'item_b' || '/1.webp', :'item_a'),
  '%items_image_path_scoped%', 'a dish cannot point at another café''s photo');
select test.fails(format('update public.items set image_path = %L where id = %L', :'ra' || '/items/../../x.webp', :'item_a'),
  '%items_image_path_scoped%', 'nor climb out of its folder');
update public.items set image_path = :'ra' || '/items/' || :'item_a' || '/1700000000000.webp' where id = :'item_a';
select test.ok((select image_path is not null from public.items where id = :'item_a'), 'its own photo path is fine');
select test.fails(format('update public.restaurants set logo_path = %L where id = %L', :'rb' || '/logo.png', :'ra'),
  '%restaurants_logo_path_scoped%', 'nor can the logo point outside the café');
select test.fails(format('update public.categories set image_path = %L where restaurant_id = %L', '../x.png', :'ra'),
  '%categories_image_path_scoped%', 'nor a section picture');

-- Web push endpoints are push services only (security review M-1).
select test.fails(format('select api.save_push_subscription(%L, %L, %L, %L)', :'ra', 'https://attacker.example/hook', :'p256dh', :'authkey'),
  '%push_subscriptions_endpoint_push_service%', 'a push subscription cannot point at an arbitrary host');
select test.fails(format('select api.save_push_subscription(%L, %L, %L, %L)', :'ra', 'https://fcm.googleapis.com.attacker.example/x', :'p256dh', :'authkey'),
  '%push_subscriptions_endpoint_push_service%', 'nor at a look-alike');

-- A manager of A: the same wall, and the owner-only rows of their own café.
select test.act_as('e1000000-0000-0000-0000-0000000000aa');
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'rb') where n > 0 \gset
select test.ok(:'bad' = '', 'a manager of A reads no row of café B ' || :'bad');
select test.ok((select n from test.rc_rows(:'ra') where tbl = 'subscriptions') = 0, 'nor the plan of their own café (owner only)');

-- ---------------------------------------------------------------------------
-- Kitchen device of A
-- ---------------------------------------------------------------------------
select test.act_as('e1000000-0000-0000-0000-0000000000ad', true);
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'rb') where n > 0 \gset
select test.ok(:'bad' = '', 'the kitchen tablet of A reads no row of café B ' || :'bad');
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'ra') where n > 0
  and tbl in ('audit_log', 'bills', 'bill_lines', 'categories', 'category_translations', 'device_pairings', 'invitations',
              'item_modifier_groups', 'item_translations', 'items', 'menu_import_images', 'menu_imports', 'menu_locations',
              'menu_translations', 'menus', 'metrics_daily', 'modifier_group_translations', 'modifier_groups',
              'modifier_translations', 'modifiers', 'notification_channels', 'notification_outbox', 'payments',
              'prep_areas', 'push_subscriptions', 'subscriptions', 'telegram_link_codes') \gset
select test.ok(:'bad' = '', 'nor any owner-only table of its own café ' || :'bad');
select test.ok((select n from test.rc_rows(:'ra') where tbl = 'kitchen_tickets') > 0, 'but it does see its own tickets');
select coalesce(string_agg(tbl || ' ' || op, ', '), '') as bad from test.rc_writes(:'ra') where n > 0
  and tbl not in ('stop_list') \gset
select test.ok(:'bad' = '', 'and it changes nothing but the stop list directly ' || :'bad');

-- ---------------------------------------------------------------------------
-- Guest at A
-- ---------------------------------------------------------------------------
select test.act_as('e1000000-0000-0000-0000-0000000000a9', true);
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'rb') where n > 0 \gset
select test.ok(:'bad' = '', 'a guest at A reads no row of café B ' || :'bad');
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'ra') where n > 0
  and tbl not in ('guest_sessions', 'orders', 'order_items', 'order_item_modifiers', 'service_requests') \gset
select test.ok(:'bad' = '', 'nor any staff table of café A ' || :'bad');
select test.ok((select count(*) from public.orders) = 1 and (select count(*) from public.guest_sessions) = 1
               and (select count(*) from public.service_requests) = 1, 'only their own session, order and call');
select coalesce(string_agg(tbl || ' ' || op, ', '), '') as bad from test.rc_writes(:'ra') where n > 0 \gset
select test.ok(:'bad' = '', 'and changes nothing directly ' || :'bad');
select test.fails(format('insert into public.orders (restaurant_id, location_id) values (%L, %L)', :'ra', :'la'),
  '%permission denied%', 'nor writes an order around the api');
select set_config('realtime.topic', 'loc:' || :'la', false) is not null as t \gset
select test.ok((select count(*) from realtime.messages) = 0, 'nor joins the staff channel of A');
select set_config('realtime.topic', '', false) is not null as t \gset
select test.fails(format('insert into storage.objects (bucket_id, name) values (''menu-images'', %L)', :'ra' || '/items/x/2.webp'),
  '%row-level security%', 'nor uploads a file');

-- ---------------------------------------------------------------------------
-- A signed-in person with no café, and anon
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values ('e1000000-0000-0000-0000-0000000000ff', 'stranger@example.am');
select test.act_as('e1000000-0000-0000-0000-0000000000ff');
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'ra') where n > 0 \gset
select test.ok(:'bad' = '', 'a signed-in stranger reads nothing of café A ' || :'bad');
select test.ok((select count(*) from public.platform_admins) = 0, 'nor the platform admins');

reset role;
select set_config('request.jwt.claims', '', false) is not null as c \gset
select slug as la_slug from public.locations where id = :'la' \gset
set role anon;
select coalesce(string_agg(tbl, ', '), '') as bad from test.rc_rows(:'ra') where n <> -1 \gset
select test.ok(:'bad' = '', 'anon may not select from any public table ' || :'bad');
select test.fails('select private.my_restaurant_ids()', '%permission denied%', 'nor call the private helpers');
select test.ok(api.public_menu('rls-cafe-a', :'la_slug') is not null, 'but it can read the public menu');

reset role;
select set_config('request.jwt.claims', '', false);
drop function test.rc_cafe(uuid, uuid, uuid, text);
\echo
\echo RLS COVERAGE TESTS PASSED
