-- Guest event tracking (ADR-072, Phase 3.1): what guests look at and add to the
-- cart, with no personal data at all.
--
--   * public.guest_events: four guest-side kinds only (item_view, item_add,
--     suggestion_shown, suggestion_accepted). The only identifier is an
--     anonymous session key made on the phone. No name, phone, e-mail, IP or
--     user agent is stored. Owner and manager of the restaurant read; nobody
--     writes directly.
--   * api.record_guest_events(location, session, events): the one write path.
--     Callable by anon, validates everything, ignores client time, refuses
--     floods (60 events per minute per session, 1200 per minute per café).
--   * api.event_timeline(location, from, to, limit): one place for reports. It
--     unions guest_events with the order, kitchen and service-request times
--     already in the database and derives `cart_abandoned`. Never stored.
--   * private.purge_guest_events(): daily cron deletes rows older than 90 days.
--
-- Row size (free plan, 500 MB): a row is about 130 bytes of heap and about 120
-- bytes of the three small b-tree indexes, so roughly 250 bytes. A busy café
-- with 150 visits a day and about 25 events per visit writes 3 750 rows a day,
-- about 0.9 MB a day and 85 MB for the 90 days kept. Hence the 90-day limit,
-- the per-café flood cap, and batching in the app (one call of up to 20 events
-- every 5 s instead of one request per tap).

create table public.guest_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  location_id uuid not null,
  session_key text not null check (session_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('item_view', 'item_add', 'suggestion_shown', 'suggestion_accepted')),
  item_id uuid,
  at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 200),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
create index guest_events_location_idx on public.guest_events (location_id, at);
create index guest_events_item_idx on public.guest_events (item_id, at) where item_id is not null;
create index guest_events_session_idx on public.guest_events (session_key, at);
-- Append order is time order, so a block-range index is enough for the purge.
create index guest_events_at_brin on public.guest_events using brin (at);

alter table public.guest_events enable row level security;
create policy guest_events_read on public.guest_events for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
revoke all on public.guest_events from anon, authenticated;
grant select on public.guest_events to authenticated;
-- No client write grant: only api.record_guest_events inserts.

-- -----------------------------------------------------------------------------
-- Write path
-- -----------------------------------------------------------------------------

-- p_events: a JSON array of up to 20 objects {kind, item_id, meta?}. A
-- timestamp the client sends is ignored: the server clock is the time. The
-- whole call is refused when any event is wrong, so a batch is all or nothing.
create function api.record_guest_events(p_location_id uuid, p_session text, p_events jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_items jsonb;
  v_n integer;
  v_e jsonb;
  v_kind text;
  v_item text;
  v_meta jsonb;
begin
  if p_session is null or p_session !~ '^[A-Za-z0-9_-]{8,64}$' then
    raise exception 'guest_events_bad_session' using errcode = '22023';
  end if;
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'guest_events_bad_events' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_events);
  if v_n > 20 then
    raise exception 'guest_events_too_many' using errcode = '22023';
  end if;

  -- The café must be open to the public: active, with a published menu.
  select l.restaurant_id, v.snapshot -> 'items' into v_restaurant, v_items
  from public.locations l
  join public.restaurants r on r.id = l.restaurant_id
  join public.menu_versions v on v.id = l.published_menu_version_id
  where l.id = p_location_id and l.status = 'active' and r.status = 'active';
  if v_restaurant is null then
    raise exception 'guest_events_unknown_location' using errcode = '22023';
  end if;
  if v_n = 0 then
    return jsonb_build_object('recorded', 0);
  end if;

  -- Flood caps, counted on the rows already there (cheap with the indexes).
  if (select count(*) from public.guest_events where session_key = p_session and at > now() - interval '1 minute') + v_n > 60 then
    raise exception 'guest_events_rate_limited' using errcode = '54000';
  end if;
  if (select count(*) from (select 1 from public.guest_events
                            where location_id = p_location_id and at > now() - interval '1 minute' limit 1200) c) + v_n > 1200 then
    raise exception 'guest_events_rate_limited' using errcode = '54000';
  end if;

  for v_e in select e from jsonb_array_elements(p_events) e loop
    if jsonb_typeof(v_e) <> 'object' then
      raise exception 'guest_events_bad_event' using errcode = '22023';
    end if;
    v_kind := v_e ->> 'kind';
    if v_kind is null or v_kind not in ('item_view', 'item_add', 'suggestion_shown', 'suggestion_accepted') then
      raise exception 'guest_events_bad_kind' using errcode = '22023';
    end if;
    -- Every kind today is about one dish, and the dish must be on this café's published menu.
    v_item := v_e ->> 'item_id';
    if v_item is null or jsonb_typeof(v_e -> 'item_id') <> 'string' or not (v_items ? v_item) then
      raise exception 'guest_events_bad_item' using errcode = '22023';
    end if;
    -- meta: a few scalar keys only, so nothing free-form (and nothing personal) fits.
    v_meta := coalesce(v_e -> 'meta', '{}'::jsonb);
    if jsonb_typeof(v_meta) <> 'object'
       or exists (select 1 from jsonb_each(v_meta) m
                  where m.key not in ('from', 'qty', 'via')
                     or jsonb_typeof(m.value) not in ('number', 'string')
                     or (m.key = 'from' and (jsonb_typeof(m.value) <> 'string' or not (v_items ? (m.value #>> '{}'))))
                     or (m.key = 'qty' and (jsonb_typeof(m.value) <> 'number' or (m.value #>> '{}') !~ '^[0-9]{1,2}$'))
                     or (m.key = 'via' and (jsonb_typeof(m.value) <> 'string' or char_length(m.value #>> '{}') > 16)))
       or pg_column_size(v_meta) > 200 then
      raise exception 'guest_events_bad_meta' using errcode = '22023';
    end if;
    insert into public.guest_events (restaurant_id, location_id, session_key, kind, item_id, meta)
    values (v_restaurant, p_location_id, p_session, v_kind, v_item::uuid, v_meta);
  end loop;
  return jsonb_build_object('recorded', v_n);
end $$;
revoke execute on function api.record_guest_events(uuid, text, jsonb) from public;
grant execute on function api.record_guest_events(uuid, text, jsonb) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Reports: one timeline
-- -----------------------------------------------------------------------------

-- Everything that happened at a café between two times, oldest first, from:
--   guest_events                 item_view, item_add, suggestion_shown, suggestion_accepted
--   orders.placed_at             order_placed
--   orders.accepted_at           order_accepted
--   orders.ready_at              order_ready   (the slowest ticket is ready)
--   orders.served_at             order_served  (set when the last ticket is served)
--   service_requests.created_at  waiter_called (call_waiter), bill_requested (bring_bill)
--   derived                      cart_abandoned: an item_add after which the same
--                                session placed no order within 30 minutes and
--                                added nothing more in that time; at = last add + 30 min.
-- session_key is the anonymous key (for orders and requests, the guest session id).
-- Only owner and manager of the restaurant may call it; a view would run with its
-- owner's rights, so this is a function that checks the caller.
create function api.event_timeline(
  p_location_id uuid,
  p_from timestamptz default now() - interval '1 day',
  p_to timestamptz default now(),
  p_limit integer default 2000
) returns table (at timestamptz, kind text, session_key text, item_id uuid, order_id uuid, table_id uuid, meta jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.locations l
                 where l.id = p_location_id and l.restaurant_id in (select private.my_restaurant_ids('{owner,manager}'))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_to - p_from > interval '31 days' then
    raise exception 'event_timeline_range' using errcode = '22023';
  end if;
  return query
  select t.at, t.kind, t.session_key, t.item_id, t.order_id, t.table_id, t.meta
  from (
    select g.at, g.kind, g.session_key, g.item_id, null::uuid as order_id, null::uuid as table_id, g.meta
    from public.guest_events g
    where g.location_id = p_location_id and g.at >= p_from and g.at < p_to
    union all
    select o.placed_at, 'order_placed', o.guest_session_id::text, null::uuid, o.id, o.table_id, '{}'::jsonb
    from public.orders o where o.location_id = p_location_id and o.placed_at >= p_from and o.placed_at < p_to
    union all
    select o.accepted_at, 'order_accepted', o.guest_session_id::text, null::uuid, o.id, o.table_id, '{}'::jsonb
    from public.orders o where o.location_id = p_location_id and o.accepted_at >= p_from and o.accepted_at < p_to
    union all
    select o.ready_at, 'order_ready', o.guest_session_id::text, null::uuid, o.id, o.table_id, '{}'::jsonb
    from public.orders o where o.location_id = p_location_id and o.ready_at >= p_from and o.ready_at < p_to
    union all
    select o.served_at, 'order_served', o.guest_session_id::text, null::uuid, o.id, o.table_id, '{}'::jsonb
    from public.orders o where o.location_id = p_location_id and o.served_at >= p_from and o.served_at < p_to
    union all
    select s.created_at, case s.kind when 'call_waiter' then 'waiter_called' else 'bill_requested' end,
           s.guest_session_id::text, null::uuid, null::uuid, s.table_id, '{}'::jsonb
    from public.service_requests s where s.location_id = p_location_id and s.created_at >= p_from and s.created_at < p_to
    union all
    select a.at + interval '30 minutes', 'cart_abandoned', a.session_key, a.item_id, null::uuid, null::uuid, '{}'::jsonb
    from public.guest_events a
    where a.location_id = p_location_id and a.kind = 'item_add'
      and a.at + interval '30 minutes' <= now()
      and a.at + interval '30 minutes' >= p_from and a.at + interval '30 minutes' < p_to
      -- the last add of its run: nothing more added within 30 minutes
      and not exists (select 1 from public.guest_events b
                      where b.session_key = a.session_key and b.location_id = a.location_id and b.kind = 'item_add'
                        and b.at > a.at and b.at <= a.at + interval '30 minutes')
      -- and no order from that guest session in that time
      and not exists (select 1 from public.orders o
                      where o.guest_session_id::text = a.session_key
                        and o.placed_at >= a.at and o.placed_at <= a.at + interval '30 minutes')
  ) t
  order by t.at, t.kind
  limit least(greatest(coalesce(p_limit, 2000), 1), 5000);
end $$;
revoke execute on function api.event_timeline(uuid, timestamptz, timestamptz, integer) from public, anon;
grant execute on function api.event_timeline(uuid, timestamptz, timestamptz, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Retention: 90 days, deleted in small batches so one night's job never holds
-- a long lock or a big write on the free plan.
-- -----------------------------------------------------------------------------
create function private.purge_guest_events(p_days integer default 90) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_total integer := 0; v_n integer;
begin
  loop
    delete from public.guest_events
    where id in (select id from public.guest_events where at < now() - make_interval(days => p_days) order by id limit 5000);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n < 5000;
  end loop;
  return v_total;
end $$;
revoke execute on function private.purge_guest_events(integer) from public, anon, authenticated;

do $$
begin
  -- pg_cron was created by an earlier migration where the platform has it.
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-purge-guest-events') then
      perform cron.unschedule('pativ-purge-guest-events');
    end if;
    perform cron.schedule('pativ-purge-guest-events', '50 2 * * *', $job$select private.purge_guest_events()$job$);
  else
    raise notice 'pg_cron is not available: the guest events purge is not scheduled';
  end if;
end $$;
