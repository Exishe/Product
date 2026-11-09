-- Menu from a photo (Task 9.2). The owner uploads photos, the server has them
-- read and saves the draft here, the owner fixes it on the review screen, and
-- apply_menu_import turns it into categories and dishes. Every name it writes
-- is AI output: source 'ai', reviewed only where the owner ticked the dish, so
-- publish_menu keeps refusing until the rest is looked at.

create function api.start_menu_import(p_restaurant_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  insert into public.menu_imports (restaurant_id, created_by)
  values (p_restaurant_id, (select auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- The photos, once uploaded to menu-imports/{restaurant}/{import}/{n}.jpg.
create function api.add_menu_import_images(p_import_id uuid, p_paths text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.menu_imports;
  v_path text;
  v_page integer := 0;
begin
  select * into v_imp from public.menu_imports where id = p_import_id;
  perform private.assert_restaurant_role(v_imp.restaurant_id, '{owner,manager}');
  if v_imp.status <> 'uploaded' then
    raise exception using errcode = '22023', message = 'import_closed';
  end if;
  if coalesce(array_length(p_paths, 1), 0) not between 1 and 8 then
    raise exception using errcode = '22023', message = 'invalid_pages';
  end if;
  foreach v_path in array p_paths loop
    v_page := v_page + 1;
    if v_path !~ ('^' || v_imp.restaurant_id || '/' || v_imp.id || '/[0-9]+\.(jpg|png|webp)$') then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
    insert into public.menu_import_images (restaurant_id, import_id, storage_path, page)
    values (v_imp.restaurant_id, v_imp.id, v_path, v_page);
  end loop;
  update public.menu_imports set status = 'processing', updated_at = now() where id = v_imp.id;
end $$;

-- The reading, and later the owner's edits to it. The draft is checked by Zod
-- before it gets here and again, field by field, when it's applied.
create function api.save_menu_import_draft(
  p_import_id uuid, p_draft jsonb, p_model text default null,
  p_input_tokens integer default null, p_output_tokens integer default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.menu_imports;
begin
  select * into v_imp from public.menu_imports where id = p_import_id;
  perform private.assert_restaurant_role(v_imp.restaurant_id, '{owner,manager}');
  if v_imp.status not in ('processing', 'needs_review') then
    raise exception using errcode = '22023', message = 'import_closed';
  end if;
  if jsonb_typeof(p_draft) is distinct from 'object' or jsonb_typeof(p_draft -> 'categories') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'invalid_draft';
  end if;
  if octet_length(p_draft::text) > 1000000 then
    raise exception using errcode = '22023', message = 'draft_too_large';
  end if;
  update public.menu_imports
     set draft = p_draft, status = 'needs_review', error = null,
         model = coalesce(left(p_model, 80), model),
         input_tokens = coalesce(p_input_tokens, input_tokens),
         output_tokens = coalesce(p_output_tokens, output_tokens),
         updated_at = now()
   where id = v_imp.id;
end $$;

-- A reading that failed; the code is one the review screen can explain.
create function api.fail_menu_import(p_import_id uuid, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.menu_imports;
begin
  select * into v_imp from public.menu_imports where id = p_import_id;
  perform private.assert_restaurant_role(v_imp.restaurant_id, '{owner,manager}');
  if v_imp.status not in ('uploaded', 'processing') then
    raise exception using errcode = '22023', message = 'import_closed';
  end if;
  update public.menu_imports set status = 'failed', error = left(p_error, 200), updated_at = now() where id = v_imp.id;
end $$;

create function api.discard_menu_import(p_import_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.menu_imports;
begin
  select * into v_imp from public.menu_imports where id = p_import_id;
  perform private.assert_restaurant_role(v_imp.restaurant_id, '{owner,manager}');
  if v_imp.status = 'applied' then
    raise exception using errcode = '22023', message = 'import_closed';
  end if;
  update public.menu_imports set status = 'discarded', updated_at = now() where id = v_imp.id;
end $$;

-- Names (and dish descriptions) from the reading, one row per language given.
create function private.insert_ai_translations(
  p_table text, p_fk text, p_restaurant_id uuid, p_id uuid,
  p_names jsonb, p_descriptions jsonb, p_reviewed boolean, p_source public.translation_source default 'ai'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_loc public.app_locale;
  v_name text;
  v_desc text;
begin
  if p_table not in ('category_translations', 'item_translations', 'modifier_group_translations', 'modifier_translations') then
    raise exception 'unknown translation table %', p_table;
  end if;
  foreach v_loc in array enum_range(null::public.app_locale) loop
    v_name := nullif(btrim(coalesce(p_names ->> v_loc::text, '')), '');
    continue when v_name is null;
    if p_table = 'item_translations' then
      v_desc := nullif(btrim(coalesce(p_descriptions ->> v_loc::text, '')), '');
      execute 'insert into public.item_translations
                 (restaurant_id, item_id, locale, name, description, source, reviewed_at)
               values ($1, $2, $3, $4, $5, $6, $7)'
        using p_restaurant_id, p_id, v_loc, v_name, v_desc, p_source, case when p_reviewed then now() end;
    else
      execute format('insert into public.%I (restaurant_id, %I, locale, name, source, reviewed_at)
                      values ($1, $2, $3, $4, $5, $6)', p_table, p_fk)
        using p_restaurant_id, p_id, v_loc, v_name, p_source, case when p_reviewed then now() end;
    end if;
  end loop;
end $$;

-- price as a whole number of drams, or an error the review screen shows.
create function private.draft_price(p_value jsonb) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(p_value) is distinct from 'number'
     or (p_value::text)::numeric <> trunc((p_value::text)::numeric)
     or (p_value::text)::numeric not between 0 and 10000000 then
    raise exception using errcode = '22023', message = 'price_required';
  end if;
  return (p_value::text)::integer;
end $$;

create function api.apply_menu_import(p_import_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_imp public.menu_imports;
  v_menu uuid;
  v_sort integer;
  v_cat jsonb;
  v_cat_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_item_sort integer;
  v_price integer;
  v_reviewed boolean;
  v_group_id uuid;
  v_variant jsonb;
  v_variant_sort integer;
  v_mod_id uuid;
  v_dishes integer := 0;
begin
  select * into v_imp from public.menu_imports where id = p_import_id for update;
  perform private.assert_restaurant_role(v_imp.restaurant_id, '{owner,manager}');
  if v_imp.status <> 'needs_review' then
    raise exception using errcode = '22023', message = 'import_closed';
  end if;
  if (select count(*) from jsonb_array_elements(v_imp.draft -> 'categories') c,
                           jsonb_array_elements(c -> 'items') i) > 500 then
    raise exception using errcode = '22023', message = 'draft_too_large';
  end if;

  v_menu := api.ensure_menu(v_imp.restaurant_id);
  select coalesce(max(c.sort) + 1, 0) into v_sort from public.categories c where c.menu_id = v_menu;

  for v_cat in select value from jsonb_array_elements(v_imp.draft -> 'categories') loop
    continue when jsonb_array_length(coalesce(v_cat -> 'items', '[]')) = 0;
    perform private.require_hy_name(v_cat -> 'names');
    insert into public.categories (restaurant_id, menu_id, sort)
    values (v_imp.restaurant_id, v_menu, v_sort) returning id into v_cat_id;
    v_sort := v_sort + 1;
    -- A section counts as reviewed when every dish in it was.
    perform private.insert_ai_translations('category_translations', 'category_id', v_imp.restaurant_id, v_cat_id,
      v_cat -> 'names', null,
      not exists (select 1 from jsonb_array_elements(v_cat -> 'items') i where coalesce((i ->> 'reviewed')::boolean, false) = false));

    v_item_sort := 0;
    for v_item in select value from jsonb_array_elements(v_cat -> 'items') loop
      perform private.require_hy_name(v_item -> 'names');
      v_price := private.draft_price(v_item -> 'price_amd');
      v_reviewed := coalesce((v_item ->> 'reviewed')::boolean, false);
      insert into public.items (restaurant_id, category_id, price, sort)
      values (v_imp.restaurant_id, v_cat_id, v_price, v_item_sort) returning id into v_item_id;
      v_item_sort := v_item_sort + 1;
      v_dishes := v_dishes + 1;
      perform private.insert_ai_translations('item_translations', 'item_id', v_imp.restaurant_id, v_item_id,
        v_item -> 'names', v_item -> 'descriptions', v_reviewed);

      -- Sizes become one required choice, priced from the dish's own price.
      if jsonb_array_length(coalesce(v_item -> 'variants', '[]')) >= 2 then
        insert into public.modifier_groups (restaurant_id, min_select, max_select)
        values (v_imp.restaurant_id, 1, 1) returning id into v_group_id;
        perform private.insert_ai_translations('modifier_group_translations', 'group_id', v_imp.restaurant_id, v_group_id,
          '{"hy": "Չափ", "ru": "Размер", "en": "Size"}', null, true, 'import');
        v_variant_sort := 0;
        for v_variant in select value from jsonb_array_elements(v_item -> 'variants') loop
          perform private.require_hy_name(v_variant -> 'names');
          insert into public.modifiers (restaurant_id, group_id, price_delta, is_default, sort)
          values (v_imp.restaurant_id, v_group_id, private.draft_price(v_variant -> 'price_amd') - v_price,
                  v_variant_sort = 0, v_variant_sort)
          returning id into v_mod_id;
          v_variant_sort := v_variant_sort + 1;
          perform private.insert_ai_translations('modifier_translations', 'modifier_id', v_imp.restaurant_id, v_mod_id,
            v_variant -> 'names', null, v_reviewed);
        end loop;
        insert into public.item_modifier_groups (restaurant_id, item_id, group_id)
        values (v_imp.restaurant_id, v_item_id, v_group_id);
      end if;
    end loop;
  end loop;

  if v_dishes = 0 then
    raise exception using errcode = '22023', message = 'invalid_draft';
  end if;
  update public.menu_imports
     set status = 'applied', applied_at = now(), applied_by = (select auth.uid()), menu_id = v_menu, updated_at = now()
   where id = v_imp.id;
  return v_dishes;
end $$;

revoke execute on function
  api.start_menu_import(uuid), api.add_menu_import_images(uuid, text[]),
  api.save_menu_import_draft(uuid, jsonb, text, integer, integer), api.fail_menu_import(uuid, text),
  api.discard_menu_import(uuid), api.apply_menu_import(uuid),
  private.insert_ai_translations(text, text, uuid, uuid, jsonb, jsonb, boolean, public.translation_source),
  private.draft_price(jsonb)
from public, anon, authenticated;
grant execute on function
  api.start_menu_import(uuid), api.add_menu_import_images(uuid, text[]),
  api.save_menu_import_draft(uuid, jsonb, text, integer, integer), api.fail_menu_import(uuid, text),
  api.discard_menu_import(uuid), api.apply_menu_import(uuid)
to authenticated;

-- Paper-menu photos: phone pictures resized in the browser, up to 4 MB each.
update storage.buckets
   set file_size_limit = 4 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'menu-imports';
