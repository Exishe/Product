-- Web push for café guests and waiters (ADR-050), on the pipeline of ADR-035:
-- outbox rows → pg_net → /api/push (signed per row) → encrypted send.
--
-- Guests: «Notify me when it's ready» on the order status page. The phone's
-- subscription belongs to its guest session (an anonymous user), is removed
-- when the table session closes or after 24 hours, and gets one push per order
-- when the kitchen marks it ready.
-- Waiters: a switch in the waiter app subscribes the device; a guest calling
-- the waiter or asking for the bill (and choosing card or cash) pushes to the
-- subscribed waiters of that location. Not every order (ADR-040).
--
-- A channel now has an audience: owner (the Telegram page, as before), waiter
-- or guest. Waiter and guest channels carry no alert events, so the owners'
-- event queueing never reaches them; they are fed by the functions below.

-- -----------------------------------------------------------------------------
-- Channels: audience and the guest session
-- -----------------------------------------------------------------------------
alter table public.notification_channels
  add column audience text not null default 'owner' check (audience in ('owner', 'waiter', 'guest')),
  add column guest_session_id uuid references public.guest_sessions (id) on delete cascade,
  add constraint notification_channels_audience check (
    (audience = 'guest') = (guest_session_id is not null)
    and (audience = 'owner' or kind = 'web_push'));

drop index public.notification_channels_web_push_user;
create unique index notification_channels_web_push_user on public.notification_channels (restaurant_id, user_id)
  where kind = 'web_push' and audience = 'owner';
create unique index notification_channels_waiter_user on public.notification_channels (restaurant_id, user_id)
  where audience = 'waiter';
create unique index notification_channels_guest_session on public.notification_channels (guest_session_id)
  where audience = 'guest';
create index notification_channels_guest_age_idx on public.notification_channels (created_at) where audience = 'guest';

-- -----------------------------------------------------------------------------
-- Validation shared by the three ways to subscribe
-- -----------------------------------------------------------------------------
-- Only a browser's push service (the same list as the table check of the
-- security review, M-1, and isPushServiceEndpoint in web-push.ts).
create function private.valid_push_endpoint(p_endpoint text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/\S*$'
                  and char_length(p_endpoint) <= 1000, false)
$$;

-- A P-256 public key is 65 bytes, the auth secret 16 (RFC 8291).
create function private.valid_push_keys(p_p256dh text, p_auth text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_p256dh ~ '^[A-Za-z0-9_-]{86,88}={0,2}$' and p_auth ~ '^[A-Za-z0-9_-]{22,24}={0,2}$'
                  and length(private.b64url_decode(rtrim(p_p256dh, '='))) = 65
                  and length(private.b64url_decode(rtrim(p_auth, '='))) = 16, false)
$$;

-- Stores or moves a device. The endpoint is unique: the same browser
-- subscribing again (or for another channel) keeps one row.
create function private.store_push_subscription(
  p_restaurant_id uuid, p_channel_id uuid, p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text
) returns void
language sql security definer set search_path = '' as $$
  insert into public.push_subscriptions (restaurant_id, channel_id, user_id, endpoint, p256dh, auth, user_agent)
  values (p_restaurant_id, p_channel_id, p_user_id, p_endpoint, rtrim(p_p256dh, '='), rtrim(p_auth, '='), left(p_user_agent, 300))
  on conflict (endpoint) do update
    set restaurant_id = excluded.restaurant_id, channel_id = excluded.channel_id, user_id = excluded.user_id,
        p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failures = 0
$$;

-- The owner's subscribe, now with the audience in its conflict target.
create or replace function api.save_push_subscription(
  p_restaurant_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_channel uuid;
  v_locale public.app_locale;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if not private.rate_limit_hit('push:' || auth.uid(), 20, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  -- The push-service allow-list is the table's own check (security review M-1).
  if p_endpoint is null or p_endpoint !~ '^https://[^/\s]+/\S*$' or char_length(p_endpoint) > 1000
     or not private.valid_push_keys(p_p256dh, p_auth) then
    raise exception using errcode = '22023', message = 'invalid_subscription';
  end if;

  select locale into v_locale from public.members where restaurant_id = p_restaurant_id and user_id = auth.uid();
  insert into public.notification_channels (restaurant_id, kind, user_id, title, locale, created_by)
  values (p_restaurant_id, 'web_push', auth.uid(), 'web_push', coalesce(v_locale, 'hy'), auth.uid())
  on conflict (restaurant_id, user_id) where kind = 'web_push' and audience = 'owner' do update set is_active = true
  returning id into v_channel;

  perform private.store_push_subscription(p_restaurant_id, v_channel, auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent);
  return v_channel;
end $$;

-- -----------------------------------------------------------------------------
-- Guests
-- -----------------------------------------------------------------------------
-- p_subscription is the browser's PushSubscription.toJSON():
-- {"endpoint": "https://…", "keys": {"p256dh": "…", "auth": "…"}}.
-- The caller must own an open guest session. At most 3 phones per guest
-- session (one person, a few browsers), 10 calls an hour.
create function api.guest_push_subscribe(p_guest_session_id uuid, p_subscription jsonb, p_user_agent text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_endpoint text;
  v_p256dh text;
  v_auth text;
  v_channel uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> auth.uid() or v_guest.revoked_at is not null or v_guest.expires_at <= now()
     or not exists (select 1 from public.table_sessions s where s.id = v_guest.table_session_id and s.status = 'open') then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  if p_subscription is null or jsonb_typeof(p_subscription) <> 'object' or jsonb_typeof(p_subscription -> 'keys') <> 'object'
     or octet_length(p_subscription::text) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_subscription';
  end if;
  v_endpoint := p_subscription ->> 'endpoint';
  v_p256dh := p_subscription -> 'keys' ->> 'p256dh';
  v_auth := p_subscription -> 'keys' ->> 'auth';
  if not private.valid_push_endpoint(v_endpoint) or not private.valid_push_keys(v_p256dh, v_auth) then
    raise exception using errcode = '22023', message = 'invalid_subscription';
  end if;
  if not private.rate_limit_hit('guestpush:' || v_guest.id, 10, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  insert into public.notification_channels (restaurant_id, location_id, kind, user_id, guest_session_id, audience, title, locale, events, created_by)
  values (v_guest.restaurant_id, v_guest.location_id, 'web_push', auth.uid(), v_guest.id, 'guest', 'guest', v_guest.locale, '{}', auth.uid())
  on conflict (guest_session_id) where audience = 'guest' do update set is_active = true, locale = excluded.locale
  returning id into v_channel;

  if (select count(*) from public.push_subscriptions where channel_id = v_channel and endpoint <> v_endpoint) >= 3 then
    raise exception using errcode = 'RS429', message = 'too_many_devices';
  end if;
  perform private.store_push_subscription(v_guest.restaurant_id, v_channel, auth.uid(), v_endpoint, v_p256dh, v_auth, p_user_agent);
  return v_channel;
end $$;

-- Whether this browser is subscribed for this guest session (for the button).
create function api.guest_push_exists(p_guest_session_id uuid, p_endpoint text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.push_subscriptions s
    join public.notification_channels c on c.id = s.channel_id
    join public.guest_sessions g on g.id = c.guest_session_id
    where s.endpoint = p_endpoint and c.guest_session_id = p_guest_session_id and g.user_id = auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Waiters
-- -----------------------------------------------------------------------------
-- Owners, managers and waiters (paired tablets included) subscribe their own
-- device. The channel is separate from an owner's Telegram-page channel.
create function api.waiter_push_subscribe(
  p_restaurant_id uuid, p_endpoint text, p_p256dh text, p_auth text,
  p_user_agent text default null, p_locale public.app_locale default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_channel uuid;
  v_locale public.app_locale;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager,waiter}');
  if not private.rate_limit_hit('waiterpush:' || auth.uid(), 20, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  if not private.valid_push_endpoint(p_endpoint) or not private.valid_push_keys(p_p256dh, p_auth) then
    raise exception using errcode = '22023', message = 'invalid_subscription';
  end if;

  select locale into v_locale from public.members
  where restaurant_id = p_restaurant_id and user_id = auth.uid() and is_active;
  insert into public.notification_channels (restaurant_id, kind, user_id, audience, title, locale, events, created_by)
  values (p_restaurant_id, 'web_push', auth.uid(), 'waiter', 'waiter', coalesce(p_locale, v_locale, 'hy'), '{}', auth.uid())
  on conflict (restaurant_id, user_id) where audience = 'waiter' do update
    set is_active = true, locale = coalesce(p_locale, notification_channels.locale)
  returning id into v_channel;

  if (select count(*) from public.push_subscriptions where channel_id = v_channel and endpoint <> p_endpoint) >= 5 then
    raise exception using errcode = 'RS429', message = 'too_many_devices';
  end if;
  perform private.store_push_subscription(p_restaurant_id, v_channel, auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent);
  return v_channel;
end $$;

-- -----------------------------------------------------------------------------
-- Texts: «Ձեր պատվերը պատրաստ է՝ սեղան 5», «Սեղան 5․ կանչում են»
-- -----------------------------------------------------------------------------
-- The existing renderer keeps every earlier kind; the new function handles the
-- three new ones and passes the rest on. Armenian follows the hy-writer rules.
alter function private.render_notification(text, jsonb, public.app_locale) rename to render_notification_base;

create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_table text := nullif(p_payload ->> 'table', '');
  v_pay text := nullif(p_payload ->> 'payment', '');
begin
  case p_kind
  when 'order.ready' then
    return case l
      when 'hy' then 'Ձեր պատվերը պատրաստ է' || coalesce('՝ սեղան ' || v_table, '')
      when 'ru' then 'Ваш заказ готов' || coalesce(' — стол ' || v_table, '')
      else 'Your order is ready' || coalesce(' — table ' || v_table, '') end;

  when 'service.call' then
    return case l
      when 'hy' then 'Սեղան ' || coalesce(v_table, '?') || '․ կանչում են'
      when 'ru' then 'Стол ' || coalesce(v_table, '?') || ': зовут официанта'
      else 'Table ' || coalesce(v_table, '?') || ': calling a waiter' end;

  when 'service.bill' then
    return case l
      when 'hy' then 'Սեղան ' || coalesce(v_table, '?') || '․ հաշիվ'
        || case v_pay when 'card' then '՝ քարտով' when 'cash' then '՝ կանխիկ' else '' end
      when 'ru' then 'Стол ' || coalesce(v_table, '?') || ': счёт'
        || case v_pay when 'card' then ', картой' when 'cash' then ', наличными' else '' end
      else 'Table ' || coalesce(v_table, '?') || ': bill'
        || case v_pay when 'card' then ', by card' when 'cash' then ', cash' else '' end end;

  else
    return private.render_notification_base(p_kind, p_payload, p_locale);
  end case;
end $$;

-- The language of a row: the order's own (payload.locale) or the channel's.
create function private.outbox_locale(p_payload jsonb, p_channel_locale public.app_locale) returns public.app_locale
language sql immutable set search_path = '' as $$
  select case when p_payload ->> 'locale' in ('hy', 'ru', 'en') then (p_payload ->> 'locale')::public.app_locale
              else p_channel_locale end
$$;

-- -----------------------------------------------------------------------------
-- Queueing
-- -----------------------------------------------------------------------------
-- One row for the guest session's channel, if it has a device.
create function private.enqueue_guest_push(p_guest_session_id uuid, p_event text, p_dedupe_key text, p_payload jsonb)
returns integer
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
    select c.restaurant_id, c.id, p_event, p_dedupe_key, p_payload
    from public.notification_channels c
    where c.guest_session_id = p_guest_session_id and c.audience = 'guest' and c.is_active
      and exists (select 1 from public.push_subscriptions s where s.channel_id = c.id)
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

-- One row per subscribed waiter device-owner of the location: active members
-- who are waiters, managers or owners and may see the location.
create function private.enqueue_waiter_push(p_restaurant_id uuid, p_location_id uuid, p_event text, p_dedupe_key text, p_payload jsonb)
returns integer
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
    select p_restaurant_id, c.id, p_event, p_dedupe_key, p_payload
    from public.notification_channels c
    where c.restaurant_id = p_restaurant_id and c.audience = 'waiter' and c.is_active
      and exists (select 1 from public.push_subscriptions s where s.channel_id = c.id)
      and exists (select 1 from public.members m
                  where m.restaurant_id = c.restaurant_id and m.user_id = c.user_id and m.is_active
                    and m.role in ('owner', 'manager', 'waiter')
                    and (m.all_locations or exists (select 1 from public.member_locations ml
                                                    where ml.member_id = m.id and ml.location_id = p_location_id)))
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

-- The kitchen marked the order's last ticket ready. The order's kitchen status
-- changes to 'ready' once per pass; the dedupe key keeps a "ready, undo, ready"
-- from sending twice. The path is the guest's status page, with the table's
-- signed sticker so the page can resolve the table.
create function private.notify_order_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_table text;
  v_restaurant text;
  v_location text;
begin
  select t.label into v_table from public.tables t where t.id = new.table_id;
  select r.slug, l.slug into v_restaurant, v_location
  from public.locations l join public.restaurants r on r.id = l.restaurant_id where l.id = new.location_id;
  perform private.enqueue_guest_push(new.guest_session_id, 'order.ready', 'order.ready:' || new.id,
    jsonb_build_object('order_id', new.id, 'number', new.number, 'table', v_table, 'locale', new.locale,
                       'path', '/' || new.locale || '/m/' || v_restaurant || '/' || v_location || '/order?t='
                               || private.sign_table_token(new.table_id)));
  return null;
exception when others then
  -- A missing QR key or any other trouble must never block the kitchen.
  raise warning 'notify_order_ready: %', sqlerrm;
  return null;
end $$;

create trigger orders_notify_ready after update of kitchen_status on public.orders
  for each row
  when (new.kitchen_status = 'ready' and old.kitchen_status is distinct from 'ready'
        and new.guest_session_id is not null and new.table_id is not null and new.status = 'accepted')
  execute function private.notify_order_ready();

-- A guest calls the waiter or asks for the bill. A new request pushes; so does
-- a card/cash choice on an open bill request (the key includes the choice).
create function private.notify_service_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_table text;
begin
  if new.status = 'resolved' then
    return null;
  end if;
  if tg_op = 'UPDATE' and (new.payment_preference is null or new.payment_preference is not distinct from old.payment_preference) then
    return null;
  end if;
  select label into v_table from public.tables where id = new.table_id;
  perform private.enqueue_waiter_push(new.restaurant_id, new.location_id,
    case new.kind when 'call_waiter' then 'service.call' else 'service.bill' end,
    'service:' || new.id || ':' || coalesce(new.payment_preference, '-'),
    jsonb_build_object('request_id', new.id, 'table_id', new.table_id, 'table', v_table, 'payment', new.payment_preference,
                       'kind', new.kind));
  return null;
exception when others then
  raise warning 'notify_service_request: %', sqlerrm;
  return null;
end $$;

create trigger service_requests_notify after insert or update of payment_preference on public.service_requests
  for each row execute function private.notify_service_request();

-- -----------------------------------------------------------------------------
-- Cleanup: a guest's devices live as long as the table session (and 24 hours)
-- -----------------------------------------------------------------------------
create function private.drop_guest_push_of_session() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notification_channels c
  where c.audience = 'guest' and c.guest_session_id in (select g.id from public.guest_sessions g where g.table_session_id = new.id);
  return null;
end $$;

create trigger table_sessions_drop_guest_push after update of status on public.table_sessions
  for each row when (new.status <> 'open' and old.status = 'open')
  execute function private.drop_guest_push_of_session();

create function private.drop_guest_push_of_guest() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notification_channels where audience = 'guest' and guest_session_id = new.id;
  return null;
end $$;

create trigger guest_sessions_drop_push after update of revoked_at on public.guest_sessions
  for each row when (new.revoked_at is not null and old.revoked_at is null)
  execute function private.drop_guest_push_of_guest();

-- Channels cascade to their devices and queued rows. Returns how many guests
-- were cleaned.
create function private.cleanup_guest_push() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  with gone as (
    delete from public.notification_channels c
    where c.audience = 'guest'
      and (c.created_at < now() - interval '24 hours'
           or not exists (select 1 from public.guest_sessions g
                          where g.id = c.guest_session_id and g.revoked_at is null and g.expires_at > now()))
    returning 1)
  select count(*) into v_n from gone;
  return v_n;
end $$;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('pativ-guest-push-cleanup', '*/15 * * * *', 'select private.cleanup_guest_push()');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Delivery
-- -----------------------------------------------------------------------------
-- What the push shows and where a tap leads, by event. Tags are per table or
-- order, so a repeat replaces the earlier notification instead of stacking.
create function private.push_target(p_event text, p_payload jsonb, p_id bigint)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_event = 'order.ready' then
      jsonb_build_object('tag', 'order:' || (p_payload ->> 'order_id'), 'url', p_payload ->> 'path', 'renotify', true)
    when p_event in ('service.call', 'service.bill') then
      jsonb_build_object('tag', 'table:' || (p_payload ->> 'table_id') || ':' || p_event, 'url', '/waiter', 'renotify', true)
    else
      jsonb_build_object('tag', p_event || ':' || p_id, 'url', '/admin/telegram', 'renotify', false)
  end
$$;

create or replace function api.push_claim(p_id bigint, p_attempt integer, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_target jsonb;
begin
  perform private.assert_push_sig(p_id, p_attempt, p_sig);
  select o.id, o.event, o.payload, o.attempts, o.net_request_id, o.status, c.id as channel_id, c.locale, c.kind
  into r
  from public.notification_outbox o join public.notification_channels c on c.id = o.channel_id
  where o.id = p_id;
  if not found or r.kind <> 'web_push' or r.net_request_id is null or r.attempts <> p_attempt
     or r.status not in ('pending', 'failed') then
    raise exception using errcode = 'RS409', message = 'not_in_flight';
  end if;
  v_target := private.push_target(r.event, r.payload, p_id);
  -- A path that isn't ours (anything but "/x…") falls back to the admin.
  if coalesce(v_target ->> 'url', '') !~ '^/[^/\\]' then
    v_target := v_target || jsonb_build_object('url', '/admin');
  end if;
  return jsonb_build_object(
    'title', private.render_notification('brand', '{}', private.outbox_locale(r.payload, r.locale)),
    'body', private.render_notification(r.event, r.payload, private.outbox_locale(r.payload, r.locale)),
    'tag', v_target ->> 'tag',
    'url', v_target ->> 'url',
    'renotify', (v_target ->> 'renotify')::boolean,
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                                                order by s.created_at), '[]'::jsonb)
                      from public.push_subscriptions s where s.channel_id = r.channel_id));
end $$;

-- deliver_outbox: the row's language can be the order's, and the live
-- notifications (a call, a bill, a ready dish) are dropped after 15 minutes
-- instead of 6 hours: a "table 5 is calling" from last night is noise.
create or replace function private.deliver_outbox(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.secret('telegram_bot_token');
  v_base text := rtrim(private.secret('app_base_url'), '/');
  v_bypass text := private.secret('vercel_bypass_secret');
  v_push boolean := private.secret('app_base_url') is not null and private.secret('push_job_key') is not null;
  r record;
  v_text text;
  v_req bigint;
  v_n integer := 0;
begin
  update public.notification_outbox o set status = 'dead', last_error = 'channel_off', net_request_id = null
  from public.notification_channels c
  where c.id = o.channel_id and not c.is_active and o.status in ('pending', 'failed') and o.net_request_id is null;

  update public.notification_outbox o set status = 'dead', last_error = 'stale'
  from public.notification_channels c
  where c.id = o.channel_id
    and ((c.kind = 'telegram' and v_token is not null) or (c.kind = 'web_push' and v_push))
    and o.status in ('pending', 'failed') and o.net_request_id is null
    and o.created_at < now() - case when o.event in ('order.ready', 'service.call', 'service.bill')
                                    then interval '15 minutes' else interval '6 hours' end;

  for r in
    select o.id, o.event, o.payload, o.attempts, c.kind, c.telegram_chat_id, c.locale
    from public.notification_outbox o
    join public.notification_channels c on c.id = o.channel_id
    where o.status in ('pending', 'failed') and o.net_request_id is null and o.next_attempt_at <= now()
      and c.is_active
      and ((c.kind = 'telegram' and v_token is not null) or (c.kind = 'web_push' and v_push))
    order by o.id
    limit p_limit
    for update of o skip locked
  loop
    begin
      v_text := private.render_notification(r.event, r.payload, private.outbox_locale(r.payload, r.locale));
    exception when others then
      update public.notification_outbox set status = 'dead', last_error = left('render: ' || sqlerrm, 300) where id = r.id;
      continue;
    end;
    if r.kind = 'telegram' then
      v_req := net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        body := jsonb_build_object('chat_id', r.telegram_chat_id, 'text', v_text, 'disable_web_page_preview', true),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 10000);
    else
      v_req := net.http_post(
        url := v_base || '/api/push',
        body := jsonb_build_object('id', r.id, 'attempt', r.attempts + 1, 'sig', private.push_sig(r.id, r.attempts + 1)),
        headers := jsonb_strip_nulls(jsonb_build_object('Content-Type', 'application/json',
                                                        'x-vercel-protection-bypass', v_bypass)),
        timeout_milliseconds := 15000);
    end if;
    update public.notification_outbox
    set net_request_id = v_req, attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes'
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.valid_push_endpoint(text), private.valid_push_keys(text, text),
  private.store_push_subscription(uuid, uuid, uuid, text, text, text, text),
  private.render_notification(text, jsonb, public.app_locale), private.render_notification_base(text, jsonb, public.app_locale),
  private.outbox_locale(jsonb, public.app_locale), private.enqueue_guest_push(uuid, text, text, jsonb),
  private.enqueue_waiter_push(uuid, uuid, text, text, jsonb), private.notify_order_ready(), private.notify_service_request(),
  private.drop_guest_push_of_session(), private.drop_guest_push_of_guest(), private.cleanup_guest_push(),
  private.push_target(text, jsonb, bigint),
  api.guest_push_subscribe(uuid, jsonb, text), api.guest_push_exists(uuid, text),
  api.waiter_push_subscribe(uuid, text, text, text, text, public.app_locale)
from public, anon, authenticated;
grant execute on function
  api.guest_push_subscribe(uuid, jsonb, text), api.guest_push_exists(uuid, text),
  api.waiter_push_subscribe(uuid, text, text, text, text, public.app_locale)
to authenticated;
