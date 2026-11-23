-- Weekly Telegram digest (ADR-074, Phase 3.6): every Monday 09:00 (the café's
-- time zone) the owner gets up to three findings, each with one suggested
-- action, about the week that just ended. Chosen by RULES from the numbers the
-- owner reports already compute (ADR-073); no AI, no new data, no personal data.
--
--   1. private cores of the four report functions (the cron job has no
--      auth.uid(); the api.* functions keep their checks and results)
--   2. private.weekly_digest_payload: the rule engine, data only (keys, numbers)
--   3. the weekly.digest message in hy / ru / en (extends private.render_notification)
--   4. the event kind and its per-channel toggle
--   5. the schedule: private.enqueue_weekly_digests, pg_cron every 15 minutes
--   6. api.last_weekly_digest: the same message on the Reports page

-- -----------------------------------------------------------------------------
-- 1. Cores of the report functions. Bodies are the ones of 20261119024332 and
-- 20261123230000 without the caller check; the api.* wrappers below check the
-- caller and call them, so their behavior is unchanged. menu_engineering's
-- cost visibility becomes a parameter: the digest passes false (costs are an
-- owner-only number and managers read the digest too).
-- -----------------------------------------------------------------------------
create function private.item_conversion_core(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
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

create function private.busy_hours_core(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
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

create function private.upsell_report_core(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_starts time;
  v_lo timestamptz;
  v_hi timestamptz;
  v_result jsonb;
begin
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

create function private.menu_engineering_core(p_location_id uuid, p_from date, p_to date, p_owner boolean) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_owner boolean;
  v_result jsonb;
begin
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  v_owner := coalesce(p_owner, false);

  with sold as (
    select oi.item_id, sum(oi.quantity - oi.cancelled_quantity)::integer as qty,
           sum(oi.line_total)::integer as revenue
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.location_id = p_location_id and o.business_date between p_from and p_to
      and o.status = 'accepted' and not o.is_test
      and oi.item_id is not null and oi.quantity > oi.cancelled_quantity
    group by oi.item_id
  ), dishes as (
    select i.id, i.category_id, i.price, i.sort,
           case when v_owner then c.cost end as cost,
           coalesce(s.qty, 0) as qty, coalesce(s.revenue, 0) as revenue
    from public.items i
    left join sold s on s.item_id = i.id
    left join public.item_costs c on c.item_id = i.id
    where i.restaurant_id = v_restaurant and i.is_active
  ), sections as (
    select d.category_id,
           count(*) as n,
           sum(d.qty) as qty,
           bool_and(d.cost is not null) as costed
    from dishes d group by d.category_id
  ), scored as (
    select d.*, s.n, s.qty as section_qty,
           case when s.costed then 'margin' else 'price' end as basis,
           case when s.costed then d.price - d.cost else d.price end as margin
    from dishes d join sections s on s.category_id = d.category_id
  ), thresholds as (
    select category_id,
           0.7 * max(section_qty)::numeric / max(n) as pop_line,
           case when sum(qty) > 0 then sum(margin * qty)::numeric / sum(qty) else avg(margin) end as margin_line
    from scored group by category_id
  ), classified as (
    select sc.*, t.pop_line, t.margin_line,
           case when sc.section_qty = 0 then null
                when sc.qty >= t.pop_line and sc.margin >= t.margin_line then 'star'
                when sc.qty >= t.pop_line then 'plowhorse'
                when sc.margin >= t.margin_line then 'puzzle'
                else 'dog' end as quadrant
    from scored sc join thresholds t on t.category_id = sc.category_id
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to, 'owner', v_owner,
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', cat.id,
               'name', (select jsonb_object_agg(t.locale, t.name) from public.category_translations t where t.category_id = cat.id),
               'basis', x.basis,
               'popularity_line', round(x.pop_line, 1),
               'margin_line', round(x.margin_line),
               'dishes', x.dishes)
             order by cat.sort, cat.id)
      from (select category_id, min(basis) as basis, min(pop_line) as pop_line, min(margin_line) as margin_line,
                   jsonb_agg(jsonb_build_object(
                     'id', id,
                     'name', (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = classified.id),
                     'price', price, 'cost', cost, 'margin', margin, 'qty', qty, 'revenue', revenue,
                     'quadrant', quadrant) order by qty desc, revenue desc, sort, id) as dishes
            from classified group by category_id) x
      join public.categories cat on cat.id = x.category_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function api.item_conversion(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return private.item_conversion_core(p_location_id, p_from, p_to);
end $$;

create or replace function api.busy_hours(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return private.busy_hours_core(p_location_id, p_from, p_to);
end $$;

create or replace function api.upsell_report(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return private.upsell_report_core(p_location_id, p_from, p_to);
end $$;

create or replace function api.menu_engineering(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return private.menu_engineering_core(p_location_id, p_from, p_to,
    exists (select 1 from private.my_restaurant_ids('{owner}') r
            where r = (select l.restaurant_id from public.locations l where l.id = p_location_id)));
end $$;

-- -----------------------------------------------------------------------------
-- 2. The rule engine
-- -----------------------------------------------------------------------------
-- One week (p_from .. p_to, seven business days) of one café in, a jsonb out:
--   {location_id, from, to, orders, revenue, enough, min_orders,
--    findings: [{key, ...numbers, item?}], actions: [{key, ...}]}
-- findings[i] belongs to actions[i]. Keys are data; the texts live in the
-- renderer (section 3). At most 3 findings; fewer when the data lacks.
--
-- Gate: fewer than 20 orders in the week (accepted, not test): enough = false,
-- no findings (the schedule decides whether to say "not enough data yet").
--
-- Candidates (one per rule, thresholds are in ADR-074); score = base + bonus:
--   unordered   80 + views/10 (max 20)   the most viewed flagged dish of item_conversion
--   wow         60 + |change|/2 (max 30) orders or revenue up/down by 15 % or more vs the week before
--   slow        75 + alerts (max 20)     3 or more slow orders / repeated calls
--   workhorse   70 + units/5 (max 20)    popular, price below its section's line, 10+ units
--   puzzle      65 + price/200 (max 20)  priced above the line, rarely ordered, section sold 30+ units
--   dog         60 + section units/20    rarely ordered and below the line, section sold 30+ units
--   busiest     55 + orders/3 (max 20)   the peak weekday-hour, 6+ orders and 10 % of the week
--   dead        50                       an hour inside opening hours with 20 % of the hourly average or less
--   suggestions 45 + shown/10 (max 15)   30+ suggestions shown, accepted 20 % or more, or 5 % or less
-- The three best scores win; a tie goes to the rule listed first above; a dish
-- appears in one finding only (the next rule's candidate takes its place).
create function private.weekly_digest_payload(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c_min_orders constant integer := 20;
  v_tz text;
  v_starts time;
  v_overdue integer;
  v_calls integer;
  v_lo timestamptz;
  v_hi timestamptz;
  v_shift integer := p_to - p_from + 1;
  v_busy jsonb;
  v_prev jsonb;
  v_conv jsonb;
  v_eng jsonb;
  v_ups jsonb;
  v_orders integer;
  v_revenue bigint;
  v_dishes jsonb;
  v_cands jsonb := '[]'::jsonb;
  v_findings jsonb := '[]'::jsonb;
  v_actions jsonb := '[]'::jsonb;
  v_used text[] := '{}';
  v_e jsonb;
  v_n integer;
  v_m integer;
  v_cur numeric;
  v_old numeric;
  v_pct integer;
  v_metric text;
  v_rate numeric;
  c jsonb;
begin
  select l.timezone, l.business_day_starts, l.overdue_minutes, l.repeat_call_threshold
  into v_tz, v_starts, v_overdue, v_calls
  from public.locations l where l.id = p_location_id;
  if not found then
    return null;
  end if;
  v_lo := (p_from + v_starts) at time zone v_tz;
  v_hi := ((p_to + 1) + v_starts) at time zone v_tz;

  v_busy := private.busy_hours_core(p_location_id, p_from, p_to);
  v_orders := (v_busy ->> 'orders')::integer;
  v_revenue := (v_busy ->> 'revenue')::bigint;
  if v_orders < c_min_orders then
    return jsonb_build_object('location_id', p_location_id, 'from', p_from, 'to', p_to, 'orders', v_orders,
                              'revenue', v_revenue, 'enough', false, 'min_orders', c_min_orders,
                              'findings', '[]'::jsonb, 'actions', '[]'::jsonb);
  end if;
  v_conv := private.item_conversion_core(p_location_id, p_from, p_to);
  v_eng := private.menu_engineering_core(p_location_id, p_from, p_to, false);
  v_ups := private.upsell_report_core(p_location_id, p_from, p_to);

  -- (a) viewed but not ordered: the most viewed flagged dish
  select e into v_e from jsonb_array_elements(v_conv -> 'items') e
  where (e ->> 'flagged')::boolean order by (e ->> 'views')::integer desc, e ->> 'id' limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 1, 'score', 80 + least(20, (v_e ->> 'views')::integer / 10), 'item', v_e ->> 'id',
      'finding', jsonb_build_object('key', 'unordered', 'item', v_e -> 'name', 'views', (v_e ->> 'views')::integer,
                                    'orders', (v_e ->> 'orders')::integer),
      'action', jsonb_build_object('key', 'check_photo_price', 'item', v_e -> 'name')));
  end if;

  -- (b) workhorse, (c) puzzle, (d) dog: from the menu matrix (price basis, no costs)
  select coalesce(jsonb_agg(jsonb_build_object(
           'quadrant', d ->> 'quadrant', 'id', d ->> 'id', 'name', d -> 'name', 'qty', (d ->> 'qty')::integer,
           'revenue', (d ->> 'revenue')::integer, 'price', (d ->> 'price')::integer,
           'section_qty', (select coalesce(sum((x ->> 'qty')::integer), 0) from jsonb_array_elements(s -> 'dishes') x))), '[]'::jsonb)
  into v_dishes
  from jsonb_array_elements(v_eng -> 'sections') s, jsonb_array_elements(s -> 'dishes') d;

  select to_jsonb(x) into v_e
  from jsonb_to_recordset(v_dishes) as x(quadrant text, id text, name jsonb, qty integer, revenue integer, price integer, section_qty integer)
  where x.quadrant = 'plowhorse' and x.qty >= 10
  order by x.qty desc, x.revenue desc, x.id limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 4, 'score', 70 + least(20, (v_e ->> 'qty')::integer / 5), 'item', v_e ->> 'id',
      'finding', jsonb_build_object('key', 'workhorse', 'item', v_e -> 'name', 'units', (v_e ->> 'qty')::integer,
                                    'price', (v_e ->> 'price')::integer),
      'action', jsonb_build_object('key', 'small_price_rise', 'item', v_e -> 'name')));
  end if;

  select to_jsonb(x) into v_e
  from jsonb_to_recordset(v_dishes) as x(quadrant text, id text, name jsonb, qty integer, revenue integer, price integer, section_qty integer)
  where x.quadrant = 'puzzle' and x.section_qty >= 30
  order by x.price desc, x.qty, x.id limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 5, 'score', 65 + least(20, (v_e ->> 'price')::integer / 200), 'item', v_e ->> 'id',
      'finding', jsonb_build_object('key', 'puzzle', 'item', v_e -> 'name', 'units', (v_e ->> 'qty')::integer,
                                    'price', (v_e ->> 'price')::integer),
      'action', jsonb_build_object('key', 'promote', 'item', v_e -> 'name')));
  end if;

  select to_jsonb(x) into v_e
  from jsonb_to_recordset(v_dishes) as x(quadrant text, id text, name jsonb, qty integer, revenue integer, price integer, section_qty integer)
  where x.quadrant = 'dog' and x.section_qty >= 30
  order by x.qty, x.revenue, x.id limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 6, 'score', 60 + least(20, (v_e ->> 'section_qty')::integer / 20), 'item', v_e ->> 'id',
      'finding', jsonb_build_object('key', 'dog', 'item', v_e -> 'name', 'units', (v_e ->> 'qty')::integer,
                                    'price', (v_e ->> 'price')::integer),
      'action', jsonb_build_object('key', 'rework', 'item', v_e -> 'name')));
  end if;

  -- (e) the busiest weekday-hour
  select to_jsonb(x) into v_e
  from jsonb_to_recordset(v_busy -> 'cells') as x(dow integer, hour integer, orders integer, revenue bigint)
  where x.orders >= 6 and x.orders * 10 >= v_orders
  order by x.orders desc, x.dow, x.hour limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 7, 'score', 55 + least(20, (v_e ->> 'orders')::integer / 3), 'item', null,
      'finding', jsonb_build_object('key', 'busiest', 'dow', (v_e ->> 'dow')::integer, 'hour', (v_e ->> 'hour')::integer,
                                    'orders', (v_e ->> 'orders')::integer),
      'action', jsonb_build_object('key', 'extra_waiter', 'dow', (v_e ->> 'dow')::integer, 'hour', (v_e ->> 'hour')::integer)));
  end if;

  -- (f) a dead hour inside opening hours. Hours are counted from the start of
  -- the business day, so a café open past midnight is one range, not two.
  with h as (
    select mod(x.hour - extract(hour from v_starts)::integer + 24, 24) as sh, sum(x.orders)::integer as n
    from jsonb_to_recordset(v_busy -> 'cells') as x(dow integer, hour integer, orders integer, revenue bigint)
    group by 1
  ), rng as (
    select min(sh) as lo, max(sh) as hi from h
  ), allh as (
    select g as sh, coalesce(h.n, 0) as n from rng cross join generate_series(rng.lo, rng.hi) g left join h on h.sh = g
  ), st as (
    select count(*) as hrs, sum(n)::numeric / count(*) as avg from allh
  )
  select jsonb_build_object('hour', mod(a.sh + extract(hour from v_starts)::integer, 24), 'orders', a.n, 'avg', round(st.avg, 1))
  into v_e
  from allh a cross join st cross join rng
  where st.hrs >= 5 and a.sh > rng.lo and a.sh < rng.hi and a.n * 5 <= st.avg
  order by a.n, a.sh limit 1;
  if v_e is not null then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 8, 'score', 50, 'item', null,
      'finding', jsonb_build_object('key', 'dead', 'hour', (v_e ->> 'hour')::integer, 'orders', (v_e ->> 'orders')::integer,
                                    'avg', (v_e ->> 'avg')::numeric),
      'action', jsonb_build_object('key', 'promo_then', 'hour', (v_e ->> 'hour')::integer)));
  end if;

  -- (g) slow orders (served later than the café's limit) and repeated calls
  -- nobody answered quickly, as the live alerts (ADR-071) define them
  with slow as (
    select extract(hour from o.placed_at at time zone v_tz)::integer as hour
    from public.orders o
    where o.location_id = p_location_id and o.business_date between p_from and p_to
      and o.status = 'accepted' and not o.is_test and o.served_at is not null
      and o.served_at - o.placed_at > make_interval(mins => v_overdue)
  ), calls as (
    select extract(hour from r.created_at at time zone v_tz)::integer as hour
    from public.service_requests r
    where r.location_id = p_location_id and r.kind = 'call_waiter' and r.created_at >= v_lo and r.created_at < v_hi
      and r.press_count >= v_calls
  ), allx as (
    select hour from slow union all select hour from calls
  )
  select jsonb_build_object('slow', (select count(*) from slow), 'calls', (select count(*) from calls),
                            'hour', (select hour from allx group by hour order by count(*) desc, hour limit 1))
  into v_e;
  v_n := (v_e ->> 'slow')::integer + (v_e ->> 'calls')::integer;
  if v_n >= 3 then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 3, 'score', 75 + least(20, v_n), 'item', null,
      'finding', jsonb_build_object('key', 'slow', 'slow_orders', (v_e ->> 'slow')::integer, 'calls', (v_e ->> 'calls')::integer,
                                    'minutes', v_overdue, 'hour', (v_e ->> 'hour')::integer),
      'action', jsonb_build_object('key', 'check_pace', 'hour', (v_e ->> 'hour')::integer)));
  end if;

  -- (h) the "often added" suggestions work well or hardly at all
  v_n := (v_ups ->> 'shown')::integer;
  v_m := (v_ups ->> 'accepted')::integer;
  v_rate := (v_ups ->> 'accept_rate')::numeric;
  if v_n >= 30 and v_rate is not null and (v_rate >= 0.2 or v_rate <= 0.05) then
    v_cands := v_cands || jsonb_build_array(jsonb_build_object(
      'prio', 9, 'score', 45 + least(15, v_n / 10), 'item', null,
      'finding', jsonb_build_object('key', case when v_rate >= 0.2 then 'suggest_high' else 'suggest_low' end,
                                    'shown', v_n, 'accepted', v_m, 'percent', round(v_rate * 100)::integer),
      'action', jsonb_build_object('key', case when v_rate >= 0.2 then 'more_suggestions' else 'review_suggestions' end)));
  end if;

  -- (i) week over week: revenue when both weeks have it, else orders; 15 % or more, the week before with 20+ orders
  v_prev := private.busy_hours_core(p_location_id, p_from - v_shift, p_to - v_shift);
  if (v_prev ->> 'orders')::integer >= c_min_orders then
    if v_revenue > 0 and (v_prev ->> 'revenue')::bigint > 0 then
      v_metric := 'revenue';
      v_cur := v_revenue;
      v_old := (v_prev ->> 'revenue')::bigint;
    else
      v_metric := 'orders';
      v_cur := v_orders;
      v_old := (v_prev ->> 'orders')::integer;
    end if;
    v_pct := round((v_cur - v_old) * 100 / v_old)::integer;
    if abs(v_pct) >= 15 then
      v_cands := v_cands || jsonb_build_array(jsonb_build_object(
        'prio', 2, 'score', 60 + least(30, abs(v_pct) / 2), 'item', null,
        'finding', jsonb_build_object('key', case when v_pct > 0 then 'wow_up' else 'wow_down' end, 'metric', v_metric,
                                      'current', v_cur, 'previous', v_old, 'percent', v_pct),
        'action', jsonb_build_object('key', case when v_pct > 0 then 'keep_stock' else 'check_reports' end)));
    end if;
  end if;

  -- The three best: score, then the rule's priority, then the dish id. A dish is used once.
  for c in
    select e.value from jsonb_array_elements(v_cands) e
    order by (e.value ->> 'score')::numeric desc, (e.value ->> 'prio')::integer, e.value ->> 'item'
  loop
    exit when jsonb_array_length(v_findings) >= 3;
    continue when c ->> 'item' is not null and (c ->> 'item') = any (v_used);
    if c ->> 'item' is not null then
      v_used := v_used || (c ->> 'item');
    end if;
    v_findings := v_findings || jsonb_build_array((c -> 'finding') || jsonb_build_object('score', c -> 'score'));
    v_actions := v_actions || jsonb_build_array(c -> 'action');
  end loop;

  return jsonb_build_object('location_id', p_location_id, 'from', p_from, 'to', p_to, 'orders', v_orders,
                            'revenue', v_revenue, 'enough', true, 'min_orders', c_min_orders,
                            'findings', v_findings, 'actions', v_actions);
end $$;

-- -----------------------------------------------------------------------------
-- 3. The message. Plain text (the sender sets no parse mode, so no escaping is
-- needed and a dish name cannot break the message); one text per language.
-- The existing renderer keeps every other kind; this layer adds weekly.digest.
-- -----------------------------------------------------------------------------
-- "5 views", "1 заказ", "3 заказа", "5 заказов"
create function private.digest_count(p_n integer, p_l public.app_locale, p_what text) returns text
language sql immutable set search_path = '' as $$
  select p_n || ' ' || case p_l
    when 'hy' then case p_what when 'view' then 'դիտում' when 'order' then 'պատվեր' else 'հատ' end
    when 'ru' then (
      select case when p_n % 100 between 11 and 14 then f[3]
                  when p_n % 10 = 1 then f[1]
                  when p_n % 10 between 2 and 4 then f[2]
                  else f[3] end
      from (select case p_what when 'view' then array['просмотр', 'просмотра', 'просмотров']
                               when 'order' then array['заказ', 'заказа', 'заказов']
                               else array['порция', 'порции', 'порций'] end as f) x)
    else case p_what when 'view' then case when p_n = 1 then 'view' else 'views' end
                     when 'order' then case when p_n = 1 then 'order' else 'orders' end
                     else case when p_n = 1 then 'portion' else 'portions' end end
  end
$$;

-- "Fri", "19:00", "1,5"
create function private.digest_dow(p_dow integer, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select (case p_l
    when 'hy' then array['Երկ', 'Երք', 'Չրք', 'Հնգ', 'Ուրբ', 'Շաբ', 'Կիր']
    when 'ru' then array['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
    else array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] end)[p_dow]
$$;

create function private.digest_hour(p_hour integer) returns text
language sql immutable set search_path = '' as $$ select lpad(p_hour::text, 2, '0') || ':00' $$;

create function private.digest_decimal(p_n numeric, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select case when p_l = 'en' then trim(to_char(p_n, 'FM999990.0')) else replace(trim(to_char(p_n, 'FM999990.0')), '.', ',') end
$$;

-- A dish name in the reader's language, as the other messages do; cut short so
-- one long name cannot push the message past Telegram's limit.
create function private.digest_name(p_names jsonb, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select '«' || left(private.pick_name(p_names, p_l), 60) || '»'
$$;

create function private.digest_finding_text(f jsonb, p_l public.app_locale) returns text
language plpgsql immutable set search_path = '' as $$
declare
  n text := case when f ? 'item' then private.digest_name(f -> 'item', p_l) end;
  cur text;
  prev text;
  label text;
  sign text := case when (f ->> 'percent')::integer > 0 then '+' else '' end;
begin
  case f ->> 'key'
  when 'unordered' then
    return n || case p_l when 'ru' then ': ' when 'hy' then '՝ ' else ': ' end
      || private.digest_count((f ->> 'views')::integer, p_l, 'view') || ', '
      || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || case p_l when 'hy' then '։' else '.' end;
  when 'workhorse' then
    return case p_l
      when 'hy' then 'Շատ են պատվիրում ' || n || '՝ ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ', բայց գինը բաժնի միջինից ցածր է։'
      when 'ru' then n || ' часто заказывают (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), но цена ниже средней по разделу.'
      else n || ' sells well (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), but its price is below the section average.' end;
  when 'puzzle' then
    return case p_l
      when 'hy' then n || '՝ գինը բաժնի միջինից բարձր է, բայց պատվիրել են ընդամենը ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '։'
      when 'ru' then n || ': цена выше средней по разделу, но заказали всего ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '.'
      else n || ': priced above the section average, but only ' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ' ordered.' end;
  when 'dog' then
    return case p_l
      when 'hy' then n || '՝ քիչ են պատվիրում (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), գինն էլ բաժնի միջինից ցածր է։'
      when 'ru' then n || ': заказывают редко (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || '), цена ниже средней по разделу.'
      else n || ': rarely ordered (' || private.digest_count((f ->> 'units')::integer, p_l, 'unit') || ') and priced below the section average.' end;
  when 'busiest' then
    return case p_l
      when 'hy' then 'Ամենածանրաբեռնված ժամը՝ ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
                     || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '։'
      when 'ru' then 'Самый загруженный час: ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
                     || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '.'
      else 'Busiest hour: ' || private.digest_dow((f ->> 'dow')::integer, p_l) || ' ' || private.digest_hour((f ->> 'hour')::integer)
           || ', ' || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || '.' end;
  when 'dead' then
    return case p_l
      when 'hy' then 'Ամենահանգիստ ժամը՝ ' || private.digest_hour((f ->> 'hour')::integer) || ', շաբաթվա ընթացքում ընդամենը '
                     || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' (ժամում միջինը՝ ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ')։'
      when 'ru' then 'Самый тихий час: ' || private.digest_hour((f ->> 'hour')::integer) || ', за неделю всего '
                     || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' (в среднем на час: ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ').'
      else 'Quietest hour: ' || private.digest_hour((f ->> 'hour')::integer) || ', only '
           || private.digest_count((f ->> 'orders')::integer, p_l, 'order') || ' all week (average per hour: ' || private.digest_decimal((f ->> 'avg')::numeric, p_l) || ').' end;
  when 'slow' then
    return case p_l
      when 'hy' then private.digest_count((f ->> 'slow_orders')::integer, p_l, 'order') || ' սպասել է ' || (f ->> 'minutes') || ' րոպեից ավելի, '
                     || (f ->> 'calls') || ' անգամ կրկնակի կանչել են մատուցողին։ Առավել հաճախ՝ ' || private.digest_hour((f ->> 'hour')::integer) || '-ի շուրջ։'
      when 'ru' then 'Долгие ожидания: заказов ' || (f ->> 'slow_orders') || ' (дольше ' || (f ->> 'minutes') || ' мин), повторных вызовов '
                     || (f ->> 'calls') || '. Чаще всего около ' || private.digest_hour((f ->> 'hour')::integer) || '.'
      else 'Long waits: orders ' || (f ->> 'slow_orders') || ' (over ' || (f ->> 'minutes') || ' min), repeated calls '
           || (f ->> 'calls') || '. Mostly around ' || private.digest_hour((f ->> 'hour')::integer) || '.' end;
  when 'suggest_high' then
    return case p_l
      when 'hy' then 'Առաջարկները աշխատում են՝ ցուցադրվել է ' || (f ->> 'shown') || ', ընդունվել է ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%)։'
      when 'ru' then 'Подсказки работают: показано ' || (f ->> 'shown') || ', принято ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).'
      else 'Suggestions work: shown ' || (f ->> 'shown') || ', accepted ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).' end;
  when 'suggest_low' then
    return case p_l
      when 'hy' then 'Առաջարկները քիչ են ընդունվում՝ ցուցադրվել է ' || (f ->> 'shown') || ', ընդունվել է ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%)։'
      when 'ru' then 'Подсказки почти не принимают: показано ' || (f ->> 'shown') || ', принято ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).'
      else 'Suggestions are rarely accepted: shown ' || (f ->> 'shown') || ', accepted ' || (f ->> 'accepted') || ' (' || (f ->> 'percent') || '%).' end;
  when 'wow_up', 'wow_down' then
    if f ->> 'metric' = 'revenue' then
      cur := private.format_amd((f ->> 'current')::integer, p_l);
      prev := private.format_amd((f ->> 'previous')::integer, p_l);
      label := case p_l when 'hy' then 'Վաճառք' when 'ru' then 'Выручка' else 'Revenue' end;
    else
      cur := (f ->> 'current');
      prev := (f ->> 'previous');
      label := case p_l when 'hy' then 'Պատվերներ' when 'ru' then 'Заказы' else 'Orders' end;
    end if;
    return case p_l
      when 'hy' then label || '՝ ' || cur || ', նախորդ շաբաթվա համեմատ ' || sign || (f ->> 'percent') || '% (' || prev || ')։'
      when 'ru' then label || ': ' || cur || ', ' || sign || (f ->> 'percent') || '% к прошлой неделе (' || prev || ').'
      else label || ': ' || cur || ', ' || sign || (f ->> 'percent') || '% vs last week (' || prev || ').' end;
  else
    return null;
  end case;
end $$;

create function private.digest_action_text(a jsonb, p_l public.app_locale) returns text
language sql immutable set search_path = '' as $$
  select case a ->> 'key'
    when 'check_photo_price' then case p_l when 'hy' then 'Ստուգեք նկարը կամ գինը։' when 'ru' then 'Проверьте фото или цену.' else 'Check its photo or price.' end
    when 'small_price_rise' then case p_l when 'hy' then 'Մտածեք գինը մի փոքր բարձրացնելու մասին։' when 'ru' then 'Подумайте о небольшом повышении цены.' else 'Consider a small price rise.' end
    when 'promote' then case p_l when 'hy' then 'Տեղափոխեք մենյուի վերևը կամ առաջ քաշեք։' when 'ru' then 'Поднимите выше в меню или продвиньте.' else 'Move it up in the menu or promote it.' end
    when 'rework' then case p_l when 'hy' then 'Մտածեք հանելու կամ փոխելու մասին։' when 'ru' then 'Подумайте, не убрать ли блюдо или переделать его.' else 'Consider removing or reworking it.' end
    when 'extra_waiter' then case p_l when 'hy' then 'Այդ ժամին պլանավորեք լրացուցիչ մատուցող։' when 'ru' then 'Запланируйте на это время ещё одного официанта.' else 'Plan an extra waiter for that hour.' end
    when 'promo_then' then case p_l when 'hy' then 'Մտածեք այդ ժամի համար ակցիա անելու մասին («Ակցիաներ» բաժինը)։' when 'ru' then 'Подумайте об акции на это время (раздел «Акции»).' else 'Consider a promotion for that hour (Promotions).' end
    when 'check_pace' then case p_l when 'hy' then 'Ստուգեք խոհանոցի տեմպը ' || private.digest_hour((a ->> 'hour')::integer) || '-ի շուրջ։' when 'ru' then 'Проверьте темп кухни около ' || private.digest_hour((a ->> 'hour')::integer) || '.' else 'Check kitchen pace around ' || private.digest_hour((a ->> 'hour')::integer) || '.' end
    when 'more_suggestions' then case p_l when 'hy' then 'Ավելացրեք առաջարկներ ավելի շատ ուտեստների համար։' when 'ru' then 'Добавьте подсказки к другим блюдам.' else 'Add suggestions to more dishes.' end
    when 'review_suggestions' then case p_l when 'hy' then 'Վերանայեք, թե որ ուտեստներն են առաջարկվում միասին։' when 'ru' then 'Пересмотрите, какие блюда предлагаются вместе.' else 'Review which dishes are suggested together.' end
    when 'keep_stock' then case p_l when 'hy' then 'Համոզվեք, որ պաշարն ու անձնակազմը բավարար են։' when 'ru' then 'Убедитесь, что хватает продуктов и персонала.' else 'Make sure stock and staff keep up.' end
    when 'check_reports' then case p_l when 'hy' then 'Նայեք հաշվետվություններում՝ որ օրերին է նվազել։' when 'ru' then 'Посмотрите в отчётах, в какие дни просело.' else 'See in Reports which days dropped.' end
  end
$$;

alter function private.render_notification(text, jsonb, public.app_locale) rename to render_notification_tables;

create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_from date := (p_payload ->> 'from')::date;
  v_to date := (p_payload ->> 'to')::date;
  v_period text;
  v_lines text[];
  v_head text;
  i integer;
begin
  if p_kind <> 'weekly.digest' then
    return private.render_notification_tables(p_kind, p_payload, p_locale);
  end if;
  v_period := case when l = 'en' then to_char(v_from, 'FMDD Mon') || ' – ' || to_char(v_to, 'FMDD Mon')
                   else to_char(v_from, 'DD.MM') || '–' || to_char(v_to, 'DD.MM') end;
  v_head := '📊 ' || case l when 'hy' then 'Շաբաթվա ամփոփում՝ ' when 'ru' then 'Итоги недели: ' else 'Weekly summary: ' end || v_period;

  if not coalesce((p_payload ->> 'enough')::boolean, false) then
    return v_head || E'\n' || case l
      when 'hy' then 'Այս շաբաթ տվյալները քիչ են՝ ' || private.digest_count((p_payload ->> 'orders')::integer, l, 'order')
                     || ', իսկ ամփոփման համար պետք է առնվազն ' || (p_payload ->> 'min_orders') || '։ Երբ տվյալները բավարար լինեն, ամփոփումը կգա ամեն երկուշաբթի։'
      when 'ru' then 'Пока мало данных: за неделю ' || private.digest_count((p_payload ->> 'orders')::integer, l, 'order')
                     || ', а для итогов нужно хотя бы ' || (p_payload ->> 'min_orders') || '. Когда данных хватит, итоги будут приходить по понедельникам.'
      else 'Not enough data yet: ' || private.digest_count((p_payload ->> 'orders')::integer, l, 'order')
           || ' this week, and a summary needs at least ' || (p_payload ->> 'min_orders') || '. Once there is enough, it will arrive every Monday.' end;
  end if;

  v_lines := array[v_head,
    case l when 'hy' then 'Պատվերներ՝ ' when 'ru' then 'Заказы: ' else 'Orders: ' end || (p_payload ->> 'orders')
      || case when (p_payload ->> 'revenue')::bigint > 0
              then case l when 'hy' then ', վաճառք՝ ' when 'ru' then ', выручка: ' else ', revenue: ' end
                   || private.format_amd(least((p_payload ->> 'revenue')::bigint, 2000000000)::integer, l)
              else '' end];
  if jsonb_array_length(p_payload -> 'findings') = 0 then
    v_lines := v_lines || array['', case l when 'hy' then 'Այս շաբաթ առանձնահատուկ ոչինչ չկա։'
                                           when 'ru' then 'На этой неделе ничего особенного.'
                                           else 'Nothing stands out this week.' end];
  end if;
  for i in 0 .. jsonb_array_length(p_payload -> 'findings') - 1 loop
    v_lines := v_lines || array['',
      (i + 1) || '. ' || private.digest_finding_text((p_payload -> 'findings') -> i, l),
      '→ ' || private.digest_action_text((p_payload -> 'actions') -> i, l)];
  end loop;
  v_lines := v_lines || array['', case l
    when 'hy' then 'Մանրամասները՝ կառավարման էջի «Հաշվետվություններ» բաժնում։'
    when 'ru' then 'Подробности: раздел «Отчёты» в админке.'
    else 'Details: Reports in the admin.' end];
  return array_to_string(v_lines, E'\n');
end $$;

-- -----------------------------------------------------------------------------
-- 4. The event kind and its toggle. On by default (exceptions only, ADR-040: it
-- is one message a week) and added to chats that already get late orders.
-- Only Telegram chats get it; a phone's notification is too small for it.
-- -----------------------------------------------------------------------------
create or replace function private.alert_events() returns text[]
language sql immutable set search_path = '' as $$
  select '{order.placed,order.overdue,station.offline,order.comped,day.summary,table.alert,weekly.digest}'::text[]
$$;

alter table public.notification_channels drop constraint notification_channels_events_known;
alter table public.notification_channels
  add constraint notification_channels_events_known
  check (events <@ '{order.placed,order.overdue,station.offline,order.comped,day.summary,table.alert,weekly.digest}'::text[]);
alter table public.notification_channels
  alter column events set default '{order.overdue,station.offline,order.comped,day.summary,table.alert,weekly.digest}';
update public.notification_channels set events = events || '{weekly.digest}'
where 'order.overdue' = any (events) and not ('weekly.digest' = any (events));

-- -----------------------------------------------------------------------------
-- 5. The schedule. Every 15 minutes; a café is due on Monday between 09:00 and
-- 12:00 of its own clock (the window survives a missed run), once per ISO week:
-- the outbox's unique (channel, dedupe key) is the guard, key
-- weekly.digest:<location>:<ISO week of that Monday>. The week reported is the
-- one that ended on Sunday.
-- Chats that get it: Telegram, active, "weekly.digest" switched on, linked by a
-- person who is still an active owner or manager of the café's restaurant.
-- -----------------------------------------------------------------------------
create function private.digest_due_channels(p_restaurant_id uuid, p_location_id uuid, p_key text)
returns table (id uuid, created_at timestamptz, is_first boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.created_at,
         not exists (select 1 from public.notification_outbox o where o.channel_id = c.id and o.event = 'weekly.digest')
  from public.notification_channels c
  where c.restaurant_id = p_restaurant_id and c.kind = 'telegram' and c.is_active
    and 'weekly.digest' = any (c.events)
    and (c.location_id is null or c.location_id = p_location_id)
    and exists (select 1 from public.members m
                where m.restaurant_id = c.restaurant_id and m.user_id = c.created_by and m.is_active
                  and m.role in ('owner', 'manager'))
    and not exists (select 1 from public.notification_outbox o where o.channel_id = c.id and o.dedupe_key = p_key)
$$;

-- Not enough orders (under 20): a short "not enough data yet" goes only to a
-- chat that is new (linked within the last 14 days) and has had no digest
-- before; every later quiet week is skipped silently.
create function private.enqueue_weekly_digests(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_local timestamp;
  v_monday date;
  v_key text;
  v_payload jsonb;
  v_enough boolean;
  v_rows integer;
  v_n integer := 0;
begin
  for r in select l.id, l.restaurant_id, l.timezone, l.business_day_starts from public.locations l where l.status = 'active' loop
    v_local := p_now at time zone r.timezone;
    continue when extract(isodow from v_local) <> 1 or v_local::time < time '09:00' or v_local::time >= time '12:00';
    v_monday := v_local::date;
    -- a café whose business day starts after 09:00 is still on Sunday's day
    continue when (v_local - (r.business_day_starts - time '00:00'))::date <> v_monday;
    v_key := 'weekly.digest:' || r.id || ':' || to_char(v_monday, 'IYYY-"W"IW');
    continue when not exists (select 1 from private.digest_due_channels(r.restaurant_id, r.id, v_key));
    v_payload := private.weekly_digest_payload(r.id, v_monday - 7, v_monday - 1);
    continue when v_payload is null;
    v_enough := (v_payload ->> 'enough')::boolean;
    insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
    select r.restaurant_id, d.id, 'weekly.digest', v_key, v_payload
    from private.digest_due_channels(r.restaurant_id, r.id, v_key) d
    where v_enough or (d.is_first and d.created_at > p_now - interval '14 days')
    on conflict (channel_id, dedupe_key) do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  return v_n;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-weekly-digest') then
      perform cron.unschedule('pativ-weekly-digest');
    end if;
    perform cron.schedule('pativ-weekly-digest', '*/15 * * * *', $job$select private.enqueue_weekly_digests()$job$);
  else
    raise notice 'pg_cron is not available: pativ-weekly-digest is not scheduled';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 6. The same message on the Reports page: the last complete Monday-to-Sunday
-- week of the café, in the caller's language. Owner and manager only. Nothing is
-- stored; it is computed from the same payload the digest sends.
-- -----------------------------------------------------------------------------
create function api.last_weekly_digest(p_location_id uuid, p_locale text default 'hy') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date;
  v_monday date;
  v_payload jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  v_today := private.business_date(p_location_id);
  v_monday := v_today - (extract(isodow from v_today)::integer - 1);
  v_payload := private.weekly_digest_payload(p_location_id, v_monday - 7, v_monday - 1);
  return jsonb_build_object(
    'from', v_monday - 7, 'to', v_monday - 1,
    'enough', (v_payload ->> 'enough')::boolean,
    'findings', jsonb_array_length(v_payload -> 'findings'),
    'text', private.render_notification('weekly.digest', v_payload,
              case when p_locale in ('hy', 'ru', 'en') then p_locale::public.app_locale else 'hy' end));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.item_conversion_core(uuid, date, date), private.busy_hours_core(uuid, date, date),
  private.upsell_report_core(uuid, date, date), private.menu_engineering_core(uuid, date, date, boolean),
  private.weekly_digest_payload(uuid, date, date),
  private.digest_count(integer, public.app_locale, text), private.digest_dow(integer, public.app_locale),
  private.digest_hour(integer), private.digest_decimal(numeric, public.app_locale),
  private.digest_name(jsonb, public.app_locale), private.digest_finding_text(jsonb, public.app_locale),
  private.digest_action_text(jsonb, public.app_locale),
  private.render_notification_tables(text, jsonb, public.app_locale), private.render_notification(text, jsonb, public.app_locale),
  private.digest_due_channels(uuid, uuid, text), private.enqueue_weekly_digests(timestamptz),
  private.alert_events(), api.last_weekly_digest(uuid, text)
from public, anon, authenticated;
grant execute on function api.last_weekly_digest(uuid, text) to authenticated;
revoke execute on function
  api.item_conversion(uuid, date, date), api.busy_hours(uuid, date, date), api.upsell_report(uuid, date, date),
  api.menu_engineering(uuid, date, date)
from public, anon, authenticated;
grant execute on function
  api.item_conversion(uuid, date, date), api.busy_hours(uuid, date, date), api.upsell_report(uuid, date, date),
  api.menu_engineering(uuid, date, date)
to authenticated;
