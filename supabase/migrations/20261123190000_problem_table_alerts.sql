-- Problem tables in real time (ADR-071). Two conditions raise an alert:
--   1. slow: an accepted order not served within the café's limit (default 25 min);
--   2. calls: a table pressed "call waiter" N times (default 3) and nobody has
--      answered the request yet.
-- The admin screen and the waiters read the live list (api.table_alerts); the
-- same list is sent once per condition to the linked Telegram chats and phones
-- by the existing minute job (pativ-alerts). Nothing is stored per alert: the
-- list is computed from the orders and requests, so an alert disappears by
-- itself when the order is served or the request is acknowledged or resolved.

-- -----------------------------------------------------------------------------
-- 1. The owner's limits, per café
-- -----------------------------------------------------------------------------
alter table public.locations
  add column overdue_minutes integer not null default 25,
  add column repeat_call_threshold integer not null default 3,
  add constraint locations_overdue_minutes_range check (overdue_minutes between 5 and 180),
  add constraint locations_repeat_call_range check (repeat_call_threshold between 2 and 10);
-- No client write grant on these columns: api.set_alert_settings changes them.

-- -----------------------------------------------------------------------------
-- 2. Counting presses. A repeat press collapses into the open request
-- (service_requests_one_open); it now also counts. A second tap within 5 s of
-- the last one is a double tap, not a new press. Only a request nobody has
-- acknowledged keeps counting.
-- -----------------------------------------------------------------------------
alter table public.service_requests
  add column press_count integer not null default 1,
  add column last_pressed_at timestamptz not null default now();

create function private.count_service_press(p_request_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.service_requests
  set press_count = least(press_count + 1, 99), last_pressed_at = now()
  where id = p_request_id and status = 'open' and last_pressed_at <= now() - interval '5 seconds'
$$;

-- Same body as 20261110120000_bill_payment_preference, plus the press count.
create or replace function api.guest_service_request(
  p_guest_session_id uuid,
  p_kind public.service_request_kind,
  p_payment_preference text default null
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_payment_preference is not null
     and (p_kind <> 'bring_bill' or p_payment_preference not in ('card', 'cash')) then
    raise exception using errcode = '22023', message = 'invalid_payment_preference';
  end if;
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> auth.uid() or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'table_unavailable';
  end if;

  select r.id into v_id from public.service_requests r
  where r.table_id = v_table.id and r.kind = p_kind and r.status <> 'resolved';
  if found then
    if p_payment_preference is not null then
      update public.service_requests set payment_preference = p_payment_preference
      where id = v_id and payment_preference is distinct from p_payment_preference;
    end if;
    perform private.count_service_press(v_id);
    return v_id;
  end if;

  if not private.rate_limit_hit('service:guest:' || v_guest.id, 10, interval '10 minutes') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  insert into public.service_requests (restaurant_id, location_id, table_id, table_session_id, guest_session_id, kind, payment_preference)
  values (v_guest.restaurant_id, v_guest.location_id, v_table.id, v_guest.table_session_id, v_guest.id, p_kind, p_payment_preference)
  on conflict (table_id, kind) where status <> 'resolved' do nothing
  returning id into v_id;
  if v_id is null then
    -- Another phone at the table asked at the same moment.
    select r.id into v_id from public.service_requests r
    where r.table_id = v_table.id and r.kind = p_kind and r.status <> 'resolved';
    if p_payment_preference is not null then
      update public.service_requests set payment_preference = p_payment_preference
      where id = v_id and payment_preference is distinct from p_payment_preference;
    end if;
    perform private.count_service_press(v_id);
  end if;
  update public.guest_sessions set last_seen_at = now() where id = v_guest.id;
  return v_id;
end $$;

-- -----------------------------------------------------------------------------
-- 3. The live list. p_location_id null = every café (the minute job).
-- Slow: accepted, not served, not paid, not a test order, placed within the
-- last 6 hours (older ones are forgotten, not late). The limit is the café's.
-- Calls: an open "call waiter" request with enough presses.
-- -----------------------------------------------------------------------------
create function private.table_alerts_live(p_location_id uuid default null)
returns table (
  reason text, ref_id uuid, restaurant_id uuid, location_id uuid, table_id uuid, table_label text,
  order_number integer, minutes integer, presses integer, since timestamptz
)
language sql stable security definer set search_path = '' as $$
  select 'slow'::text, o.id, o.restaurant_id, o.location_id, o.table_id, t.label, o.number,
         floor(extract(epoch from now() - o.placed_at) / 60)::integer, null::integer, o.placed_at
  from public.orders o
  join public.locations l on l.id = o.location_id
  left join public.tables t on t.id = o.table_id
  where (p_location_id is null or o.location_id = p_location_id)
    and o.status = 'accepted' and o.kitchen_status <> 'served' and not o.is_test and o.paid_at is null
    and o.placed_at <= now() - make_interval(mins => l.overdue_minutes)
    and o.placed_at > now() - interval '6 hours'
  union all
  select 'calls'::text, r.id, r.restaurant_id, r.location_id, r.table_id, t.label, null::integer,
         floor(extract(epoch from now() - r.created_at) / 60)::integer, r.press_count, r.created_at
  from public.service_requests r
  join public.locations l on l.id = r.location_id
  join public.tables t on t.id = r.table_id
  where (p_location_id is null or r.location_id = p_location_id)
    and r.kind = 'call_waiter' and r.status = 'open' and r.press_count >= l.repeat_call_threshold
$$;

-- What the admin home and the waiter app poll: the problem tables of one café,
-- longest wait first. Owners, managers and waiters of that café only.
create function api.table_alerts(p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,waiter}');
  return coalesce((
    select jsonb_agg(jsonb_build_object('reason', a.reason, 'id', a.ref_id, 'table', a.table_label,
                                        'number', a.order_number, 'minutes', a.minutes, 'presses', a.presses)
                     order by a.minutes desc, a.ref_id)
    from private.table_alerts_live(p_location_id) a), '[]'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- 4. Telegram and phones: a new alert kind, one message per condition.
-- The current renderer (push_guests_waiters already wraps the first one) keeps
-- every other message; this layer adds table.alert.
-- -----------------------------------------------------------------------------
alter function private.render_notification(text, jsonb, public.app_locale) rename to render_notification_staff;

create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_table text := coalesce(nullif(p_payload ->> 'table', ''), '?');
  v_min text := coalesce(p_payload ->> 'minutes', '0');
  v_presses text := coalesce(p_payload ->> 'presses', '0');
begin
  if p_kind <> 'table.alert' then
    return private.render_notification_staff(p_kind, p_payload, p_locale);
  end if;
  if p_payload ->> 'reason' = 'calls' then
    return case l
      when 'hy' then 'Սեղան ' || v_table || '՝ մատուցողին կանչել են ' || v_presses || ' անգամ, պատասխան չկա (' || v_min || ' րոպե)։'
      when 'ru' then 'Стол ' || v_table || ': официанта звали ' || v_presses || ' раз, ответа нет (' || v_min || ' мин).'
      else 'Table ' || v_table || ': called the waiter ' || v_presses || ' times, no answer (' || v_min || ' min).' end;
  end if;
  return case l
    when 'hy' then 'Սեղան ' || v_table || '՝ պատվերը դեռ չի մատուցվել, անցել է ' || v_min || ' րոպե։'
    when 'ru' then 'Стол ' || v_table || ': заказ не подан уже ' || v_min || ' мин.'
    else 'Table ' || v_table || ': order not served for ' || v_min || ' min.' end;
end $$;

-- The new alert can be switched per chat like the others; it is on by default
-- (exceptions only, ADR-040) and added to chats that already get late orders.
create or replace function private.alert_events() returns text[]
language sql immutable set search_path = '' as $$
  select '{order.placed,order.overdue,station.offline,order.comped,day.summary,table.alert}'::text[]
$$;

alter table public.notification_channels drop constraint notification_channels_events_known;
alter table public.notification_channels
  add constraint notification_channels_events_known
  check (events <@ '{order.placed,order.overdue,station.offline,order.comped,day.summary,table.alert}'::text[]);
alter table public.notification_channels
  alter column events set default '{order.overdue,station.offline,order.comped,day.summary,table.alert}';
update public.notification_channels set events = events || '{table.alert}'
where 'order.overdue' = any (events) and not ('table.alert' = any (events));

-- One outbox row per chat and condition: the key names the order or the request.
create function private.enqueue_table_alerts() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_n integer := 0;
begin
  for r in select * from private.table_alerts_live(null) loop
    v_n := v_n + private.enqueue_notification(r.restaurant_id, r.location_id, 'table.alert',
      'table.alert:' || r.reason || ':' || r.ref_id,
      jsonb_build_object('reason', r.reason, 'table', r.table_label, 'number', r.order_number,
                         'minutes', r.minutes, 'presses', r.presses));
  end loop;
  return v_n;
end $$;

-- Every minute: late tickets, problem tables, silent screens, housekeeping
-- (the body of 20261109200100 plus the new check).
create or replace function private.run_alert_checks() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_overdue_alerts();
  perform private.enqueue_table_alerts();
  perform private.enqueue_offline_alerts();
  delete from public.notification_outbox where status in ('sent', 'dead') and created_at < now() - interval '30 days';
end $$;

-- -----------------------------------------------------------------------------
-- 5. The owner's settings
-- -----------------------------------------------------------------------------
create function api.set_alert_settings(p_location_id uuid, p_overdue_minutes integer, p_repeat_calls integer)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_overdue_minutes is null or p_overdue_minutes not between 5 and 180 then
    raise exception using errcode = '22023', message = 'invalid_minutes';
  end if;
  if p_repeat_calls is null or p_repeat_calls not between 2 and 10 then
    raise exception using errcode = '22023', message = 'invalid_calls';
  end if;

  update public.locations
  set overdue_minutes = p_overdue_minutes, repeat_call_threshold = p_repeat_calls
  where id = p_location_id
  returning restaurant_id into v_restaurant;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'alerts.settings', 'location', p_location_id,
          jsonb_build_object('overdue_minutes', p_overdue_minutes, 'repeat_calls', p_repeat_calls));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function private.count_service_press(uuid) from public, anon, authenticated;
revoke execute on function private.table_alerts_live(uuid) from public, anon, authenticated;
revoke execute on function private.render_notification_staff(text, jsonb, public.app_locale) from public, anon, authenticated;
revoke execute on function private.render_notification(text, jsonb, public.app_locale) from public, anon, authenticated;
revoke execute on function private.alert_events() from public, anon, authenticated;
revoke execute on function private.enqueue_table_alerts() from public, anon, authenticated;
revoke execute on function api.table_alerts(uuid) from public, anon, authenticated;
grant execute on function api.table_alerts(uuid) to authenticated;
revoke execute on function api.set_alert_settings(uuid, integer, integer) from public, anon, authenticated;
grant execute on function api.set_alert_settings(uuid, integer, integer) to authenticated;
revoke execute on function api.guest_service_request(uuid, public.service_request_kind, text) from public, anon, authenticated;
grant execute on function api.guest_service_request(uuid, public.service_request_kind, text) to authenticated;
