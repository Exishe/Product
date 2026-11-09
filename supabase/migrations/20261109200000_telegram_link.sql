-- Milestone 8.1: linking the owner's Telegram (ADR-016, ADR-038, ADR-040).
-- The bot token and the webhook secret live in Vault. The webhook reaches the
-- database through a small Next.js route that passes the update and Telegram's
-- secret header to api.telegram_update. Replies go back in the webhook's own
-- HTTP answer, so linking needs no outgoing call. Alert texts are rendered
-- here, in the channel's language.

-- -----------------------------------------------------------------------------
-- Vault helpers
-- -----------------------------------------------------------------------------
-- A secret by name, or null when it isn't there (an empty value counts as missing).
create function private.secret(p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select nullif(btrim(s.decrypted_secret), '') from vault.decrypted_secrets s where s.name = p_name limit 1
$$;

-- Creates a random secret inside the database unless it exists; nobody sees it.
create function private.ensure_random_secret(p_name text, p_description text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = p_name) then
    perform vault.create_secret(private.b64url(extensions.gen_random_bytes(32)), p_name, p_description);
  end if;
end $$;

select private.ensure_random_secret('telegram_webhook_secret',
  'Telegram sends it in X-Telegram-Bot-Api-Secret-Token; checked by api.telegram_update');

-- -----------------------------------------------------------------------------
-- Formatting and texts
-- -----------------------------------------------------------------------------
-- Same output as src/lib/format/money.ts: «6 500 ֏» (no-break spaces) in hy and
-- ru, "AMD 6,500" in en.
create function private.format_amd(p_amount integer, p_locale public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select case when p_locale = 'en'
              then 'AMD' || chr(160) || to_char(p_amount, 'FM999,999,999,990')
              else replace(to_char(p_amount, 'FM999,999,999,990'), ',', chr(160)) || chr(160) || '֏' end
$$;

-- A name from a {"hy": …, "ru": …, "en": …} object, falling back hy → ru → en.
create function private.pick_name(p_names jsonb, p_locale public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select coalesce(nullif(p_names ->> p_locale::text, ''), nullif(p_names ->> 'hy', ''),
                  nullif(p_names ->> 'ru', ''), nullif(p_names ->> 'en', ''), '?')
$$;

-- Telegram's language_code ("ru", "en-US") to ours; null when it isn't one of ours.
create function private.telegram_locale(p_code text) returns public.app_locale
language sql immutable set search_path = '' as $$
  select case lower(left(coalesce(p_code, ''), 2)) when 'hy' then 'hy' when 'ru' then 'ru' when 'en' then 'en' end::public.app_locale
$$;

-- Every message the bot or a push notification shows. Armenian follows the
-- hy-writer rules (։ ՝ « »). Unknown kinds are errors, never an empty message.
create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_table text := nullif(p_payload ->> 'table', '');
  v_no text := '№' || coalesce(p_payload ->> 'number', '?');
  v_where text;
  v_top text;
  v_lines text[];
begin
  -- "table 5" or, for an order without a table, its number
  v_where := case
    when v_table is null then case when l = 'en' then '#' || coalesce(p_payload ->> 'number', '?') else v_no end
    when l = 'hy' then 'սեղան ' || v_table
    when l = 'ru' then 'стол ' || v_table
    else 'table ' || v_table end;

  case p_kind
  when 'brand' then
    return case l when 'hy' then 'Պատիվ' when 'ru' then 'Патив' else 'Pativ' end;

  when 'order.placed' then
    return case l
      when 'hy' then 'Նոր պատվեր՝ '
      when 'ru' then 'Новый заказ: '
      else 'New order: ' end
      || v_where || ', ' || private.format_amd((p_payload ->> 'total')::integer, l);

  when 'order.overdue' then
    v_where := v_where || case when v_table is null then '' when l = 'en' then ', #' || coalesce(p_payload ->> 'number', '?') else ', ' || v_no end;
    return case l
      when 'hy' then 'Պատվերն ուշանում է՝ ' || v_where || ', ' || (p_payload ->> 'minutes') || ' րոպե'
      when 'ru' then 'Заказ задерживается: ' || v_where || ', ' || (p_payload ->> 'minutes') || ' мин'
      else 'Order running late: ' || v_where || ', ' || (p_payload ->> 'minutes') || ' min' end;

  when 'station.offline' then
    return case l
      when 'hy' then '«' || (p_payload ->> 'label') || '» էկրանն անջատված է ' || (p_payload ->> 'minutes') || ' րոպե։'
      when 'ru' then 'Экран «' || (p_payload ->> 'label') || '» не на связи ' || (p_payload ->> 'minutes') || ' мин.'
      else 'Screen "' || (p_payload ->> 'label') || '" offline for ' || (p_payload ->> 'minutes') || ' min.' end;

  when 'order.comped' then
    v_where := v_where || case when v_table is null then '' when l = 'en' then ', #' || coalesce(p_payload ->> 'number', '?') else ', ' || v_no end;
    return case l
      when 'hy' then 'Չեղարկվել է մատուցելուց հետո՝ '
      when 'ru' then 'Отмена после подачи: '
      else 'Cancelled after serving: ' end
      || v_where || ', ' || private.pick_name(p_payload -> 'item', l) || ' × ' || (p_payload ->> 'quantity')
      || ', ' || private.format_amd((p_payload ->> 'amount')::integer, l);

  when 'day.summary' then
    select string_agg(private.pick_name(t -> 'name', l) || ' (' || (t ->> 'quantity') || ')', ', ' order by o)
    into v_top
    from jsonb_array_elements(coalesce(p_payload -> 'top', '[]'::jsonb)) with ordinality as x(t, o);
    v_lines := array[
      case l when 'hy' then 'Օրվա ամփոփում՝ ' when 'ru' then 'Итоги дня: ' else 'Day summary: ' end
        || case when l = 'en' then to_char((p_payload ->> 'date')::date, 'FMDD Mon YYYY')
                else to_char((p_payload ->> 'date')::date, 'DD.MM.YYYY') end,
      case l when 'hy' then 'Պատվերներ՝ ' when 'ru' then 'Заказы: ' else 'Orders: ' end || (p_payload ->> 'orders'),
      case l when 'hy' then 'Վաճառք՝ ' when 'ru' then 'Выручка: ' else 'Revenue: ' end
        || private.format_amd((p_payload ->> 'revenue')::integer, l)];
    if (p_payload ->> 'average_bill') is not null then
      v_lines := v_lines || (case l when 'hy' then 'Միջին հաշիվ՝ ' when 'ru' then 'Средний чек: ' else 'Average bill: ' end
        || private.format_amd((p_payload ->> 'average_bill')::integer, l));
    end if;
    v_lines := v_lines || (case l when 'hy' then 'Չեղարկված ուտեստներ՝ ' when 'ru' then 'Отменённые блюда: ' else 'Cancelled dishes: ' end
      || coalesce(p_payload ->> 'cancelled', '0'));
    if (p_payload ->> 'kitchen_minutes') is not null then
      v_lines := v_lines || (case l when 'hy' then 'Խոհանոցի միջին ժամանակը՝ ' when 'ru' then 'Среднее время кухни: ' else 'Average kitchen time: ' end
        || (p_payload ->> 'kitchen_minutes') || case l when 'hy' then ' րոպե' else ' min' end);
    end if;
    if v_top is not null then
      v_lines := v_lines || (case l when 'hy' then 'Ամենաշատ պատվիրվածը՝ ' when 'ru' then 'Чаще всего заказывали: ' else 'Top dishes: ' end || v_top);
    end if;
    return array_to_string(v_lines, E'\n');

  when 'channel.test' then
    return case l
      when 'hy' then 'Փորձնական ծանուցում։ Եթե սա տեսնում եք, ամեն ինչ աշխատում է։'
      when 'ru' then 'Тестовое уведомление. Если вы его видите, всё работает.'
      else 'Test notification. If you can see this, everything works.' end;

  when 'channel.linked' then
    return case l
      when 'hy' then 'Պատրաստ է։ Այս զրույցում կստանաք ծանուցումներ՝ «' || (p_payload ->> 'restaurant') || '»։ Անջատելու համար գրեք /stop։'
      when 'ru' then 'Готово. В этот чат будут приходить уведомления: «' || (p_payload ->> 'restaurant') || '». Чтобы отключить, напишите /stop.'
      else 'Done. This chat will get alerts for "' || (p_payload ->> 'restaurant') || '". To turn them off, send /stop.' end;

  when 'link.invalid' then
    return case l
      when 'hy' then 'Այս կոդն այլևս չի գործում։ Կառավարման էջում սեղմեք «Միացնել Telegram» և բացեք նոր հղումը։'
      when 'ru' then 'Этот код больше не действует. Нажмите «Подключить Telegram» в админке и откройте новую ссылку.'
      else 'This code no longer works. Press "Connect Telegram" in the admin and open the new link.' end;

  when 'channel.stopped' then
    return case l
      when 'hy' then 'Ծանուցումներն անջատված են։ Կրկին միացնելու համար կառավարման էջում սեղմեք «Միացնել Telegram»։'
      when 'ru' then 'Уведомления отключены. Чтобы включить снова, нажмите «Подключить Telegram» в админке.'
      else 'Alerts are off. To turn them back on, press "Connect Telegram" in the admin.' end;

  when 'bot.hello' then
    return case l
      when 'hy' then 'Բարև։ Այս բոտն ուղարկում է սրճարանի ծանուցումները։ Միացնելու համար կառավարման էջում սեղմեք «Միացնել Telegram»։'
      when 'ru' then 'Здравствуйте. Этот бот присылает уведомления кафе. Чтобы подключить его, нажмите «Подключить Telegram» в админке.'
      else 'Hello. This bot sends café alerts. To connect it, press "Connect Telegram" in the admin.' end;

  else
    raise exception using errcode = 'RS422', message = 'unknown_notification: ' || coalesce(p_kind, 'null');
  end case;
end $$;

-- The events an owner can switch per channel (ADR-040). Internal kinds such as
-- channel.test are not in this list.
create function private.alert_events() returns text[]
language sql immutable set search_path = '' as $$
  select '{order.placed,order.overdue,station.offline,order.comped,day.summary}'::text[]
$$;

alter table public.notification_channels
  add constraint notification_channels_events_known
  check (events <@ '{order.placed,order.overdue,station.offline,order.comped,day.summary}'::text[]);

-- -----------------------------------------------------------------------------
-- Link codes
-- -----------------------------------------------------------------------------
alter table public.telegram_link_codes add column consumed_chat_id bigint;

-- Chats are created only by the bot's /start (proof that the chat wants the
-- alerts) and changed through api.update_notification_channel. A direct write
-- could point a café's alerts at someone else's chat id.
revoke insert, update on public.notification_channels from authenticated;

-- The owner or a manager presses «Միացնել Telegram» and gets a code for
-- t.me/<bot>?start=<code>. Only its hash is stored; it works once, for 30 minutes.
create function api.create_telegram_link(p_restaurant_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_expires timestamptz := now() + interval '30 minutes';
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if not private.rate_limit_hit('tglink:' || auth.uid(), 10, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  v_code := private.b64url(extensions.gen_random_bytes(12));
  insert into public.telegram_link_codes (code_hash, restaurant_id, location_id, created_by, expires_at)
  values (encode(extensions.digest(v_code, 'sha256'), 'hex'), p_restaurant_id, null, auth.uid(), v_expires);
  return jsonb_build_object('code', v_code, 'expires_at', v_expires);
end $$;

-- Whether the bot can work at all yet (token and webhook secret in Vault).
create function api.telegram_status(p_restaurant_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  return jsonb_build_object('bot_ready', private.secret('telegram_bot_token') is not null
                                         and private.secret('telegram_webhook_secret') is not null);
end $$;

-- -----------------------------------------------------------------------------
-- The webhook
-- -----------------------------------------------------------------------------
-- Called by /api/telegram with Telegram's secret header. Returns {"reply": {…}}
-- when the bot should answer: the route sends it back as the webhook's answer
-- (a Bot API method call), so no token is needed here. Safe to repeat: Telegram
-- resends updates it thinks failed.
create function api.telegram_update(p_secret text, p_update jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_expected text := private.secret('telegram_webhook_secret');
  v_msg jsonb := p_update -> 'message';
  v_chat bigint;
  v_text text;
  v_lang public.app_locale;
  v_code text;
  v_link public.telegram_link_codes;
  v_locale public.app_locale;
  v_title text;
  v_name text;
  v_status text;
begin
  if v_expected is null or p_secret is null
     or extensions.digest(p_secret, 'sha256') <> extensions.digest(v_expected, 'sha256') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- The bot was removed from a group or blocked in a private chat
  if p_update ? 'my_chat_member' then
    v_chat := (p_update #>> '{my_chat_member,chat,id}')::bigint;
    v_status := p_update #>> '{my_chat_member,new_chat_member,status}';
    if v_status in ('kicked', 'left') then
      update public.notification_channels set is_active = false where kind = 'telegram' and telegram_chat_id = v_chat;
    end if;
    return '{}'::jsonb;
  end if;

  if v_msg is null or jsonb_typeof(v_msg -> 'text') <> 'string' then
    return '{}'::jsonb;
  end if;
  v_chat := (v_msg #>> '{chat,id}')::bigint;
  v_text := btrim(v_msg ->> 'text');
  v_lang := private.telegram_locale(v_msg #>> '{from,language_code}');

  if v_text ~ '^/stop(@\w+)?$' then
    select locale into v_locale from public.notification_channels
    where kind = 'telegram' and telegram_chat_id = v_chat and is_active order by created_at limit 1;
    update public.notification_channels set is_active = false where kind = 'telegram' and telegram_chat_id = v_chat;
    return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
      'text', private.render_notification('channel.stopped', '{}', coalesce(v_locale, v_lang, 'hy'))));
  end if;

  v_code := substring(v_text from '^/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$');
  if v_code is null then
    if v_text ~ '^/start(@\w+)?$' then
      return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
        'text', private.render_notification('bot.hello', '{}', coalesce(v_lang, 'hy'))));
    end if;
    return '{}'::jsonb;
  end if;

  select * into v_link from public.telegram_link_codes
  where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
  for update;
  if not found
     or (v_link.consumed_at is null and v_link.expires_at <= now())
     or (v_link.consumed_at is not null and v_link.consumed_chat_id is distinct from v_chat) then
    return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
      'text', private.render_notification('link.invalid', '{}', coalesce(v_lang, 'hy'))));
  end if;

  -- The chat gets the language of whoever made the link; the owner can change it.
  select m.locale into v_locale from public.members m
  where m.restaurant_id = v_link.restaurant_id and m.user_id = v_link.created_by;
  select r.default_locale, r.name into v_lang, v_name from public.restaurants r where r.id = v_link.restaurant_id;
  v_locale := coalesce(v_locale, v_lang, 'hy');
  v_title := left(coalesce(nullif(v_msg #>> '{chat,title}', ''),
                           nullif(btrim(concat_ws(' ', v_msg #>> '{chat,first_name}', v_msg #>> '{chat,last_name}')), ''),
                           nullif(v_msg #>> '{chat,username}', ''), 'Telegram'), 80);

  insert into public.notification_channels (restaurant_id, location_id, kind, telegram_chat_id, title, locale, created_by)
  values (v_link.restaurant_id, v_link.location_id, 'telegram', v_chat, v_title, v_locale, v_link.created_by)
  on conflict (restaurant_id, telegram_chat_id) do update
    set is_active = true, title = excluded.title;
  if v_link.consumed_at is null then
    update public.telegram_link_codes set consumed_at = now(), consumed_chat_id = v_chat where code_hash = v_link.code_hash;
    insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, data)
    values (v_link.restaurant_id, 'system', v_link.created_by, 'telegram.linked', 'notification_channel',
            jsonb_build_object('chat_type', v_msg #>> '{chat,type}'));
  end if;

  select locale into v_locale from public.notification_channels
  where restaurant_id = v_link.restaurant_id and telegram_chat_id = v_chat;
  return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
    'text', private.render_notification('channel.linked', jsonb_build_object('restaurant', v_name), v_locale)));
end $$;

-- Registers the webhook with Telegram once the owner has put the bot token in
-- Vault. Run by the operator in the SQL editor:
--   select private.telegram_set_webhook('https://<app>/api/telegram');
-- If Vault holds vercel_bypass_secret, it is added as the query parameter
-- Vercel's deployment protection accepts, so previews behind it still work.
create function private.telegram_set_webhook(p_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.secret('telegram_bot_token');
  v_bypass text := private.secret('vercel_bypass_secret');
  v_id bigint;
begin
  perform private.ensure_random_secret('telegram_webhook_secret',
    'Telegram sends it in X-Telegram-Bot-Api-Secret-Token; checked by api.telegram_update');
  if v_token is null then
    return 'no_token';
  end if;
  if p_url !~ '^https://[^/]+/' then
    raise exception using errcode = '22023', message = 'invalid_url';
  end if;
  v_id := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/setWebhook',
    body := jsonb_build_object(
      'url', p_url || case when v_bypass is null then ''
                           else case when p_url like '%?%' then '&' else '?' end
                                || 'x-vercel-protection-bypass=' || v_bypass end,
      'secret_token', private.secret('telegram_webhook_secret'),
      'allowed_updates', jsonb_build_array('message', 'my_chat_member'),
      'drop_pending_updates', true),
    timeout_milliseconds := 10000);
  return 'requested:' || v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.secret(text), private.ensure_random_secret(text, text), private.format_amd(integer, public.app_locale),
  private.pick_name(jsonb, public.app_locale), private.telegram_locale(text),
  private.render_notification(text, jsonb, public.app_locale), private.alert_events(),
  api.create_telegram_link(uuid), api.telegram_status(uuid), api.telegram_update(text, jsonb),
  private.telegram_set_webhook(text)
from public, anon, authenticated;
grant execute on function api.create_telegram_link(uuid), api.telegram_status(uuid) to authenticated;
grant execute on function api.telegram_update(text, jsonb) to anon, authenticated;
