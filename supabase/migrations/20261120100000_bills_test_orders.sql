-- Test orders no longer count in revenue (ADR-066). Orders flagged is_test were
-- already left out, but paid bills were summed with no test filter. A paid bill
-- is test data when its table session has at least one order and every order of
-- that session is is_test. Bills with no session, or a session with a real
-- order, still count. Uses orders_table_session_idx. Only the bill CTEs change;
-- signatures, security definer, search_path and grants are as before (create or
-- replace keeps the existing grants).

create or replace function api.sales_dashboard(p_location_id uuid, p_from date, p_to date) returns jsonb
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
      and not (
        b.table_session_id is not null
        and exists (select 1 from public.orders t where t.table_session_id = b.table_session_id)
        and not exists (select 1 from public.orders t where t.table_session_id = b.table_session_id and not t.is_test))
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
      and not (
        b.table_session_id is not null
        and exists (select 1 from public.orders t where t.table_session_id = b.table_session_id)
        and not exists (select 1 from public.orders t where t.table_session_id = b.table_session_id and not t.is_test))
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

create or replace function private.compute_metrics_daily(p_date date) returns integer
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
      where x.location_id = l.id and x.business_date = p_date and x.status = 'paid'
        and not (
        x.table_session_id is not null
        and exists (select 1 from public.orders t where t.table_session_id = x.table_session_id)
        and not exists (select 1 from public.orders t where t.table_session_id = x.table_session_id and not t.is_test))) b on true
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

-- The numbers of one business day at one location (test orders excluded).
create or replace function private.day_summary_payload(p_location_id uuid, p_date date) returns jsonb
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
                     where b.location_id = p_location_id and b.business_date = p_date and b.status = 'paid'
                       and not (
        b.table_session_id is not null
        and exists (select 1 from public.orders t where t.table_session_id = b.table_session_id)
        and not exists (select 1 from public.orders t where t.table_session_id = b.table_session_id and not t.is_test))),
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
