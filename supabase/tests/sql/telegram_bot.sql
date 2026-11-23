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
select test.ok(test.scr(test.tg_cb(5002, 'a:promo')) = 'soon', 'an action not built yet says coming soon');
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
-- Price, hide / show, close the kitchen early. The guest menu is the published
-- snapshot: every change here publishes (and undo publishes) as the linked owner.
-- ---------------------------------------------------------------------------
create function test.snap(p_loc uuid, p_item uuid) returns jsonb language sql as $$
  select v.snapshot -> 'items' -> p_item::text
  from public.locations l join public.menu_versions v on v.id = l.published_menu_version_id
  where l.id = p_loc
$$;
insert into public.menu_locations (restaurant_id, menu_id, location_id) values (:'ra', :'menu_a', :'la'), (:'rb', :'menu_b', :'lb');

-- The rate limit (60 presses a minute per chat) is reset between the sections, so the
-- counts here do not depend on the clock.
delete from private.rate_limits where key like 'tgbot:%';
-- price: a foreign café's item is refused by the list; a number is asked, shown, then applied
select test.tg_cb(5002, 'a:price') as p1 \gset
select test.ok(:'p1'::jsonb #>> '{bot,screen,type}' = 'pick_item', 'price starts with the item list');
select test.ok(test.tg_cb(5002, 'p:' || :'cap_b') #>> '{bot,screen,code}' = 'invalid', 'price: a foreign café''s item is refused');
select test.ok(test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,type}' = 'ask_number', 'price asks for the new number');
select test.tg_msg(5002, '900') as p3 \gset
select test.ok(:'p3'::jsonb #>> '{bot,screen,type}' = 'confirm' and :'p3'::jsonb #>> '{bot,screen,facts,old}' = '800'
  and :'p3'::jsonb #>> '{bot,screen,facts,new}' = '900', 'a typed number goes to the preview: 800 to 900');
select :'p3'::jsonb #>> '{bot,screen,token}' as ptok4 \gset
select test.ok((select price from public.items where id = :'cap_a') = 800, 'price: nothing changed before confirming');
select test.tg_cb(5002, 'k:' || :'ptok4') as p4 \gset
select test.ok(:'p4'::jsonb #>> '{bot,screen,type}' = 'done' and (:'p4'::jsonb #>> '{bot,screen,change,new,price}')::integer = 900,
  'confirming sets the price');
select test.ok((select price from public.items where id = :'cap_a') = 900, 'the item price is 900');
select test.ok(test.snap(:'la', :'cap_a') ->> 'price' = '900', 'the guest menu snapshot shows 900 at once');
select test.ok(test.tg_cb(5002, 'k:' || :'ptok4') #>> '{bot,screen,type}' = 'expired', 'price: a repeated confirm does nothing');
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as putok \gset
select test.tg_cb(5002, 'k:' || :'putok') as p5 \gset
select test.ok((:'p5'::jsonb #>> '{bot,screen,ok}')::boolean and (select price from public.items where id = :'cap_a') = 800,
  'undo restores the price');
select test.ok(test.snap(:'la', :'cap_a') ->> 'price' = '800', 'and the guest menu shows 800 again');

-- price changed by hand since the bot set it: undo refuses
select test.tg_cb(5002, 'a:price') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cap_a') is not null as x \gset
select test.tg_msg(5002, '950') #>> '{bot,screen,token}' as ptok5 \gset
select test.tg_cb(5002, 'k:' || :'ptok5') is not null as x \gset
update public.items set price = 960 where id = :'cap_a';
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as putok2 \gset
select test.tg_cb(5002, 'k:' || :'putok2') as p6 \gset
select test.ok(not (:'p6'::jsonb #>> '{bot,screen,ok}')::boolean and (select price from public.items where id = :'cap_a') = 960,
  'undo refuses when the price changed since');

-- price refused: an item with priced options, and a dish text the admin has not reviewed
insert into public.modifier_groups (restaurant_id) values (:'ra') returning id as grp_a \gset
insert into public.modifiers (restaurant_id, group_id, price_delta) values (:'ra', :'grp_a', 150);
insert into public.item_modifier_groups (restaurant_id, item_id, group_id) values (:'ra', :'esp_a', :'grp_a');
select test.tg_cb(5002, 'a:price') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'esp_a') is not null as x \gset
select test.ok(test.tg_msg(5002, '650') #>> '{bot,screen,code}' = 'has_options', 'price: an item with priced options is refused');
delete from public.item_modifier_groups where item_id = :'esp_a';
delete from public.modifiers where group_id = :'grp_a';
delete from public.modifier_groups where id = :'grp_a';
update public.item_translations set source = 'ai', reviewed_at = null where item_id = :'esp_a' and locale = 'en';
select test.tg_cb(5002, 'a:price') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'esp_a') is not null as x \gset
select test.ok(test.tg_msg(5002, '650') #>> '{bot,screen,code}' = 'unreviewed_ai', 'price: an unreviewed AI text stops it (the menu cannot publish)');
update public.item_translations set source = 'owner', reviewed_at = now() where item_id = :'esp_a' and locale = 'en';
select test.ok((select price from public.items where id = :'esp_a') = 700, 'the refused prices changed nothing');

-- hide: the preview shows the state now and after; confirm hides it from the guest menu
delete from private.rate_limits where key like 'tgbot:%';
select test.tg_cb(5002, 'a:hide') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cap_a') as h1 \gset
select test.ok(:'h1'::jsonb #>> '{bot,screen,type}' = 'confirm' and (:'h1'::jsonb #>> '{bot,screen,facts,visible_now}')::boolean
  and not (:'h1'::jsonb #>> '{bot,screen,facts,to_visible}')::boolean, 'hide previews visible now, hidden after');
select :'h1'::jsonb #>> '{bot,screen,token}' as htok \gset
select test.ok((select is_active from public.items where id = :'cap_a'), 'hide: nothing changed before confirming');
select test.tg_cb(5002, 'k:' || :'htok') #>> '{bot,screen,type}' as h2 \gset
select test.ok(:'h2' = 'done' and not (select is_active from public.items where id = :'cap_a'), 'confirming hides the item');
select test.ok(test.snap(:'la', :'cap_a') is null, 'the guest menu no longer shows it');
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as hutok \gset
select test.tg_cb(5002, 'k:' || :'hutok') as h3 \gset
select test.ok((:'h3'::jsonb #>> '{bot,screen,ok}')::boolean and (select is_active from public.items where id = :'cap_a'), 'undo shows it again');
select test.ok(test.snap(:'la', :'cap_a') ->> 'price' = '960', 'and the guest menu shows it again');

-- close the kitchen early: no inputs, so the preview comes at once
delete from private.rate_limits where key like 'tgbot:%';
select test.tg_cb(5002, 'a:close_kitchen') as k1 \gset
select test.ok(:'k1'::jsonb #>> '{bot,screen,type}' = 'confirm' and :'k1'::jsonb #>> '{bot,screen,action}' = 'close_kitchen',
  'close early asks first');
select test.ok(private.ordering_block(:'la') is null, 'the kitchen stays open before confirming');
select :'k1'::jsonb #>> '{bot,screen,token}' as ktok \gset
select test.tg_cb(5002, 'k:' || :'ktok') as k2 \gset
select test.ok(:'k2'::jsonb #>> '{bot,screen,type}' = 'done' and private.ordering_block(:'la') = 'kitchen_closed',
  'confirming closes the kitchen; guests are refused');
select test.ok((api.public_menu_status(:'la') -> 'closed') is not null, 'the guest status shows it closed');
select test.ok(test.tg_cb(5002, 'a:close_kitchen') #>> '{bot,screen,code}' = 'already_closed', 'closing twice is explained');
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as ktok2 \gset
select test.tg_cb(5002, 'k:' || :'ktok2') as k3 \gset
select test.ok((:'k3'::jsonb #>> '{bot,screen,ok}')::boolean and private.ordering_block(:'la') is null, 'undo reopens the kitchen');

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
-- Engine extension: section step, read-only kind, hidden items in the picker
-- ---------------------------------------------------------------------------
create function test.snapv(p_loc uuid) returns jsonb language sql as $$
  select v.snapshot from public.locations l join public.menu_versions v on v.id = l.published_menu_version_id where l.id = p_loc
$$;
delete from private.rate_limits where key like 'tgbot:%';

-- Category on / off: the section picker lists 8 per page, own café only
select test.ok((select kind = 'change' and steps = '{category}' and pick_inactive and ready from private.bot_actions where id = 'category'),
  'category is a ready action with a section step');
select test.tg_cb(5002, 'a:category') as c1 \gset
select test.ok(:'c1'::jsonb #>> '{bot,screen,type}' = 'pick_category' and :'c1'::jsonb #>> '{bot,screen,action}' = 'category'
  and (:'c1'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'cat_a', 'label', 'Coffee A', 'off', false))
  and not (:'c1'::jsonb #>> '{bot,screen,rows}') like '%' || :'cat_b' || '%', 'category starts with café A''s sections only');
insert into public.categories (restaurant_id, menu_id, sort) select :'ra', :'menu_a', 10 + g from generate_series(1, 9) g;
select test.tg_cb(5002, 'a:category') as c2 \gset
select test.ok(jsonb_array_length(:'c2'::jsonb #> '{bot,screen,rows}') = 8 and (:'c2'::jsonb #>> '{bot,screen,has_next}')::boolean
  and not (:'c2'::jsonb #>> '{bot,screen,has_prev}')::boolean, 'sections come 8 to a page (11 sections: next page exists)');
select test.tg_cb(5002, 'g:1') as c3 \gset
select test.ok(jsonb_array_length(:'c3'::jsonb #> '{bot,screen,rows}') = 3 and not (:'c3'::jsonb #>> '{bot,screen,has_next}')::boolean
  and (:'c3'::jsonb #>> '{bot,screen,has_prev}')::boolean, 'the last page has the other 3');
select test.ok(test.tg_cb(5002, 'p:' || :'cat_b') #>> '{bot,screen,code}' = 'invalid', 'category: a foreign café''s section id is refused');
select test.ok(test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,code}' = 'invalid', 'category: an item id is not a section');
select test.ok(test.tg_cb(5002, 'k:abcdefgh') #>> '{bot,screen,type}' = 'expired', 'category: a guessed confirm token does nothing');
-- the unreachable-from-here page is not a reason to lose the flow: pagination of a stale page is empty, not an error
delete from public.categories where restaurant_id = :'ra' and sort > 10;

-- preview, confirm required, apply, snapshot
delete from private.rate_limits where key like 'tgbot:%';
select test.tg_cb(5002, 'a:category') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cat_a') as c4 \gset
select test.ok(:'c4'::jsonb #>> '{bot,screen,type}' = 'confirm' and (:'c4'::jsonb #>> '{bot,screen,facts,active_now}')::boolean
  and not (:'c4'::jsonb #>> '{bot,screen,facts,to_active}')::boolean and :'c4'::jsonb #>> '{bot,screen,facts,category}' = 'Coffee A'
  and (:'c4'::jsonb #>> '{bot,screen,facts,items}')::int = 2, 'the preview shows the section, on now, off after, and its dishes');
select :'c4'::jsonb #>> '{bot,screen,token}' as ctok \gset
select test.ok((select is_active from public.categories where id = :'cat_a'), 'category: nothing changed before confirming');
select test.ok(test.tg_cb(5003, 'k:' || :'ctok') #>> '{bot,screen,type}' = 'expired', 'another café''s chat cannot confirm it');
select test.ok(test.snap(:'la', :'cap_a') is not null, 'the guest menu still shows the dishes');
select test.tg_cb(5002, 'k:' || :'ctok') as c5 \gset
select test.ok(:'c5'::jsonb #>> '{bot,screen,type}' = 'done' and not (:'c5'::jsonb #>> '{bot,screen,change,new,active}')::boolean
  and :'c5'::jsonb #>> '{bot,screen,change,label}' = 'Coffee A', 'confirming switches the section off');
select test.ok(not (select is_active from public.categories where id = :'cat_a'), 'categories.is_active is false');
select test.ok(test.snap(:'la', :'cap_a') is null and test.snapv(:'la')::text not like '%' || :'cat_a' || '%',
  'the guest menu snapshot dropped the section and its dishes at once');
select test.ok(test.tg_cb(5002, 'k:' || :'ctok') #>> '{bot,screen,type}' = 'expired', 'category: a repeated confirm does nothing');
select test.ok(exists (select 1 from public.audit_log where restaurant_id = :'ra' and action = 'bot.category' and data ->> 'via' = 'telegram')
  and exists (select 1 from public.audit_log where restaurant_id = :'ra' and action = 'menu.published' and actor_kind = 'system' order by created_at desc limit 1),
  'category: audited, and published as the linked account');
select test.ok(test.snapv(:'lb') is null or test.snapv(:'lb')::text not like '%' || :'cat_a' || '%', 'café B is untouched');

-- undo restores and republishes; undo refuses after a change by hand
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as cutok \gset
select test.tg_cb(5002, 'k:' || :'cutok') as c6 \gset
select test.ok((:'c6'::jsonb #>> '{bot,screen,ok}')::boolean and (select is_active from public.categories where id = :'cat_a'), 'undo switches the section back on');
select test.ok(test.snap(:'la', :'cap_a') ->> 'price' = '960', 'and the guest menu shows its dishes again');
select test.tg_cb(5002, 'a:category') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cat_a') #>> '{bot,screen,token}' as ctok2 \gset
select test.tg_cb(5002, 'k:' || :'ctok2') is not null as x \gset
update public.categories set is_active = true where id = :'cat_a';
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as cutok2 \gset
select test.tg_cb(5002, 'k:' || :'cutok2') as c7 \gset
select test.ok(:'c7'::jsonb #>> '{bot,screen,type}' = 'undo_result' and not (:'c7'::jsonb #>> '{bot,screen,ok}')::boolean
  and (select is_active from public.categories where id = :'cat_a'), 'category: undo refuses when the section changed since');
select test.ok(test.snap(:'la', :'cap_a') is null, 'and does not republish (the guest menu keeps the bot''s last state)');

-- an off section is listed (marked) and can be switched on
select test.tg_cb(5002, 'a:category') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cat_a') #>> '{bot,screen,token}' as ctok3 \gset
select test.tg_cb(5002, 'k:' || :'ctok3') is not null as x \gset
select test.ok(not (select is_active from public.categories where id = :'cat_a'), 'switched off again');
select test.tg_cb(5002, 'a:category') as c8 \gset
select test.ok((:'c8'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'cat_a', 'label', 'Coffee A', 'off', true)),
  'an off section is listed, marked off');
select test.tg_cb(5002, 'p:' || :'cat_a') as c9 \gset
select test.ok(not (:'c9'::jsonb #>> '{bot,screen,facts,active_now}')::boolean and (:'c9'::jsonb #>> '{bot,screen,facts,to_active}')::boolean,
  'its preview says off now, on after');
select test.tg_cb(5002, 'k:' || (:'c9'::jsonb #>> '{bot,screen,token}')) is not null as x \gset
select test.ok((select is_active from public.categories where id = :'cat_a') and test.snap(:'la', :'cap_a') ->> 'price' = '960',
  'confirming switches it on and republishes');
-- the sold-out picker still lists active sections and items only
update public.categories set is_active = false where id = :'cat_big';
select test.ok(not (test.tg_cb(5002, 'a:sold_out') #>> '{bot,screen,rows}') like '%' || :'cat_big' || '%', 'other actions do not list off sections');
update public.categories set is_active = true where id = :'cat_big';
-- an unreviewed AI text stops it (the menu cannot publish)
update public.category_translations set source = 'ai', reviewed_at = null where category_id = :'cat_a' and locale = 'en';
select test.tg_cb(5002, 'a:category') is not null as x \gset
select test.ok(test.tg_cb(5002, 'p:' || :'cat_a') #>> '{bot,screen,code}' = 'unreviewed_ai', 'category: an unreviewed AI text stops it');
update public.category_translations set source = 'owner', reviewed_at = now() where category_id = :'cat_a' and locale = 'en';

-- the explicit section step before an item step (test-only action)
delete from private.rate_limits where key like 'tgbot:%';
insert into private.bot_actions (id, sort, steps, ready) values ('testcat', 98, '{category,item}', true);
create function private.bot_prepare_testcat(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language sql as $$ select jsonb_build_object('item', p_data -> 'item_id', 'category', p_data -> 'category_id') $$;
create function private.bot_apply_testcat(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language sql as $$ select jsonb_build_object('entity', 'location', 'entity_id', p_loc, 'label', 'n', 'old', '{}'::jsonb, 'new', '{}'::jsonb) $$;
create function private.bot_undo_testcat(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language sql as $$ select true $$;
select test.ok(test.tg_cb(5002, 'a:testcat') #>> '{bot,screen,type}' = 'pick_category', 'a category step asks for the section even on a small menu');
select test.tg_cb(5002, 'p:' || :'cat_a') as tc1 \gset
select test.ok(:'tc1'::jsonb #>> '{bot,screen,type}' = 'pick_item' and :'tc1'::jsonb #>> '{bot,screen,category}' = 'Coffee A'
  and jsonb_array_length(:'tc1'::jsonb #> '{bot,screen,rows}') = 2, 'then only that section''s items');
select test.ok(test.tg_cb(5002, 'p:' || :'cat_b') #>> '{bot,screen,code}' = 'invalid', 'a foreign section is refused at the item step too');
select test.tg_cb(5002, 'a:testcat') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cat_big') is not null as x \gset
select test.ok(test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,code}' = 'invalid', 'an item of another section is refused');
select test.tg_cb(5002, 'a:testcat') is not null as x \gset
select test.tg_cb(5002, 'p:' || :'cat_a') is not null as x \gset
select test.ok(test.tg_cb(5002, 'p:' || :'cap_a') #>> '{bot,screen,type}' = 'confirm', 'section then item reaches the preview');
select test.ok(test.tg_cb(5002, 'b') #>> '{bot,screen,type}' = 'pick_item', 'back from the preview asks for the item again');
select test.ok(test.tg_cb(5002, 'b') #>> '{bot,screen,type}' = 'pick_category', 'back from the items returns to the sections');
select test.ok(test.tg_cb(5002, 'b') #>> '{bot,screen,type}' = 'menu', 'back from the first step returns to the menu');
delete from private.bot_actions where id = 'testcat';
drop function private.bot_prepare_testcat(public.notification_channels, uuid, jsonb);
drop function private.bot_apply_testcat(public.notification_channels, uuid, jsonb);
drop function private.bot_undo_testcat(public.notification_channels, uuid, private.bot_changes);
select test.fails($q$insert into private.bot_actions (id, sort, steps, kind) values ('testbad', 97, '{item}', 'read')$q$, '%bot_actions_read_no_steps%',
  'a read-only action cannot have steps');

-- Show a hidden item: the hide / show picker lists hidden items, marked
delete from private.rate_limits where key like 'tgbot:%';
update public.items set is_active = false where id = :'cap_a';
select test.tg_cb(5002, 'a:sold_out') as s1 \gset
select test.ok(not (:'s1'::jsonb #>> '{bot,screen,rows}') like '%' || :'cap_a' || '%', 'sold out lists active items only');
select test.ok(test.tg_cb(5002, 'a:hide') #>> '{bot,screen,type}' = 'pick_category', 'a long menu asks for the section first, hidden or not');
select test.tg_cb(5002, 'p:' || :'cat_a') as s2 \gset
select test.ok((:'s2'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'cap_a', 'label', 'Cappuccino', 'off', true))
  and (:'s2'::jsonb #> '{bot,screen,rows}') @> jsonb_build_array(jsonb_build_object('id', :'esp_a', 'label', 'Espresso', 'off', false)),
  'hide / show lists hidden items (marked) and shown ones');
update public.items set is_active = false where id = :'cap_b';
select test.ok(test.tg_cb(5002, 'p:' || :'cap_b') #>> '{bot,screen,code}' = 'invalid', 'a foreign café''s hidden item is refused');
update public.items set is_active = true where id = :'cap_b';
select test.tg_cb(5002, 'p:' || :'cap_a') as s3 \gset
select test.ok(:'s3'::jsonb #>> '{bot,screen,type}' = 'confirm' and not (:'s3'::jsonb #>> '{bot,screen,facts,visible_now}')::boolean
  and (:'s3'::jsonb #>> '{bot,screen,facts,to_visible}')::boolean, 'a hidden item previews hidden now, shown after');
select :'s3'::jsonb #>> '{bot,screen,token}' as shtok \gset
select test.ok(not (select is_active from public.items where id = :'cap_a'), 'show: nothing changed before confirming');
select test.tg_cb(5002, 'k:' || :'shtok') as s4 \gset
select test.ok(:'s4'::jsonb #>> '{bot,screen,type}' = 'done' and (:'s4'::jsonb #>> '{bot,screen,change,new,visible}')::boolean
  and (select is_active from public.items where id = :'cap_a'), 'confirming shows the item');
select test.ok(test.snap(:'la', :'cap_a') ->> 'price' = '960', 'and the guest menu has it at once');
select test.tg_cb(5002, 'u') #>> '{bot,screen,token}' as shutok \gset
select test.tg_cb(5002, 'k:' || :'shutok') as s5 \gset
select test.ok((:'s5'::jsonb #>> '{bot,screen,ok}')::boolean and not (select is_active from public.items where id = :'cap_a')
  and test.snap(:'la', :'cap_a') is null, 'undo hides it again and republishes');
update public.items set is_active = true where id = :'cap_a';

-- Today's report: read-only, own café, test orders and test bills left out
delete from private.rate_limits where key like 'tgbot:%';
select private.business_date(:'la') as bd \gset
select id as own_a from public.members where restaurant_id = :'ra' and role = 'owner' \gset
select id as own_b from public.members where restaurant_id = :'rb' and role = 'owner' \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', 'R1') returning id as rt1 \gset
insert into public.tables (restaurant_id, location_id, label) values (:'ra', :'la', 'R2') returning id as rt2 \gset
insert into public.table_sessions (restaurant_id, location_id, table_id, status) values (:'ra', :'la', :'rt1', 'closed') returning id as rs1 \gset
insert into public.table_sessions (restaurant_id, location_id, table_id, status) values (:'ra', :'la', :'rt2', 'closed') returning id as rs2 \gset
insert into public.orders (id, restaurant_id, location_id, table_session_id, created_by_member, source, fulfillment, status, locale, business_date,
                           number, idempotency_key, request_hash, placed_at, total, is_test) values
  ('bb0a0000-0000-0000-0000-000000000001', :'ra', :'la', :'rs1', :'own_a', 'waiter', 'takeaway', 'accepted', 'en', :'bd', 1, gen_random_uuid(), 'x', now(), 3000, false),
  ('bb0a0000-0000-0000-0000-000000000002', :'ra', :'la', null,   :'own_a', 'waiter', 'takeaway', 'accepted', 'en', :'bd', 2, gen_random_uuid(), 'x', now(), 2000, false),
  ('bb0a0000-0000-0000-0000-000000000003', :'ra', :'la', :'rs2', :'own_a', 'waiter', 'takeaway', 'accepted', 'en', :'bd', 3, gen_random_uuid(), 'x', now(), 9999, true),
  ('bb0a0000-0000-0000-0000-000000000004', :'ra', :'la', null,   :'own_a', 'waiter', 'takeaway', 'accepted', 'en', :'bd'::date - 1, 1, gen_random_uuid(), 'x', now() - interval '1 day', 777, false),
  ('bb0a0000-0000-0000-0000-000000000005', :'rb', :'lb', null,   :'own_b', 'waiter', 'takeaway', 'accepted', 'en', private.business_date(:'lb'), 1, gen_random_uuid(), 'x', now(), 1234, false);
insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, unit_price, quantity, cancelled_quantity, line_total) values
  (:'ra', 'bb0a0000-0000-0000-0000-000000000001', :'cap_a', '{"en":"Cappuccino"}', 1000, 3, 0, 3000),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', :'cap_a', '{"en":"Cappuccino"}', 1000, 1, 0, 1000),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', :'esp_a', '{"en":"Espresso"}', 500, 3, 1, 1000),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', null, '{"hy":"Extra 1","en":"Extra 1"}', 0, 1, 0, 0),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', null, '{"hy":"Extra 2","en":"Extra 2"}', 0, 1, 0, 0),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', null, '{"hy":"Extra 3","en":"Extra 3"}', 0, 1, 0, 0),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000002', null, '{"hy":"Extra 4","en":"Extra 4"}', 0, 1, 0, 0),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000003', :'cap_a', '{"en":"Cappuccino"}', 1000, 5, 0, 5000),
  (:'ra', 'bb0a0000-0000-0000-0000-000000000004', :'cap_a', '{"en":"Cappuccino"}', 1000, 7, 0, 7000),
  (:'rb', 'bb0a0000-0000-0000-0000-000000000005', :'cap_b', '{"en":"Cappuccino B"}', 1000, 2, 0, 2000);
insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status, subtotal, total, idempotency_key, closed_at) values
  (:'ra', :'la', :'rs1', :'bd', 1, 'paid', 4000, 4000, gen_random_uuid(), now()),
  (:'ra', :'la', :'rs2', :'bd', 2, 'paid', 9000, 9000, gen_random_uuid(), now());   -- a test bill: its only order is is_test
select count(*) as chg_before from private.bot_changes \gset
select test.ok(test.tg_cb(5001, 'a:report') = '{}'::jsonb, 'report: an unlinked chat gets no answer');
select test.tg_cb(5002, 'a:report') as r20 \gset
select test.ok(:'r20'::jsonb #>> '{bot,screen,type}' = 'read' and :'r20'::jsonb #>> '{bot,screen,action}' = 'report'
  and (:'r20'::jsonb #>> '{bot,message_id}') = '10', 'the report is a read-only screen (no confirm)');
select test.ok((:'r20'::jsonb #>> '{bot,screen,facts,orders}')::int = 2, 'orders: today''s real orders (test order and yesterday''s left out)');
select test.ok((:'r20'::jsonb #>> '{bot,screen,facts,revenue}')::int = 5000, 'revenue: 3000 + 2000');
select test.ok((:'r20'::jsonb #>> '{bot,screen,facts,avg_bill}')::int = 4000, 'average bill: the test bill (9000) is left out');
select test.ok(jsonb_array_length(:'r20'::jsonb #> '{bot,screen,facts,top}') = 5
  and :'r20'::jsonb #>> '{bot,screen,facts,top,0,name}' = 'Cappuccino' and (:'r20'::jsonb #>> '{bot,screen,facts,top,0,qty}')::int = 4
  and :'r20'::jsonb #>> '{bot,screen,facts,top,1,name}' = 'Espresso' and (:'r20'::jsonb #>> '{bot,screen,facts,top,1,qty}')::int = 2
  and :'r20'::jsonb #>> '{bot,screen,facts,top,4,name}' = 'Extra 3',
  'top 5 dishes by quantity (cancelled quantity taken off, test and yesterday''s lines left out)');
select test.ok(:'r20'::jsonb #>> '{bot,screen,facts,date}' = to_char(:'bd'::date, 'DD.MM'), 'the date is the business day');
select test.ok(not exists (select 1 from private.bot_pending where channel_id = (select id from public.notification_channels where telegram_chat_id = 5002))
  and (select count(*) from private.bot_changes) = :chg_before, 'a report leaves no pending step and no history');
select test.ok(test.tg_cb(5002, 'k:abcdefgh') #>> '{bot,screen,type}' = 'expired', 'and there is nothing to confirm');
select test.tg_cb(5003, 'a:report') as r21 \gset
select test.ok((:'r21'::jsonb #>> '{bot,screen,facts,orders}')::int = 1 and (:'r21'::jsonb #>> '{bot,screen,facts,revenue}')::int = 1234
  and :'r21'::jsonb #>> '{bot,screen,facts,top,0,name}' = 'Cappuccino B', 'café B''s chat sees café B''s numbers only');
update public.members set is_active = false where restaurant_id = :'ra' and user_id = 'bb000000-0000-0000-0000-000000000001';
select test.ok(test.tg_cb(5002, 'a:report') = '{}'::jsonb, 'report: silent when the linking owner is no longer active');
update public.members set is_active = true where restaurant_id = :'ra' and user_id = 'bb000000-0000-0000-0000-000000000001';
select test.tg_cb(5003, 'a:category') is not null as x \gset
select test.ok(not (test.tg_cb(5003, 'p:' || :'cat_a') #>> '{bot,screen,type}' = 'confirm'), 'café B''s chat cannot reach café A''s section');
delete from public.order_items where order_id::text like 'bb0a0000-%';
delete from public.bills where restaurant_id in (:'ra', :'rb') and number in (1, 2) and business_date = :'bd';
delete from public.orders where id::text like 'bb0a0000-%';
drop function test.snapv(uuid);

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
drop function test.snap(uuid, uuid);
