-- Telegram manager bot (ADR-069): who may use it, the confirm step, undo,
-- pending-step expiry, tampered callback data, and the two reference actions.
-- Runs after 90-smoke-test.sql and reuses its test.* helpers.
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);

insert into auth.users (id, email, is_anonymous) values
  ('bb000000-0000-0000-0000-000000000001', 'owner-bot-a@example.am', false),
  ('bb000000-0000-0000-0000-000000000002', 'owner-bot-b@example.am', false);

select test.act_as('bb000000-0000-0000-0000-000000000001');
select api.create_restaurant('Bot A', 'bot-cafe-a', 'Main', 'Owner A') as ra \gset
select test.act_as('bb000000-0000-0000-0000-000000000002');
select api.create_restaurant('Bot B', 'bot-cafe-b', 'Main', 'Owner B') as rb \gset
reset role;
select id as la from public.locations where restaurant_id = :'ra' \gset
select id as lb from public.locations where restaurant_id = :'rb' \gset

insert into public.menus (restaurant_id, internal_name) values (:'ra', 'Main') returning id as menu_a \gset
insert into public.menus (restaurant_id, internal_name) values (:'rb', 'Main') returning id as menu_b \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu_a', 1) returning id as cat_a \gset
insert into public.categories (restaurant_id, menu_id, sort) values (:'rb', :'menu_b', 1) returning id as cat_b \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values
  (:'ra', :'cat_a', 'en', 'Coffee A'), (:'rb', :'cat_b', 'en', 'Coffee B');
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat_a', 800) returning id as cap_a \gset
insert into public.items (restaurant_id, category_id, price) values (:'ra', :'cat_a', 700) returning id as esp_a \gset
insert into public.items (restaurant_id, category_id, price) values (:'rb', :'cat_b', 900) returning id as cap_b \gset
insert into public.item_translations (restaurant_id, item_id, locale, name) values
  (:'ra', :'cap_a', 'en', 'Cappuccino'), (:'ra', :'esp_a', 'en', 'Espresso'), (:'rb', :'cap_b', 'en', 'Cappuccino B');

-- Test helpers: what Telegram would POST.
create function test.tg_cb(p_chat bigint, p_data text, p_from bigint default null, p_type text default 'private') returns jsonb
language sql as $$
  select api.telegram_update(private.secret('telegram_webhook_secret'), jsonb_build_object('update_id', 1,
    'callback_query', jsonb_build_object('id', 'cb1', 'data', p_data, 'from', jsonb_build_object('id', coalesce(p_from, p_chat)),
      'message', jsonb_build_object('message_id', 10, 'chat', jsonb_build_object('id', p_chat, 'type', p_type)))))
$$;
create function test.tg_msg(p_chat bigint, p_text text) returns jsonb
language sql as $$
  select api.telegram_update(private.secret('telegram_webhook_secret'), jsonb_build_object('update_id', 2,
    'message', jsonb_build_object('text', p_text, 'from', jsonb_build_object('id', p_chat, 'language_code', 'ru'),
      'chat', jsonb_build_object('id', p_chat, 'type', 'private', 'first_name', 'M'))))
$$;
create function test.scr(p jsonb) returns text language sql as $$ select p #>> '{bot,screen,type}' $$;

-- ---------------------------------------------------------------------------
-- An unlinked chat gets nothing and changes nothing
-- ---------------------------------------------------------------------------
select test.ok(test.tg_msg(5001, 'hello') = '{}'::jsonb, 'an unlinked chat gets no answer to text');
select test.ok(test.tg_cb(5001, 'a:sold_out') = '{}'::jsonb, 'an unlinked chat gets no answer to a button');
select test.ok(test.tg_cb(5001, 'k:abcdefgh') = '{}'::jsonb, 'nor to a forged confirm');
select test.ok(not exists (select 1 from private.bot_pending) and not exists (select 1 from private.bot_changes),
  'and no state is created for it');
select test.fails($q$select api.telegram_update('wrong', '{"update_id": 1, "callback_query": {}}'::jsonb)$q$, 'forbidden',
  'a wrong webhook secret is refused for button presses too');

-- Link café A's owner and café B's owner (the existing one-time code flow)
select test.act_as('bb000000-0000-0000-0000-000000000001');
select api.create_telegram_link(:'ra') ->> 'code' as code_a \gset
select test.act_as('bb000000-0000-0000-0000-000000000002');
select api.create_telegram_link(:'rb') ->> 'code' as code_b \gset
reset role;
select test.ok(test.tg_msg(5002, '/start ' || :'code_a') ? 'reply', 'café A links chat 5002');
select test.ok(test.tg_msg(5003, '/start ' || :'code_b') ? 'reply', 'café B links chat 5003');
select test.ok(not exists (select 1 from private.bot_pending), 'linking starts no flow');

-- ---------------------------------------------------------------------------
-- Language on first use, then the menu
-- ---------------------------------------------------------------------------
select test.ok(test.scr(test.tg_msg(5002, '/menu')) = 'language', 'first use asks for the language');
select test.ok(test.scr(test.tg_cb(5002, 'a:sold_out')) = 'language', 'and no action starts before it is chosen');
select test.ok(test.tg_cb(5002, 'l:xx') = '{}'::jsonb, 'an unknown language code is ignored');
select test.ok(test.scr(test.tg_cb(5002, 'l:en')) = 'menu', 'choosing a language shows the menu');
select test.ok((select bot_locale = 'en' and locale = 'en' from public.notification_channels where telegram_chat_id = 5002), 'stored on the linked account');
select test.ok(test.scr(test.tg_cb(5003, 'l:en')) = 'menu', 'café B picks its language');
select test.ok(test.scr(test.tg_cb(5002, 'l:choose')) = 'language' and test.scr(test.tg_cb(5002, 'l:en')) = 'menu', 'the menu''s Language button asks again');
select test.ok(test.scr(test.tg_msg(5002, 'blah')) = 'menu', 'free text answers with the menu');
select test.ok(test.scr(test.tg_cb(5002, 'a:price')) = 'soon', 'an action not built yet says coming soon');
select test.ok(test.tg_cb(5002, 'a:../x') = '{}'::jsonb and test.tg_cb(5002, repeat('a', 70)) = '{}'::jsonb, 'malformed callback data is ignored');
select test.ok(test.tg_cb(5002, 'a:sold_out', 999) = '{}'::jsonb, 'a press whose sender is not the chat is ignored');
select test.ok(test.tg_cb(-100123, 'a:sold_out', -100123, 'group') = '{}'::jsonb, 'groups are ignored');
select test.ok(test.tg_cb(5002, 'a:help') #>> '{bot,screen,type}' = 'help', 'help is there');

-- ---------------------------------------------------------------------------
-- Sold out: nothing changes before the confirmation
-- ---------------------------------------------------------------------------
select test.tg_cb(5002, 'a:sold_out') as r1 \gset
select test.ok(:'r1'::jsonb #>> '{bot,screen,type}' = 'pick_item', 'sold out starts with the item list');
select test.ok((:'r1'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'cap_a', 'label', 'Cappuccino'))
  and not ((:'r1'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'cap_b', 'label', 'Cappuccino B'))),
  'the list holds café A''s dishes only');
select test.ok((:'r1'::jsonb #>> '{bot,message_id}') = '10' and (:'r1'::jsonb #>> '{bot,chat_id}') = '5002', 'the answer names the chat and the message to edit');

-- tampered ids
select test.ok(test.tg_cb(5002, 'p:' || :'cap_b') #>> '{bot,screen,code}' = 'invalid', 'a foreign café''s item id is refused');
select test.ok(test.tg_cb(5002, 'p:not-a-uuid') #>> '{bot,screen,code}' = 'invalid', 'a malformed id is refused');
select test.ok(test.tg_cb(5002, 'p:' || gen_random_uuid()) #>> '{bot,screen,code}' = 'invalid', 'an unknown id is refused');
select test.ok(test.tg_cb(5002, 'c:inf') #>> '{bot,screen,code}' = 'invalid', 'a choice is refused where none was asked');
select test.ok(test.tg_cb(5002, 'k:abcdefgh') #>> '{bot,screen,type}' = 'expired', 'a guessed confirm token does nothing');

select test.tg_cb(5002, 'p:' || :'cap_a') as r2 \gset
select test.ok(:'r2'::jsonb #>> '{bot,screen,type}' = 'confirm' and (:'r2'::jsonb #>> '{bot,screen,facts,to_sold_out}')::boolean
  and :'r2'::jsonb #>> '{bot,screen,facts,item}' = 'Cappuccino', 'picking an item shows the preview');
select :'r2'::jsonb #>> '{bot,screen,token}' as tok \gset
select test.ok(not exists (select 1 from public.stop_list where item_id = :'cap_a'), 'nothing changed before confirming');
select test.ok(test.tg_cb(5002, 'x') #>> '{bot,screen,type}' = 'menu', 'cancel goes back to the menu');
select test.ok(test.tg_cb(5002, 'k:' || :'tok') #>> '{bot,screen,type}' = 'expired', 'and the cancelled flow can no longer be confirmed');
select test.ok(not exists (select 1 from public.stop_list where item_id = :'cap_a'), 'still nothing changed');

-- confirm for real
select test.tg_cb(5002, 'a:sold_out') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,token}' as tok \gset
select test.ok(test.tg_cb(5003, 'k:' || :'tok') #>> '{bot,screen,type}' = 'expired', 'another café''s chat cannot confirm it');
select test.tg_cb(5002, 'k:' || :'tok') as r3 \gset
select test.ok(:'r3'::jsonb #>> '{bot,screen,type}' = 'done' and (:'r3'::jsonb #>> '{bot,screen,change,new,sold_out}')::boolean, 'confirming marks it sold out');
select test.ok(exists (select 1 from public.stop_list where item_id = :'cap_a' and location_id = :'la' and until > now()), 'a stop-list row until the end of the business day');
select test.ok((api.public_menu_status(:'la') -> 'sold_out') @> to_jsonb(array[:'cap_a'::uuid]), 'the guest menu status shows it at once');
select test.ok(test.tg_cb(5002, 'k:' || :'tok') #>> '{bot,screen,type}' = 'expired', 'a repeated confirm does nothing');
select test.ok((select count(*) from private.bot_changes where action = 'sold_out') = 1, 'one change is logged, not two');
select test.ok(exists (select 1 from public.audit_log where restaurant_id = :'ra' and action = 'bot.sold_out' and data ->> 'via' = 'telegram'), 'and audited');
select test.ok(not exists (select 1 from public.stop_list where restaurant_id = :'rb'), 'café B is untouched');

-- Expired pending step
select test.tg_cb(5002, 'a:sold_out') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'esp_a') #>> '{bot,screen,token}' as tok2 \gset
update private.bot_pending set expires_at = now() - interval '1 second';
select test.ok(test.tg_cb(5002, 'k:' || :'tok2') #>> '{bot,screen,type}' = 'expired', 'an expired pending step is ignored');
select test.ok(not exists (select 1 from public.stop_list where item_id = :'esp_a'), 'and changes nothing');

-- ---------------------------------------------------------------------------
-- Undo
-- ---------------------------------------------------------------------------
select test.tg_cb(5002, 'u') as r4 \gset
select test.ok(:'r4'::jsonb #>> '{bot,screen,type}' = 'undo_confirm' and :'r4'::jsonb #>> '{bot,screen,change,label}' = 'Cappuccino', 'undo asks first');
select test.ok(exists (select 1 from public.stop_list where item_id = :'cap_a'), 'nothing is undone before the confirmation');
select :'r4'::jsonb #>> '{bot,screen,token}' as utok \gset
select test.tg_cb(5002, 'k:' || :'utok') as r5 \gset
select test.ok((:'r5'::jsonb #>> '{bot,screen,ok}')::boolean and not exists (select 1 from public.stop_list where item_id = :'cap_a'), 'undo puts the dish back in stock');
select test.ok((select count(*) from private.bot_changes where action = 'undo' and undo_of is not null) = 1
  and (select undone_at is not null from private.bot_changes where action = 'sold_out'), 'the undo is logged and the original marked');
select test.ok(test.tg_cb(5002, 'u') #>> '{bot,screen,type}' = 'nothing_to_undo', 'nothing left to undo');

-- changed since: sold out via the bot, then the café changes it by hand
select test.tg_cb(5002, 'a:sold_out') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'esp_a') #>> '{bot,screen,token}' as tok3 \gset
select test.tg_cb(5002, 'k:' || :'tok3') is not null as x \gset
delete from public.stop_list where item_id = :'esp_a';
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as utok2 \gset
select test.tg_cb(5002, 'k:' || :'utok2') as r6 \gset
select test.ok(:'r6'::jsonb #>> '{bot,screen,type}' = 'undo_result' and not (:'r6'::jsonb #>> '{bot,screen,ok}')::boolean,
  'undo refuses when the value changed since');
select test.ok((select undone_at is null from private.bot_changes where entity_id = :'esp_a' and action = 'sold_out'), 'and the change stays not undone');
select test.ok(test.scr(test.tg_cb(5003, 'u')) = 'nothing_to_undo', 'café B''s chat cannot undo café A''s change');
select test.ok(jsonb_array_length(test.tg_cb(5002, 'h') #> '{bot,screen,rows}') = 3, 'history lists the changes, newest first');

-- ---------------------------------------------------------------------------
-- Pause ordering
-- ---------------------------------------------------------------------------
select test.tg_cb(5002, 'a:pause') as r7 \gset
select test.ok(:'r7'::jsonb #>> '{bot,screen,type}' = 'choice' and :'r7'::jsonb #> '{bot,screen,choices}' = '["10","20","30","inf","resume"]'::jsonb, 'pause asks for minutes by buttons');
select test.ok(test.tg_cb(5002, 'c:99') #>> '{bot,screen,code}' = 'invalid', 'a made-up choice is refused');
select test.ok(test.tg_cb(5002, 'c:resume') #>> '{bot,screen,code}' = 'not_paused', 'resume while not paused is explained');
select test.tg_cb(5002, 'a:pause') is not null as x \gset
select test.tg_cb(5002, 'c:20') #>> '{bot,screen,token}' as ptok \gset
select test.ok(not private.ordering_block(:'la') is not distinct from 'ordering_paused', 'nothing is paused before the confirmation');
select test.ok(test.tg_cb(5003, 'k:' || :'ptok') #>> '{bot,screen,type}' = 'expired', 'another café''s chat cannot confirm it');
select test.tg_cb(5002, 'k:' || :'ptok') as r8 \gset
select test.ok(:'r8'::jsonb #>> '{bot,screen,type}' = 'done' and (:'r8'::jsonb #>> '{bot,screen,change,new,paused}')::boolean, 'confirming pauses ordering');
select test.ok(private.ordering_block(:'la') = 'ordering_paused', 'the database now refuses guest orders');
select test.ok((api.public_menu_status(:'la') -> 'paused') is not null
  and (select ordering_paused_until between now() + interval '19 minutes' and now() + interval '21 minutes' from public.locations where id = :'la'),
  'the guest menu status shows a 20 minute pause');
select test.ok(private.ordering_block(:'lb') is null, 'café B is not paused');
select test.ok(exists (select 1 from public.audit_log where restaurant_id = :'ra' and action = 'ordering.paused' and actor_kind = 'system'), 'the shared rule audited it');
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as utok3 \gset
select test.tg_cb(5002, 'k:' || :'utok3') as r13 \gset
select test.ok((:'r13'::jsonb #>> '{bot,screen,ok}')::boolean and private.ordering_block(:'la') is null, 'undo resumes ordering');
-- resume by button
select test.tg_cb(5002, 'a:pause') is not null as x \gset
select test.tg_cb(5002, 'c:inf') #>> '{bot,screen,token}' as ptok2 \gset
select test.tg_cb(5002, 'k:' || :'ptok2') is not null as x \gset
select test.ok((select ordering_paused and ordering_paused_until is null from public.locations where id = :'la'), 'until I resume has no end');
select test.ok((test.tg_cb(5002, 'a:pause') #>> '{bot,screen,context,paused}')::boolean, 'the menu shows it is paused');
select test.tg_cb(5002, 'c:resume') #>> '{bot,screen,token}' as ptok3 \gset
select test.tg_cb(5002, 'k:' || :'ptok3') is not null as x \gset
select test.ok(private.ordering_block(:'la') is null, 'resume works');
-- the admin function still works as before
select test.act_as('bb000000-0000-0000-0000-000000000001');
select api.set_ordering_pause(:'la', true, 5) is not null as p5 \gset
select api.set_ordering_pause(:'la', false) as p0 \gset
reset role;
select test.ok(:'p5' and private.ordering_block(:'la') is null, 'api.set_ordering_pause is unchanged for the admin');

-- ---------------------------------------------------------------------------
-- The number step, with a test-only action (shows how little an action needs)
-- ---------------------------------------------------------------------------
insert into private.bot_actions (id, sort, steps, ready) values ('testnum', 99, '{number}', true);
create function private.bot_prepare_testnum(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language sql as $$ select jsonb_build_object('number', p_data -> 'number') $$;
create function private.bot_apply_testnum(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language sql as $$ select jsonb_build_object('entity', 'location', 'entity_id', p_loc, 'label', 'n', 'old', '{"n":0}'::jsonb, 'new', jsonb_build_object('n', p_data -> 'number')) $$;
create function private.bot_undo_testnum(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language sql as $$ select true $$;
select test.ok(test.tg_cb(5002, 'a:testnum') #>> '{bot,screen,type}' = 'ask_number', 'a number step asks for a number');
select test.ok(test.tg_msg(5002, 'abc') #>> '{bot,screen,type}' = 'bad_number', 'text that is not a number is asked again');
select test.tg_msg(5002, '1 200 AMD') as r9 \gset
select test.ok(:'r9'::jsonb #>> '{bot,screen,type}' = 'confirm' and :'r9'::jsonb #>> '{bot,screen,facts,number}' = '1200', 'a typed number goes to the preview');
update private.bot_pending set expires_at = now() - interval '1 second';
select test.ok(test.scr(test.tg_msg(5002, '500')) = 'menu', 'a number typed after the step expired is just text');
select test.ok(not exists (select 1 from private.bot_changes where action = 'testnum'), 'and changed nothing');
delete from private.bot_actions where id = 'testnum';
drop function private.bot_prepare_testnum(public.notification_channels, uuid, jsonb);
drop function private.bot_apply_testnum(public.notification_channels, uuid, jsonb);
drop function private.bot_undo_testnum(public.notification_channels, uuid, private.bot_changes);

-- ---------------------------------------------------------------------------
-- Long menus: category first, 8 per page
-- ---------------------------------------------------------------------------
insert into public.categories (restaurant_id, menu_id, sort) values (:'ra', :'menu_a', 2) returning id as cat_big \gset
insert into public.category_translations (restaurant_id, category_id, locale, name) values (:'ra', :'cat_big', 'en', 'Big');
with n as (insert into public.items (restaurant_id, category_id, price, sort)
           select :'ra', :'cat_big', 100, g from generate_series(1, 30) g returning id, sort)
insert into public.item_translations (restaurant_id, item_id, locale, name) select :'ra', id, 'en', 'Dish ' || sort from n;
select test.tg_cb(5002, 'a:sold_out') as r10 \gset
select test.ok(:'r10'::jsonb #>> '{bot,screen,type}' = 'pick_category' and jsonb_array_length(:'r10'::jsonb #> '{bot,screen,rows}') = 2,
  'a long menu starts with its categories');
select test.tg_cb(5002, 'p:' || :'cat_big') as r11 \gset
select test.ok(:'r11'::jsonb #>> '{bot,screen,type}' = 'pick_item' and jsonb_array_length(:'r11'::jsonb #> '{bot,screen,rows}') = 8
  and (:'r11'::jsonb #>> '{bot,screen,has_next}')::boolean and not (:'r11'::jsonb #>> '{bot,screen,has_prev}')::boolean, 'items come 8 to a page');
select test.tg_cb(5002, 'g:3') as r12 \gset
select test.ok(jsonb_array_length(:'r12'::jsonb #> '{bot,screen,rows}') = 6 and not (:'r12'::jsonb #>> '{bot,screen,has_next}')::boolean, 'the last page has the rest (30 = 3 x 8 + 6)');
select test.ok(test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,code}' = 'invalid', 'an item outside the chosen category is refused');
select test.ok(test.tg_cb(5002, 'b') #>> '{bot,screen,type}' = 'pick_category', 'back from the items returns to the categories');
select test.ok(test.tg_cb(5002, 'b') #>> '{bot,screen,type}' = 'menu', 'back from the first step returns to the menu');

-- ---------------------------------------------------------------------------
-- The spinner call, and who stays linked
-- ---------------------------------------------------------------------------
select vault.create_secret('test-token', 'telegram_bot_token', 'test') is not null as x \gset
select test.tg_cb(5002, 'm') is not null as x \gset
select test.ok((select count(*) from net._stub_requests where url like '%/answerCallbackQuery') = 1, 'a button press is answered with answerCallbackQuery');
delete from vault.secrets where name = 'telegram_bot_token';

update public.members set is_active = false where restaurant_id = :'ra' and user_id = 'bb000000-0000-0000-0000-000000000001';
select test.ok(test.tg_cb(5002, 'm') = '{}'::jsonb and test.tg_msg(5002, 'x') = '{}'::jsonb, 'when the linking owner is no longer active the bot goes silent');
update public.members set is_active = true where restaurant_id = :'ra' and user_id = 'bb000000-0000-0000-0000-000000000001';
select test.ok(test.scr(test.tg_cb(5002, 'm')) = 'menu', 'and works again when they are');
select test.tg_msg(5002, '/stop') is not null as x \gset
select test.ok(test.tg_cb(5002, 'm') = '{}'::jsonb, '/stop switches the bot off for the chat');

drop function test.tg_cb(bigint, text, bigint, text);
drop function test.tg_msg(bigint, text);
drop function test.scr(jsonb);
