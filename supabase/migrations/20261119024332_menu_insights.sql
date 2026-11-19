-- Owner insights (ADR-057): a cost price per dish, the menu engineering
-- matrix and the weekday × hour heatmap. Definitions: docs/05-business/metrics.md.

-- -----------------------------------------------------------------------------
-- Cost price per dish: owner only
-- -----------------------------------------------------------------------------
-- A separate table, not a column on items: guests never read items (they read
-- the published snapshot), but a separate table keeps the cost out of every
-- menu query, away from managers, and does not mark the menu as edited.
create table public.item_costs (
  restaurant_id uuid not null,
  item_id uuid primary key,
  cost integer not null check (cost between 0 and 10000000),
  updated_at timestamptz not null default now(),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade
);
create index item_costs_restaurant_idx on public.item_costs (restaurant_id);
alter table public.item_costs enable row level security;
create policy item_costs_owner_read on public.item_costs for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner}')));
revoke all on public.item_costs from anon, authenticated;
grant select on public.item_costs to authenticated;
grant all on public.item_costs to service_role;

-- Sets or clears (null) a dish's cost price. Owners only.
create function api.set_item_cost(p_item_id uuid, p_cost integer) returns void
language plpgsql security definer set search_path = '' as $$
declare v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null
     or not exists (select 1 from private.my_restaurant_ids('{owner}') r where r = v_restaurant) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_cost is not null and (p_cost < 0 or p_cost > 10000000) then
    raise exception using errcode = '22023', message = 'invalid_cost';
  end if;
  if p_cost is null then
    delete from public.item_costs where item_id = p_item_id;
  else
    insert into public.item_costs as c (restaurant_id, item_id, cost)
    values (v_restaurant, p_item_id, p_cost)
    on conflict (item_id) do update set cost = excluded.cost, updated_at = now();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Menu engineering (Kasavana and Smith): popularity × contribution margin
-- -----------------------------------------------------------------------------
-- Each active dish is compared with the other dishes of its section over the
-- range. Popular: units sold ≥ 70 % of the section's average. Profitable:
-- margin per unit ≥ the section's sales-weighted average margin. The margin is
-- price − cost when the owner entered a cost for every dish of the section
-- (basis 'margin'); otherwise the price itself (basis 'price'), which ranks by
-- revenue per unit. Managers always get basis 'price' and no costs.
-- Quadrants: star (popular, profitable), plowhorse (popular, low margin),
-- puzzle (unpopular, profitable), dog (neither).
create function api.menu_engineering(p_location_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_owner boolean;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 92 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  v_owner := exists (select 1 from private.my_restaurant_ids('{owner}') r where r = v_restaurant);

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

-- -----------------------------------------------------------------------------
-- Weekday × hour heatmap: when the café is actually busy
-- -----------------------------------------------------------------------------
-- Accepted orders per local weekday and hour over the last p_weeks complete weeks, ending
-- yesterday. Weekday is ISO: 1 = Monday … 7 = Sunday. Only non-empty cells
-- are returned; the client fills the rest with zeros.
create function api.sales_heatmap(p_location_id uuid, p_weeks integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_to date;
  v_from date;
  v_result jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_weeks is null or p_weeks < 1 or p_weeks > 26 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.timezone into v_tz from public.locations l where l.id = p_location_id;
  v_to := private.business_date(p_location_id) - 1;
  v_from := v_to - p_weeks * 7 + 1;

  select jsonb_build_object(
    'from', v_from, 'to', v_to, 'weeks', p_weeks,
    'orders', (select count(*) from public.orders o
               where o.location_id = p_location_id and o.business_date between v_from and v_to
                 and o.status = 'accepted' and not o.is_test),
    'cells', coalesce((
      select jsonb_agg(jsonb_build_object('dow', dow, 'hour', hour, 'orders', n,
                                          'avg', round(n::numeric / p_weeks, 1)) order by dow, hour)
      from (select extract(isodow from o.placed_at at time zone v_tz)::integer as dow,
                   extract(hour from o.placed_at at time zone v_tz)::integer as hour,
                   count(*)::integer as n
            from public.orders o
            where o.location_id = p_location_id and o.business_date between v_from and v_to
              and o.status = 'accepted' and not o.is_test
            group by 1, 2) c), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  api.set_item_cost(uuid, integer), api.menu_engineering(uuid, date, date), api.sales_heatmap(uuid, integer)
from public, anon, authenticated;
grant execute on function
  api.set_item_cost(uuid, integer), api.menu_engineering(uuid, date, date), api.sales_heatmap(uuid, integer)
to authenticated;
