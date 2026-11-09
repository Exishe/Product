-- ADR-033 (operations), ADR-036 (plans) and ADR-037 (metrics).

-- -----------------------------------------------------------------------------
-- ADR-033: kitchen busy, device heartbeat, test orders, possible duplicates
-- -----------------------------------------------------------------------------
alter table public.locations
  add column kitchen_busy_until timestamptz,
  add column expected_wait_minutes smallint check (expected_wait_minutes in (20, 30, 45));

alter table public.members add column last_seen_at timestamptz;

alter table public.orders
  add column is_test boolean not null default false,
  add column possible_duplicate_of uuid,
  add constraint orders_possible_duplicate_fk foreign key (restaurant_id, possible_duplicate_of)
    references public.orders (restaurant_id, id) on delete set null (possible_duplicate_of);

-- -----------------------------------------------------------------------------
-- ADR-036: two plans, enforced here
-- -----------------------------------------------------------------------------
update public.subscriptions set plan = 'service' where plan not in ('menu', 'service');

alter table public.subscriptions
  add constraint subscriptions_plan_check check (plan in ('menu', 'service')),
  add column canceled_at timestamptz,
  add column cancel_reason text check (char_length(cancel_reason) <= 300),
  add column converted_at timestamptz;

-- Ordering needs the Service plan: in the free month, paid up, or at most
-- 7 days past due. The Menu plan keeps the public menu and nothing else.
create function private.location_can_order(p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subscriptions s
    where s.location_id = p_location_id
      and s.plan = 'service'
      and (   (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
           or  s.status = 'active'
           or (s.status = 'past_due' and s.current_period_end > now() - interval '7 days')))
$$;

-- One check for every way an order is created (guest, waiter, later kiosk).
create function private.orders_require_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not private.location_can_order(new.location_id) then
    raise exception using errcode = 'RS402', message = 'plan_required';
  end if;
  return new;
end $$;

create trigger orders_require_plan before insert on public.orders
  for each row execute function private.orders_require_plan();

-- New cafés start their free month on the Service plan.
create or replace function api.create_restaurant(p_name text, p_slug text, p_location_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_location uuid;
  v_station uuid;
  v_area uuid;
begin
  if not private.is_real_user() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  insert into public.restaurants (name, slug, created_by)
  values (p_name, p_slug, auth.uid()) returning id into v_restaurant;
  insert into public.locations (restaurant_id, name, slug)
  values (v_restaurant, p_location_name, 'main') returning id into v_location;
  insert into public.members (restaurant_id, user_id, role, display_name)
  values (v_restaurant, auth.uid(), 'owner', p_display_name);
  insert into public.stations (restaurant_id, location_id, name, is_default)
  values (v_restaurant, v_location, 'Kitchen', true) returning id into v_station;
  insert into public.prep_areas (restaurant_id, name) values (v_restaurant, 'Kitchen') returning id into v_area;
  insert into public.station_prep_areas (restaurant_id, location_id, prep_area_id, station_id)
  values (v_restaurant, v_location, v_area, v_station);
  insert into public.subscriptions (restaurant_id, location_id, plan, status, price_amd, trial_ends_at)
  values (v_restaurant, v_location, 'service', 'trialing', 0, now() + interval '30 days');
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, 'member', auth.uid(), 'restaurant.created', 'restaurant', v_restaurant);
  return v_restaurant;
end $$;

-- The guest menu shows whether ordering is on (plan and switch) and, while the
-- kitchen is busy, the expected wait. The notice ends by itself.
create or replace function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'logo', r.logo_path, 'brand_color', r.brand_color),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'locales', to_jsonb(l.guest_locales),
                                   'ordering', l.qr_ordering_enabled and private.location_can_order(l.id)),
    'menu', v.snapshot,
    'sold_out', (select coalesce(jsonb_agg(s.item_id), '[]'::jsonb) from public.stop_list s
                 where s.location_id = l.id and (s.until is null or s.until > now())),
    'kitchen_busy', case when l.kitchen_busy_until > now()
                         then jsonb_build_object('until', l.kitchen_busy_until,
                                                 'expected_wait_minutes', l.expected_wait_minutes)
                    end)
  from public.restaurants r
  join public.locations l on l.restaurant_id = r.id
  join public.menu_versions v on v.id = l.published_menu_version_id
  where r.slug = p_restaurant_slug and l.slug = p_location_slug
    and r.status = 'active' and l.status = 'active'
$$;

-- -----------------------------------------------------------------------------
-- ADR-037: when a kitchen screen first drew a ticket; device heartbeat
-- -----------------------------------------------------------------------------
alter table public.kitchen_tickets add column first_seen_at timestamptz;

create function api.mark_tickets_seen(p_ticket_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  update public.kitchen_tickets k set first_seen_at = now()
  where k.id = any (p_ticket_ids)
    and k.first_seen_at is null
    and k.location_id in (select private.my_location_ids())
$$;

create function api.heartbeat() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.members m set last_seen_at = now()
  where m.user_id = auth.uid() and m.kind = 'device' and m.is_active;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.location_can_order(uuid), private.orders_require_plan(),
  api.mark_tickets_seen(uuid[]), api.heartbeat()
from public, anon, authenticated;
grant execute on function api.mark_tickets_seen(uuid[]), api.heartbeat() to authenticated;
