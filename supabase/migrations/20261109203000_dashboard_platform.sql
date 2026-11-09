-- Milestone 10: the owner's sales dashboard, daily metrics (ADR-037) and the
-- platform admin (screens 16 and 17). Definitions: docs/05-business/metrics.md.

-- -----------------------------------------------------------------------------
-- Owner dashboard: one call per screen, numbers for the caller's location only
-- -----------------------------------------------------------------------------
-- Money comes from paid bills; orders are real orders (accepted, not a test).
-- The comparison period is the same weekdays shifted back by whole weeks; when
-- the range includes today, it stops at the same time of day.
create function api.sales_dashboard(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_restaurant uuid;
  v_today date;
  v_shift integer;
  v_cutoff timestamptz;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.timezone, l.restaurant_id into v_tz, v_restaurant from public.locations l where l.id = p_location_id;
  v_today := private.business_date(p_location_id);
  v_shift := ceil((p_to - p_from + 1) / 7.0)::integer * 7;
  v_cutoff := case when p_to >= v_today then now() - make_interval(days => v_shift) end;

  with real_orders as (
    select o.* from public.orders o
    where o.location_id = p_location_id and o.business_date between p_from and p_to
      and o.status = 'accepted' and not o.is_test
  ), paid as (
    select b.total from public.bills b
    where b.location_id = p_location_id and b.business_date between p_from and p_to and b.status = 'paid'
  ), prev_orders as (
    select o.placed_at from public.orders o
    where o.location_id = p_location_id
      and o.business_date between p_from - v_shift and p_to - v_shift
      and o.status = 'accepted' and not o.is_test
      and (v_cutoff is null or o.placed_at <= v_cutoff)
  ), prev_paid as (
    select b.total from public.bills b
    where b.location_id = p_location_id
      and b.business_date between p_from - v_shift and p_to - v_shift and b.status = 'paid'
      and (v_cutoff is null or b.closed_at <= v_cutoff)
  ), sold as (
    select coalesce(oi.item_id::text, oi.name_i18n ->> 'hy') as k,
           (array_agg(oi.name_i18n order by oi.created_at desc))[1] as name,
           sum(oi.quantity - oi.cancelled_quantity)::integer as qty,
           sum(oi.line_total)::integer as revenue
    from public.order_items oi join real_orders o on o.id = oi.order_id
    where oi.quantity > oi.cancelled_quantity
    group by 1
  ), top as (
    select * from sold order by revenue desc, qty desc, k limit 5
  ), menu_items as (
    select i.id::text as k,
           (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = i.id) as name,
           coalesce(s.qty, 0) as qty, coalesce(s.revenue, 0) as revenue, i.sort
    from public.items i
    left join sold s on s.k = i.id::text
    where i.restaurant_id = v_restaurant and i.is_active
      and not exists (select 1 from top where top.k = i.id::text)
  ), tickets as (
    select k.station_id, extract(epoch from k.ready_at - k.created_at) as secs
    from public.kitchen_tickets k join real_orders o on o.id = k.order_id
    where k.kind = 'order' and k.ready_at is not null
  ), cancels as (
    select h.reason, coalesce(nullif(split_part(h.to_status, ':', 2), '')::integer, 1) as qty
    from public.order_status_history h
    join public.orders o on o.id = h.order_id
    where o.location_id = p_location_id and o.business_date between p_from and p_to and not o.is_test
      and h.entity = 'order_item' and h.to_status like 'cancelled%'
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'today', v_today, 'partial', p_to >= v_today,
    'timezone', v_tz, 'shift_days', v_shift,
    'summary', jsonb_build_object(
      'revenue', (select coalesce(sum(total), 0) from paid),
      'bills', (select count(*) from paid),
      'avg_bill', (select coalesce(round(avg(total)), 0)::integer from paid),
      'orders', (select count(*) from real_orders),
      'qr_orders', (select count(*) from real_orders where source = 'qr'),
      'waiter_orders', (select count(*) from real_orders where source = 'waiter'),
      'items_sold', (select coalesce(sum(qty), 0) from sold)),
    'compare', jsonb_build_object(
      'revenue', (select coalesce(sum(total), 0) from prev_paid),
      'bills', (select count(*) from prev_paid),
      'avg_bill', (select coalesce(round(avg(total)), 0)::integer from prev_paid),
      'orders', (select count(*) from prev_orders)),
    'open_tables', (
      select jsonb_build_object('count', count(distinct s.id), 'total', coalesce(sum(o.total), 0))
      from public.table_sessions s
      left join public.orders o on o.table_session_id = s.id and o.status = 'accepted' and not o.is_test
      where s.location_id = p_location_id and s.status = 'open'),
    'hourly', (
      select jsonb_agg(jsonb_build_object('hour', h,
               'orders', (select count(*) from real_orders o where extract(hour from o.placed_at at time zone v_tz) = h),
               'compare_orders', (select count(*) from public.orders o
                                  where o.location_id = p_location_id
                                    and o.business_date between p_from - v_shift and p_to - v_shift
                                    and o.status = 'accepted' and not o.is_test
                                    and extract(hour from o.placed_at at time zone v_tz) = h)) order by h)
      from generate_series(0, 23) h),
    'top_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue)
                                             order by revenue desc, qty desc, k), '[]'::jsonb) from top),
    'weak_dishes', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', revenue)
                                              order by qty, revenue, sort, k), '[]'::jsonb)
                    from (select * from menu_items order by qty, revenue, sort, k limit 3) w),
    'kitchen', (select coalesce(jsonb_agg(jsonb_build_object(
                  'station', st.name, 'is_default', st.is_default, 'tickets', x.n,
                  'avg_seconds', x.avg_s, 'over_limit', x.over) order by st.sort, st.name), '[]'::jsonb)
                from (select station_id, count(*) as n, round(avg(secs))::integer as avg_s,
                             count(*) filter (where secs > 20 * 60) as over
                      from tickets group by station_id) x
                join public.stations st on st.id = x.station_id),
    'cancellations', jsonb_build_object(
      'items', (select coalesce(sum(qty), 0) from cancels),
      'rejected_orders', (select count(*) from public.orders o
                          where o.location_id = p_location_id and o.business_date between p_from and p_to
                            and o.status = 'rejected' and not o.is_test),
      'reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'count', n) order by n desc, reason), '[]'::jsonb)
                  from (select reason, sum(qty)::integer as n from cancels where reason is not null and reason <> ''
                        group by reason order by n desc, reason limit 5) r))
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- metrics_daily: one row per location per business day (ADR-037)
-- -----------------------------------------------------------------------------
create table public.metrics_daily (
  restaurant_id uuid not null,
  location_id uuid not null,
  business_date date not null,
  orders integer not null default 0,
  qr_orders integer not null default 0,
  waiter_orders integer not null default 0,
  bills integer not null default 0,
  revenue integer not null default 0,
  avg_bill integer,
  screen_p50_s numeric,          -- order to kitchen screen, straight-to-kitchen orders
  screen_p95_s numeric,
  accept_p90_s numeric,          -- waiter acceptance wait
  kitchen_avg_s numeric,         -- ticket created to ready
  tickets_ready integer not null default 0,
  tickets_over_limit integer not null default 0,
  computed_at timestamptz not null default now(),
  primary key (location_id, business_date),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
alter table public.metrics_daily enable row level security;
create policy metrics_daily_read on public.metrics_daily for select to authenticated
  using (location_id in (select private.my_location_ids('{owner,manager}')) or (select private.is_platform_admin()));
revoke all on public.metrics_daily from anon, authenticated;
grant select on public.metrics_daily to authenticated;
grant all on public.metrics_daily to service_role;

-- Recomputes one business day for every active location. Safe to run again.
create function private.compute_metrics_daily(p_date date) returns integer
language sql security definer set search_path = '' as $$
  with rows as (
    insert into public.metrics_daily as m (
      restaurant_id, location_id, business_date, orders, qr_orders, waiter_orders, bills, revenue, avg_bill,
      screen_p50_s, screen_p95_s, accept_p90_s, kitchen_avg_s, tickets_ready, tickets_over_limit, computed_at)
    select l.restaurant_id, l.id, p_date,
           coalesce(o.n, 0), coalesce(o.qr, 0), coalesce(o.waiter, 0),
           coalesce(b.n, 0), coalesce(b.revenue, 0), b.avg_bill,
           s.p50, s.p95, a.p90, k.avg_s, coalesce(k.n, 0), coalesce(k.over, 0), now()
    from public.locations l
    left join lateral (
      select count(*) as n, count(*) filter (where x.source = 'qr') as qr,
             count(*) filter (where x.source = 'waiter') as waiter
      from public.orders x
      where x.location_id = l.id and x.business_date = p_date and x.status = 'accepted' and not x.is_test) o on true
    left join lateral (
      select count(*) as n, sum(x.total) as revenue, round(avg(x.total))::integer as avg_bill
      from public.bills x
      where x.location_id = l.id and x.business_date = p_date and x.status = 'paid') b on true
    left join lateral (
      select percentile_cont(0.5) within group (order by extract(epoch from t.first_seen_at - x.placed_at)) as p50,
             percentile_cont(0.95) within group (order by extract(epoch from t.first_seen_at - x.placed_at)) as p95
      from public.orders x join public.kitchen_tickets t on t.order_id = x.id and t.kind = 'order'
      where x.location_id = l.id and x.business_date = p_date and not x.is_test
        and x.accepted_at = x.placed_at and t.first_seen_at is not null) s on true
    left join lateral (
      select percentile_cont(0.9) within group (order by extract(epoch from x.accepted_at - x.placed_at)) as p90
      from public.orders x
      where x.location_id = l.id and x.business_date = p_date and not x.is_test
        and x.accepted_at > x.placed_at) a on true
    left join lateral (
      select count(*) as n, round(avg(extract(epoch from t.ready_at - t.created_at)), 1) as avg_s,
             count(*) filter (where t.ready_at - t.created_at > interval '20 minutes') as over
      from public.kitchen_tickets t join public.orders x on x.id = t.order_id
      where x.location_id = l.id and x.business_date = p_date and x.status = 'accepted' and not x.is_test
        and t.kind = 'order' and t.ready_at is not null) k on true
    where l.status = 'active'
    on conflict (location_id, business_date) do update set
      orders = excluded.orders, qr_orders = excluded.qr_orders, waiter_orders = excluded.waiter_orders,
      bills = excluded.bills, revenue = excluded.revenue, avg_bill = excluded.avg_bill,
      screen_p50_s = excluded.screen_p50_s, screen_p95_s = excluded.screen_p95_s,
      accept_p90_s = excluded.accept_p90_s, kitchen_avg_s = excluded.kitchen_avg_s,
      tickets_ready = excluded.tickets_ready, tickets_over_limit = excluded.tickets_over_limit,
      computed_at = excluded.computed_at
    returning 1)
  select count(*)::integer from rows
$$;

-- 05:30 Yerevan (01:30 UTC), after the business day (05:00 start) has closed.
-- Supabase preloads pg_cron; the plain-Postgres test harness does not, so the
-- schedule is skipped there.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and coalesce(current_setting('shared_preload_libraries', true), '') like '%pg_cron%' then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('metrics-daily', '30 1 * * *',
      $job$select private.compute_metrics_daily((now() at time zone 'Asia/Yerevan')::date - 1)$job$);
  else
    raise notice 'pg_cron is not available: metrics-daily is not scheduled';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Platform admin (screens 16 and 17)
-- -----------------------------------------------------------------------------
create function private.assert_platform_admin() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- Every location with its plan, last order, devices online and the last 28
-- days from metrics_daily.
create function api.platform_cafes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_platform_admin();
  select coalesce(jsonb_agg(jsonb_build_object(
      'restaurant_id', r.id, 'restaurant_name', r.name, 'slug', r.slug, 'restaurant_status', r.status,
      'created_at', r.created_at, 'location_id', l.id, 'location_name', l.name,
      'plan', s.plan, 'status', s.status, 'price_amd', s.price_amd, 'trial_ends_at', s.trial_ends_at,
      'current_period_end', s.current_period_end,
      'last_order_at', (select max(o.placed_at) from public.orders o
                        where o.location_id = l.id and o.status = 'accepted' and not o.is_test),
      'devices_online', (select count(*) from public.members m
                         where m.restaurant_id = r.id and m.kind = 'device' and m.is_active
                           and m.last_seen_at > now() - interval '5 minutes'),
      'orders_per_open_day', (select round(sum(d.orders)::numeric / nullif(count(*) filter (where d.orders > 0), 0), 1)
                              from public.metrics_daily d
                              where d.location_id = l.id and d.business_date >= current_date - 28),
      'qr_share_pct', (select round(100.0 * sum(d.qr_orders) / nullif(sum(d.orders), 0))
                       from public.metrics_daily d
                       where d.location_id = l.id and d.business_date >= current_date - 28)
    ) order by r.created_at desc, l.name), '[]'::jsonb)
  into v
  from public.restaurants r
  join public.locations l on l.restaurant_id = r.id
  left join public.subscriptions s on s.location_id = l.id;
  return v;
end $$;

-- Changing a plan by hand (Stage 1 bills by invoice). Logged in the audit log.
create function api.platform_set_plan(p_location_id uuid, p_plan text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.subscriptions;
  v_status public.subscription_status;
begin
  perform private.assert_platform_admin();
  if p_plan not in ('menu', 'service') or p_status not in ('trialing', 'active', 'past_due', 'canceled') then
    raise exception using errcode = '22023', message = 'invalid_plan';
  end if;
  v_status := p_status::public.subscription_status;
  select * into v_old from public.subscriptions where location_id = p_location_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'subscription_not_found'; end if;

  update public.subscriptions set
    plan = p_plan,
    status = v_status,
    price_amd = case when p_plan = 'menu' or v_status = 'trialing' then 0
                     when v_old.price_amd > 0 then v_old.price_amd   -- keeps a founding café's price
                     else 15000 end,
    current_period_end = case when v_status = 'active' and (v_old.current_period_end is null or v_old.current_period_end < now())
                              then now() + interval '1 month' else v_old.current_period_end end,
    converted_at = case when p_plan = 'service' and v_status = 'active' and v_old.converted_at is null
                        then now() else v_old.converted_at end,
    canceled_at = case when v_status = 'canceled' then coalesce(v_old.canceled_at, now()) else null end
  where id = v_old.id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_old.restaurant_id, p_location_id, 'platform_admin', auth.uid(), 'subscription.changed', 'subscription', v_old.id,
          jsonb_build_object('from', jsonb_build_object('plan', v_old.plan, 'status', v_old.status),
                             'to', jsonb_build_object('plan', p_plan, 'status', p_status)));
end $$;

-- Delivery problems: dead Telegram messages, failed imports (7 days), devices
-- silent for more than a day.
create function api.platform_problems() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.assert_platform_admin();
  select jsonb_build_object(
    'dead_letters', (select coalesce(jsonb_agg(jsonb_build_object(
                       'id', x.id, 'restaurant_name', r.name, 'event', x.event, 'attempts', x.attempts,
                       'last_error', x.last_error, 'created_at', x.created_at) order by x.created_at desc), '[]'::jsonb)
                     from (select * from public.notification_outbox where status = 'dead'
                           order by created_at desc limit 100) x
                     join public.restaurants r on r.id = x.restaurant_id),
    'failed_imports', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', i.id, 'restaurant_name', r.name, 'error', i.error, 'created_at', i.created_at)
                         order by i.created_at desc), '[]'::jsonb)
                       from public.menu_imports i join public.restaurants r on r.id = i.restaurant_id
                       where i.status = 'failed' and i.created_at > now() - interval '7 days'),
    'offline_devices', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', m.id, 'restaurant_name', r.name, 'display_name', m.display_name, 'role', m.role,
                          'last_seen_at', m.last_seen_at) order by m.last_seen_at nulls first), '[]'::jsonb)
                        from public.members m join public.restaurants r on r.id = m.restaurant_id
                        where m.kind = 'device' and m.is_active and r.status = 'active'
                          and coalesce(m.last_seen_at, m.created_at) < now() - interval '1 day'))
  into v;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  api.sales_dashboard(uuid, date, date), private.compute_metrics_daily(date), private.assert_platform_admin(),
  api.platform_cafes(), api.platform_set_plan(uuid, text, text), api.platform_problems()
from public, anon, authenticated;
grant execute on function
  api.sales_dashboard(uuid, date, date), api.platform_cafes(), api.platform_set_plan(uuid, text, text),
  api.platform_problems()
to authenticated;
grant execute on function private.compute_metrics_daily(date) to service_role;
