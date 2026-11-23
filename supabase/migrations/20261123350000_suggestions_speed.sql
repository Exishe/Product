-- Faster "goes well with" (ADR-077 addendum). api.public_suggestions was slow on a
-- cold call (0.5 to 5 s, sometimes the statement timeout) because every call
-- re-read the orders of 60 days twice (learned pairs and popularity), scanned
-- the sections of every café and ran the outage query even with no outage.
--   * private.learned_pair_cache / item_popularity_cache hold the two order
--     aggregates per location, refreshed every 15 minutes by pg_cron
--     (private.refresh_suggestion_caches, once per café per run). The rules are
--     the same (same round, other section, 3+ times in 60 days); the strip may
--     lag the newest orders by up to 15 minutes.
--   * A location with no cache row yet (new café, job not run) is computed live
--     from the last 60 days, as before, so the strip still works.
--   * The hot path reads only small indexed tables: sections are limited to the
--     café, the outage query runs once and only when an outage is active.
-- Output shape and rules of api.public_suggestions are unchanged.

create table private.suggestion_cache_state (
  location_id uuid primary key references public.locations (id) on delete cascade,
  refreshed_at timestamptz not null default now()
);
create table private.learned_pair_cache (
  location_id uuid not null references public.locations (id) on delete cascade,
  item_id uuid not null,
  other_id uuid not null,
  n bigint not null,
  primary key (location_id, item_id, other_id)
);
create table private.item_popularity_cache (
  location_id uuid not null references public.locations (id) on delete cascade,
  item_id uuid not null,
  n bigint not null,
  primary key (location_id, item_id)
);
alter table private.suggestion_cache_state enable row level security;
alter table private.learned_pair_cache enable row level security;
alter table private.item_popularity_cache enable row level security;
revoke all on private.suggestion_cache_state, private.learned_pair_cache, private.item_popularity_cache from public, anon, authenticated;
-- No policy and no grant: only the SECURITY DEFINER functions below read them.

-- The live computation, now cheaper: with one dish only the orders that contain it.
-- Same rows as before.
alter function private.learned_pairs(uuid, uuid) rename to learned_pairs_live;
create or replace function private.learned_pairs_live(p_location_id uuid, p_item_id uuid default null)
returns table (item_id uuid, other_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  with ord as (
    select o.id
    from public.orders o
    where o.location_id = p_location_id
      and o.business_date >= current_date - 60
      and o.status in ('placed', 'accepted')
      and (p_item_id is null
           or exists (select 1 from public.order_items x
                      where x.order_id = o.id and x.item_id = p_item_id and x.quantity > x.cancelled_quantity))
  ),
  lines as (
    select distinct oi.order_id, oi.item_id, i.category_id
    from ord
    join public.order_items oi on oi.order_id = ord.id
    join public.items i on i.id = oi.item_id
    where oi.quantity > oi.cancelled_quantity
  )
  select a.item_id, b.item_id, count(*)
  from lines a
  join lines b on b.order_id = a.order_id and b.category_id <> a.category_id
  where p_item_id is null or a.item_id = p_item_id
  group by a.item_id, b.item_id
  having count(*) >= 3
$$;

create function private.item_popularity_live(p_location_id uuid)
returns table (item_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  select oi.item_id, count(*)
  from public.orders o join public.order_items oi on oi.order_id = o.id
  where o.location_id = p_location_id and o.business_date >= current_date - 60
    and o.status in ('placed', 'accepted') and oi.quantity > oi.cancelled_quantity
  group by oi.item_id
$$;

-- The names the rest of the code already uses: the cache when this location has
-- one, else the live computation.
create function private.learned_pairs(p_location_id uuid, p_item_id uuid default null)
returns table (item_id uuid, other_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  select c.item_id, c.other_id, c.n
  from private.learned_pair_cache c
  where c.location_id = p_location_id and (p_item_id is null or c.item_id = p_item_id)
    and exists (select 1 from private.suggestion_cache_state s where s.location_id = p_location_id)
  union all
  select l.item_id, l.other_id, l.n
  from private.learned_pairs_live(p_location_id, p_item_id) l
  where not exists (select 1 from private.suggestion_cache_state s where s.location_id = p_location_id)
$$;

create function private.item_popularity(p_location_id uuid)
returns table (item_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  select c.item_id, c.n
  from private.item_popularity_cache c
  where c.location_id = p_location_id
    and exists (select 1 from private.suggestion_cache_state s where s.location_id = p_location_id)
  union all
  select l.item_id, l.n
  from private.item_popularity_live(p_location_id) l
  where not exists (select 1 from private.suggestion_cache_state s where s.location_id = p_location_id)
$$;

-- Rebuild one location's cache. Idempotent; two runs at once wait for each other.
create function private.refresh_suggestion_cache(p_location_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.locations l where l.id = p_location_id) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('suggestion-cache:' || p_location_id::text, 0));
  delete from private.learned_pair_cache where location_id = p_location_id;
  delete from private.item_popularity_cache where location_id = p_location_id;
  insert into private.learned_pair_cache (location_id, item_id, other_id, n)
  select p_location_id, l.item_id, l.other_id, l.n from private.learned_pairs_live(p_location_id) l;
  insert into private.item_popularity_cache (location_id, item_id, n)
  select p_location_id, p.item_id, p.n from private.item_popularity_live(p_location_id) p
  where p.item_id is not null;   -- lines of deleted dishes can never be suggested
  insert into private.suggestion_cache_state (location_id, refreshed_at) values (p_location_id, now())
  on conflict (location_id) do update set refreshed_at = excluded.refreshed_at;
end $$;

-- The cron entry: every café with orders in the window (or an older cache to
-- clear), once each. One café failing does not stop the others.
create function private.refresh_suggestion_caches() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_loc uuid;
  v_done integer := 0;
begin
  for v_loc in
    select l.id from public.locations l
    where exists (select 1 from public.orders o where o.location_id = l.id and o.business_date >= current_date - 60)
       or exists (select 1 from private.suggestion_cache_state s where s.location_id = l.id)
  loop
    begin
      perform private.refresh_suggestion_cache(v_loc);
      v_done := v_done + 1;
    exception when others then
      raise warning 'suggestion cache refresh failed for %: %', v_loc, sqlerrm;
    end;
  end loop;
  return v_done;
end $$;

revoke execute on function private.learned_pairs(uuid, uuid), private.learned_pairs_live(uuid, uuid),
  private.item_popularity(uuid), private.item_popularity_live(uuid),
  private.refresh_suggestion_cache(uuid), private.refresh_suggestion_caches() from public, anon, authenticated;

-- Section lookups by café (the guest path joins sections of one café only).
create index if not exists categories_restaurant_idx on public.categories (restaurant_id);

-- The guest read path: same rules and output, cheaper steps.
create or replace function api.public_suggestions(p_location_id uuid, p_item_id uuid, p_cart_item_ids uuid[] default '{}')
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_loc public.locations;
  v_snap jsonb;
  v_cart uuid[];
  v_added_type public.item_type;
  v_added_cat uuid;
  v_allowed public.item_type[];
  v_local timestamp;
  v_dow integer;
  v_result jsonb;
  v_outage boolean;
begin
  if p_location_id is null or p_item_id is null then
    return '{"suggestions": []}'::jsonb;
  end if;
  select l.* into v_loc
  from public.locations l join public.restaurants r on r.id = l.restaurant_id
  where l.id = p_location_id and l.status = 'active' and r.status = 'active'
    and l.published_menu_version_id is not null;
  if not found then
    return '{"suggestions": []}'::jsonb;
  end if;
  select v.snapshot -> 'items' into v_snap from public.menu_versions v where v.id = v_loc.published_menu_version_id;
  if v_snap is null or not (v_snap ? p_item_id::text) then
    return '{"suggestions": []}'::jsonb;
  end if;
  select i.item_type, i.category_id into v_added_type, v_added_cat
  from public.items i where i.id = p_item_id and i.restaurant_id = v_loc.restaurant_id;
  if not found then
    return '{"suggestions": []}'::jsonb;
  end if;

  -- The cart: at most 50 ids matter, nulls and repeats do not.
  select coalesce(array_agg(distinct x), '{}'::uuid[]) into v_cart
  from unnest((coalesce(p_cart_item_ids, '{}'::uuid[]))[1:50]) x where x is not null;

  -- Which types the table lets this dish suggest here (null added type: no filter).
  if v_added_type is not null then
    select coalesce(array_agg(t), '{}'::public.item_type[]) into v_allowed
    from (
      select d.to_type as t from public.item_type_compat_defaults d
      where d.from_type = v_added_type
        and not exists (select 1 from public.item_type_compat o
                        where o.location_id = v_loc.id and o.from_type = d.from_type and o.to_type = d.to_type)
      union
      select o.to_type from public.item_type_compat o
      where o.location_id = v_loc.id and o.from_type = v_added_type and o.allowed
    ) x;
  end if;

  v_local := now() at time zone v_loc.timezone;
  select exists (select 1 from public.ingredient_outages o where o.location_id = v_loc.id and o.until > now()) into v_outage;

  with hidden as materialized (   -- computed once, and not at all while no outage is active
    select e.item_id from private.outage_effects(v_loc.id) e where e.hidden and v_outage
  ),
  avail as (
    -- Dishes that can be ordered right now: on the published menu, active,
    -- not on the stop list, not blocked by an ingredient outage (ADR-076),
    -- in an open section, not in the cart and not the dish just added.
    select i.id, i.item_type as itype, i.category_id, i.sort
    from public.items i
    join public.categories c on c.id = i.category_id and c.restaurant_id = v_loc.restaurant_id
    where i.restaurant_id = v_loc.restaurant_id
      and i.is_active and c.is_active
      and v_snap ? i.id::text
      and i.id <> p_item_id
      and not (i.id = any (v_cart))
      and private.in_daily_window(v_local::time, c.available_from, c.available_to)
      and not exists (select 1 from public.stop_list s
                      where s.location_id = v_loc.id and s.item_id = i.id and (s.until is null or s.until > now()))
      and not exists (select 1 from hidden h where h.item_id = i.id)
  ),
  pop as (   -- how often each dish was ordered here in the last 60 days (fallback ranking only): the cache
    select p.item_id, p.n from private.item_popularity(v_loc.id) p where v_added_type is not null
  ),
  cand as (
    -- 1. the owner's pairings: they bypass the type table
    select a.id as item_id, 1 as tier, p.sort::bigint as o1, 0::bigint as o2, 'pairs_with_dish'::text as reason, false as obey
    from public.item_pairings p join avail a on a.id = p.suggest_item_id
    where p.item_id = p_item_id
    union all
    -- 2. category and type rules
    select a.id, 2, r.sort, a.sort,
           case when r.from_type is not null then 'perfect_with_type' else 'pairs_with_dish' end, true
    from public.suggestion_rules r
    join avail a on (r.to_category_id is not null and a.category_id = r.to_category_id)
                 or (r.to_type is not null and a.itype = r.to_type)
    where r.restaurant_id = v_loc.restaurant_id
      and ((r.from_category_id is not null and r.from_category_id = v_added_cat)
           or (r.from_type is not null and r.from_type = v_added_type))
    union all
    -- 3. time rules, in the café's time zone
    select a.id, 3, r.sort, a.sort, 'time_rule', true
    from public.suggestion_time_rules r
    join avail a on (r.to_item_id is not null and a.id = r.to_item_id)
                 or (r.to_type is not null and a.itype = r.to_type)
    where r.location_id = v_loc.id
      and private.in_daily_window(v_local::time, r.from_time, r.to_time)
      and (r.weekdays is null
           or extract(isodow from (case when r.from_time > r.to_time and v_local::time < r.to_time
                                        then v_local - interval '1 day' else v_local end))::smallint = any (r.weekdays))
    union all
    -- 4. learned pairs: guests here ordered them together
    select a.id, 4, -lp.n, 0, 'often_together', true
    from private.learned_pairs(v_loc.id, p_item_id) lp join avail a on a.id = lp.other_id
    union all
    -- 5. the table itself: allowed types, the dishes ordered most here first
    select a.id, 5, -coalesce(pop.n, 0), a.sort, 'perfect_with_type', true
    from avail a left join pop on pop.item_id = a.id
    where v_added_type is not null and a.itype = any (v_allowed)
  ),
  ok as (
    -- Table rule: with a typed dish, only allowed types. An untyped dish
    -- suggested after a typed one cannot be checked, so it is dropped. Owner
    -- pairings (obey = false) are never filtered.
    select c.*
    from cand c join avail a on a.id = c.item_id
    where not c.obey or v_added_type is null or a.itype = any (v_allowed)
  ),
  best as (
    select distinct on (o.item_id) o.* from ok o order by o.item_id, o.tier, o.o1, o.o2
  ),
  typed as (   -- one per type; a dish without a type counts as its own type
    select b.*, a.itype,
           row_number() over (partition by coalesce(a.itype::text, 'u:' || b.item_id::text)
                              order by b.tier, b.o1, b.o2, b.item_id) as rn
    from best b join avail a on a.id = b.item_id
  ),
  picked as (
    select t.* from typed t where t.rn = 1 order by t.tier, t.o1, t.o2, t.item_id limit 3
  )
  select jsonb_build_object('suggestions', coalesce(jsonb_agg(
           jsonb_build_object(
             'item_id', p.item_id,
             'reason', p.reason,
             'type', p.itype,
             'with_item_id', case when p.reason in ('pairs_with_dish', 'often_together', 'perfect_with_type') then p_item_id end,
             'with_type', case when p.reason = 'perfect_with_type' then v_added_type end)
           order by p.tier, p.o1, p.o2, p.item_id), '[]'::jsonb))
  into v_result
  from picked p;
  return v_result;
end $$;

revoke execute on function api.public_suggestions(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function api.public_suggestions(uuid, uuid, uuid[]) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-refresh-suggestion-cache') then
      perform cron.unschedule('pativ-refresh-suggestion-cache');
    end if;
    perform cron.schedule('pativ-refresh-suggestion-cache', '*/15 * * * *', $job$select private.refresh_suggestion_caches()$job$);
  else
    raise notice 'pg_cron is not available: the suggestion cache is not refreshed by a job';
  end if;
end $$;

-- Fill the cache once now, so the first guests do not wait for the job.
select private.refresh_suggestion_caches();
