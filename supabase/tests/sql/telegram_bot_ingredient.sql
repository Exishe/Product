-- Telegram manager bot: "Ingredient out" (ADR-078) and the next-morning question.
-- Picker and typed search (hy / ru / en), confirm, effects identical to the kitchen
-- button, undo only if unchanged, foreign ids refused, the morning question once
-- per ingredient and day and only for yesterday's outages.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('bd000000-0000-0000-0000-000000000001', 'owner-bi-a@example.am', false),
  ('bd000000-0000-0000-0000-000000000002', 'owner-bi-b@example.am', false);

select test.act_as('bd000000-0000-0000-0000-000000000001');
select api.create_restaurant('Bot Ingr A', 'bi-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('bd000000-0000-0000-0000-000000000002');
select api.create_restaurant('Bot Ingr B', 'bi-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu \gset
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu', :'la');
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu', 1) returning id as cat \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat', 'en', 'All');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 1500) returning id as latte \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 3500) returning id as bowl \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat', 700) returning id as tea \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'latte', 'en', 'Latte'), (:'ra', :'bowl', 'en', 'Salmon bowl'), (:'ra', :'tea', 'en', 'Tea');

-- Ingredients of A: milk is used by two dishes (so it leads the list), salmon by one.
select test.act_as('bd000000-0000-0000-0000-000000000001');
select api.save_ingredient(:'ra', null, '{"hy": "Կաթ", "ru": "Молоко", "en": "Milk"}'::jsonb, 'ml') as milk \gset
select api.save_ingredient(:'ra', null, '{"hy": "Վարսակի կաթ", "ru": "Овсяное молоко", "en": "Oat milk"}'::jsonb, 'ml') as oat \gset
select api.save_ingredient(:'ra', null, '{"hy": "Սաղմոն", "ru": "Лосось", "en": "Salmon"}'::jsonb, 'g') as salmon \gset
select api.save_ingredient(:'ra', null, '{"hy": "Սերուցք", "en": "Cream"}'::jsonb, 'ml') as cream \gset
select count(api.save_ingredient(:'ra', null, format('{"hy": "Լրացուցիչ %s"}', lpad(g::text, 2, '0'))::jsonb, 'g')) as n_fill from generate_series(1, 9) g \gset
select api.set_item_ingredient(:'latte', :'milk', 200, true, :'oat', 300) is not null as l1 \gset
select api.set_item_ingredient(:'bowl', :'milk', 50, true, :'oat', -50) is not null as l2 \gset
select api.set_item_ingredient(:'bowl', :'salmon', 150, true) is not null as l3 \gset
select api.publish_menu(:'la') is not null as pub \gset
select test.act_as('bd000000-0000-0000-0000-000000000002');
select api.save_ingredient(:'rb', null, '{"hy": "Օտար Սաղմոն", "en": "Foreign salmon"}'::jsonb, 'g') as ing_b \gset
reset role;

-- Helpers (their own names; dropped at the end)
create function test.ti_cb(p_chat bigint, p_data text, p_from bigint default null, p_type text default 'private') returns jsonb
language sql as $$
  select api.telegram_update(private.secret('telegram_webhook_secret'), jsonb_build_object('update_id', 1,
    'callback_query', jsonb_build_object('id', 'cb1', 'data', p_data, 'from', jsonb_build_object('id', coalesce(p_from, p_chat)),
      'message', jsonb_build_object('message_id', 10, 'chat', jsonb_build_object('id', p_chat, 'type', p_type)))))
$$;
create function test.ti_msg(p_chat bigint, p_text text) returns jsonb
language sql as $$
  select api.telegram_update(private.secret('telegram_webhook_secret'), jsonb_build_object('update_id', 2,
    'message', jsonb_build_object('text', p_text, 'from', jsonb_build_object('id', p_chat, 'language_code', 'ru'),
      'chat', jsonb_build_object('id', p_chat, 'type', 'private', 'first_name', 'M'))))
$$;
create function test.ti_scr(p jsonb) returns text language sql as $$ select p #>> '{bot,screen,type}' $$;
-- labels of the picker rows, in order
create function test.ti_rows(p jsonb) returns text language sql as $$
  select coalesce(string_agg(r ->> 'label', '|' order by n), '') from jsonb_array_elements(p #> '{bot,screen,rows}') with ordinality t(r, n)
$$;
create function test.ti_out(p_loc uuid, p_ing uuid) returns boolean language sql as $$
  select exists (select 1 from public.ingredient_outages where location_id = p_loc and ingredient_id = p_ing and until > now())
$$;

-- Link the two owners (the existing one-time code flow) and choose English.
select test.act_as('bd000000-0000-0000-0000-000000000001');
select api.create_telegram_link(:'ra') ->> 'code' as code_a \gset
select test.act_as('bd000000-0000-0000-0000-000000000002');
select api.create_telegram_link(:'rb') ->> 'code' as code_b \gset
reset role;
select test.ti_msg(6001, '/start ' || :'code_a') is not null as x \gset
select test.ti_msg(6002, '/start ' || :'code_b') is not null as x \gset
select test.ti_cb(6001, 'l:en') is not null as x \gset
select test.ti_cb(6002, 'l:en') is not null as x \gset

-- ---------------------------------------------------------------------------
-- Registry and access
-- ---------------------------------------------------------------------------
select test.ok((select ready and steps = '{ingredient}' and kind = 'change' from private.bot_actions where id = 'ingredient_out'),
  'ingredient_out is a ready action with one ingredient step');
select test.ok((select sort from private.bot_actions where id = 'help') > (select sort from private.bot_actions where id = 'ingredient_out'),
  'and it comes before Help');
select test.ok(test.ti_cb(6003, 'a:ingredient_out') = '{}'::jsonb and test.ti_msg(6003, 'salmon') = '{}'::jsonb
  and test.ti_cb(6003, 'y:' || :'salmon') = '{}'::jsonb and test.ti_cb(6003, 'n:' || :'salmon') = '{}'::jsonb,
  'an unlinked chat gets nothing, for the action, a typed search and the morning buttons');
select test.ok(not exists (select 1 from private.bot_pending where channel_id not in (select id from public.notification_channels where telegram_chat_id in (6001, 6002))),
  'and no state is created for it');
select test.ti_msg(6001, 'salmon') #>> '{bot,screen,type}' as typed_without_action \gset
select test.ok(:'typed_without_action' = 'menu', 'typed text outside the action is just the menu');

-- ---------------------------------------------------------------------------
-- The list: same order as api.search_ingredients, 8 per page, paging
-- ---------------------------------------------------------------------------
select test.ti_cb(6001, 'a:ingredient_out') as s1 \gset
select test.ok(test.ti_scr(:'s1'::jsonb) = 'pick_ingredient' and jsonb_array_length((:'s1'::jsonb) #> '{bot,screen,rows}') = 8
  and (:'s1'::jsonb) #>> '{bot,screen,has_next}' = 'true' and (:'s1'::jsonb) #>> '{bot,screen,has_prev}' = 'false',
  'the action opens a list of 8 ingredients with a next page');
select test.act_as('bd000000-0000-0000-0000-000000000001');
select coalesce(string_agg(s.id::text, '|' order by s.n), '') as api_order2
from (select a.id, row_number() over () as n from (select * from api.search_ingredients(:'la') limit 8) a) s \gset
reset role;
select coalesce(string_agg(r ->> 'id', '|' order by n), '') as bot_order
from jsonb_array_elements((:'s1'::jsonb) #> '{bot,screen,rows}') with ordinality t(r, n) \gset
select test.ok(:'bot_order' = :'api_order2', 'the order is the one of api.search_ingredients (most used first)');
select test.ok(split_part(test.ti_rows(:'s1'::jsonb), '|', 1) = 'Milk' and split_part(test.ti_rows(:'s1'::jsonb), '|', 2) = 'Salmon',
  'milk (two dishes) leads, then salmon (one), in the manager''s language');
select test.ti_cb(6001, 'g:1') as s2 \gset
select test.ok(test.ti_scr(:'s2'::jsonb) = 'pick_ingredient' and jsonb_array_length((:'s2'::jsonb) #> '{bot,screen,rows}') = 5
  and (:'s2'::jsonb) #>> '{bot,screen,has_next}' = 'false' and (:'s2'::jsonb) #>> '{bot,screen,has_prev}' = 'true', 'page two has the other 5');
select test.ok(test.ti_scr(test.ti_cb(6001, 'g:99')) = 'pick_ingredient' and jsonb_array_length(test.ti_cb(6001, 'g:99') #> '{bot,screen,rows}') = 0,
  'a page past the end is empty, not an error');
select test.ok(test.ti_scr(test.ti_cb(6001, 'g:x')) = 'failed', 'a malformed page is refused');
select test.ok(not exists (select 1 from public.ingredient_outages where location_id = :'la'), 'listing changes nothing');

-- ---------------------------------------------------------------------------
-- Typed search: three languages, case-insensitive, substring, no match, too long
-- ---------------------------------------------------------------------------
select test.ti_cb(6001, 'g:0') is not null as x \gset
select test.ti_msg(6001, 'salmon') as t1 \gset
select test.ok(test.ti_scr(:'t1'::jsonb) = 'pick_ingredient' and test.ti_rows(:'t1'::jsonb) = 'Salmon' and (:'t1'::jsonb) #>> '{bot,screen,q}' = 'salmon',
  'typing "salmon" finds Salmon');
select test.ok(test.ti_rows(test.ti_msg(6001, 'SALMON')) = 'Salmon' and test.ti_rows(test.ti_msg(6001, '  alm  ')) = 'Salmon',
  'case and surrounding spaces do not matter, a part of the word is enough');
select test.ok(test.ti_rows(test.ti_msg(6001, 'ЛОСОСЬ')) = 'Salmon', 'Russian, upper case');
select test.ok(test.ti_rows(test.ti_msg(6001, 'лосос')) = 'Salmon', 'Russian, part of the word');
select test.ok(test.ti_rows(test.ti_msg(6001, 'ՍԱՂՄՈՆ')) = 'Salmon', 'Armenian, upper case');
select test.ok(test.ti_rows(test.ti_msg(6001, 'ղմո')) = 'Salmon', 'Armenian, part of the word');
select test.ok(test.ti_rows(test.ti_msg(6001, 'milk')) = 'Milk|Oat milk', 'a word in two names finds both (most used first)');
select test.ti_msg(6001, 'zzzz') as t_none \gset
select test.ok(test.ti_scr(:'t_none'::jsonb) = 'pick_ingredient' and jsonb_array_length((:'t_none'::jsonb) #> '{bot,screen,rows}') = 0
  and (:'t_none'::jsonb) #>> '{bot,screen,q}' = 'zzzz', 'no match: an empty list that remembers the text');
select test.ok(test.ti_rows(test.ti_msg(6001, 'Foreign')) = '' and test.ti_rows(test.ti_msg(6001, 'Օտար')) = '',
  'another café''s ingredient is never found');
select test.ti_msg(6001, repeat('a', 41)) as t_long \gset
select test.ok(test.ti_scr(:'t_long'::jsonb) = 'bad_search', 'more than 40 characters is refused, not cut');
select test.ok(test.ti_scr(test.ti_msg(6001, '/start')) = 'bad_search', 'a command is refused');
select test.ok(test.ti_rows(test.ti_msg(6001, repeat('a', 40))) = '' , '40 characters are fine');
select test.ok(test.ti_rows(test.ti_msg(6001, E'sal​mon')) = 'Salmon' and test.ti_rows(test.ti_msg(6001, E'sal\nmon')) = '',
  'invisible characters are dropped; a newline becomes a space');
select test.ok((select data ->> 'q' from private.bot_pending p join public.notification_channels c on c.id = p.channel_id where c.telegram_chat_id = 6001) = 'sal mon',
  'the stored text is the cleaned one');
-- Back clears the search, then leaves
select test.ti_cb(6001, 'b') as b1 \gset
select test.ok(test.ti_scr(:'b1'::jsonb) = 'pick_ingredient' and jsonb_array_length((:'b1'::jsonb) #> '{bot,screen,rows}') = 8
  and (:'b1'::jsonb) #>> '{bot,screen,q}' is null, 'Back clears the search and shows the whole list');
select test.ok(test.ti_scr(test.ti_cb(6001, 'b')) = 'menu', 'Back again goes to the menu');
delete from private.rate_limits where key like 'tgbot:%';

-- ---------------------------------------------------------------------------
-- Preview, confirm required, apply = the kitchen's core
-- ---------------------------------------------------------------------------
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_msg(6001, 'milk') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'milk') as c1 \gset
select test.ok(test.ti_scr(:'c1'::jsonb) = 'confirm' and (:'c1'::jsonb) #>> '{bot,screen,facts,ingredient}' = 'Milk'
  and (:'c1'::jsonb) #>> '{bot,screen,facts,to_out}' = 'true', 'tapping milk previews "out?"');
select test.ok(not test.ti_out(:'la', :'milk'), 'nothing changed before the confirm');
select test.ok(test.ti_scr(test.ti_cb(6001, 'k:wrongtok')) = 'expired' and not test.ti_out(:'la', :'milk'), 'a wrong token changes nothing');
select (:'c1'::jsonb) #>> '{bot,screen,token}' as tok1 \gset
-- (a wrong token leaves the preview; start again to be sure of a fresh token)
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'milk') #>> '{bot,screen,token}' as tok1 \gset
select test.ti_cb(6001, 'k:' || :'tok1') as d1 \gset
select test.ok(test.ti_scr(:'d1'::jsonb) = 'done' and test.ti_out(:'la', :'milk'), 'confirming marks milk out');
select test.ok((select source = 'bot' and set_by_user = 'bd000000-0000-0000-0000-000000000001' and set_by_member is not null
                  and until = private.business_day_end(:'la')
                from public.ingredient_outages where location_id = :'la' and ingredient_id = :'milk'),
  'with the kitchen core''s data: source bot, the linked account, until the business day ends');
select test.ok((:'d1'::jsonb) #>> '{bot,screen,change,new,hidden}' = '0' and (:'d1'::jsonb) #>> '{bot,screen,change,new,substituted}' = '2',
  'the result counts the dishes: none hidden, the latte and the bowl get oat milk');
select test.ok((:'d1'::jsonb) #>> '{bot,screen,change,label}' = 'Milk', 'and names it in the manager''s language');

-- Effects are exactly the kitchen button's: compare the overlay and the guest menu
select private.outage_overlay(:'la') as ov_bot \gset
select api.public_menu('bi-cafe-a', 'main') as menu_bot \gset
select test.ok((:'menu_bot'::jsonb) ? 'substitutions' and (:'menu_bot'::jsonb) #>> array['substitutions', :'latte', 'to', 'name', 'en'] = 'Oat milk'
  and (:'menu_bot'::jsonb) #>> array['substitutions', :'latte', 'price_delta'] = '300', 'the guest menu shows the latte with oat milk, +300');
delete from public.ingredient_outages where location_id = :'la';
select test.act_as('bd000000-0000-0000-0000-000000000001');
select api.set_ingredient_out(:'la', :'milk', true) is not null as k1 \gset
reset role;
select test.ok(private.outage_overlay(:'la') = :'ov_bot'::jsonb, 'the overlay is identical to the one made by api.set_ingredient_out');
select test.ok(api.public_menu('bi-cafe-a', 'main') - 'outages' = (:'menu_bot'::jsonb) - 'outages', 'and so is the guest menu');
select test.ok((select count(*) from public.ingredient_outages where location_id = :'la') = 1, 'one row per ingredient');
delete from public.ingredient_outages where location_id = :'la';

-- Salmon: the bowl has no substitute, so it is hidden
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_msg(6001, 'лосось') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'salmon') #>> '{bot,screen,token}' as tok2 \gset
select test.ti_cb(6001, 'k:' || :'tok2') as d2 \gset
select test.ok((:'d2'::jsonb) #>> '{bot,screen,change,new,hidden}' = '1' and (:'d2'::jsonb) #>> '{bot,screen,change,new,substituted}' = '0',
  'salmon out: one dish hidden, none with a substitute');
select test.ok(not ((api.public_menu('bi-cafe-a', 'main') #> '{menu,items}') ? :'bowl'::text), 'the salmon bowl is gone from the guest menu');
-- the same ingredient again offers "back"
select test.ti_cb(6001, 'a:ingredient_out') as s3 \gset
select test.ok(exists (select 1 from jsonb_array_elements((:'s3'::jsonb) #> '{bot,screen,rows}') r where r ->> 'id' = :'salmon' and (r ->> 'off')::boolean),
  'an ingredient that is out is marked in the list');
select test.ti_cb(6001, 'p:' || :'salmon') as c3 \gset
select test.ok((:'c3'::jsonb) #>> '{bot,screen,facts,to_out}' = 'false', 'tapping it offers "back in"');
select test.ti_cb(6001, 'k:' || ((:'c3'::jsonb) #>> '{bot,screen,token}')) as d3 \gset
select test.ok(test.ti_scr(:'d3'::jsonb) = 'done' and not test.ti_out(:'la', :'salmon') and ((api.public_menu('bi-cafe-a', 'main') #> '{menu,items}') ? :'bowl'::text),
  'confirming brings it back and the dish returns');
select test.ok((:'d3'::jsonb) #>> '{bot,screen,change,new,out}' = 'false' and not ((:'d3'::jsonb) #> '{bot,screen,change,new}' ? 'hidden'), 'with no counts');
select test.ok((select count(*) from private.bot_changes where action = 'ingredient_out') = 3 and exists
  (select 1 from public.audit_log where action = 'bot.ingredient_out') and exists (select 1 from public.audit_log where action = 'ingredient.back'),
  'history and audit rows are written (the core''s own entry too)');
delete from private.rate_limits where key like 'tgbot:%';

-- A confirm token is single use
select test.ok(test.ti_scr(test.ti_cb(6001, 'k:' || :'tok2')) = 'expired' and not test.ti_out(:'la', :'salmon'), 'a confirm cannot be repeated');

-- ---------------------------------------------------------------------------
-- Foreign and forged ids
-- ---------------------------------------------------------------------------
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ok(test.ti_scr(test.ti_cb(6001, 'p:' || :'ing_b')) = 'failed', 'a foreign café''s ingredient id is refused by the picker');
select test.ok(test.ti_scr(test.ti_cb(6001, 'p:' || gen_random_uuid())) = 'failed', 'so is an unknown id');
select test.ok(test.ti_scr(test.ti_cb(6001, 'p:not-a-uuid')) = 'failed', 'and a malformed one');
select test.ok(test.ti_scr(test.ti_cb(6001, 'c:10')) = 'failed' and test.ti_scr(test.ti_cb(6001, 's')) = 'failed', 'other verbs do nothing here');
select test.ok(not exists (select 1 from public.ingredient_outages where restaurant_id = :'rb'), 'nothing happened to café B');
-- forged pending data: the database functions check again
select test.ok((select private.bot_prepare_ingredient_out(private.bot_channel(6001), :'la', jsonb_build_object('ingredient_id', :'ing_b')) ->> 'error') = 'no_ingredient',
  'prepare refuses a foreign ingredient');
select format($f$select private.bot_apply_ingredient_out(private.bot_channel(6001), %L, jsonb_build_object('ingredient_id', %L, 'ing_out', true))$f$, :'la', :'ing_b') as q2 \gset
select test.fails(:'q2', 'forbidden', 'apply refuses a foreign ingredient');
select format($f$select private.bot_apply_ingredient_out(private.bot_channel(6001), %L, '{}'::jsonb)$f$, :'la') as q3 \gset
select test.fails(:'q3', 'forbidden', 'and one with no ingredient');
select test.ok(not exists (select 1 from public.ingredient_outages where restaurant_id = :'rb'), 'café B is untouched');
-- café B's chat cannot reach A's ingredients either
select test.ti_cb(6002, 'a:ingredient_out') is not null as x \gset
select test.ok(test.ti_scr(test.ti_cb(6002, 'p:' || :'milk')) = 'failed' and test.ti_rows(test.ti_msg(6002, 'milk')) = '', 'café B''s chat sees none of A''s ingredients');
select test.ok(test.ti_rows(test.ti_msg(6002, 'foreign')) = 'Foreign salmon', 'only its own');
select test.ti_cb(6002, 'x') is not null as x \gset
delete from private.rate_limits where key like 'tgbot:%';

-- ---------------------------------------------------------------------------
-- Undo: only while the state is what the bot set
-- ---------------------------------------------------------------------------
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'cream') #>> '{bot,screen,token}' as tok4 \gset
select test.ti_cb(6001, 'k:' || :'tok4') is not null as x \gset
select test.ok(test.ti_out(:'la', :'cream'), 'cream is out');
select test.ti_cb(6001, 'u') #>> '{bot,screen,token}' as utok \gset
select test.ok(test.ti_cb(6001, 'k:' || :'utok') #>> '{bot,screen,ok}' = 'true' and not test.ti_out(:'la', :'cream'), 'undo puts cream back');
-- changed by someone else in the meantime
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'cream') #>> '{bot,screen,token}' as tok5 \gset
select test.ti_cb(6001, 'k:' || :'tok5') is not null as x \gset
select test.act_as('bd000000-0000-0000-0000-000000000001');
select api.set_ingredient_out(:'la', :'cream', false) is null as admin_back \gset
reset role;
select test.ti_cb(6001, 'u') #>> '{bot,screen,token}' as utok2 \gset
select test.ok(test.ti_cb(6001, 'k:' || :'utok2') #>> '{bot,screen,ok}' = 'false' and not test.ti_out(:'la', :'cream'),
  'undo refuses when someone already changed it, and changes nothing');
-- undo of "back in" puts it out again, only if still back
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'cream') #>> '{bot,screen,token}' as tok6 \gset
select test.ti_cb(6001, 'k:' || :'tok6') is not null as x \gset
select test.ti_cb(6001, 'a:ingredient_out') is not null as x \gset
select test.ti_cb(6001, 'p:' || :'cream') #>> '{bot,screen,token}' as tok7 \gset
select test.ti_cb(6001, 'k:' || :'tok7') is not null as x \gset
select test.ok(not test.ti_out(:'la', :'cream'), 'cream is back');
select test.ti_cb(6001, 'u') #>> '{bot,screen,token}' as utok3 \gset
select test.ok(test.ti_cb(6001, 'k:' || :'utok3') #>> '{bot,screen,ok}' = 'true' and test.ti_out(:'la', :'cream'), 'undoing a "back" marks it out again');
delete from public.ingredient_outages where location_id = :'la';
delete from private.rate_limits where key like 'tgbot:%';

-- ---------------------------------------------------------------------------
-- Who may reach the functions
-- ---------------------------------------------------------------------------
select test.act_as('bd000000-0000-0000-0000-000000000001');
select test.fails(format('select private.bot_apply_ingredient_out(null, %L, ''{}''::jsonb)', :'la'), '%permission denied%', 'a signed-in user cannot call the bot functions');
select test.fails('select * from private.search_ingredients_core(null, null, null, 5)', '%permission denied%', 'nor the shared search core');
select test.fails('select private.enqueue_ingredient_morning()', '%permission denied%', 'nor the morning job');
select count(*) as n_api from api.search_ingredients(:'la', 'milk') \gset
reset role;
select test.ok(:'n_api' = 2, 'api.search_ingredients still works for the owner (same core)');
select test.ok(exists (select 1 from cron.job where jobname = 'pativ-bot-ingredient-morning' and schedule = '*/5 * * * *'), 'the morning job is scheduled every five minutes');

-- ---------------------------------------------------------------------------
-- The next-morning question
-- ---------------------------------------------------------------------------
select private.business_day_end(:'la') - interval '1 day' as open_at \gset
select (:'open_at'::timestamptz + interval '10 minutes') as now_a \gset
-- yesterday: salmon and oat milk were out until this opening; cream the day before; milk is out again today
insert into public.ingredient_outages (restaurant_id, location_id, ingredient_id, out_at, until, source) values
  (:'ra', :'la', :'salmon', :'open_at'::timestamptz - interval '10 hours', :'open_at'::timestamptz, 'kitchen'),
  (:'ra', :'la', :'oat', :'open_at'::timestamptz - interval '9 hours', :'open_at'::timestamptz, 'kitchen'),
  (:'ra', :'la', :'cream', :'open_at'::timestamptz - interval '34 hours', :'open_at'::timestamptz - interval '1 day', 'kitchen'),
  (:'ra', :'la', :'milk', :'open_at'::timestamptz - interval '10 hours', :'open_at'::timestamptz + interval '1 day', 'kitchen');
select test.ok(private.enqueue_ingredient_morning(:'open_at'::timestamptz - interval '1 hour') = 0, 'before the day starts nothing is asked');
select test.ok(private.enqueue_ingredient_morning(:'open_at'::timestamptz + interval '31 minutes') = 0, 'nor after the 30 minute window');
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 2, 'in the window: salmon and oat milk, one chat each (not cream, not milk)');
select test.ok((select count(*) from private.ingredient_morning_prompts where location_id = :'la') = 2
  and not exists (select 1 from private.ingredient_morning_prompts where ingredient_id in (:'cream', :'milk')),
  'one row per ingredient and day; an outage from two days ago or one set again today is not asked about');
select test.ok((select count(*) from public.notification_outbox where event = 'ingredient.morning') = 2
  and not exists (select 1 from public.notification_outbox o join public.notification_channels c on c.id = o.channel_id
                  where o.event = 'ingredient.morning' and c.telegram_chat_id <> 6001), 'only café A''s linked chat is asked');
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 0 and private.enqueue_ingredient_morning(:'now_a'::timestamptz + interval '5 minutes') = 0,
  'running again (or five minutes later) asks nothing twice');
-- a day later only what ended at THAT opening is asked about (milk), never salmon again
select private.enqueue_ingredient_morning(:'now_a'::timestamptz + interval '1 day') as n_next \gset
select test.ok(:'n_next'::int = 1 and exists (select 1 from private.ingredient_morning_prompts where ingredient_id = :'milk' and day = (select max(day) from private.ingredient_morning_prompts)),
  'a day later the question is for what was out yesterday, once');
delete from public.notification_outbox where dedupe_key like 'ingredient.morning:%' and (payload ->> 'ingredient_id') = :'milk';
delete from private.ingredient_morning_prompts where ingredient_id = :'milk';
delete from public.ingredient_outages where ingredient_id in (:'milk', :'cream');

-- What the chat receives: text in its language, two symbol buttons carrying the id
select (select payload from public.notification_outbox where event = 'ingredient.morning' and (payload ->> 'ingredient_id') = :'salmon') as pl \gset
select test.ok(private.render_notification('ingredient.morning', :'pl'::jsonb, 'en') like '«Salmon» was out yesterday. Is it back today?%'
  and private.render_notification('ingredient.morning', :'pl'::jsonb, 'ru') like '«Лосось» вчера не было. Сегодня есть?%'
  and private.render_notification('ingredient.morning', :'pl'::jsonb, 'hy') like '«Սաղմոն»-ը երեկ չկար։ Այսօր կա՞։%',
  'the question is written in English, Russian and Armenian');
select test.ok(private.render_notification('weekly.digest', '{"enough": false, "orders": 1, "min_orders": 20, "from": "2026-11-09", "to": "2026-11-15"}'::jsonb, 'en') is not null
  and private.render_notification('channel.stopped', '{}'::jsonb, 'en') is not null, 'other notification texts still render');
select vault.create_secret('test-token', 'telegram_bot_token', 'test') is not null as x \gset
select private.deliver_outbox() as delivered \gset
select body as sent from net._stub_requests where url like '%/sendMessage' and body ->> 'text' like '«Salmon»%' order by id desc limit 1 \gset
select test.ok(:'delivered'::int >= 2, 'the outbox sends the questions');
select test.ok((:'sent'::jsonb) #>> '{reply_markup,inline_keyboard,0,0,callback_data}' = 'y:' || :'salmon'
  and (:'sent'::jsonb) #>> '{reply_markup,inline_keyboard,0,1,callback_data}' = 'n:' || :'salmon'
  and (:'sent'::jsonb) #>> '{reply_markup,inline_keyboard,0,0,text}' = '✅' and (:'sent'::jsonb) #>> '{reply_markup,inline_keyboard,0,1,text}' = '❌'
  and length('n:' || :'salmon') <= 64, 'with a yes and a no button, 38 bytes of data each');
select test.ok(not exists (select 1 from net._stub_requests where url like '%/sendMessage' and body ->> 'text' not like '«%' and body ? 'reply_markup'),
  'no other message got buttons');
delete from vault.secrets where name = 'telegram_bot_token';

-- The buttons: forged or foreign data does nothing
select test.ok(test.ti_scr(test.ti_cb(6001, 'n:' || :'ing_b')) = 'failed' and test.ti_scr(test.ti_cb(6001, 'y:' || gen_random_uuid())) = 'failed'
  and test.ti_scr(test.ti_cb(6001, 'n:' || :'tea')) = 'failed' and test.ti_scr(test.ti_cb(6001, 'n:bad')) = 'failed',
  'a foreign ingredient, an unknown id, an id nobody asked about and a malformed id are refused');
select test.ok(test.ti_cb(6002, 'n:' || :'salmon') #>> '{bot,screen,type}' = 'failed' and not test.ti_out(:'la', :'salmon'), 'café B''s chat cannot answer A''s question');
select test.ok(test.ti_cb(6003, 'n:' || :'salmon') = '{}'::jsonb and not test.ti_out(:'la', :'salmon'), 'an unlinked chat is silent');
select test.ok((select count(*) from private.ingredient_morning_prompts where answered_at is not null) = 0, 'nothing was answered by those');

-- Yes = nothing to do, once
select test.ti_cb(6001, 'y:' || :'oat') as y1 \gset
select test.ok(test.ti_scr(:'y1'::jsonb) = 'morning_back' and (:'y1'::jsonb) #>> '{bot,screen,label}' = 'Oat milk'
  and not test.ti_out(:'la', :'oat') and (select answer from private.ingredient_morning_prompts where ingredient_id = :'oat') = 'back',
  '"back today" changes nothing and is recorded');
select test.ok(test.ti_cb(6001, 'n:' || :'oat') #>> '{bot,screen,code}' = 'answered' and not test.ti_out(:'la', :'oat'),
  'it can be answered only once (a second press cannot mark it out)');
select test.ok(not exists (select 1 from private.bot_changes where entity_id = :'oat'), 'and a "yes" leaves no history row');

-- No = out again for today, through the same core, with history and undo
select count(*) as ch_before from private.bot_changes where action = 'ingredient_out' \gset
select test.ti_cb(6001, 'n:' || :'salmon') as n1 \gset
select test.ok(test.ti_scr(:'n1'::jsonb) = 'done' and (:'n1'::jsonb) #>> '{bot,screen,action}' = 'ingredient_out'
  and test.ti_out(:'la', :'salmon') and (:'n1'::jsonb) #>> '{bot,screen,change,new,hidden}' = '1',
  '"not yet" marks salmon out again for today and says what it hides');
select test.ok((select source = 'bot' and until = private.business_day_end(:'la') from public.ingredient_outages where location_id = :'la' and ingredient_id = :'salmon'),
  'with the same data as any outage (source bot, until the next opening)');
select test.ok((select count(*) from private.bot_changes where action = 'ingredient_out') = :'ch_before'::int + 1
  and (select answer from private.ingredient_morning_prompts where ingredient_id = :'salmon') = 'out', 'a history row is written and the question is answered');
select test.ok(test.ti_cb(6001, 'n:' || :'salmon') #>> '{bot,screen,code}' = 'answered', 'pressing again does nothing more');
select test.ti_cb(6001, 'u') #>> '{bot,screen,token}' as utok4 \gset
select test.ok(test.ti_cb(6001, 'k:' || :'utok4') #>> '{bot,screen,ok}' = 'true' and not test.ti_out(:'la', :'salmon'), 'and it can be undone');
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 0, 'answered questions are not sent again');

-- Another day's button no longer works
update private.ingredient_morning_prompts set day = day - 1 where ingredient_id = :'salmon';
select test.ok(test.ti_cb(6001, 'n:' || :'salmon') #>> '{bot,screen,code}' = 'invalid', 'a question of an earlier business day is gone');

-- Chats that are not eligible are not asked: no language chosen, linking owner gone
delete from public.notification_outbox where event = 'ingredient.morning';
delete from private.ingredient_morning_prompts;
update public.notification_channels set bot_locale = null where telegram_chat_id = 6001;
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 0, 'a chat that never chose a language is not asked');
update public.notification_channels set bot_locale = 'en' where telegram_chat_id = 6001;
update public.members set is_active = false where restaurant_id = :'ra' and user_id = 'bd000000-0000-0000-0000-000000000001';
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 0, 'nor one whose linking owner is no longer active');
update public.members set is_active = true where restaurant_id = :'ra' and user_id = 'bd000000-0000-0000-0000-000000000001';
-- (salmon's row went with the undo above, so only oat milk is left to ask about)
select test.ok(private.enqueue_ingredient_morning(:'now_a'::timestamptz) = 1, 'and asked again when they are');

-- Retention: yesterday's rows are still there when the question is asked
select private.purge_old_outages();
select test.ok((select count(*) from public.ingredient_outages where ingredient_id = :'oat') = 1, 'the nightly purge keeps yesterday''s outage rows (it deletes after two days)');

drop function test.ti_cb(bigint, text, bigint, text);
drop function test.ti_msg(bigint, text);
drop function test.ti_scr(jsonb);
drop function test.ti_rows(jsonb);
drop function test.ti_out(uuid, uuid);
