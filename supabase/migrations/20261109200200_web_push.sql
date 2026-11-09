-- Milestone 8.3: web push for owners without Telegram (ADR-035).
-- Each person who turns on notifications gets one web_push channel per café
-- (same events and texts as Telegram) and one push_subscriptions row per
-- device. The database can't encrypt web push, so the worker pokes the app's
-- /api/push with the row id signed by a key in Vault; the route claims the row
-- with that signature, sends with the VAPID key from Vercel's environment and
-- reports back. The app still holds no Supabase secret key (ADR-038).

select private.ensure_random_secret('push_job_key', 'Signs outbox row ids for /api/push (private.push_sig)');

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
alter table public.notification_channels drop constraint notification_channels_kind_check;
alter table public.notification_channels
  add constraint notification_channels_kind_check check (kind in ('telegram', 'web_push')),
  alter column telegram_chat_id drop not null,
  add column user_id uuid references auth.users (id) on delete cascade,
  add constraint notification_channels_target check (
    (kind = 'telegram' and telegram_chat_id is not null and user_id is null)
    or (kind = 'web_push' and user_id is not null and telegram_chat_id is null));
create unique index notification_channels_web_push_user on public.notification_channels (restaurant_id, user_id)
  where kind = 'web_push';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  channel_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://[^/\s]+/\S*$' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failures smallint not null default 0,
  foreign key (restaurant_id, channel_id) references public.notification_channels (restaurant_id, id) on delete cascade
);
create index push_subscriptions_channel_idx on public.push_subscriptions (channel_id);
alter table public.push_subscriptions enable row level security;
-- No client policy and no grants: keys are read only by the functions below.
revoke all on public.push_subscriptions from public, anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- -----------------------------------------------------------------------------
-- Queueing: web push channels need a device
-- -----------------------------------------------------------------------------
create or replace function private.enqueue_notification(
  p_restaurant_id uuid, p_location_id uuid, p_event text, p_dedupe_key text, p_payload jsonb
) returns integer
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
    select p_restaurant_id, c.id, p_event, p_dedupe_key, p_payload
    from public.notification_channels c
    where c.restaurant_id = p_restaurant_id and c.is_active
      and (c.location_id is null or p_location_id is null or c.location_id = p_location_id)
      and p_event = any (c.events)
      and (c.kind = 'telegram' or exists (select 1 from public.push_subscriptions s where s.channel_id = c.id))
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

-- -----------------------------------------------------------------------------
-- Subscribing a device
-- -----------------------------------------------------------------------------
create function api.save_push_subscription(
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
  -- A P-256 public key is 65 bytes, the auth secret 16 (RFC 8291).
  if p_endpoint is null or p_endpoint !~ '^https://[^/\s]+/\S*$' or char_length(p_endpoint) > 1000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{86,88}={0,2}$' or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{22,24}={0,2}$'
     or length(private.b64url_decode(rtrim(p_p256dh, '='))) <> 65 or length(private.b64url_decode(rtrim(p_auth, '='))) <> 16 then
    raise exception using errcode = '22023', message = 'invalid_subscription';
  end if;

  select locale into v_locale from public.members where restaurant_id = p_restaurant_id and user_id = auth.uid();
  insert into public.notification_channels (restaurant_id, kind, user_id, title, locale, created_by)
  values (p_restaurant_id, 'web_push', auth.uid(), 'web_push', coalesce(v_locale, 'hy'), auth.uid())
  on conflict (restaurant_id, user_id) where kind = 'web_push' do update set is_active = true
  returning id into v_channel;

  insert into public.push_subscriptions (restaurant_id, channel_id, user_id, endpoint, p256dh, auth, user_agent)
  values (p_restaurant_id, v_channel, auth.uid(), p_endpoint, rtrim(p_p256dh, '='), rtrim(p_auth, '='), left(p_user_agent, 300))
  on conflict (endpoint) do update
    set restaurant_id = excluded.restaurant_id, channel_id = excluded.channel_id, user_id = excluded.user_id,
        p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, failures = 0;
  return v_channel;
end $$;

-- Removes the caller's own device (a browser's endpoint).
create function api.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid()
$$;

-- Whether this browser's endpoint is subscribed for the caller (for the toggle).
create function api.push_subscription_exists(p_endpoint text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid())
$$;

-- -----------------------------------------------------------------------------
-- Delivery through /api/push
-- -----------------------------------------------------------------------------
-- HMAC of "<row id>:<attempt>" with the Vault key: valid for one attempt only.
create function private.push_sig(p_id bigint, p_attempt integer) returns text
language sql stable security definer set search_path = '' as $$
  select private.b64url(extensions.hmac(p_id || ':' || p_attempt, private.secret('push_job_key'), 'sha256'))
$$;

create function private.assert_push_sig(p_id bigint, p_attempt integer, p_sig text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.secret('push_job_key') is null or p_sig is null or p_id is null or p_attempt is null
     or extensions.digest(p_sig, 'sha256') <> extensions.digest(private.push_sig(p_id, p_attempt), 'sha256') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- The route trades a signed id for the text and the devices of that row.
create function api.push_claim(p_id bigint, p_attempt integer, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r record;
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
  return jsonb_build_object(
    'title', private.render_notification('brand', '{}', r.locale),
    'body', private.render_notification(r.event, r.payload, r.locale),
    'tag', r.event || ':' || p_id,
    'url', '/admin/telegram',
    'subscriptions', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)
                                                order by s.created_at), '[]'::jsonb)
                      from public.push_subscriptions s where s.channel_id = r.channel_id));
end $$;

-- The route reports what each push service answered: 2xx delivered, 404/410
-- the subscription is gone (deleted), anything else counts against the device.
-- The row is sent if any device got it, otherwise it is retried.
create function api.push_report(p_id bigint, p_attempt integer, p_sig text, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_channel uuid;
  v_ok integer := 0;
  v_error text;
begin
  perform private.assert_push_sig(p_id, p_attempt, p_sig);
  select channel_id into v_channel from public.notification_outbox
  where id = p_id and net_request_id is not null and attempts = p_attempt and status in ('pending', 'failed')
  for update;
  if not found then
    raise exception using errcode = 'RS409', message = 'not_in_flight';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_results';
  end if;

  with res as (
    select x ->> 'endpoint' as endpoint, (x ->> 'status')::integer as status
    from jsonb_array_elements(p_results) x),
  gone as (
    delete from public.push_subscriptions s using res
    where s.channel_id = v_channel and s.endpoint = res.endpoint and res.status in (404, 410)),
  ok as (
    update public.push_subscriptions s set last_success_at = now(), failures = 0 from res
    where s.channel_id = v_channel and s.endpoint = res.endpoint and res.status between 200 and 299
    returning 1),
  bad as (
    update public.push_subscriptions s set failures = least(s.failures + 1, 1000) from res
    where s.channel_id = v_channel and s.endpoint = res.endpoint and res.status not between 200 and 299
      and res.status not in (404, 410))
  select count(*) into v_ok from ok;

  if v_ok > 0 then
    update public.notification_outbox set status = 'sent', sent_at = now(), net_request_id = null, last_error = null
    where id = p_id;
  elsif not exists (select 1 from public.push_subscriptions where channel_id = v_channel) then
    update public.notification_outbox set status = 'dead', net_request_id = null, last_error = 'no_devices'
    where id = p_id;
  else
    select string_agg(coalesce(x ->> 'status', '?'), ',') into v_error from jsonb_array_elements(p_results) x;
    perform private.outbox_fail(p_id, 'push: ' || coalesce(v_error, 'no results'));
  end if;
end $$;

-- deliver_outbox now also sends web push rows: a POST to the app with the
-- signed id. Without app_base_url in Vault those rows wait, like Telegram rows
-- without a token. A vercel_bypass_secret in Vault passes Vercel's deployment
-- protection on previews.
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
    and o.status in ('pending', 'failed') and o.net_request_id is null and o.created_at < now() - interval '6 hours';

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
      v_text := private.render_notification(r.event, r.payload, r.locale);
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
  api.save_push_subscription(uuid, text, text, text, text), api.delete_push_subscription(text),
  api.push_subscription_exists(text), private.push_sig(bigint, integer),
  private.assert_push_sig(bigint, integer, text), api.push_claim(bigint, integer, text),
  api.push_report(bigint, integer, text, jsonb)
from public, anon, authenticated;
grant execute on function
  api.save_push_subscription(uuid, text, text, text, text), api.delete_push_subscription(text),
  api.push_subscription_exists(text)
to authenticated;
-- /api/push calls these with the publishable key; the signature is the check.
grant execute on function api.push_claim(bigint, integer, text), api.push_report(bigint, integer, text, jsonb)
to anon, authenticated;
