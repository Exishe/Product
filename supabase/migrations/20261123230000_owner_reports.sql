-- Owner reports (ADR-073, Phase 3.2-3.4): viewed but not ordered, busy and dead
-- hours with revenue and table time, and the upsell rate. Three read-only
-- functions that check owner or manager of the café, so the weekly Telegram
-- digest can call exactly the same ones. Definitions: ADR-073.
--
-- Shared rules
--   * The period is business days in the café's own calendar (orders and bills
--     carry business_date; guest events carry a time, so they are cut at the
--     business-day start in the café's time zone).
--   * Test data stays out: orders with is_test, and paid bills whose table
--     session has orders and only test orders (as api.sales_dashboard does).
--   * Guest events have no test flag; they are counted as recorded.
--   * Range: 1 to 92 days, like the dashboard. Events are kept 90 days, so the
--     oldest days of a long range may have no views.

-- -----------------------------------------------------------------------------
-- 1. Viewed but not ordered
-- -----------------------------------------------------------------------------
-- Per dish: views (item_view), adds (item_add), orders (units on accepted,
-- non-test QR orders, cancelled units removed) and conversion = orders / views,
-- capped at 1 (a table can order a dish nobody opened), null without views.
-- Why QR only: a view is a guest looking at a phone, so only guest orders can
-- be the result of one; waiter orders would raise the share for no reason.
--
-- Highlight rule (flagged = true): the dish has at least 20 views AND either
--   - it was never ordered (orders = 0), or
--   - its conversion is below half the café's median conversion.
-- The median is taken over dishes with at least 5 views, and only when at least
-- 3 dishes qualify; with fewer, only the "never ordered" case is flagged.
-- The reason is data, never text: {key, views, orders}. Keys:
--   never_ordered   flagged, orders = 0
--   low_share       flagged, orders > 0 (below half the median)
--   ok              not flagged
--   few_views       fewer than 20 views, too little to judge
-- The app turns the key into a sentence in the viewer's language.
create function api.item_conversion(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.restaurant_id, l.timezone, l.business_day_starts into v_restaurant, v_tz, v_starts
  from public.locations l where l.id = p_location_id;
  v_lo := (p_from + v_starts) at time zone v_tz;
  v_hi := ((p_to + 1) + v_starts) at time zone v_tz;

  with ev as (
    select g.item_id,
           count(*) filter (where g.kind = 'item_view')::integer as views,
           count(*) filter (where g.kind = 'item_add')::integer as adds
    from public.guest_events g
    where g.location_id = p_location_id and g.at >= v_lo and g.at < v_hi
      and g.kind in ('item_view', 'item_add') and g.item_id is not null
    group by g.item_id
  ), sold as (
    select oi.item_id, sum(oi.quantity - oi.cancelled_quantity)::integer as orders
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.location_id = p_location_id and o.business_date between p_from and p_to
      and o.status = 'accepted' and not o.is_test and o.source = 'qr'
      and oi.item_id is not null and oi.quantity > oi.cancelled_quantity
    group by oi.item_id
  ), base as (
    select i.id, coalesce(ev.views, 0) as views, coalesce(ev.adds, 0) as adds, coalesce(sold.orders, 0) as orders
    from public.items i
    left join ev on ev.item_id = i.id
    left join sold on sold.item_id = i.id
    where i.restaurant_id = v_restaurant and i.is_active
      and (ev.item_id is not null or sold.item_id is not null)
  ), med as (
    select case when count(*) >= 3
                then percentile_cont(0.5) within group (order by least(1, b.orders::numeric / b.views)) end as median
    from base b where b.views >= 5
  ), judged as (
    select b.*, case when b.views > 0 then round(least(1, b.orders::numeric / b.views), 4) end as conversion,
           case when b.views < 20 then 'few_views'
                when b.orders = 0 then 'never_ordered'
                when m.median is not null and least(1, b.orders::numeric / b.views) < m.median / 2 then 'low_share'
                else 'ok' end as reason
    from base b cross join med m
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'median', (select round(median::numeric, 4) from med),
    'min_views', 20,
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'id', j.id,
      'name', (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = j.id),
      'views', j.views, 'adds', j.adds, 'orders', j.orders,
      'conversion', j.conversion,
      'flagged', j.reason in ('never_ordered', 'low_share'),
      'reason', jsonb_build_object('key', j.reason, 'views', j.views, 'orders', j.orders))
      order by (j.reason in ('never_ordered', 'low_share')) desc, j.views desc, j.id) from judged j), '[]'::jsonb))
  into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Busy and dead hours: orders, revenue and table time
-- -----------------------------------------------------------------------------
-- cells: one per local weekday (ISO, 1 = Monday) and hour that has anything.
--   orders   accepted, non-test orders placed in that hour (as sales_heatmap)
--   revenue  total of paid bills closed in that hour, with the dashboard's
--            filters, so the cells add up to the dashboard's revenue for the
--            same days. The dashboard counts a day's revenue from paid bills,
--            not from orders; a café that never marks bills paid shows 0.
-- weekday_days: how many days of each weekday the period holds (index 0 =
--   Monday), so the client can show an average per day.
-- table_time: average minutes a table stayed open. A session counts when it is
--   closed, was opened on a business day of the period, has at least one
--   accepted non-test order, and lasted under 8 hours (a table left open
--   overnight is a forgotten close, not a visit). Overall and by the weekday it
--   was opened.
create function api.busy_hours(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.timezone, l.business_day_starts into v_tz, v_starts from public.locations l where l.id = p_location_id;
  v_lo := (p_from + v_starts) at time zone v_tz;
  v_hi := ((p_to + 1) + v_starts) at time zone v_tz;

  with ords as (
    select extract(isodow from o.placed_at at time zone v_tz)::integer as dow,
           extract(hour from o.placed_at at time zone v_tz)::integer as hour
    from public.orders o
    where o.location_id = p_location_id and o.business_date between p_from and p_to
      and o.status = 'accepted' and not o.is_test
  ), paid as (
    select extract(isodow from b.closed_at at time zone v_tz)::integer as dow,
           extract(hour from b.closed_at at time zone v_tz)::integer as hour,
           b.total
    from public.bills b
    where b.location_id = p_location_id and b.business_date between p_from and p_to
      and b.status = 'paid' and b.closed_at is not null
      and not (
        b.table_session_id is not null
        and exists (select 1 from public.orders t where t.table_session_id = b.table_session_id)
        and not exists (select 1 from public.orders t where t.table_session_id = b.table_session_id and not t.is_test))
  ), cells as (
    select coalesce(a.dow, r.dow) as dow, coalesce(a.hour, r.hour) as hour,
           coalesce(a.n, 0) as orders, coalesce(r.revenue, 0) as revenue
    from (select dow, hour, count(*)::integer as n from ords group by 1, 2) a
    full join (select dow, hour, sum(total)::bigint as revenue from paid group by 1, 2) r
      on r.dow = a.dow and r.hour = a.hour
  ), visits as (
    select extract(isodow from (s.opened_at at time zone v_tz) - (v_starts - time '00:00'))::integer as dow,
           extract(epoch from s.closed_at - s.opened_at) / 60.0 as minutes
    from public.table_sessions s
    where s.location_id = p_location_id and s.status = 'closed' and s.closed_at is not null
      and s.opened_at >= v_lo and s.opened_at < v_hi
      and s.closed_at - s.opened_at < interval '8 hours' and s.closed_at >= s.opened_at
      and exists (select 1 from public.orders o
                  where o.table_session_id = s.id and o.status = 'accepted' and not o.is_test)
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'timezone', v_tz,
    'orders', (select count(*) from ords),
    'revenue', (select coalesce(sum(total), 0) from paid),
    'weekday_days', (select jsonb_agg((select count(*) from generate_series(p_from, p_to, interval '1 day') d
                                       where extract(isodow from d) = w) order by w) from generate_series(1, 7) w),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'orders', orders, 'revenue', revenue)
                                        order by dow, hour) from cells), '[]'::jsonb),
    'table_time', jsonb_build_object(
      'sessions', (select count(*) from visits),
      'avg_minutes', (select round(avg(minutes)) from visits),
      'by_weekday', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'sessions', n, 'avg_minutes', m) order by dow)
                              from (select dow, count(*)::integer as n, round(avg(minutes))::integer as m
                                    from visits group by dow) w), '[]'::jsonb))
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Upsell: the "often added" suggestions in the dish sheet
-- -----------------------------------------------------------------------------
-- shown      suggestion_shown events
-- accepted   suggestion_accepted events
-- accept_rate accepted / shown, capped at 1, null when nothing was shown
-- orders_with_suggestion  accepted, non-test orders that hold a dish a guest
--            accepted as a suggestion: the order's guest session equals the
--            event's session key, the order was placed within 2 hours after
--            the acceptance, and it contains that dish. Each order counts once.
-- revenue    line totals (after cancellations) of those dishes in those orders,
--            each line once. A guest whose events used a random visit key (no
--            table session yet) cannot be tied to an order, so both numbers
--            are a lower bound (ADR-072, point 4).
-- pairs      the five most shown "dish being viewed -> suggested dish" pairs.
create function api.upsell_report(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.timezone, l.business_day_starts into v_tz, v_starts from public.locations l where l.id = p_location_id;
  v_lo := (p_from + v_starts) at time zone v_tz;
  v_hi := ((p_to + 1) + v_starts) at time zone v_tz;

  with ev as (
    select g.kind, g.item_id, g.session_key, g.at, g.meta ->> 'from' as from_item
    from public.guest_events g
    where g.location_id = p_location_id and g.at >= v_lo and g.at < v_hi
      and g.kind in ('suggestion_shown', 'suggestion_accepted')
  ), lines as (
    select distinct oi.id as line_id, o.id as order_id, oi.line_total
    from ev e
    join public.orders o on o.location_id = p_location_id
      and o.guest_session_id = case when e.session_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                                    then e.session_key::uuid end
      and o.status = 'accepted' and not o.is_test
      and o.placed_at >= e.at and o.placed_at <= e.at + interval '2 hours'
    join public.order_items oi on oi.order_id = o.id and oi.item_id = e.item_id and oi.quantity > oi.cancelled_quantity
    where e.kind = 'suggestion_accepted'
  ), pairs as (
    select e.from_item, e.item_id,
           count(*) filter (where e.kind = 'suggestion_shown')::integer as shown,
           count(*) filter (where e.kind = 'suggestion_accepted')::integer as accepted
    from ev e where e.from_item ~ '^[0-9a-f-]{36}$'
    group by 1, 2
    order by shown desc, accepted desc, 1, 2
    limit 5
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'shown', (select count(*) from ev where kind = 'suggestion_shown'),
    'accepted', (select count(*) from ev where kind = 'suggestion_accepted'),
    'accept_rate', (select case when count(*) filter (where kind = 'suggestion_shown') > 0
                                then round(least(1, count(*) filter (where kind = 'suggestion_accepted')::numeric
                                                    / count(*) filter (where kind = 'suggestion_shown')), 4) end
                    from ev),
    'orders_with_suggestion', (select count(distinct order_id) from lines),
    'revenue', (select coalesce(sum(line_total), 0) from lines),
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
        'from', p.from_item, 'item', p.item_id, 'shown', p.shown, 'accepted', p.accepted,
        'from_name', (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = p.from_item::uuid),
        'item_name', (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = p.item_id))
        order by p.shown desc, p.accepted desc, p.from_item, p.item_id) from pairs p), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  api.item_conversion(uuid, date, date), api.busy_hours(uuid, date, date), api.upsell_report(uuid, date, date)
from public, anon, authenticated;
grant execute on function
  api.item_conversion(uuid, date, date), api.busy_hours(uuid, date, date), api.upsell_report(uuid, date, date)
to authenticated;
