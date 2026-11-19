-- ADR-064: api.set_ticket_status and api.cancel_order_item lock an order's rows
-- in one order: order -> kitchen ticket -> order item. Before migration
-- 20261119120000 the first went ticket -> order and the second item -> order
-- -> ticket, and the two deadlocked (40P01).
--
-- How the lock order is proved: this session holds one row lock inside a
-- transaction; a second session (dblink) calls the function and waits. While
-- it waits, the rows that come LATER in the order must still be free
-- (`for update nowait` succeeds) and the rows that come EARLIER must be held.
-- Against the baseline functions the first check below fails.
-- Then both functions run 16 times at the same moment from two sessions and
-- neither may be chosen as a deadlock victim.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
create extension if not exists dblink with schema extensions;

-- A second session on this database, over the local socket.
create function test.lo_connect(p_name text) returns integer language plpgsql as $$
declare v_pid integer;
begin
  perform extensions.dblink_connect(p_name, format('dbname=%L host=%L port=%L user=%L', current_database(),
    split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), session_user));
  select pid into v_pid from extensions.dblink(p_name, 'select pg_backend_pid()') as t(pid integer);
  perform 1 from extensions.dblink(p_name, 'select test.act_as(''fa000000-0000-0000-0000-000000000001'')') as t(r text);
  return v_pid;
end $$;

-- Runs a statement and answers 'ok' or the error's SQLSTATE and message.
create function test.lo_try(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;

-- Waits until the session with this pid is waiting for a lock (10 s at most).
create function test.lo_wait_blocked(p_pid integer) returns boolean language plpgsql as $$
begin
  for i in 1..200 loop
    if exists (select 1 from pg_locks where pid = p_pid and not granted) then return true; end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end $$;

-- True when nobody holds a lock on that row. The probe's own lock is released at once.
create function test.lo_row_free(p_table regclass, p_id uuid) returns boolean language plpgsql as $$
begin
  begin
    execute format('select 1 from %s where id = %L for update nowait', p_table, p_id);
    raise exception using errcode = 'RS001', message = 'probe_done';   -- undo the probe's lock
  exception
    when lock_not_available then return false;
    when sqlstate 'RS001' then return true;
  end;
end $$;

create function test.lo_result(p_name text) returns text language plpgsql as $$
declare v_out text; v_more text;
begin
  select r into v_out from extensions.dblink_get_result(p_name) as t(r text);
  select r into v_more from extensions.dblink_get_result(p_name) as t(r text);   -- drain
  return v_out;
end $$;
grant execute on all functions in schema test to public;

-- Café L: one dish, two tables. The owner acts for the kitchen and the floor.
insert into auth.users (id, email, is_anonymous) values
  ('fa000000-0000-0000-0000-000000000001', 'owner-l@example.am', false);
select test.act_as('fa000000-0000-0000-0000-000000000001');
select api.create_restaurant('Սրճարան Լ', 'cafe-lock-order', 'Main', 'Lilit') as rl \gset
select id as ll from public.locations where restaurant_id = :'rl' \gset
insert into public.menus (restaurant_id, internal_name) values (:'rl', 'Main') returning id as lmenu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'rl', :'lmenu', :'ll');
insert into public.categories (restaurant_id, menu_id, sort) values (:'rl', :'lmenu', 1) returning id as lcat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'rl', :'lcat', 'hy', 'Ուտեստներ');
insert into public.items (restaurant_id, category_id, price) values (:'rl', :'lcat', 1000) returning id as dish \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values (:'rl', :'dish', 'hy', 'Լահմաջո');
insert into public.tables (restaurant_id, location_id, label) values (:'rl', :'ll', '1') returning id as lt1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'rl', :'ll', '2') returning id as lt2 \gset
select api.publish_menu(:'ll') is not null as published \gset

\set four '[{"item_id": "' :dish '", "quantity": 4}]'
\set one '[{"item_id": "' :dish '", "quantity": 1}]'
\set twenty '[{"item_id": "' :dish '", "quantity": 20}]'

-- ---------------------------------------------------------------------------
-- Behaviour is what it was
-- ---------------------------------------------------------------------------
select api.place_waiter_order(:'lt1', 'ab000000-0000-0000-0000-000000000001', :'one'::jsonb) as o0 \gset
select id as i0 from public.order_items where order_id = :'o0' \gset
select id as k0 from public.kitchen_tickets where order_id = :'o0' and kind = 'order' \gset
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', gen_random_uuid(), 'new', 'cooking'), 'ticket_not_found', 'an unknown ticket is not found');
select test.fails(format('select api.cancel_order_item(%L, 1, %L)', gen_random_uuid(), 'x'), 'order_item_not_found', 'an unknown line is not found');
select test.fails(format('select api.cancel_order_item(%L, 2, %L)', :'i0', 'x'), 'invalid_quantity', 'more than was ordered cannot be cancelled');
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', :'k0', 'cooking', 'new'), 'transition_not_allowed', 'a ticket cannot go back to new');
select test.fails(format('select api.set_ticket_status(%L, %L, %L)', :'k0', 'cooking', 'ready'), 'stale_status', 'a stale expected status is refused');
select api.cancel_order_item(:'i0', 1, 'Սխալ') is null as c \gset
reset role;
select test.ok((select status from public.kitchen_tickets where id = :'k0') = 'cancelled', 'cancelling the only line of an untouched ticket cancels the ticket');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o0' and kind = 'void') = 0, 'and sends no void ticket');
select test.ok((select status = 'cancelled' and total = 0 from public.orders where id = :'o0'), 'and cancels the order');

-- ---------------------------------------------------------------------------
-- Lock order, step 1: the order row comes first in both functions
-- ---------------------------------------------------------------------------
select test.act_as('fa000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'lt1', 'ab000000-0000-0000-0000-000000000002', :'four'::jsonb) as o1 \gset
reset role;
select id as i1 from public.order_items where order_id = :'o1' \gset
select id as k1 from public.kitchen_tickets where order_id = :'o1' and kind = 'order' \gset
select test.lo_connect('kitchen') as kpid \gset
select test.lo_connect('waiter') as wpid \gset

begin;
select 1 as held from public.orders where id = :'o1' for update \gset
select extensions.dblink_send_query('kitchen', format('select test.lo_try(%L)',
  format('select api.set_ticket_status(%L, %L, %L)', :'k1', 'new', 'cooking'))) as sent \gset
select test.ok(test.lo_wait_blocked(:kpid), 'the kitchen''s move waits while the order row is held');
select test.ok(test.lo_row_free('public.kitchen_tickets', :'k1'), 'set_ticket_status asks for the order before it locks the ticket');
select extensions.dblink_send_query('waiter', format('select test.lo_try(%L)',
  format('select api.cancel_order_item(%L, 1, %L)', :'i1', 'Հյուրը փոխեց միտքը'))) as sent \gset
select test.ok(test.lo_wait_blocked(:wpid), 'the waiter''s cancellation waits while the order row is held');
select test.ok(test.lo_row_free('public.order_items', :'i1'), 'cancel_order_item asks for the order before it locks the line');
select test.ok(test.lo_row_free('public.kitchen_tickets', :'k1'), 'and before it locks the ticket');
commit;
select test.ok(test.lo_result('kitchen') = 'ok', 'the kitchen''s move goes through once the order is free');
select test.ok(test.lo_result('waiter') = 'ok', 'and so does the cancellation: no deadlock');
select test.ok((select status from public.kitchen_tickets where id = :'k1') = 'cooking', 'the ticket is cooking');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o1' and kind = 'void') = 1, 'the kitchen got one void ticket for the cancelled dish');
select test.ok((select total = 3000 and item_count = 3 and kitchen_status = 'cooking' from public.orders where id = :'o1'), 'the order shows 3 dishes, 3 000 ֏, cooking');

-- ---------------------------------------------------------------------------
-- Lock order, step 2: in cancel_order_item the ticket comes before the line
-- ---------------------------------------------------------------------------
begin;
select 1 as held from public.kitchen_tickets where id = :'k1' for update \gset
select extensions.dblink_send_query('waiter', format('select test.lo_try(%L)',
  format('select api.cancel_order_item(%L, 1, %L)', :'i1', 'Եվս մեկը'))) as sent \gset
select test.ok(test.lo_wait_blocked(:wpid), 'the cancellation waits while the ticket row is held');
select test.ok(not test.lo_row_free('public.orders', :'o1'), 'by then it holds the order');
select test.ok(test.lo_row_free('public.order_items', :'i1'), 'and has not locked the line yet');
commit;
select test.ok(test.lo_result('waiter') = 'ok', 'it goes through once the ticket is free');
select test.ok((select total = 2000 and item_count = 2 from public.orders where id = :'o1'), 'the order shows 2 dishes, 2 000 ֏');

-- ---------------------------------------------------------------------------
-- Both at the same moment, 16 times: nobody is a deadlock victim
-- ---------------------------------------------------------------------------
select test.act_as('fa000000-0000-0000-0000-000000000001');
select api.place_waiter_order(:'lt2', 'ab000000-0000-0000-0000-000000000003', :'twenty'::jsonb) as o2 \gset
reset role;
select id as i2 from public.order_items where order_id = :'o2' \gset
select id as k2 from public.kitchen_tickets where order_id = :'o2' and kind = 'order' \gset
select api_result.r = 'ok' as started from extensions.dblink('kitchen', format('select test.lo_try(%L)',
  format('select api.set_ticket_status(%L, %L, %L)', :'k2', 'new', 'cooking'))) as api_result(r text) \gset

select set_config('test.lo_ticket', :'k2', false) is not null and set_config('test.lo_item', :'i2', false) is not null as kept \gset
create table test.lo_race (round integer, kitchen text, waiter text);
do $$
declare
  v_ticket uuid := current_setting('test.lo_ticket')::uuid;
  v_item uuid := current_setting('test.lo_item')::uuid;
  v_from text; v_to text;
begin
  for i in 1..16 loop
    if i % 2 = 1 then v_from := 'cooking'; v_to := 'ready'; else v_from := 'ready'; v_to := 'cooking'; end if;
    -- odd rounds: kitchen first; even rounds: waiter first
    if i % 2 = 1 then
      perform extensions.dblink_send_query('kitchen', format('select test.lo_try(%L)',
        format('select api.set_ticket_status(%L, %L, %L)', v_ticket, v_from, v_to)));
    end if;
    perform extensions.dblink_send_query('waiter', format('select test.lo_try(%L)',
      format('select api.cancel_order_item(%L, 1, %L)', v_item, 'round ' || i)));
    if i % 2 = 0 then
      perform extensions.dblink_send_query('kitchen', format('select test.lo_try(%L)',
        format('select api.set_ticket_status(%L, %L, %L)', v_ticket, v_from, v_to)));
    end if;
    insert into test.lo_race values (i, test.lo_result('kitchen'), test.lo_result('waiter'));
  end loop;
end $$;
select test.ok((select count(*) from test.lo_race where kitchen <> 'ok' or waiter <> 'ok') = 0,
  '16 simultaneous moves and cancellations all succeed: '
  || coalesce((select string_agg(distinct kitchen || ' / ' || waiter, '; ') from test.lo_race where kitchen <> 'ok' or waiter <> 'ok'), 'no errors'));
select test.ok((select count(*) from test.lo_race where kitchen like '40P01%' or waiter like '40P01%') = 0, 'no deadlock (40P01)');
select test.ok((select cancelled_quantity = 16 and line_total = 4000 from public.order_items where id = :'i2'), '16 of 20 dishes are cancelled, the line is 4 000 ֏');
select test.ok((select total = 4000 and item_count = 4 and kitchen_status = 'cooking' from public.orders where id = :'o2'), 'the order agrees, and is cooking again after 16 toggles');
select test.ok((select count(*) from public.kitchen_tickets where order_id = :'o2' and kind = 'void') = 16, 'each cancellation sent the kitchen a void ticket');
select test.ok((select sum(quantity) from public.kitchen_ticket_items ti join public.kitchen_tickets k on k.id = ti.ticket_id
                where k.order_id = :'o2' and k.kind = 'void') = 16, 'for one dish each');

select extensions.dblink_disconnect('kitchen') = 'OK' as closed \gset
select extensions.dblink_disconnect('waiter') = 'OK' as closed \gset
drop table test.lo_race;

\echo TICKET LOCK ORDER TESTS PASSED
