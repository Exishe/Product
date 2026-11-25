-- Telegram manager bot (ADR-069), more actions: change price, hide / show item,
-- close the kitchen early today. Same pattern as sold_out and pause
-- (docs/02-stack/telegram-bot.md).
--
-- Shared rules moved to private cores that take an explicit actor, so the admin
-- functions and the bot run the same code (the pause pattern):
--   private.publish_menu_core(location, actor_kind, actor)   <- api.publish_menu
--   private.apply_kitchen_closed(location, closed, actor_kind, actor) <- api.set_kitchen_closed_today
-- The api functions keep their role checks and behave as before.
--
-- Guests read the published snapshot, so a price or a hidden item reaches them
-- only after a publish. The bot publishes itself (as the linked account) in the
-- same transaction, and undo does too.

-- -----------------------------------------------------------------------------
-- Publish: the rule, with the actor passed in
-- -----------------------------------------------------------------------------
create function private.menu_has_unreviewed_ai(p_location_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  with mn as (select ml.menu_id as id from public.menu_locations ml where ml.location_id = p_location_id),
       ct as (select c.id from public.categories c where c.menu_id in (select id from mn)),
       it as (select i.id from public.items i where i.category_id in (select id from ct)),
       gr as (select img.group_id as id from public.item_modifier_groups img where img.item_id in (select id from it)),
       md as (select m.id from public.modifiers m where m.group_id in (select id from gr))
  select exists (
    select 1 from public.menu_translations t where t.menu_id in (select id from mn) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.category_translations t where t.category_id in (select id from ct) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.item_translations t where t.item_id in (select id from it) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.modifier_group_translations t where t.group_id in (select id from gr) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.modifier_translations t where t.modifier_id in (select id from md) and t.source = 'ai' and t.reviewed_at is null
  )
$$;

create function private.publish_menu_core(p_location_id uuid, p_actor_kind public.actor_kind, p_actor_user uuid) returns uuid
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
         )), '{}'::jsonb),
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

-- The admin's Publish button: same rule, the caller's role and identity.
create or replace function api.publish_menu(p_location_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return private.publish_menu_core(p_location_id, 'member', auth.uid());
end $$;

-- -----------------------------------------------------------------------------
-- Kitchen closed today: the rule, with the actor passed in
-- -----------------------------------------------------------------------------
create function private.apply_kitchen_closed(p_location_id uuid, p_closed boolean,
  p_actor_kind public.actor_kind, p_actor_user uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_tz text;
  v_starts time;
  v_local timestamp;
  v_open timestamp;
  v_until timestamptz;
begin
  select l.restaurant_id, l.timezone, l.business_day_starts into v_restaurant, v_tz, v_starts
  from public.locations l where l.id = p_location_id;

  if p_closed then
    v_local := now() at time zone v_tz;
    v_open := date_trunc('day', v_local) + v_starts;
    if v_open <= v_local then
      v_open := v_open + interval '1 day';
    end if;
    v_until := v_open at time zone v_tz;
  end if;

  update public.locations set kitchen_closed_until = v_until where id = p_location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, p_actor_kind, p_actor_user,
          case when p_closed then 'kitchen.closed_today' else 'kitchen.reopened' end,
          'location', p_location_id, jsonb_build_object('until', v_until));
  return v_until;
end $$;

create or replace function api.set_kitchen_closed_today(p_location_id uuid, p_closed boolean)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_closed is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  return private.apply_kitchen_closed(p_location_id, p_closed, 'member', auth.uid());
end $$;

-- -----------------------------------------------------------------------------
-- Action: change price (a whole number of AMD on the item's base price)
-- Refused for items with priced options (sizes etc.): a base-price change would
-- silently move every option price with it.
-- -----------------------------------------------------------------------------
create function private.bot_item_has_options(p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.item_modifier_groups img
                 join public.modifiers m on m.group_id = img.group_id
                 where img.item_id = p_item and m.price_delta <> 0 and m.is_active)
$$;

create function private.bot_prepare_price(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
  v_new integer := (p_data ->> 'number')::integer;
  v_old integer;
begin
  select i.price into v_old from public.items i
  where i.id = v_item and i.restaurant_id = p_ch.restaurant_id and i.is_active;
  if v_old is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if v_new is null or v_new < 0 or v_new > 10000000 then
    return jsonb_build_object('error', 'invalid');
  end if;
  if v_new = v_old then
    return jsonb_build_object('error', 'unchanged');
  end if;
  if private.bot_item_has_options(v_item) then
    return jsonb_build_object('error', 'has_options');
  end if;
  if private.menu_has_unreviewed_ai(p_loc) then
    return jsonb_build_object('error', 'unreviewed_ai');
  end if;
  return jsonb_build_object('item', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
                            'old', v_old, 'new', v_new);
end $$;

create function private.bot_apply_price(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
  v_new integer := (p_data ->> 'number')::integer;
  v_old integer;
begin
  select i.price into v_old from public.items i
  where i.id = v_item and i.restaurant_id = p_ch.restaurant_id and i.is_active
  for update;
  if v_old is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if v_new is null or v_new < 0 or v_new > 10000000 or v_new = v_old or private.bot_item_has_options(v_item) then
    raise exception using errcode = '22023', message = 'invalid_price';
  end if;
  update public.items set price = v_new, updated_at = now() where id = v_item;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'item', 'entity_id', v_item,
    'label', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('price', v_old), 'new', jsonb_build_object('price', v_new));
end $$;

-- Restores only while the price is still the one the bot set.
create function private.bot_undo_price(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now integer;
begin
  select i.price into v_now from public.items i
  where i.id = p_change.entity_id and i.restaurant_id = p_ch.restaurant_id;
  if v_now is distinct from (p_change.new_value ->> 'price')::integer then
    return false;
  end if;
  update public.items set price = (p_change.old_value ->> 'price')::integer, updated_at = now()
  where id = p_change.entity_id;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Action: hide / show item (items.is_active; the guest menu follows on publish)
-- -----------------------------------------------------------------------------
create function private.bot_prepare_hide(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
  v_visible boolean;
begin
  select i.is_active into v_visible from public.items i
  where i.id = v_item and i.restaurant_id = p_ch.restaurant_id;
  if v_visible is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if private.menu_has_unreviewed_ai(p_loc) then
    return jsonb_build_object('error', 'unreviewed_ai');
  end if;
  return jsonb_build_object('item', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
                            'visible_now', v_visible, 'to_visible', not v_visible);
end $$;

create function private.bot_apply_hide(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
  v_was boolean;
begin
  select i.is_active into v_was from public.items i
  where i.id = v_item and i.restaurant_id = p_ch.restaurant_id
  for update;
  if v_was is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  update public.items set is_active = not v_was, updated_at = now() where id = v_item;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'item', 'entity_id', v_item,
    'label', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('visible', v_was), 'new', jsonb_build_object('visible', not v_was));
end $$;

create function private.bot_undo_hide(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now boolean;
begin
  select i.is_active into v_now from public.items i
  where i.id = p_change.entity_id and i.restaurant_id = p_ch.restaurant_id;
  if v_now is distinct from (p_change.new_value ->> 'visible')::boolean then
    return false;
  end if;
  update public.items set is_active = (p_change.old_value ->> 'visible')::boolean, updated_at = now()
  where id = p_change.entity_id;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Action: close the kitchen early today (no new guest orders until the next
-- business-day opening). Live: no publish needed.
-- -----------------------------------------------------------------------------
create function private.bot_prepare_close_kitchen(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  select l.kitchen_closed_until into v_until from public.locations l where l.id = p_loc;
  if v_until > now() then
    return jsonb_build_object('error', 'already_closed');
  end if;
  return jsonb_build_object('closed_now', false);
end $$;

create function private.bot_apply_close_kitchen(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_old timestamptz;
  v_name text;
  v_until timestamptz;
begin
  select l.kitchen_closed_until, l.name into v_old, v_name from public.locations l where l.id = p_loc for update;
  if v_old > now() then
    raise exception using errcode = '22023', message = 'already_closed';
  end if;
  v_until := private.apply_kitchen_closed(p_loc, true, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'location', 'entity_id', p_loc, 'label', v_name,
    'old', jsonb_build_object('until', null), 'new', jsonb_build_object('until', v_until));
end $$;

-- Reopens only while the closing is still the one the bot made.
create function private.bot_undo_close_kitchen(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
begin
  select l.kitchen_closed_until into v_now from public.locations l where l.id = p_loc;
  if v_now is distinct from (p_change.new_value ->> 'until')::timestamptz then
    return false;
  end if;
  perform private.apply_kitchen_closed(p_loc, false, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Switch the three actions on. Category (needs a section step in the engine)
-- and report (needs a read-only path in the engine) stay "coming soon".
-- -----------------------------------------------------------------------------
update private.bot_actions set ready = true where id in ('price', 'hide', 'close_kitchen');

-- -----------------------------------------------------------------------------
-- Privileges: nothing here is client-callable.
-- -----------------------------------------------------------------------------
revoke execute on function
  private.menu_has_unreviewed_ai(uuid),
  private.publish_menu_core(uuid, public.actor_kind, uuid),
  private.apply_kitchen_closed(uuid, boolean, public.actor_kind, uuid),
  private.bot_item_has_options(uuid),
  private.bot_prepare_price(public.notification_channels, uuid, jsonb),
  private.bot_apply_price(public.notification_channels, uuid, jsonb),
  private.bot_undo_price(public.notification_channels, uuid, private.bot_changes),
  private.bot_prepare_hide(public.notification_channels, uuid, jsonb),
  private.bot_apply_hide(public.notification_channels, uuid, jsonb),
  private.bot_undo_hide(public.notification_channels, uuid, private.bot_changes),
  private.bot_prepare_close_kitchen(public.notification_channels, uuid, jsonb),
  private.bot_apply_close_kitchen(public.notification_channels, uuid, jsonb),
  private.bot_undo_close_kitchen(public.notification_channels, uuid, private.bot_changes)
from public, anon, authenticated;
