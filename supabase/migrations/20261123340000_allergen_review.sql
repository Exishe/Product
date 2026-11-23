-- "This dish contains none of the 14 allergens" (ADR-083, spec 4.2).
--
-- Until now an empty allergen list meant "nobody entered it", so a guest with
-- an allergy could not tell "none" from "unknown". items.allergens_confirmed
-- says the owner has reviewed the dish's allergen information:
--   confirmed + empty list  -> guests read "No allergens declared by the venue"
--   confirmed + a list      -> the list
--   not confirmed           -> "not listed, ask your waiter" (today's text)
--
--   1. items.allergens_confirmed boolean not null default false. Backfill: true
--      where a list exists (a dish with allergens counts as reviewed).
--   2. api.save_item (from 20261123320000_calories_tags; only the new key is
--      added): a non-empty list sets it true; the key "allergens_confirmed"
--      sets it as given; a list that is emptied without that key resets it to
--      false (removing the last tick must not turn into a claim of "none"); a
--      missing key keeps the stored value. No separate bulk function: there is
--      deliberately no "mark everything reviewed" (it would make false claims).
--   3. private.publish_menu_core (from 20261123320000_calories_tags; only the
--      new key) writes allergens_confirmed into each published dish. It is true
--      when the column is true or the list is not empty, so the snapshot is
--      consistent even for rows written by scripts that bypass save_item.
-- Blanca's real dishes stay unconfirmed until the owner reviews them.

alter table public.items add column allergens_confirmed boolean not null default false;
update public.items set allergens_confirmed = true where cardinality(allergens) > 0;

-- 2. and 3. (the latest definitions with the new key)
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
           'allergens_confirmed', (li.allergens_confirmed or cardinality(li.allergens) > 0),
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
  v_confirmed boolean := (p_item ->> 'allergens_confirmed')::boolean;
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
                              portion_amount, portion_unit, tags, allergens, allergens_confirmed, image_path)
    values (p_restaurant_id, v_cat, v_price::integer, v_prep,
            coalesce((select max(i.sort) + 1 from public.items i where i.category_id = v_cat), 0),
            coalesce((p_item ->> 'is_active')::boolean, true), v_amount, v_unit, v_tags, v_allergens,
            coalesce(v_confirmed, false) or cardinality(v_allergens) > 0,
            nullif(p_item ->> 'image_path', ''))
    returning id into v_saved;
  else
    update public.items
    set category_id = v_cat, price = v_price::integer, prep_area_id = v_prep,
        is_active = coalesce((p_item ->> 'is_active')::boolean, is_active),
        portion_amount = v_amount, portion_unit = v_unit, tags = v_tags,
        allergens = case when p_item ? 'allergens' then v_allergens else allergens end,
        allergens_confirmed = case
          when p_item ? 'allergens' and cardinality(v_allergens) > 0 then true
          when v_confirmed is not null then v_confirmed
          when p_item ? 'allergens' then false
          else allergens_confirmed end,
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
