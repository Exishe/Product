-- Dish editor: the owner sets allergens and diet tags (guests already read them).
-- save_item now takes "allergens" (kept as is when the key is missing, so a save
-- from an older client or an import doesn't wipe them) and checks both lists
-- against the known values. Same signature, so grants stay as they were.

-- p_item: {id?, category_id, price, prep_area_id?, is_active?, portion_amount?, portion_unit?,
--          tags?, allergens?, image_path?, names, descriptions?, modifier_group_ids?, mark_reviewed?}
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
  if not v_tags <@ array['popular', 'new', 'vegan', 'vegetarian', 'gluten_free', 'lactose_free', 'spicy'] then
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
