-- "Goes well with" recommendations (ADR-077): data, rules and the read path.
-- Rule-based only: no AI, no external service. A dish may have a type; a table
-- says which types go with which; the owner may pair dishes by hand, add
-- category/type rules and time-of-day rules; learned pairs (ADR-060) fill the
-- rest. api.public_suggestions returns up to 3 ids with a reason key; the
-- guest screen that shows them is a later task.

create domain public.item_type as text check (value in (
  'coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
  'main', 'side', 'sauce', 'dessert', 'pastry_snack'));

alter table public.items add column item_type public.item_type;   -- null = unknown

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- The default "may suggest" table, global. A missing pair means "never
-- suggest" (the owner's "never" column). Read through api.compat_matrix only.
create table public.item_type_compat_defaults (
  from_type public.item_type not null,
  to_type public.item_type not null,
  primary key (from_type, to_type)
);
alter table public.item_type_compat_defaults enable row level security;
revoke all on public.item_type_compat_defaults from anon, authenticated;
-- No policy and no grant: functions only.

insert into public.item_type_compat_defaults (from_type, to_type) values
  ('main', 'side'), ('main', 'sauce'), ('main', 'cold_drink'), ('main', 'starter_salad'),
  ('side', 'sauce'), ('side', 'cold_drink'), ('side', 'pastry_snack'),
  ('starter_salad', 'side'), ('starter_salad', 'cold_drink'),
  ('soup', 'side'), ('soup', 'cold_drink'),
  ('coffee_tea', 'dessert'), ('coffee_tea', 'pastry_snack'),
  ('dessert', 'coffee_tea'),
  ('breakfast', 'coffee_tea'), ('breakfast', 'cold_drink'),
  ('cold_drink', 'pastry_snack'), ('cold_drink', 'side');

-- One café's changes to the table, per location: allowed true adds a pair,
-- false removes a default one.
create table public.item_type_compat (
  restaurant_id uuid not null,
  location_id uuid not null,
  from_type public.item_type not null,
  to_type public.item_type not null,
  allowed boolean not null,
  primary key (location_id, from_type, to_type),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

-- The owner's hand-made pairs: "with this dish, suggest that dish".
create table public.item_pairings (
  restaurant_id uuid not null,
  item_id uuid not null,
  suggest_item_id uuid not null,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (item_id, suggest_item_id),
  check (item_id <> suggest_item_id),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, suggest_item_id) references public.items (restaurant_id, id) on delete cascade
);
create index item_pairings_restaurant_idx on public.item_pairings (restaurant_id);

-- Category/type rules: "any main -> drinks". The "from" side is a category or
-- a type, the "to" side is a category or a type.
create table public.suggestion_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  from_category_id uuid,
  from_type public.item_type,
  to_category_id uuid,
  to_type public.item_type,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  check ((from_category_id is null) <> (from_type is null)),
  check ((to_category_id is null) <> (to_type is null)),
  foreign key (restaurant_id, from_category_id) references public.categories (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, to_category_id) references public.categories (restaurant_id, id) on delete cascade
);
create index suggestion_rules_restaurant_idx on public.suggestion_rules (restaurant_id);

-- Time rules: inside the window (café time zone) add this type or dish as a
-- candidate, whatever was added. weekdays: ISO numbers 1 (Mon) to 7 (Sun);
-- null = every day. A window may pass midnight; its weekday is the day it began.
create table public.suggestion_time_rules (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  from_time time not null,
  to_time time not null,
  weekdays smallint[],
  to_type public.item_type,
  to_item_id uuid,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  check (from_time <> to_time),
  check ((to_type is null) <> (to_item_id is null)),
  check (weekdays is null or (cardinality(weekdays) between 1 and 7 and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, to_item_id) references public.items (restaurant_id, id) on delete cascade
);
create index suggestion_time_rules_location_idx on public.suggestion_time_rules (location_id);

alter table public.item_type_compat enable row level security;
alter table public.item_pairings enable row level security;
alter table public.suggestion_rules enable row level security;
alter table public.suggestion_time_rules enable row level security;
create policy item_type_compat_read on public.item_type_compat for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy item_pairings_read on public.item_pairings for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy suggestion_rules_read on public.suggestion_rules for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy suggestion_time_rules_read on public.suggestion_time_rules for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
revoke all on public.item_type_compat, public.item_pairings, public.suggestion_rules, public.suggestion_time_rules
  from anon, authenticated;
grant select on public.item_type_compat, public.item_pairings, public.suggestion_rules, public.suggestion_time_rules
  to authenticated;
-- Writes only through the api functions below.

-- -----------------------------------------------------------------------------
-- Learned pairs: the logic of api.public_menu_hints, now shared (ADR-060).
-- Same round, another section, at least 3 times in 60 days. With p_item_id,
-- only the pairs of that dish.
-- -----------------------------------------------------------------------------
create function private.learned_pairs(p_location_id uuid, p_item_id uuid default null)
returns table (item_id uuid, other_id uuid, n bigint)
language sql stable security definer set search_path = '' as $$
  with lines as (
    select distinct oi.order_id, oi.item_id, i.category_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.items i on i.id = oi.item_id
    where o.location_id = p_location_id
      and o.business_date >= current_date - 60
      and o.status in ('placed', 'accepted')
      and oi.quantity > oi.cancelled_quantity
  )
  select a.item_id, b.item_id, count(*)
  from lines a
  join lines b on b.order_id = a.order_id and b.category_id <> a.category_id
  where p_item_id is null or a.item_id = p_item_id
  group by a.item_id, b.item_id
  having count(*) >= 3
$$;

create or replace function api.public_menu_hints(p_restaurant_slug text, p_location_slug text)
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
  ranked as (
    select p.item_id as item, p.other_id as other,
           row_number() over (partition by p.item_id order by p.n desc, p.other_id) as rank
    from loc, private.learned_pairs(loc.id) p
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

-- -----------------------------------------------------------------------------
-- Type from a section name (hy / ru / en keywords). A proposal only: the owner
-- reviews it before anything is saved. The first group that matches wins, so
-- "Hot drinks" is coffee_tea before it is a cold drink.
-- -----------------------------------------------------------------------------
create function private.guess_item_type(p_name text) returns text
language sql immutable set search_path = '' as $$
  with n as (select lower(coalesce(p_name, '')) as t)
  select case
    when n.t ~ '(ապուր|բորշ|суп|борщ|soup)' then 'soup'
    when n.t ~ '(սոուս|соус|sauce|dip)' then 'sauce'
    when n.t ~ '(նախաճաշ|բրանչ|завтрак|бранч|breakfast|brunch)' then 'breakfast'
    when n.t ~ '(աղցան|նախաուտեստ|салат|закуск|starter|salad|appeti[sz]er)' then 'starter_salad'
    when n.t ~ '(աղանդեր|տորթ|պաղպաղակ|десерт|торт|мороженое|сладк|dessert|cake|ice cream|sweets?)' then 'dessert'
    when n.t ~ '(թխվածք|թխուկ|խորտիկ|выпечка|пирожн|снек|снэк|сэндвич|pastr|bakery|snack|sandwich)' then 'pastry_snack'
    when n.t ~ '(գինի|գարեջուր|կոնյակ|օղի|կոկտեյլ|վիսկի|ալկոհոլ|вино|пиво|коктейл|виски|водка|коньяк|алкоголь|крепкие|wine|beer|cocktail|whisk|vodka|brandy|spirits|alcohol)' then 'alcohol'
    when n.t ~ '(սուրճ|թեյ|տաք ըմպելիք|кофе|чай|горячие напитки|горячие|coffee|tea|espresso|latte|cappuccino|hot drink)' then 'coffee_tea'
    when n.t ~ '(ըմպելիք|լիմոնադ|հյութ|ջուր|սառը|напиток|напитки|лимонад|сок|вода|смузи|drink|beverage|lemonade|juice|soda|water|smoothie)' then 'cold_drink'
    when n.t ~ '(կողմնակի|կողքի|гарнир|side)' then 'side'
    when n.t ~ '(հիմնական|տաք ուտեստ|խորոված|մսային|ձկան|պիցցա|բուրգեր|մակարոն|горячее|основные|гриль|паста|пицца|бургер|хоровац|шашлык|main|grill|steak|pizza|burger|pasta|hot dish|khorovats|kebab)' then 'main'
  end
  from n
$$;

-- -----------------------------------------------------------------------------
-- Owner and manager functions
-- -----------------------------------------------------------------------------

-- Set (or clear) the type of one dish.
create function api.set_item_type(p_item_id uuid, p_type text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if p_type is not null and p_type not in ('coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                                          'main', 'side', 'sauce', 'dessert', 'pastry_snack') then
    raise exception using errcode = '22023', message = 'invalid_type';
  end if;
  update public.items set item_type = p_type::public.item_type, updated_at = now() where id = p_item_id;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'item.type', 'item', p_item_id, jsonb_build_object('type', p_type));
end $$;

-- Proposals for the dishes of this location that have no type yet, from the
-- name of their section. Nothing is saved: the owner reviews and applies.
create function api.suggest_item_types(p_location_id uuid)
returns table (item_id uuid, category_id uuid, suggested_type text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return query
  select i.id, i.category_id, g.t
  from public.locations l
  join public.menu_locations ml on ml.location_id = l.id
  join public.categories c on c.menu_id = ml.menu_id
  join public.items i on i.category_id = c.id
  cross join lateral (
    select private.guess_item_type((select string_agg(t.name, ' ') from public.category_translations t where t.category_id = c.id)) as t
  ) g
  where l.id = p_location_id and i.item_type is null and g.t is not null
  order by i.id;
end $$;

-- The table for one location: every pair, whether it may suggest here, and
-- whether this café changed it from the default.
create function api.compat_matrix(p_location_id uuid)
returns table (from_type text, to_type text, allowed boolean, is_custom boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return query
  select f.t, t.t, coalesce(o.allowed, d.from_type is not null), o.allowed is not null
  from unnest(array['coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                    'main', 'side', 'sauce', 'dessert', 'pastry_snack']) with ordinality f(t, fo)
  cross join unnest(array['coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                          'main', 'side', 'sauce', 'dessert', 'pastry_snack']) with ordinality t(t, tn)
  left join public.item_type_compat_defaults d on d.from_type::text = f.t and d.to_type::text = t.t
  left join public.item_type_compat o on o.location_id = p_location_id
                                     and o.from_type::text = f.t and o.to_type::text = t.t
  order by f.fo, t.tn;
end $$;

-- Let this café suggest (or never suggest) a type after another. A choice that
-- equals the default is not stored.
create function api.set_compat_rule(p_location_id uuid, p_from_type text, p_to_type text, p_allowed boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_default boolean;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_allowed is null or p_from_type is null or p_to_type is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  begin
    select exists (select 1 from public.item_type_compat_defaults d
                   where d.from_type = p_from_type::public.item_type and d.to_type = p_to_type::public.item_type)
    into v_default;
  exception when check_violation then
    raise exception using errcode = '22023', message = 'invalid_type';
  end;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  if p_allowed = v_default then
    delete from public.item_type_compat
    where location_id = p_location_id and from_type = p_from_type::public.item_type and to_type = p_to_type::public.item_type;
  else
    insert into public.item_type_compat (restaurant_id, location_id, from_type, to_type, allowed)
    values (v_restaurant, p_location_id, p_from_type::public.item_type, p_to_type::public.item_type, p_allowed)
    on conflict (location_id, from_type, to_type) do update set allowed = excluded.allowed;
  end if;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'compat.rule', 'location', p_location_id,
          jsonb_build_object('from', p_from_type, 'to', p_to_type, 'allowed', p_allowed));
end $$;

create function api.reset_compat_rules(p_location_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  delete from public.item_type_compat where location_id = p_location_id;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'compat.reset', 'location', p_location_id);
end $$;

-- A hand-made pairing: with p_item_id, suggest p_suggest_item_id. At most 6 per dish.
create function api.set_item_pairing(p_item_id uuid, p_suggest_item_id uuid, p_sort integer default 0) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if p_suggest_item_id is null or p_suggest_item_id = p_item_id or p_sort is null or p_sort not between -1000 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  if not exists (select 1 from public.items i where i.id = p_suggest_item_id and i.restaurant_id = v_restaurant) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not exists (select 1 from public.item_pairings p where p.item_id = p_item_id and p.suggest_item_id = p_suggest_item_id)
     and (select count(*) from public.item_pairings p where p.item_id = p_item_id) >= 6 then
    raise exception using errcode = '22023', message = 'too_many_pairings';
  end if;
  insert into public.item_pairings (restaurant_id, item_id, suggest_item_id, sort)
  values (v_restaurant, p_item_id, p_suggest_item_id, p_sort)
  on conflict (item_id, suggest_item_id) do update set sort = excluded.sort;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'item.pairing', 'item', p_item_id,
          jsonb_build_object('suggest', p_suggest_item_id, 'sort', p_sort));
end $$;

create function api.remove_item_pairing(p_item_id uuid, p_suggest_item_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  delete from public.item_pairings where item_id = p_item_id and suggest_item_id = p_suggest_item_id;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'item.pairing_removed', 'item', p_item_id,
          jsonb_build_object('suggest', p_suggest_item_id));
end $$;

-- A category/type rule. Exactly one "from" (category or type) and one "to".
-- p_id null creates; at most 30 per café.
create function api.save_suggestion_rule(
  p_restaurant_id uuid, p_id uuid,
  p_from_category_id uuid, p_from_type text,
  p_to_category_id uuid, p_to_type text,
  p_sort integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if (p_from_category_id is null) = (p_from_type is null) or (p_to_category_id is null) = (p_to_type is null)
     or p_sort is null or p_sort not between -1000 and 1000 then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  if p_from_type is not null and p_from_type not in ('coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                                                     'main', 'side', 'sauce', 'dessert', 'pastry_snack')
     or p_to_type is not null and p_to_type not in ('coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                                                    'main', 'side', 'sauce', 'dessert', 'pastry_snack') then
    raise exception using errcode = '22023', message = 'invalid_type';
  end if;
  if exists (select 1 from (values (p_from_category_id), (p_to_category_id)) v (c)
             where v.c is not null and not exists (select 1 from public.categories c where c.id = v.c and c.restaurant_id = p_restaurant_id)) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_id is null then
    if (select count(*) from public.suggestion_rules r where r.restaurant_id = p_restaurant_id) >= 30 then
      raise exception using errcode = '22023', message = 'too_many_rules';
    end if;
    insert into public.suggestion_rules (restaurant_id, from_category_id, from_type, to_category_id, to_type, sort)
    values (p_restaurant_id, p_from_category_id, p_from_type::public.item_type, p_to_category_id, p_to_type::public.item_type, p_sort)
    returning id into v_id;
  else
    update public.suggestion_rules
    set from_category_id = p_from_category_id, from_type = p_from_type::public.item_type,
        to_category_id = p_to_category_id, to_type = p_to_type::public.item_type, sort = p_sort
    where id = p_id and restaurant_id = p_restaurant_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (p_restaurant_id, 'member', auth.uid(), 'suggestion.rule', 'suggestion_rule', v_id);
  return v_id;
end $$;

create function api.remove_suggestion_rule(p_rule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select r.restaurant_id into v_restaurant from public.suggestion_rules r where r.id = p_rule_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  delete from public.suggestion_rules where id = p_rule_id;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, 'member', auth.uid(), 'suggestion.rule_removed', 'suggestion_rule', p_rule_id);
end $$;

-- A time rule for one location; p_id null creates; at most 10 per location.
create function api.save_time_rule(
  p_location_id uuid, p_id uuid, p_from time, p_to time, p_weekdays smallint[],
  p_to_type text, p_to_item_id uuid, p_sort integer default 0
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_id uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  if p_from is null or p_to is null or p_from = p_to or (p_to_type is null) = (p_to_item_id is null)
     or p_sort is null or p_sort not between -1000 and 1000
     or (p_weekdays is not null and (cardinality(p_weekdays) not between 1 and 7
                                     or not p_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])) then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  if p_to_type is not null and p_to_type not in ('coffee_tea', 'cold_drink', 'alcohol', 'breakfast', 'starter_salad', 'soup',
                                                 'main', 'side', 'sauce', 'dessert', 'pastry_snack') then
    raise exception using errcode = '22023', message = 'invalid_type';
  end if;
  if p_to_item_id is not null
     and not exists (select 1 from public.items i where i.id = p_to_item_id and i.restaurant_id = v_restaurant) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_id is null then
    if (select count(*) from public.suggestion_time_rules r where r.location_id = p_location_id) >= 10 then
      raise exception using errcode = '22023', message = 'too_many_rules';
    end if;
    insert into public.suggestion_time_rules (restaurant_id, location_id, from_time, to_time, weekdays, to_type, to_item_id, sort)
    values (v_restaurant, p_location_id, p_from, p_to, p_weekdays, p_to_type::public.item_type, p_to_item_id, p_sort)
    returning id into v_id;
  else
    update public.suggestion_time_rules
    set from_time = p_from, to_time = p_to, weekdays = p_weekdays, to_type = p_to_type::public.item_type,
        to_item_id = p_to_item_id, sort = p_sort
    where id = p_id and location_id = p_location_id
    returning id into v_id;
    if v_id is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'suggestion.time_rule', 'suggestion_time_rule', v_id);
  return v_id;
end $$;

create function api.remove_time_rule(p_rule_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_location uuid;
  v_restaurant uuid;
begin
  select r.location_id, r.restaurant_id into v_location, v_restaurant from public.suggestion_time_rules r where r.id = p_rule_id;
  if v_location is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_location, '{owner,manager}');
  delete from public.suggestion_time_rules where id = p_rule_id;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, v_location, 'member', auth.uid(), 'suggestion.time_rule_removed', 'suggestion_time_rule', p_rule_id);
end $$;

-- -----------------------------------------------------------------------------
-- The guest read path
-- -----------------------------------------------------------------------------
-- {"suggestions": [{"item_id", "reason", "type", "with_item_id", "with_type"}]}
-- up to 3, in order. Anything invalid gives an empty list, never an error and
-- never a hint about what exists. No personal data in, none out.
create function api.public_suggestions(p_location_id uuid, p_item_id uuid, p_cart_item_ids uuid[] default '{}')
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

  with avail as (
    -- Dishes that can be ordered right now: on the published menu, active,
    -- not on the stop list, not blocked by an ingredient outage (ADR-076),
    -- in an open section, not in the cart and not the dish just added.
    select i.id, i.item_type as itype, i.category_id, i.sort
    from public.items i
    join public.categories c on c.id = i.category_id
    where i.restaurant_id = v_loc.restaurant_id
      and i.is_active and c.is_active
      and v_snap ? i.id::text
      and i.id <> p_item_id
      and not (i.id = any (v_cart))
      and private.in_daily_window(v_local::time, c.available_from, c.available_to)
      and not exists (select 1 from public.stop_list s
                      where s.location_id = v_loc.id and s.item_id = i.id and (s.until is null or s.until > now()))
      and not exists (select 1 from private.outage_effects(v_loc.id) e where e.item_id = i.id and e.hidden)
  ),
  pop as (   -- how often each dish was ordered here in the last 60 days (fallback ranking only)
    select oi.item_id, count(*) as n
    from public.orders o join public.order_items oi on oi.order_id = o.id
    where o.location_id = v_loc.id and o.business_date >= current_date - 60
      and o.status in ('placed', 'accepted') and oi.quantity > oi.cancelled_quantity
      and v_added_type is not null
    group by oi.item_id
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

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke execute on function private.learned_pairs(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.guess_item_type(text) from public, anon, authenticated;

revoke execute on function api.public_menu_hints(text, text) from public, anon, authenticated;
grant execute on function api.public_menu_hints(text, text) to anon, authenticated;

revoke execute on function api.public_suggestions(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function api.public_suggestions(uuid, uuid, uuid[]) to anon, authenticated;

revoke execute on function api.set_item_type(uuid, text) from public, anon, authenticated;
revoke execute on function api.suggest_item_types(uuid) from public, anon, authenticated;
revoke execute on function api.compat_matrix(uuid) from public, anon, authenticated;
revoke execute on function api.set_compat_rule(uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function api.reset_compat_rules(uuid) from public, anon, authenticated;
revoke execute on function api.set_item_pairing(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function api.remove_item_pairing(uuid, uuid) from public, anon, authenticated;
revoke execute on function api.save_suggestion_rule(uuid, uuid, uuid, text, uuid, text, integer) from public, anon, authenticated;
revoke execute on function api.remove_suggestion_rule(uuid) from public, anon, authenticated;
revoke execute on function api.save_time_rule(uuid, uuid, time, time, smallint[], text, uuid, integer) from public, anon, authenticated;
revoke execute on function api.remove_time_rule(uuid) from public, anon, authenticated;
grant execute on function api.set_item_type(uuid, text) to authenticated;
grant execute on function api.suggest_item_types(uuid) to authenticated;
grant execute on function api.compat_matrix(uuid) to authenticated;
grant execute on function api.set_compat_rule(uuid, text, text, boolean) to authenticated;
grant execute on function api.reset_compat_rules(uuid) to authenticated;
grant execute on function api.set_item_pairing(uuid, uuid, integer) to authenticated;
grant execute on function api.remove_item_pairing(uuid, uuid) to authenticated;
grant execute on function api.save_suggestion_rule(uuid, uuid, uuid, text, uuid, text, integer) to authenticated;
grant execute on function api.remove_suggestion_rule(uuid) to authenticated;
grant execute on function api.save_time_rule(uuid, uuid, time, time, smallint[], text, uuid, integer) to authenticated;
grant execute on function api.remove_time_rule(uuid) to authenticated;
