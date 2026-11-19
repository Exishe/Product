-- Guest hints from the café's own orders (ADR-057). Two aggregates the guest
-- menu shows next to api.public_menu:
--  * pairs: for each dish, up to two dishes from another section that guests
--    here ordered in the same round at least 3 times in the last 60 days
--    ("Guests here often add"). No owner set-up, no invented suggestions.
--  * wait: how long a round usually takes from sending to "ready", as a
--    5-minute range (median and 80th percentile). The last 3 hours when there
--    are at least 5 rounds, else the last 30 days when there are at least 10,
--    else nothing. Never a countdown.
-- Counts only: nothing about any one guest or order leaves the database.
-- Read without a session, like api.public_menu, for an active location with a
-- published menu.

create function api.public_menu_hints(p_restaurant_slug text, p_location_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with loc as (
    select l.id
    from public.restaurants r
    join public.locations l on l.restaurant_id = r.id
    where r.slug = p_restaurant_slug and l.slug = p_location_slug
      and r.status = 'active' and l.status = 'active'
      and l.published_menu_version_id is not null
  ),
  lines as (
    select distinct oi.order_id, oi.item_id, i.category_id
    from loc
    join public.orders o on o.location_id = loc.id
    join public.order_items oi on oi.order_id = o.id
    join public.items i on i.id = oi.item_id
    where o.business_date >= current_date - 60
      and o.status in ('placed', 'accepted')
      and oi.quantity > oi.cancelled_quantity
  ),
  pairs as (
    select a.item_id as item, b.item_id as other, count(*) as n
    from lines a
    join lines b on b.order_id = a.order_id and b.category_id <> a.category_id
    group by a.item_id, b.item_id
    having count(*) >= 3
  ),
  ranked as (
    select item, other, row_number() over (partition by item order by n desc, other) as rank
    from pairs
  ),
  waits as (
    select extract(epoch from o.ready_at - o.placed_at) / 60 as minutes,
           o.ready_at > now() - interval '3 hours' as recent
    from loc
    join public.orders o on o.location_id = loc.id
    where o.business_date >= current_date - 30
      and o.ready_at is not null
      and o.ready_at > o.placed_at
      and o.ready_at - o.placed_at < interval '3 hours'
  ),
  pick as (
    select w.minutes from waits w
    where (select count(*) from waits where recent) >= 5 and w.recent
    union all
    select w.minutes from waits w
    where (select count(*) from waits where recent) < 5 and (select count(*) from waits) >= 10
  ),
  stats as (
    select percentile_cont(0.5) within group (order by minutes) as mid,
           percentile_cont(0.8) within group (order by minutes) as high,
           count(*) as n
    from pick
  )
  select jsonb_build_object(
    'pairs', coalesce((select jsonb_object_agg(item, others)
                       from (select item, jsonb_agg(other order by rank) as others
                             from ranked where rank <= 2 group by item) g), '{}'::jsonb),
    'wait', (select case when n > 0 then
               jsonb_build_object(
                 'low', greatest(5, (round(mid / 5) * 5)::int),
                 'high', greatest(greatest(5, (round(mid / 5) * 5)::int), (ceil(high / 5) * 5)::int))
             end
             from stats))
  where exists (select 1 from loc)
$$;

revoke execute on function api.public_menu_hints(text, text) from public, anon, authenticated;
grant execute on function api.public_menu_hints(text, text) to anon, authenticated;
