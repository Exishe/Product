-- Menu editing (Task 3.1): one call saves a whole category, dish or option
-- group with its names in hy / ru / en, so a dish is never half saved.

create function private.assert_restaurant_role(p_restaurant_id uuid, p_roles public.member_role[])
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_restaurant_id is null
     or not exists (select 1 from private.my_restaurant_ids(p_roles) x where x = p_restaurant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- Applies names (and, for dishes, descriptions) per language:
-- empty → the row is removed; changed → the owner's text (source owner);
-- unchanged AI text with p_mark_reviewed → reviewed. Armenian is checked by callers.
create function private.set_translations(
  p_table text, p_fk text, p_restaurant_id uuid, p_id uuid,
  p_names jsonb, p_descriptions jsonb, p_mark_reviewed boolean
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loc public.app_locale;
  v_name text;
  v_desc text;
  v_has_desc boolean := p_table = 'item_translations';
  v_old record;
  v_rows integer;
begin
  if p_table not in ('menu_translations', 'category_translations', 'item_translations',
                     'modifier_group_translations', 'modifier_translations') then
    raise exception 'unknown translation table %', p_table;
  end if;
  foreach v_loc in array enum_range(null::public.app_locale) loop
    v_name := nullif(btrim(coalesce(p_names ->> v_loc::text, '')), '');
    v_desc := case when v_has_desc then nullif(btrim(coalesce(p_descriptions ->> v_loc::text, '')), '') end;
    execute format('select name, %s as description, source from public.%I where %I = $1 and locale = $2',
                   case when v_has_desc then 'description' else 'null::text' end, p_table, p_fk)
      into v_old using p_id, v_loc;
    get diagnostics v_rows = row_count;
    if v_name is null then
      if v_rows > 0 then
        execute format('delete from public.%I where %I = $1 and locale = $2', p_table, p_fk) using p_id, v_loc;
      end if;
    elsif v_rows = 0 then
      if v_has_desc then
        execute format('insert into public.%I (restaurant_id, %I, locale, name, description) values ($1, $2, $3, $4, $5)',
                       p_table, p_fk) using p_restaurant_id, p_id, v_loc, v_name, v_desc;
      else
        execute format('insert into public.%I (restaurant_id, %I, locale, name) values ($1, $2, $3, $4)',
                       p_table, p_fk) using p_restaurant_id, p_id, v_loc, v_name;
      end if;
    elsif v_old.name is distinct from v_name or v_old.description is distinct from v_desc then
      execute format('update public.%I set name = $3, %s source = ''owner'', reviewed_at = null, updated_at = now()
                      where %I = $1 and locale = $2',
                     p_table, case when v_has_desc then 'description = $4,' else '' end, p_fk)
        using p_id, v_loc, v_name, v_desc;
    elsif p_mark_reviewed then
      execute format('update public.%I set reviewed_at = now(), updated_at = now()
                      where %I = $1 and locale = $2 and source = ''ai'' and reviewed_at is null', p_table, p_fk)
        using p_id, v_loc;
    end if;
  end loop;
end $$;

create function private.require_hy_name(p_names jsonb) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if nullif(btrim(coalesce(p_names ->> 'hy', '')), '') is null then
    raise exception using errcode = '22023', message = 'name_required';
  end if;
end $$;

-- The café's menu, created with three names on first use and linked to every location.
create function api.ensure_menu(p_restaurant_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_menu uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  select m.id into v_menu from public.menus m where m.restaurant_id = p_restaurant_id order by m.created_at, m.id limit 1;
  if v_menu is null then
    insert into public.menus (restaurant_id, internal_name) values (p_restaurant_id, 'Main') returning id into v_menu;
    insert into public.menu_translations (restaurant_id, menu_id, locale, name) values
      (p_restaurant_id, v_menu, 'hy', 'Ճաշացանկ'), (p_restaurant_id, v_menu, 'ru', 'Меню'), (p_restaurant_id, v_menu, 'en', 'Menu');
  end if;
  insert into public.menu_locations (restaurant_id, menu_id, location_id)
  select p_restaurant_id, v_menu, l.id from public.locations l where l.restaurant_id = p_restaurant_id
  on conflict do nothing;
  return v_menu;
end $$;

create function api.save_category(p_restaurant_id uuid, p_category_id uuid, p_names jsonb, p_prep_area_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_menu uuid;
  v_cat uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  perform private.require_hy_name(p_names);
  if p_prep_area_id is not null
     and not exists (select 1 from public.prep_areas a where a.id = p_prep_area_id and a.restaurant_id = p_restaurant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_category_id is null then
    v_menu := api.ensure_menu(p_restaurant_id);
    insert into public.categories (restaurant_id, menu_id, prep_area_id, sort)
    values (p_restaurant_id, v_menu, p_prep_area_id,
            coalesce((select max(c.sort) + 1 from public.categories c where c.menu_id = v_menu), 0))
    returning id into v_cat;
  else
    update public.categories set prep_area_id = p_prep_area_id, updated_at = now()
    where id = p_category_id and restaurant_id = p_restaurant_id
    returning id into v_cat;
    if v_cat is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;
  perform private.set_translations('category_translations', 'category_id', p_restaurant_id, v_cat, p_names, null, false);
  return v_cat;
end $$;

-- p_item: {id?, category_id, price, prep_area_id?, is_active?, portion_amount?, portion_unit?,
--          tags?, image_path?, names, descriptions?, modifier_group_ids?, mark_reviewed?}
create function api.save_item(p_restaurant_id uuid, p_item jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_cat uuid := nullif(p_item ->> 'category_id', '')::uuid;
  v_prep uuid := nullif(p_item ->> 'prep_area_id', '')::uuid;
  v_price numeric := (p_item ->> 'price')::numeric;
  v_amount integer := nullif(p_item ->> 'portion_amount', '')::integer;
  v_unit text := nullif(p_item ->> 'portion_unit', '');
  v_tags text[] := array(select jsonb_array_elements_text(coalesce(p_item -> 'tags', '[]'::jsonb)));
  v_saved uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if v_price is null or v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
    raise exception using errcode = '22023', message = 'invalid_price';
  end if;
  perform private.require_hy_name(p_item -> 'names');
  if not exists (select 1 from public.categories c where c.id = v_cat and c.restaurant_id = p_restaurant_id)
     or (v_prep is not null
         and not exists (select 1 from public.prep_areas a where a.id = v_prep and a.restaurant_id = p_restaurant_id)) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if v_id is null then
    insert into public.items (restaurant_id, category_id, price, prep_area_id, sort, is_active,
                              portion_amount, portion_unit, tags, image_path)
    values (p_restaurant_id, v_cat, v_price::integer, v_prep,
            coalesce((select max(i.sort) + 1 from public.items i where i.category_id = v_cat), 0),
            coalesce((p_item ->> 'is_active')::boolean, true), v_amount, v_unit, v_tags,
            nullif(p_item ->> 'image_path', ''))
    returning id into v_saved;
  else
    update public.items
    set category_id = v_cat, price = v_price::integer, prep_area_id = v_prep,
        is_active = coalesce((p_item ->> 'is_active')::boolean, is_active),
        portion_amount = v_amount, portion_unit = v_unit, tags = v_tags,
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

-- p_group: {id?, min_select, max_select, names, options: [{id?, names, price_delta, is_default}]}
-- Options left out of the list are hidden, not deleted: old orders still name them.
create function api.save_modifier_group(p_restaurant_id uuid, p_group jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_group uuid := nullif(p_group ->> 'id', '')::uuid;
  v_min integer := coalesce((p_group ->> 'min_select')::integer, 0);
  v_max integer := coalesce((p_group ->> 'max_select')::integer, 1);
  v_opt jsonb;
  v_ord bigint;
  v_oid uuid;
  v_delta numeric;
  v_keep uuid[] := '{}';
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  perform private.require_hy_name(p_group -> 'names');
  if v_min < 0 or v_max < 1 or v_max > 20 or v_min > v_max then
    raise exception using errcode = '22023', message = 'invalid_selection';
  end if;
  if v_group is null then
    insert into public.modifier_groups (restaurant_id, min_select, max_select) values (p_restaurant_id, v_min, v_max)
    returning id into v_group;
  else
    update public.modifier_groups set min_select = v_min, max_select = v_max, updated_at = now()
    where id = v_group and restaurant_id = p_restaurant_id
    returning id into v_oid;
    if v_oid is null then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;
  perform private.set_translations('modifier_group_translations', 'group_id', p_restaurant_id, v_group,
                                   p_group -> 'names', null, false);

  for v_opt, v_ord in select value, ordinality from jsonb_array_elements(coalesce(p_group -> 'options', '[]'::jsonb)) with ordinality loop
    perform private.require_hy_name(v_opt -> 'names');
    v_delta := coalesce((v_opt ->> 'price_delta')::numeric, 0);
    if v_delta <> trunc(v_delta) or v_delta < -1000000 or v_delta > 1000000 then
      raise exception using errcode = '22023', message = 'invalid_price';
    end if;
    v_oid := nullif(v_opt ->> 'id', '')::uuid;
    if v_oid is null then
      insert into public.modifiers (restaurant_id, group_id, price_delta, is_default, sort)
      values (p_restaurant_id, v_group, v_delta::integer, coalesce((v_opt ->> 'is_default')::boolean, false), (v_ord - 1)::integer)
      returning id into v_oid;
    else
      update public.modifiers
      set price_delta = v_delta::integer, is_default = coalesce((v_opt ->> 'is_default')::boolean, false),
          sort = (v_ord - 1)::integer, is_active = true
      where id = v_oid and group_id = v_group
      returning id into v_oid;
      if v_oid is null then
        raise exception using errcode = '42501', message = 'forbidden';
      end if;
    end if;
    perform private.set_translations('modifier_translations', 'modifier_id', p_restaurant_id, v_oid,
                                     v_opt -> 'names', null, false);
    v_keep := v_keep || v_oid;
  end loop;
  update public.modifiers set is_active = false where group_id = v_group and not (id = any (v_keep));
  return v_group;
end $$;

create function api.reorder(p_restaurant_id uuid, p_kind text, p_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if p_kind = 'categories' then
    update public.categories c set sort = (x.ord - 1)::integer, updated_at = now()
    from unnest(p_ids) with ordinality x(id, ord)
    where c.id = x.id and c.restaurant_id = p_restaurant_id;
  elsif p_kind = 'items' then
    update public.items i set sort = (x.ord - 1)::integer, updated_at = now()
    from unnest(p_ids) with ordinality x(id, ord)
    where i.id = x.id and i.restaurant_id = p_restaurant_id;
  else
    raise exception using errcode = '22023', message = 'invalid_kind';
  end if;
end $$;

create function api.delete_item(p_item_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  delete from public.items where id = p_item_id;
end $$;

revoke execute on function
  private.assert_restaurant_role(uuid, public.member_role[]),
  private.set_translations(text, text, uuid, uuid, jsonb, jsonb, boolean),
  private.require_hy_name(jsonb),
  api.ensure_menu(uuid), api.save_category(uuid, uuid, jsonb, uuid), api.save_item(uuid, jsonb),
  api.save_modifier_group(uuid, jsonb), api.reorder(uuid, text, uuid[]), api.delete_item(uuid)
from public, anon, authenticated;
grant execute on function
  api.ensure_menu(uuid), api.save_category(uuid, uuid, jsonb, uuid), api.save_item(uuid, jsonb),
  api.save_modifier_group(uuid, jsonb), api.reorder(uuid, text, uuid[]), api.delete_item(uuid)
to authenticated;
