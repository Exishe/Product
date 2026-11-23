-- Approximate calories per dish and the "Chef's pick" tag (ADR-082).
--
--   1. ingredients.grams_per_piece: what one piece weighs, so "2 pcs of egg"
--      has a weight. Optional, owner-edited.
--   2. private.item_kcal_detail: the number. Sum over the dish's recipe lines of
--      weight x kcal_per_100g / 100, where weight is the quantity for g and ml
--      (ml counts as g) and quantity x grams_per_piece for pcs. Only when EVERY
--      line has both a calorie value and a usable weight; otherwise no number
--      (never a partial total). Rounded to the nearest 10. Substitutes are not
--      applied: the number is for the normal recipe. A total that rounds to 0 is
--      not shown ("about 0 kcal" would claim too much).
--   3. private.publish_menu_core now writes "kcal" into each published dish
--      (only when there is a number). Everything else in it is unchanged from
--      20261123160000_telegram_bot_more_actions, so guests see a change to the
--      ingredients after Publish, like any other menu change.
--   4. api.item_kcal (the owner's live preview of the same number, with what is
--      missing) and api.set_ingredient_kcal (calories and piece weight of one
--      ingredient; api.save_ingredient needs the whole ingredient and knows
--      nothing about the piece weight).
--   5. api.save_item accepts the tag chefs_pick (from its latest definition,
--      20261120090000_dish_allergens; nothing else changed).

-- -----------------------------------------------------------------------------
-- 1. Weight of one piece
-- -----------------------------------------------------------------------------
alter table public.ingredients
  add column grams_per_piece numeric(8, 2) check (grams_per_piece is null or grams_per_piece between 0.1 and 10000);

-- -----------------------------------------------------------------------------
-- 2. The calculation
-- -----------------------------------------------------------------------------
-- One row: kcal (null: no number) and missing, the lines that block it:
-- [{"id": ingredient id, "reason": "kcal" | "weight"}].
create function private.item_kcal_detail(p_item_id uuid) returns table (kcal integer, missing jsonb)
language sql stable security definer set search_path = '' as $$
  with l as (
    select rl.ingredient_id, g.kcal_per_100g,
           case g.unit when 'pcs' then rl.quantity * g.grams_per_piece else rl.quantity end as grams
    from public.recipe_lines rl
    join public.ingredients g on g.restaurant_id = rl.restaurant_id and g.id = rl.ingredient_id
    where rl.item_id = p_item_id),
  bad as (
    select ingredient_id, case when kcal_per_100g is null then 'kcal' else 'weight' end as reason
    from l where kcal_per_100g is null or grams is null)
  select case when exists (select 1 from bad) then null
              else (select nullif(round(sum(l.grams * l.kcal_per_100g / 100) / 10) * 10, 0)::integer from l)
         end,
         coalesce((select jsonb_agg(jsonb_build_object('id', b.ingredient_id, 'reason', b.reason)
                                    order by b.ingredient_id) from bad b), '[]'::jsonb)
$$;

-- The owner's preview: {"kcal": int|null, "missing": [...]} from the live recipe.
create function api.item_kcal(p_item_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  return (select jsonb_build_object('kcal', d.kcal, 'missing', d.missing) from private.item_kcal_detail(p_item_id) d);
end $$;

-- Calories per 100 g and the weight of one piece, for one ingredient of the
-- café. Null clears a value. Dishes using the ingredient show the new number
-- after the next Publish.
create function api.set_ingredient_kcal(p_ingredient_id uuid, p_kcal_per_100g numeric, p_grams_per_piece numeric default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.ingredients i where i.id = p_ingredient_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if (p_kcal_per_100g is not null and p_kcal_per_100g not between 0 and 1000)
     or (p_grams_per_piece is not null and p_grams_per_piece not between 0.1 and 10000) then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  update public.ingredients
  set kcal_per_100g = round(p_kcal_per_100g, 2), grams_per_piece = round(p_grams_per_piece, 2)
  where id = p_ingredient_id and restaurant_id = v_restaurant;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'ingredient.kcal', 'ingredient', p_ingredient_id,
          jsonb_build_object('kcal_per_100g', p_kcal_per_100g, 'grams_per_piece', p_grams_per_piece));
end $$;

revoke execute on function private.item_kcal_detail(uuid) from public, anon, authenticated;
revoke execute on function api.item_kcal(uuid) from public, anon, authenticated;
grant execute on function api.item_kcal(uuid) to authenticated;
revoke execute on function api.set_ingredient_kcal(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function api.set_ingredient_kcal(uuid, numeric, numeric) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Publishing: "kcal" in each dish of the snapshot
-- -----------------------------------------------------------------------------
create or replace function private.publish_menu_core(p_location_id uuid, p_actor_kind public.actor_kind, p_actor_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_version integer;
  v_id uuid;
  v_snapshot jsonb;
  v_items jsonb;
  v_count integer;
begin
  select restaurant_id into v_restaurant from public.locations where id = p_location_id;

  -- AI output never reaches guests unreviewed.
  if private.menu_has_unreviewed_ai(p_location_id) then
    raise exception using errcode = 'RS422', message = 'unreviewed_ai_translations';
  end if;

  with live_items as (
    select i.*, coalesce(i.prep_area_id, c.prep_area_id) as resolved_prep_area
    from public.items i
    join public.categories c on c.id = i.category_id
    join public.menus m on m.id = c.menu_id
    join public.menu_locations ml on ml.menu_id = m.id and ml.location_id = p_location_id
    where i.is_active and c.is_active and m.is_active
  )
  select coalesce(jsonb_object_agg(li.id, jsonb_build_object(
           'name', (select jsonb_object_agg(t.locale, t.name) from public.item_translations t where t.item_id = li.id),
           'description', (select jsonb_object_agg(t.locale, t.description) from public.item_translations t
                           where t.item_id = li.id and t.description is not null),
           'price', li.price,
           'prep_area_id', li.resolved_prep_area,
           'image', li.image_path,
           'blurhash', li.image_blurhash,
           'portion', case when li.portion_amount is null then null
                           else jsonb_build_object('amount', li.portion_amount, 'unit', li.portion_unit) end,
           'tags', to_jsonb(li.tags),
           'allergens', to_jsonb(li.allergens),
           'groups', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', g.id, 'min', g.min_select, 'max', g.max_select,
                         'name', (select jsonb_object_agg(gt.locale, gt.name) from public.modifier_group_translations gt where gt.group_id = g.id),
                         'modifiers', (select coalesce(jsonb_agg(jsonb_build_object(
                                          'id', md.id, 'price_delta', md.price_delta, 'is_default', md.is_default,
                                          'name', (select jsonb_object_agg(mt.locale, mt.name) from public.modifier_translations mt where mt.modifier_id = md.id))
                                          order by md.sort), '[]'::jsonb)
                                       from public.modifiers md where md.group_id = g.id and md.is_active))
                       order by img.sort), '[]'::jsonb)
                      from public.item_modifier_groups img
                      join public.modifier_groups g on g.id = img.group_id
                      where img.item_id = li.id)
         ) || coalesce((select jsonb_build_object('kcal', d.kcal) from private.item_kcal_detail(li.id) d
                        where d.kcal is not null), '{}'::jsonb)), '{}'::jsonb),
         count(*)
  into v_items, v_count
  from live_items li;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id,
           'name', (select jsonb_object_agg(t.locale, t.name) from public.menu_translations t where t.menu_id = m.id),
           'categories', (select coalesce(jsonb_agg(jsonb_build_object(
                             'id', c.id,
                             'name', (select jsonb_object_agg(t.locale, t.name) from public.category_translations t where t.category_id = c.id),
                             'item_ids', (select coalesce(jsonb_agg(i.id order by i.sort), '[]'::jsonb)
                                          from public.items i where i.category_id = c.id and i.is_active))
                           order by c.sort), '[]'::jsonb)
                          from public.categories c where c.menu_id = m.id and c.is_active))
         order by m.sort), '[]'::jsonb)
  into v_snapshot
  from public.menus m
  join public.menu_locations ml on ml.menu_id = m.id and ml.location_id = p_location_id
  where m.is_active;

  select coalesce(max(version), 0) + 1 into v_version from public.menu_versions where location_id = p_location_id;

  insert into public.menu_versions (restaurant_id, location_id, version, snapshot, item_count, published_by)
  values (v_restaurant, p_location_id, v_version,
          jsonb_build_object('location_id', p_location_id, 'version', v_version, 'published_at', now(),
                             'menus', v_snapshot, 'items', v_items),
          v_count, p_actor_user)
  returning id into v_id;

  update public.locations set published_menu_version_id = v_id where id = p_location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, p_actor_kind, p_actor_user, 'menu.published', 'menu_version', v_id,
          jsonb_build_object('version', v_version, 'items', v_count));
  return v_id;
end $$;


-- -----------------------------------------------------------------------------
-- 5. The tag chefs_pick ("Chef's pick")
-- -----------------------------------------------------------------------------
create or replace function api.save_item(p_restaurant_id uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_cat uuid := nullif(p_item ->> 'category_id', '')::uuid;
  v_prep uuid := nullif(p_item ->> 'prep_area_id', '')::uuid;
  v_price numeric := (p_item ->> 'price')::numeric;
  v_amount integer := nullif(p_item ->> 'portion_amount', '')::integer;
  v_unit text := nullif(p_item ->> 'portion_unit', '');
  v_tags text[] := array(select jsonb_array_elements_text(coalesce(p_item -> 'tags', '[]'::jsonb)));
  v_allergens text[] := array(select jsonb_array_elements_text(coalesce(p_item -> 'allergens', '[]'::jsonb)));
  v_saved uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if v_price is null or v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
    raise exception using errcode = '22023', message = 'invalid_price';
  end if;
  -- Tags and allergens come from fixed lists (the 14 EU allergens, Annex II of 1169/2011).
  if not v_tags <@ array['popular', 'new', 'vegan', 'vegetarian', 'gluten_free', 'lactose_free', 'spicy', 'chefs_pick'] then
    raise exception using errcode = '22023', message = 'invalid_tag';
  end if;
  if not v_allergens <@ array['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts',
                              'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs'] then
    raise exception using errcode = '22023', message = 'invalid_allergen';
  end if;
  perform private.require_hy_name(p_item -> 'names');
  if not exists (select 1 from public.categories c where c.id = v_cat and c.restaurant_id = p_restaurant_id)
     or (v_prep is not null
         and not exists (select 1 from public.prep_areas a where a.id = v_prep and a.restaurant_id = p_restaurant_id)) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if v_id is null then
    insert into public.items (restaurant_id, category_id, price, prep_area_id, sort, is_active,
                              portion_amount, portion_unit, tags, allergens, image_path)
    values (p_restaurant_id, v_cat, v_price::integer, v_prep,
            coalesce((select max(i.sort) + 1 from public.items i where i.category_id = v_cat), 0),
            coalesce((p_item ->> 'is_active')::boolean, true), v_amount, v_unit, v_tags, v_allergens,
            nullif(p_item ->> 'image_path', ''))
    returning id into v_saved;
  else
    update public.items
    set category_id = v_cat, price = v_price::integer, prep_area_id = v_prep,
        is_active = coalesce((p_item ->> 'is_active')::boolean, is_active),
        portion_amount = v_amount, portion_unit = v_unit, tags = v_tags,
        allergens = case when p_item ? 'allergens' then v_allergens else allergens end,
        image_path = case when p_item ? 'image_path' then nullif(p_item ->> 'image_path', '') else image_path end,
        updated_at = now()
    where id = v_id and restaurant_id = p_restaurant_id
    returning id into v_saved;
    if v_saved is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;

  perform private.set_translations('item_translations', 'item_id', p_restaurant_id, v_saved,
                                   p_item -> 'names', p_item -> 'descriptions',
                                   coalesce((p_item ->> 'mark_reviewed')::boolean, false));

  -- A reviewed dish takes its own size options with it (they were read from the
  -- same line of the menu), and a section counts as reviewed once all its dishes are.
  if coalesce((p_item ->> 'mark_reviewed')::boolean, false) then
    update public.modifier_translations t set reviewed_at = now(), updated_at = now()
     where t.source = 'ai' and t.reviewed_at is null
       and t.modifier_id in (select m.id from public.modifiers m
                             join public.item_modifier_groups img on img.group_id = m.group_id
                             where img.item_id = v_saved);
    select i.category_id into v_cat from public.items i where i.id = v_saved;
    if not exists (select 1 from public.item_translations t join public.items i on i.id = t.item_id
                   where i.category_id = v_cat and t.source = 'ai' and t.reviewed_at is null) then
      update public.category_translations set reviewed_at = now(), updated_at = now()
       where category_id = v_cat and source = 'ai' and reviewed_at is null;
    end if;
  end if;

  if p_item ? 'modifier_group_ids' then
    if exists (select 1 from jsonb_array_elements_text(p_item -> 'modifier_group_ids') g(id)
               where not exists (select 1 from public.modifier_groups mg
                                 where mg.id = g.id::uuid and mg.restaurant_id = p_restaurant_id)) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
    delete from public.item_modifier_groups
    where item_id = v_saved
      and group_id not in (select g::uuid from jsonb_array_elements_text(p_item -> 'modifier_group_ids') g);
    insert into public.item_modifier_groups (restaurant_id, item_id, group_id, sort)
    select p_restaurant_id, v_saved, g.id::uuid, (g.ord - 1)::integer
    from jsonb_array_elements_text(p_item -> 'modifier_group_ids') with ordinality g(id, ord)
    on conflict (item_id, group_id) do update set sort = excluded.sort;
  end if;
  return v_saved;
end $$;
