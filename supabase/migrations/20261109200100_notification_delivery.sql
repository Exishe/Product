-- Milestone 8.2: alerts are queued in notification_outbox and delivered from
-- the database (ADR-016 as changed by ADR-038). pg_cron runs the worker every
-- 10 seconds; it sends Telegram messages with pg_net (token from Vault) and
-- reads the answers on its next run. No token in Vault: nothing is sent and
-- nothing fails, the rows simply wait.
--
-- Retries: 1, 5 and 15 minutes after a failure, dead after 5 failed attempts.
-- Alerts that could not go out for 6 hours are dropped as stale.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

-- A row is in flight while net_request_id is set; next_attempt_at is then the
-- end of its lease (no answer by then counts as a failure).
alter table public.notification_outbox add column net_request_id bigint;
create index notification_outbox_in_flight_idx on public.notification_outbox (net_request_id) where net_request_id is not null;
create index kitchen_tickets_open_idx on public.kitchen_tickets (created_at) where kind = 'order' and status in ('new', 'cooking');

-- -----------------------------------------------------------------------------
-- Queueing
-- -----------------------------------------------------------------------------
-- One row per active channel of the café that wants this event. Web push
-- channels need at least one device. Returns how many rows were queued.
create function private.enqueue_notification(
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
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

-- New orders (called by place_order_core). The payload carries the table label,
-- so the text needs no lookups later.
create or replace function private.enqueue_order_notification(p_order_id uuid) returns void
language sql security definer set search_path = '' as $$
  select private.enqueue_notification(o.restaurant_id, o.location_id, 'order.placed', 'order.placed:' || o.id,
           jsonb_build_object('order_id', o.id, 'number', o.number, 'table', t.label, 'total', o.total,
                              'source', o.source, 'is_test', o.is_test))
  from public.orders o left join public.tables t on t.id = o.table_id
  where o.id = p_order_id
$$;

-- A dish cancelled after its ticket was served (a comp, ADR-040 order.comped).
-- A trigger, so every way of cancelling is covered.
create function private.enqueue_comp_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_table text;
begin
  if new.cancelled_quantity <= old.cancelled_quantity then
    return null;
  end if;
  select * into v_order from public.orders where id = new.order_id;
  if not (exists (select 1 from public.kitchen_tickets k
                  where k.order_id = new.order_id and k.station_id = new.station_id
                    and k.kind = 'order' and k.status = 'served')
          or (new.station_id is null and v_order.kitchen_status = 'served')) then
    return null;
  end if;
  select label into v_table from public.tables where id = v_order.table_id;
  perform private.enqueue_notification(v_order.restaurant_id, v_order.location_id, 'order.comped',
    'order.comped:' || new.id || ':' || new.cancelled_quantity,
    jsonb_build_object('order_id', v_order.id, 'number', v_order.number, 'table', v_table, 'item', new.name_i18n,
                       'quantity', new.cancelled_quantity - old.cancelled_quantity,
                       'amount', (new.unit_price + new.modifiers_total) * (new.cancelled_quantity - old.cancelled_quantity)));
  return null;
end $$;

create trigger order_items_comp_alert after update of cancelled_quantity on public.order_items
  for each row execute function private.enqueue_comp_notification();

-- Tickets cooking longer than p_minutes: one alert per order. Tickets older
-- than 3 hours are forgotten ones, not late ones.
create function private.enqueue_overdue_alerts(p_minutes integer default 20) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select o.restaurant_id, o.location_id, o.id, o.number, t.label, min(k.created_at) as since
    from public.kitchen_tickets k
    join public.orders o on o.id = k.order_id
    left join public.tables t on t.id = o.table_id
    where k.kind = 'order' and k.status in ('new', 'cooking')
      and k.created_at < now() - make_interval(mins => p_minutes)
      and k.created_at > now() - interval '3 hours'
      and o.status = 'accepted'
    group by o.restaurant_id, o.location_id, o.id, o.number, t.label
  loop
    v_n := v_n + private.enqueue_notification(r.restaurant_id, r.location_id, 'order.overdue', 'order.overdue:' || r.id,
      jsonb_build_object('order_id', r.id, 'number', r.number, 'table', r.label,
                         'minutes', floor(extract(epoch from now() - r.since) / 60)::integer));
  end loop;
  return v_n;
end $$;

-- "During opening hours", without an opening-hours setting: a table is open or
-- an order came in during the last 45 minutes (ADR-044).
create function private.location_in_service(p_location_id uuid, p_now timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.table_sessions s where s.location_id = p_location_id and s.status = 'open')
      or exists (select 1 from public.orders o where o.location_id = p_location_id
                 and o.placed_at > p_now - interval '45 minutes' and o.placed_at <= p_now)
$$;

-- Kitchen and bar screens (device members with the kitchen role) that missed
-- two minutes of heartbeats (api.heartbeat, every 60 s) while the café is
-- serving. One alert per outage: the key includes the last-seen time.
create function private.enqueue_offline_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select m.id, m.restaurant_id, ml.location_id, m.display_name, m.last_seen_at
    from public.members m
    join public.member_locations ml on ml.member_id = m.id
    where m.kind = 'device' and m.role = 'kitchen' and m.is_active
      and m.last_seen_at < now() - interval '2 minutes'
      and m.last_seen_at > now() - interval '3 hours'
      and private.location_in_service(ml.location_id)
  loop
    v_n := v_n + private.enqueue_notification(r.restaurant_id, r.location_id, 'station.offline',
      'station.offline:' || r.id || ':' || floor(extract(epoch from r.last_seen_at))::bigint,
      jsonb_build_object('member_id', r.id, 'label', r.display_name,
                         'minutes', floor(extract(epoch from now() - r.last_seen_at) / 60)::integer));
  end loop;
  return v_n;
end $$;

-- The numbers of one business day at one location (test orders excluded).
create function private.day_summary_payload(p_location_id uuid, p_date date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with o as (
    select * from public.orders
    where location_id = p_location_id and business_date = p_date and not is_test and status = 'accepted'),
  items as (
    select oi.* from public.order_items oi join public.orders x on x.id = oi.order_id
    where x.location_id = p_location_id and x.business_date = p_date and not x.is_test and x.status in ('accepted', 'cancelled'))
  select jsonb_build_object(
    'location_id', p_location_id,
    'date', p_date,
    'orders', (select count(*) from o),
    'revenue', (select coalesce(sum(total), 0) from o),
    'average_bill', (select round(avg(b.total))::integer from public.bills b
                     where b.location_id = p_location_id and b.business_date = p_date and b.status = 'paid'),
    'cancelled', (select coalesce(sum(cancelled_quantity), 0) from items),
    'kitchen_minutes', (select round(extract(epoch from avg(k.ready_at - k.created_at)) / 60)::integer
                        from public.kitchen_tickets k join o on o.id = k.order_id
                        where k.kind = 'order' and k.ready_at is not null),
    'top', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'quantity', qty) order by qty desc, n), '[]'::jsonb)
            from (select (array_agg(name_i18n order by created_at))[1] as name,
                         private.pick_name((array_agg(name_i18n order by created_at))[1], 'hy') as n,
                         sum(quantity - cancelled_quantity) as qty
                  from items group by coalesce(item_id::text, name_i18n ->> 'hy')
                  having sum(quantity - cancelled_quantity) > 0
                  order by qty desc, n limit 3) t))
$$;

-- The day summary "at closing time" (ADR-044): once the local time is past
-- 21:00, every table is closed and no order came in for an hour. If the café
-- never got quiet, it goes in the first three hours of the next business day.
-- Days without orders send nothing. Returns how many rows were queued.
create function private.enqueue_day_summaries(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_local timestamp;
  v_today date;
  v_date date;
  v_payload jsonb;
  v_n integer := 0;
begin
  for r in
    select distinct l.id, l.restaurant_id, l.timezone, l.business_day_starts
    from public.locations l
    join public.notification_channels c on c.restaurant_id = l.restaurant_id and c.is_active
      and 'day.summary' = any (c.events) and (c.location_id is null or c.location_id = l.id)
    where l.status = 'active'
  loop
    v_local := p_now at time zone r.timezone;
    v_today := (v_local - (r.business_day_starts - time '00:00'))::date;
    v_date := null;
    if (v_local::time >= time '21:00' or v_local::time < r.business_day_starts)
       and not exists (select 1 from public.table_sessions s where s.location_id = r.id and s.status = 'open')
       and not exists (select 1 from public.orders o where o.location_id = r.id
                       and o.placed_at > p_now - interval '1 hour') then
      v_date := v_today;
    elsif v_local::time >= r.business_day_starts and v_local::time < r.business_day_starts + interval '3 hours' then
      v_date := v_today - 1;
    end if;
    continue when v_date is null;
    v_payload := private.day_summary_payload(r.id, v_date);
    continue when (v_payload ->> 'orders')::integer = 0;
    v_n := v_n + private.enqueue_notification(r.restaurant_id, r.id, 'day.summary',
                                              'day.summary:' || r.id || ':' || v_date, v_payload);
  end loop;
  return v_n;
end $$;

-- -----------------------------------------------------------------------------
-- Delivery
-- -----------------------------------------------------------------------------
create function private.outbox_backoff(p_attempts integer) returns interval
language sql immutable set search_path = '' as $$
  select case when p_attempts <= 1 then interval '1 minute'
              when p_attempts = 2 then interval '5 minutes'
              else interval '15 minutes' end
$$;

-- Records a failed attempt: retry later, or dead after the 5th failure.
-- p_retry_after (seconds) comes from Telegram's 429 answers.
create function private.outbox_fail(p_id bigint, p_error text, p_retry_after integer default null) returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox
  set status = case when attempts >= 5 then 'dead'::public.outbox_status else 'failed'::public.outbox_status end,
      next_attempt_at = now() + case when p_retry_after is null then private.outbox_backoff(attempts)
                                     else make_interval(secs => least(greatest(p_retry_after, 1), 3600)) end,
      last_error = left(p_error, 300),
      net_request_id = null
  where id = p_id
$$;

-- Reads pg_net's answers for rows in flight. 2xx: sent. Telegram's "blocked"
-- or "chat not found": the chat is turned off and the row is dead. Anything
-- else, or no answer by the end of the lease, is a failure to retry.
create function private.collect_outbox_responses() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select o.id, o.channel_id, c.kind, resp.id as resp_id, resp.status_code, resp.timed_out, resp.error_msg, resp.content
    from public.notification_outbox o
    join public.notification_channels c on c.id = o.channel_id
    left join net._http_response resp on resp.id = o.net_request_id
    where o.net_request_id is not null and o.status in ('pending', 'failed')
      and (resp.id is not null or o.next_attempt_at <= now())
    for update of o skip locked
  loop
    v_n := v_n + 1;
    if r.status_code between 200 and 299 then
      update public.notification_outbox set status = 'sent', sent_at = now(), net_request_id = null, last_error = null
      where id = r.id;
    elsif r.kind = 'telegram' and r.status_code in (400, 403)
          and r.content ~* '(bot was blocked|chat not found|bot was kicked|user is deactivated|not a member)' then
      update public.notification_channels set is_active = false where id = r.channel_id;
      update public.notification_outbox set status = 'dead', net_request_id = null,
             last_error = left('http ' || r.status_code || ': ' || coalesce(r.content, ''), 300)
      where id = r.id;
    elsif r.resp_id is null then
      perform private.outbox_fail(r.id, 'no_response');
    elsif r.status_code is null then
      perform private.outbox_fail(r.id, coalesce(r.error_msg, case when r.timed_out then 'timeout' else 'no_status' end));
    else
      perform private.outbox_fail(r.id, 'http ' || r.status_code || ': ' || coalesce(r.content, ''),
        case when r.status_code = 429 and r.content ~ '^\s*\{'
             then (r.content::jsonb #>> '{parameters,retry_after}')::integer end);
    end if;
  end loop;
  return v_n;
end $$;

-- Sends due rows. Telegram rows go straight to the Bot API; web push rows poke
-- the app's /api/push with a signed row id (added with web push). Returns how
-- many requests were made.
create function private.deliver_outbox(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.secret('telegram_bot_token');
  r record;
  v_text text;
  v_req bigint;
  v_n integer := 0;
begin
  -- Rows of a channel that was switched off will never be sent.
  update public.notification_outbox o set status = 'dead', last_error = 'channel_off', net_request_id = null
  from public.notification_channels c
  where c.id = o.channel_id and not c.is_active and o.status in ('pending', 'failed') and o.net_request_id is null;

  if v_token is null then
    return 0;
  end if;

  -- Alerts that could not go out for hours are no use any more.
  update public.notification_outbox o set status = 'dead', last_error = 'stale'
  from public.notification_channels c
  where c.id = o.channel_id and c.kind = 'telegram'
    and o.status in ('pending', 'failed') and o.net_request_id is null and o.created_at < now() - interval '6 hours';

  for r in
    select o.id, o.event, o.payload, c.telegram_chat_id, c.locale
    from public.notification_outbox o
    join public.notification_channels c on c.id = o.channel_id
    where o.status in ('pending', 'failed') and o.net_request_id is null and o.next_attempt_at <= now()
      and c.is_active and c.kind = 'telegram'
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
    v_req := net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', r.telegram_chat_id, 'text', v_text, 'disable_web_page_preview', true),
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 10000);
    update public.notification_outbox
    set net_request_id = v_req, attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes'
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- The job pg_cron runs every 10 seconds: answers first, then new sends.
create function private.run_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  perform private.collect_outbox_responses();
  return private.deliver_outbox();
end $$;

-- Every minute: late tickets, silent screens, and outbox housekeeping.
create function private.run_alert_checks() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_overdue_alerts();
  perform private.enqueue_offline_alerts();
  delete from public.notification_outbox where status in ('sent', 'dead') and created_at < now() - interval '30 days';
end $$;

-- -----------------------------------------------------------------------------
-- Owner actions from the admin
-- -----------------------------------------------------------------------------
create function api.update_notification_channel(
  p_channel_id uuid, p_events text[], p_locale public.app_locale, p_is_active boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select restaurant_id into v_restaurant from public.notification_channels where id = p_channel_id;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if p_events is null or not (p_events <@ private.alert_events()) or p_locale is null or p_is_active is null then
    raise exception using errcode = '22023', message = 'invalid_events';
  end if;
  update public.notification_channels
  set events = array(select distinct e from unnest(p_events) e order by e), locale = p_locale, is_active = p_is_active
  where id = p_channel_id;
end $$;

-- «Ուղարկել փորձնական»: a test message through the normal outbox.
create function api.send_test_notification(p_channel_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.notification_channels;
begin
  select * into v_c from public.notification_channels where id = p_channel_id;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if not v_c.is_active then
    raise exception using errcode = 'RS409', message = 'channel_off';
  end if;
  if not private.rate_limit_hit('tgtest:' || p_channel_id, 3, interval '1 minute') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
  values (v_c.restaurant_id, v_c.id, 'channel.test', 'channel.test:' || gen_random_uuid(), '{}');
end $$;

-- -----------------------------------------------------------------------------
-- Schedules (pg_cron on Supabase; recorded only on the plain-Postgres harness)
-- -----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('pativ-notify', '10 seconds', 'select private.run_notifications()');
    perform cron.schedule('pativ-alerts', '* * * * *', 'select private.run_alert_checks()');
    perform cron.schedule('pativ-day-summary', '*/5 * * * *', 'select private.enqueue_day_summaries()');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.enqueue_notification(uuid, uuid, text, text, jsonb), private.enqueue_comp_notification(),
  private.enqueue_overdue_alerts(integer), private.location_in_service(uuid, timestamptz),
  private.enqueue_offline_alerts(), private.day_summary_payload(uuid, date), private.enqueue_day_summaries(timestamptz),
  private.outbox_backoff(integer), private.outbox_fail(bigint, text, integer), private.collect_outbox_responses(),
  private.deliver_outbox(integer), private.run_notifications(), private.run_alert_checks(),
  api.update_notification_channel(uuid, text[], public.app_locale, boolean), api.send_test_notification(uuid)
from public, anon, authenticated;
grant execute on function
  api.update_notification_channel(uuid, text[], public.app_locale, boolean), api.send_test_notification(uuid)
to authenticated;
