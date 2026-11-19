-- Per-café brand profile (ADR-057). On top of the guest theme preset
-- (ADR-052) a café can bring its own look: a wordmark, up to five colours
-- with fixed roles, a heading, body and script font from a curated list of
-- free Google fonts (Latin and Cyrillic; Armenian always falls back to the
-- Noto families), a plate style for dish photos, and a cover photo per menu
-- section. The round emblem stays restaurants.logo_path; the section cover
-- uses the existing categories.image_path (already scoped to the café's
-- folder by categories_image_path_scoped).
--
-- restaurants.brand (jsonb, null = no brand, the theme looks as it does today):
--   { "colors": { "header"?, "accent"?, "highlight"?, "line"?, "page"? : "#rrggbb" },
--     "heading_font"?, "body_font"?, "script_font"? : a family from private.brand_fonts(),
--     "plate"?: "porcelain" | "dark" | "none",
--     "wordmark"?: storage path inside the café's own folder }
-- Writes go only through api.set_brand, which validates every key (clients
-- have no column grant on brand). The shape check is a function, so it is not
-- a table constraint: those run with the caller's rights on every update of
-- the row, and owners update logo_path directly. The wordmark's folder rule
-- is a plain constraint, like restaurants_logo_path_scoped.

-- The curated font list. Keep in step with BRAND_FONTS in
-- src/features/guest-theme/brand.ts (brand.test.ts compares the two).
create function private.brand_fonts() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    -- headings
    'Cormorant', 'Cormorant Garamond', 'Playfair Display', 'Lora', 'EB Garamond', 'PT Serif',
    'Prata', 'Forum', 'Yeseva One', 'Literata', 'Oswald', 'Unbounded',
    -- body
    'Jost', 'Montserrat', 'Inter', 'Manrope', 'Rubik', 'PT Sans', 'Raleway', 'Nunito',
    'Commissioner', 'Golos Text',
    -- script accents
    'Great Vibes', 'Marck Script', 'Bad Script', 'Caveat', 'Lobster'
  ]
$$;

-- true when p is a brand object of the documented shape (paths are checked
-- against the café separately, they need its id).
create function private.brand_shape_ok(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is null or (
    jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k
                    where k not in ('colors', 'heading_font', 'body_font', 'script_font', 'plate', 'wordmark'))
    and (not p ? 'colors' or (
      jsonb_typeof(p -> 'colors') = 'object'
      and not exists (select 1 from jsonb_each(p -> 'colors') c
                      where c.key not in ('header', 'accent', 'highlight', 'line', 'page')
                         or jsonb_typeof(c.value) <> 'string'
                         or c.value #>> '{}' !~ '^#[0-9a-f]{6}$')))
    and (not p ? 'heading_font' or (p ->> 'heading_font') = any (private.brand_fonts()))
    and (not p ? 'body_font' or (p ->> 'body_font') = any (private.brand_fonts()))
    and (not p ? 'script_font' or (p ->> 'script_font') = any (private.brand_fonts()))
    and (not p ? 'plate' or (p ->> 'plate') in ('porcelain', 'dark', 'none'))
    and (not p ? 'wordmark' or jsonb_typeof(p -> 'wordmark') = 'string')
  )
$$;

revoke execute on function private.brand_fonts() from public, anon, authenticated;
revoke execute on function private.brand_shape_ok(jsonb) from public, anon, authenticated;

alter table public.restaurants
  add column brand jsonb,
  add constraint restaurants_brand_wordmark_scoped check (
    brand is null or not brand ? 'wordmark'
    or ((brand ->> 'wordmark') like id::text || '/%' and (brand ->> 'wordmark') !~ '(^|/)\.\.(/|$)')
  );

-- The whole brand in one call; null (or an empty object) removes it. Colours
-- are stored lowercase, empty strings mean "not set". The owner or a manager,
-- like the theme (set_guest_appearance) and the menu-images folder.
create function api.set_brand(p_restaurant_id uuid, p_brand jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_brand jsonb;
  v_colors jsonb;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if p_brand is not null and jsonb_typeof(p_brand) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_brand';
  end if;

  if p_brand ? 'colors' and jsonb_typeof(p_brand -> 'colors') <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_brand';
  end if;

  -- Drop empty values, lowercase the colours.
  select coalesce(jsonb_object_agg(c.key, lower(c.value #>> '{}')), '{}'::jsonb) into v_colors
  from jsonb_each(coalesce(p_brand -> 'colors', '{}'::jsonb)) c
  where jsonb_typeof(c.value) = 'string' and btrim(c.value #>> '{}') <> '';

  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_brand
  from jsonb_each(coalesce(p_brand, '{}'::jsonb) - 'colors') e
  where e.value <> 'null'::jsonb and coalesce(btrim(e.value #>> '{}'), '') <> '';
  if v_colors <> '{}'::jsonb then
    v_brand := v_brand || jsonb_build_object('colors', v_colors);
  end if;
  if v_brand = '{}'::jsonb then
    v_brand := null;
  end if;

  if not private.brand_shape_ok(v_brand) then
    raise exception using errcode = '22023', message = 'invalid_brand';
  end if;

  update public.restaurants set brand = v_brand where id = p_restaurant_id;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (p_restaurant_id, 'member', auth.uid(), 'restaurant.brand', 'restaurant', p_restaurant_id,
          coalesce(v_brand, '{}'::jsonb));
end $$;

-- A section's cover photo (categories.image_path); null removes it. The path
-- must be one of the café's own cover files: <café>/covers/<section>/<n>.webp.
create function api.set_section_cover(p_category_id uuid, p_path text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_path text := nullif(btrim(p_path), '');
begin
  select restaurant_id into v_restaurant from public.categories where id = p_category_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if v_path is not null
     and v_path !~ ('^' || v_restaurant::text || '/covers/' || p_category_id::text || '/[0-9]+\.webp$') then
    raise exception using errcode = '22023', message = 'invalid_path';
  end if;

  update public.categories set image_path = v_path where id = p_category_id;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'category.cover', 'category', p_category_id,
          jsonb_build_object('path', v_path));
end $$;

revoke execute on function api.set_brand(uuid, jsonb) from public, anon, authenticated;
grant execute on function api.set_brand(uuid, jsonb) to authenticated;
revoke execute on function api.set_section_cover(uuid, text) from public, anon, authenticated;
grant execute on function api.set_section_cover(uuid, text) to authenticated;

-- Guests read the brand with the menu, and the covers of the live sections
-- (live like the stop list: a new cover shows without republishing).
-- Everything else is unchanged from 20261117120000_guest_theme.
create or replace function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'logo', r.logo_path, 'brand_color', r.brand_color,
                                     'guest_theme', r.guest_theme, 'brand', r.brand),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'locales', to_jsonb(l.guest_locales),
                                   'ordering', l.qr_ordering_enabled and private.location_can_order(l.id)),
    'menu', v.snapshot,
    'sold_out', (select coalesce(jsonb_agg(s.item_id), '[]'::jsonb) from public.stop_list s
                 where s.location_id = l.id and (s.until is null or s.until > now())),
    'covers', (select coalesce(jsonb_object_agg(c.id, c.image_path), '{}'::jsonb) from public.categories c
               where c.restaurant_id = r.id and c.is_active and c.image_path is not null),
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
