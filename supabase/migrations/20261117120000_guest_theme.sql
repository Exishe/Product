-- Guest theme per café (ADR-052). The owner or a manager picks how the
-- guest menu, cart and order page look: "evening" (noir & champagne, the
-- default), "wine" (dark wine with one red) or "soft" (light grey, white
-- cards). Brand colour and logo already exist on restaurants; one function
-- saves all three, so the admin page has a single "Save".

alter table public.restaurants
  add column guest_theme text not null default 'evening'
  constraint restaurants_guest_theme_check check (guest_theme in ('evening', 'wine', 'soft'));

-- Guests read the look with the menu. Everything else is unchanged from
-- 20261109162358_ops_plans_metrics.
create or replace function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'logo', r.logo_path, 'brand_color', r.brand_color,
                                     'guest_theme', r.guest_theme),
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

-- Theme, brand colour and logo in one call. null clears the brand colour
-- (the theme's own accent is used) or the logo. The table's checks still
-- apply: a #rrggbb colour and a logo path inside the café's own folder.
create function api.set_guest_appearance(
  p_restaurant_id uuid, p_theme text, p_brand_color text, p_logo_path text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if p_theme is null or p_theme not in ('evening', 'wine', 'soft') then
    raise exception using errcode = '22023', message = 'invalid_theme';
  end if;
  if p_brand_color is not null and p_brand_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception using errcode = '22023', message = 'invalid_color';
  end if;

  update public.restaurants
  set guest_theme = p_theme,
      brand_color = lower(p_brand_color),
      logo_path = nullif(btrim(p_logo_path), '')
  where id = p_restaurant_id;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (p_restaurant_id, 'member', auth.uid(), 'restaurant.appearance', 'restaurant', p_restaurant_id,
          jsonb_build_object('theme', p_theme, 'brand_color', lower(p_brand_color),
                             'logo', nullif(btrim(p_logo_path), '')));
end $$;

revoke execute on function api.set_guest_appearance(uuid, text, text, text) from public, anon, authenticated;
grant execute on function api.set_guest_appearance(uuid, text, text, text) to authenticated;
