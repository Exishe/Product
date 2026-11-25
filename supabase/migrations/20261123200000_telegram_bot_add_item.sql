-- Telegram manager bot (ADR-069), step 3: "Add new item" and "Promo on / off".
--
-- Engine additions (docs/02-stack/telegram-bot.md):
--   steps     'text_<field>' asks for typed text and stores it as data.<field>
--             (1 to 80 characters on one line, cleaned of control and invisible
--             characters); 'photo' asks for a Telegram photo; 'promo' asks for
--             one of the location's promos.
--   optional_steps  steps the manager may skip with the Skip button (verb 's').
--   photo     OFF until Vault secret bot_photo_enabled = 'on'. The photo cannot
--             be stored without a secret the app must not hold (ADR-038), so
--             the step is skipped and the flow is text only. See ADR-069.
-- Actions: add_item (names, section, price, optional photo; undo removes the
-- new item, or hides it when orders already mention it) and promo (switch a
-- promo on or off with the same rule as api.set_promo_on).

-- -----------------------------------------------------------------------------
-- Registry
-- -----------------------------------------------------------------------------
alter table private.bot_actions drop constraint bot_actions_steps_check;
alter table private.bot_actions add constraint bot_actions_steps_check
  check (steps <@ '{category,item,number,choice,promo,text_name_hy,text_name_ru,text_name_en,photo}'::text[]);
alter table private.bot_actions add column optional_steps text[] not null default '{}';
alter table private.bot_actions add constraint bot_actions_optional_check check (optional_steps <@ steps);

alter table private.bot_pending drop constraint bot_pending_want_check;
alter table private.bot_pending add constraint bot_pending_want_check
  check (want in ('category', 'item', 'number', 'choice', 'promo', 'text_name_hy', 'text_name_ru', 'text_name_en',
                  'photo', 'confirm', 'undo'));

update private.bot_actions
   set steps = '{text_name_hy,text_name_ru,text_name_en,category,number,photo}',
       optional_steps = '{text_name_ru,text_name_en,photo}', ready = true
 where id = 'add_item';
update private.bot_actions set steps = '{promo}', ready = true where id = 'promo';

-- Is the photo step switched on? Off by default: the owner turns it on (Vault
-- secret bot_photo_enabled = 'on') only after the photo worker exists.
create function private.bot_photo_enabled() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.secret('bot_photo_enabled') = 'on', false)
$$;

-- Photos the manager sent, waiting for the worker that stores them (only filled
-- while the photo step is on). The file id is Telegram's; nothing here is a path.
create table private.bot_photo_jobs (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  item_id uuid not null,
  file_id text not null check (file_id ~ '^[A-Za-z0-9_-]{20,200}$'),
  file_size integer not null check (file_size between 1 and 2097152),
  status text not null default 'waiting' check (status in ('waiting', 'done', 'failed')),
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade
);
alter table private.bot_photo_jobs enable row level security;
revoke all on private.bot_photo_jobs from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Engine: one page (8) of sections, items or promos
-- -----------------------------------------------------------------------------
create or replace function private.bot_list(p_ch public.notification_channels, p private.bot_pending, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.app_locale := coalesce(p_ch.bot_locale, 'hy');
  v_all boolean := coalesce((select a.pick_inactive from private.bot_actions a where a.id = p.action), false);
  v_rows jsonb;
begin
  if p_kind = 'category' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', private.bot_label('category', x.id, v_l),
                                                 'off', not x.is_active) order by x.ord), '[]')
    into v_rows
    from (select c.id, c.is_active, row_number() over (order by c.sort, c.id) as ord
          from public.categories c where c.restaurant_id = p_ch.restaurant_id and (v_all or c.is_active)
          order by c.sort, c.id limit 9 offset p.page * 8) x;
  elsif p_kind = 'promo' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.label, 'off', not x.is_on, 'on', x.is_on)
                              order by x.ord), '[]')
    into v_rows
    from (select pr.id, pr.is_on, private.pick_name(pr.title, v_l) as label,
                 row_number() over (order by pr.created_at, pr.id) as ord
          from public.promos pr
          where pr.restaurant_id = p_ch.restaurant_id and pr.location_id = private.bot_location(p_ch)
          order by pr.created_at, pr.id limit 9 offset p.page * 8) x;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', private.bot_label('item', x.id, v_l),
                                                 'off', not x.is_active) order by x.ord), '[]')
    into v_rows
    from (select i.id, i.is_active, row_number() over (order by c.sort, i.sort, i.id) as ord
          from public.items i join public.categories c on c.id = i.category_id
          where i.restaurant_id = p_ch.restaurant_id and (v_all or i.is_active)
            and (not (p.data ? 'category_id') or i.category_id = (p.data ->> 'category_id')::uuid)
          order by c.sort, i.sort, i.id limit 9 offset p.page * 8) x;
  end if;
  return jsonb_build_object('type', 'pick_' || p_kind, 'action', p.action, 'page', p.page,
    'has_prev', p.page > 0, 'has_next', jsonb_array_length(v_rows) > 8,
    'rows', jsonb_path_query_array(v_rows, '$[0 to 7]'),
    'category', case when p.data ? 'category_id' then private.bot_label('category', (p.data ->> 'category_id')::uuid, v_l) end);
end $$;

-- -----------------------------------------------------------------------------
-- Engine: next step (adds promo, typed text and photo)
-- -----------------------------------------------------------------------------
create or replace function private.bot_next(p_ch public.notification_channels, p_loc uuid, p private.bot_pending) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  def private.bot_actions;
  s text;
  v_facts jsonb;
  v_token text := substr(private.b64url(extensions.gen_random_bytes(6)), 1, 8);
begin
  select * into def from private.bot_actions a where a.id = p.action;
  foreach s in array def.steps loop
    if s = 'category' and not (p.data ? 'category_id') then
      update private.bot_pending set want = 'category', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return private.bot_list(p_ch, p, 'category');
    elsif s = 'promo' and not (p.data ? 'promo_id') then
      update private.bot_pending set want = 'promo', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return private.bot_list(p_ch, p, 'promo');
    elsif s = 'item' and not (p.data ? 'item_id') then
      if not (p.data ? 'category_id')
         and (select count(*) from public.items i
              where i.restaurant_id = p_ch.restaurant_id and (def.pick_inactive or i.is_active)) > 24 then
        update private.bot_pending set want = 'category', expires_at = now() + interval '10 minutes'
        where channel_id = p_ch.id returning * into p;
        return private.bot_list(p_ch, p, 'category');
      end if;
      update private.bot_pending set want = 'item', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return private.bot_list(p_ch, p, 'item');
    elsif s like 'text\_%' and not (p.data ? substr(s, 6)) then
      update private.bot_pending set want = s, expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return jsonb_build_object('type', 'ask_text', 'action', p.action, 'field', substr(s, 6),
                                'optional', s = any (def.optional_steps));
    elsif s = 'photo' and not (p.data ? 'photo') then
      if not private.bot_photo_enabled() then
        -- Switched off: the step is skipped, as if the manager had pressed Skip.
        update private.bot_pending set data = data || '{"photo": null}'::jsonb
        where channel_id = p_ch.id returning * into p;
      else
        update private.bot_pending set want = 'photo', expires_at = now() + interval '10 minutes'
        where channel_id = p_ch.id returning * into p;
        return jsonb_build_object('type', 'ask_photo', 'action', p.action, 'optional', 'photo' = any (def.optional_steps));
      end if;
    elsif s = 'number' and not (p.data ? 'number') then
      update private.bot_pending set want = 'number', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return jsonb_build_object('type', 'ask_number', 'action', p.action,
                                'context', private.bot_call('bot_ctx_' || p.action, p_ch, p_loc, p.data));
    elsif s = 'choice' and not (p.data ? 'choice') then
      update private.bot_pending set want = 'choice', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return jsonb_build_object('type', 'choice', 'action', p.action, 'choices', to_jsonb(def.choices),
                                'context', private.bot_call('bot_ctx_' || p.action, p_ch, p_loc, p.data));
    end if;
  end loop;

  v_facts := private.bot_call('bot_prepare_' || p.action, p_ch, p_loc, p.data);
  if v_facts ? 'error' then
    delete from private.bot_pending where channel_id = p_ch.id;
    return jsonb_build_object('type', 'failed', 'code', v_facts ->> 'error');
  end if;
  update private.bot_pending set want = 'confirm', token = v_token, expires_at = now() + interval '10 minutes'
  where channel_id = p_ch.id;
  return jsonb_build_object('type', 'confirm', 'action', p.action, 'token', v_token, 'facts', v_facts);
end $$;

-- -----------------------------------------------------------------------------
-- Action: add_item. The same rules as the admin's api.save_item for a new dish:
-- price a whole number from 0 to 10 000 000, a name in Armenian, the section
-- must be the café's, translations through private.set_translations (source
-- owner, no AI review flag), allergens and tags empty, the section's prep area.
-- The new dish is active, so the bot publishes (as the linked account, like
-- price and hide); undo removes it, or hides it when orders already mention it.
-- -----------------------------------------------------------------------------
create function private.bot_prepare_add_item(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cat uuid := (p_data ->> 'category_id')::uuid;
  v_price numeric := (p_data ->> 'number')::numeric;
  v_hy text := nullif(btrim(coalesce(p_data ->> 'name_hy', '')), '');
begin
  if v_hy is null or v_price is null or v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
    return jsonb_build_object('error', 'invalid');
  end if;
  if not exists (select 1 from public.categories c
                 join public.menu_locations ml on ml.menu_id = c.menu_id and ml.location_id = p_loc
                 where c.id = v_cat and c.restaurant_id = p_ch.restaurant_id and c.is_active) then
    return jsonb_build_object('error', 'no_section');
  end if;
  if private.menu_has_unreviewed_ai(p_loc) then
    return jsonb_build_object('error', 'unreviewed_ai');
  end if;
  return jsonb_build_object(
    'item', private.pick_name(jsonb_strip_nulls(jsonb_build_object('hy', v_hy, 'ru', p_data -> 'name_ru', 'en', p_data -> 'name_en')),
                              coalesce(p_ch.bot_locale, 'hy')),
    'category', private.bot_label('category', v_cat, coalesce(p_ch.bot_locale, 'hy')),
    'price', v_price::integer,
    'photo', jsonb_typeof(p_data -> 'photo') = 'object' and private.bot_photo_enabled());
end $$;

create function private.bot_apply_add_item(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cat uuid := (p_data ->> 'category_id')::uuid;
  v_price numeric := (p_data ->> 'number')::numeric;
  v_names jsonb := jsonb_strip_nulls(jsonb_build_object(
    'hy', nullif(btrim(coalesce(p_data ->> 'name_hy', '')), ''),
    'ru', nullif(btrim(coalesce(p_data ->> 'name_ru', '')), ''),
    'en', nullif(btrim(coalesce(p_data ->> 'name_en', '')), '')));
  v_id uuid;
  v_size integer;
begin
  if not (v_names ? 'hy') or v_price is null or v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
    raise exception using errcode = '22023', message = 'invalid_price';
  end if;
  -- the section is this café's, active, and on this location's menu
  perform 1 from public.categories c
    join public.menu_locations ml on ml.menu_id = c.menu_id and ml.location_id = p_loc
    where c.id = v_cat and c.restaurant_id = p_ch.restaurant_id and c.is_active
    for share of c;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  insert into public.items (restaurant_id, category_id, price, sort, is_active)
  values (p_ch.restaurant_id, v_cat, v_price::integer,
          coalesce((select max(i.sort) + 1 from public.items i where i.category_id = v_cat), 0), true)
  returning id into v_id;
  perform private.set_translations('item_translations', 'item_id', p_ch.restaurant_id, v_id, v_names, null, false);

  if jsonb_typeof(p_data -> 'photo') = 'object' and private.bot_photo_enabled() then
    v_size := (p_data #>> '{photo,size}')::integer;
    insert into private.bot_photo_jobs (restaurant_id, item_id, file_id, file_size)
    values (p_ch.restaurant_id, v_id, p_data #>> '{photo,file_id}', v_size);
  end if;

  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'item', 'entity_id', v_id,
    'label', private.bot_label('item', v_id, coalesce(p_ch.bot_locale, 'hy')),
    'old', null,
    'new', jsonb_build_object('created', true, 'price', v_price::integer, 'active', true));
end $$;

-- Only while the dish is still as the bot made it (active, same price).
-- Removes it, or hides it when an order line already points at it; republishes.
create function private.bot_undo_add_item(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items;
begin
  select * into v_item from public.items i
  where i.id = p_change.entity_id and i.restaurant_id = p_ch.restaurant_id
  for update;
  if v_item.id is null or not v_item.is_active or v_item.price is distinct from (p_change.new_value ->> 'price')::integer then
    return false;
  end if;
  if exists (select 1 from public.order_items oi where oi.item_id = v_item.id) then
    update public.items set is_active = false, updated_at = now() where id = v_item.id;
  else
    delete from public.items where id = v_item.id;
  end if;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Action: promo on / off. The rule is api.set_promo_on's, moved into a core that
-- takes the actor (as pause and close-kitchen did); the api function keeps its
-- role check and calls it. Guests read promos live, so nothing is published.
-- -----------------------------------------------------------------------------
create function private.apply_promo_on(p_promo_id uuid, p_on boolean, p_actor_kind public.actor_kind, p_actor uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
  v_tz text;
begin
  update public.promos set is_on = p_on, updated_at = now() where id = p_promo_id
  returning * into v_promo;
  select timezone into v_tz from public.locations where id = v_promo.location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_promo.restaurant_id, v_promo.location_id, p_actor_kind, p_actor,
          case when p_on then 'promo.on' else 'promo.off' end, 'promo', p_promo_id,
          jsonb_build_object('title', v_promo.title));
  return private.promo_is_live(v_promo, v_tz);
end $$;

create or replace function api.set_promo_on(p_promo_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
begin
  if p_on is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select * into v_promo from public.promos where id = p_promo_id;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_promo.location_id, '{owner,manager}');
  return private.apply_promo_on(p_promo_id, p_on, 'member', auth.uid());
end $$;

create function private.bot_prepare_promo(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
  v_after public.promos;
  v_tz text;
begin
  select * into v_promo from public.promos pr
  where pr.id = (p_data ->> 'promo_id')::uuid and pr.restaurant_id = p_ch.restaurant_id and pr.location_id = p_loc;
  if not found then
    return jsonb_build_object('error', 'no_promo');
  end if;
  select timezone into v_tz from public.locations where id = p_loc;
  v_after := v_promo;
  v_after.is_on := not v_promo.is_on;
  return jsonb_build_object('promo', private.pick_name(v_promo.title, coalesce(p_ch.bot_locale, 'hy')),
                            'on_now', v_promo.is_on, 'to_on', not v_promo.is_on,
                            'live_after', private.promo_is_live(v_after, v_tz));
end $$;

create function private.bot_apply_promo(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_promo public.promos;
  v_live boolean;
begin
  select * into v_promo from public.promos pr
  where pr.id = (p_data ->> 'promo_id')::uuid and pr.restaurant_id = p_ch.restaurant_id and pr.location_id = p_loc
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  v_live := private.apply_promo_on(v_promo.id, not v_promo.is_on, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'promo', 'entity_id', v_promo.id,
    'label', private.pick_name(v_promo.title, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('on', v_promo.is_on),
    'new', jsonb_build_object('on', not v_promo.is_on, 'live', v_live));
end $$;

-- Restores only while the promo is still in the state the bot set.
create function private.bot_undo_promo(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now boolean;
begin
  select pr.is_on into v_now from public.promos pr
  where pr.id = p_change.entity_id and pr.restaurant_id = p_ch.restaurant_id and pr.location_id = p_loc
  for update;
  if v_now is distinct from (p_change.new_value ->> 'on')::boolean then
    return false;
  end if;
  perform private.apply_promo_on(p_change.entity_id, (p_change.old_value ->> 'on')::boolean, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Engine: bot_handle (typed text, photo, skip, promo picks)
-- -----------------------------------------------------------------------------
create or replace function private.bot_handle(p_chat bigint, p_verb text, p_arg text, p_text text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  ch public.notification_channels;
  loc uuid;
  p private.bot_pending;
  def private.bot_actions;
  chg private.bot_changes;
  v_l public.app_locale;
  v_rec jsonb;
  v_num text;
  v_ok boolean;
  v_data jsonb;
  v_last text;
  v_txt text;
begin
  ch := private.bot_channel(p_chat);
  if ch.id is null then
    return null;
  end if;
  if not private.rate_limit_hit('tgbot:' || p_chat, 60, interval '1 minute') then
    return null;
  end if;
  loc := private.bot_location(ch);
  if loc is null then
    return null;
  end if;
  v_l := coalesce(ch.bot_locale, 'hy');

  delete from private.bot_pending where channel_id = ch.id and expires_at <= now();
  select * into p from private.bot_pending where channel_id = ch.id for update;

  if p_verb = 'l' and p_arg = 'choose' then   -- the menu's Language button
    delete from private.bot_pending where channel_id = ch.id;
    return private.bot_out(ch, jsonb_build_object('type', 'language'));
  end if;
  if p_verb = 'l' then
    if p_arg not in ('hy', 'ru', 'en') then
      return null;
    end if;
    update public.notification_channels set bot_locale = p_arg::public.app_locale, locale = p_arg::public.app_locale
    where id = ch.id returning * into ch;
    delete from private.bot_pending where channel_id = ch.id;
    return private.bot_out(ch, jsonb_build_object('type', 'menu'));
  end if;
  if ch.bot_locale is null then
    return private.bot_out(ch, jsonb_build_object('type', 'language'));
  end if;

  if p_verb in ('m', 'x') then
    delete from private.bot_pending where channel_id = ch.id;
    return private.bot_out(ch, jsonb_build_object('type', 'menu'));

  elsif p_verb = 'text' then
    if p.channel_id is not null and p.want = 'number' then
      v_num := regexp_replace(btrim(coalesce(p_text, '')), '[  ,.]', '', 'g');
      v_num := regexp_replace(v_num, '(amd|֏|դրամ|դր|драм|руб)$', '', 'i');
      if v_num ~ '^[0-9]{1,8}$' then
        update private.bot_pending set data = data || jsonb_build_object('number', v_num::integer)
        where channel_id = ch.id returning * into p;
        return private.bot_out(ch, private.bot_next(ch, loc, p));
      end if;
      return private.bot_out(ch, jsonb_build_object('type', 'bad_number', 'action', p.action,
        'context', private.bot_call('bot_ctx_' || p.action, ch, loc, p.data)));
    end if;
    if p.channel_id is not null and p.want like 'text\_%' then
      -- Typed text for a name: one line, no control or invisible characters, 1 to 80
      -- characters, not a command. Too long is refused, never cut.
      v_txt := regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g');
      v_txt := btrim(regexp_replace(v_txt, '[[:cntrl:]\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]', '', 'g'));
      if char_length(v_txt) between 1 and 80 and left(v_txt, 1) <> '/' then
        update private.bot_pending set data = data || jsonb_build_object(substr(p.want, 6), v_txt)
        where channel_id = ch.id returning * into p;
        return private.bot_out(ch, private.bot_next(ch, loc, p));
      end if;
      return private.bot_out(ch, jsonb_build_object('type', 'bad_text', 'action', p.action,
        'field', substr(p.want, 6),
        'optional', p.want = any (coalesce((select a.optional_steps from private.bot_actions a where a.id = p.action), '{}'))));
    end if;
    delete from private.bot_pending where channel_id = ch.id;
    return private.bot_out(ch, jsonb_build_object('type', 'menu'));

  elsif p_verb = 'photo' then
    -- p_arg is Telegram's file id, p_text the size in bytes (the webhook picked the
    -- largest rendition up to 2 MB, the bucket's limit). A photo nobody asked for
    -- changes nothing and gets no answer: an album sends several at once.
    if p.channel_id is null or p.want <> 'photo' or not private.bot_photo_enabled() then
      return null;
    end if;
    if p_arg !~ '^[A-Za-z0-9_-]{20,200}$' or p_text !~ '^[0-9]{1,9}$' or p_text::bigint not between 1 and 2097152 then
      return private.bot_out(ch, jsonb_build_object('type', 'bad_photo', 'action', p.action));
    end if;
    update private.bot_pending
       set data = data || jsonb_build_object('photo', jsonb_build_object('file_id', p_arg, 'size', p_text::integer))
     where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'a' then
    select * into def from private.bot_actions a where a.id = p_arg;
    if def.id is null then
      return private.bot_out(ch, jsonb_build_object('type', 'menu'));
    end if;
    delete from private.bot_pending where channel_id = ch.id;
    if def.id = 'help' then
      return private.bot_out(ch, jsonb_build_object('type', 'help', 'contact', private.secret('support_contact')));
    elsif not def.ready then
      return private.bot_out(ch, jsonb_build_object('type', 'soon', 'action', def.id));
    elsif def.kind = 'read' then
      -- Read-only: no pending step, no confirm, nothing in the history.
      v_rec := private.bot_call('bot_read_' || def.id, ch, loc, '{}'::jsonb);
      if v_rec ? 'error' then
        return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', v_rec ->> 'error'));
      end if;
      return private.bot_out(ch, jsonb_build_object('type', 'read', 'action', def.id, 'facts', v_rec));
    end if;
    insert into private.bot_pending (channel_id, action, want, data, token, page, expires_at)
    values (ch.id, def.id, 'choice', '{}', '-', 0, now() + interval '10 minutes')
    returning * into p;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'h' then
    return private.bot_out(ch, jsonb_build_object('type', 'history', 'rows', coalesce((
      select jsonb_agg(jsonb_build_object('action', x.action, 'label', x.label, 'old', x.old_value, 'new', x.new_value,
                                          'at', to_char(x.created_at at time zone l.timezone, 'DD.MM HH24:MI'),
                                          'undone', x.undone_at is not null, 'is_undo', x.undo_of is not null,
                                          'who', c.title) order by x.id desc)
      from (select * from private.bot_changes b where b.restaurant_id = ch.restaurant_id order by b.id desc limit 5) x
      join public.locations l on l.id = x.location_id
      left join public.notification_channels c on c.id = x.channel_id), '[]')));

  elsif p_verb = 'u' then
    delete from private.bot_pending where channel_id = ch.id;
    select * into chg from private.bot_changes b
    where b.channel_id = ch.id and b.restaurant_id = ch.restaurant_id and b.undone_at is null and b.undo_of is null
    order by b.id desc limit 1;
    if chg.id is null then
      return private.bot_out(ch, jsonb_build_object('type', 'nothing_to_undo'));
    end if;
    insert into private.bot_pending (channel_id, action, want, data, token, page, expires_at)
    values (ch.id, 'undo', 'undo', jsonb_build_object('change_id', chg.id), substr(private.b64url(extensions.gen_random_bytes(6)), 1, 8),
            0, now() + interval '10 minutes')
    returning * into p;
    return private.bot_out(ch, jsonb_build_object('type', 'undo_confirm', 'token', p.token,
      'change', jsonb_build_object('action', chg.action, 'label', chg.label, 'old', chg.old_value, 'new', chg.new_value)));
  end if;

  -- Everything below continues a flow: a live pending step is required.
  if p.channel_id is null then
    return private.bot_out(ch, jsonb_build_object('type', 'expired'));
  end if;

  if p_verb = 'p' then
    if p_arg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    select * into def from private.bot_actions a where a.id = p.action;
    if p.want = 'category' and exists (select 1 from public.categories c
                                       where c.id = p_arg::uuid and c.restaurant_id = ch.restaurant_id
                                         and (c.is_active or coalesce(def.pick_inactive, false))) then
      update private.bot_pending set data = data || jsonb_build_object('category_id', p_arg), page = 0
      where channel_id = ch.id returning * into p;
    elsif p.want = 'promo' and exists (select 1 from public.promos pr
                                       where pr.id = p_arg::uuid and pr.restaurant_id = ch.restaurant_id
                                         and pr.location_id = loc) then
      update private.bot_pending set data = data || jsonb_build_object('promo_id', p_arg), page = 0
      where channel_id = ch.id returning * into p;
    elsif p.want = 'item' and exists (select 1 from public.items i
                                      where i.id = p_arg::uuid and i.restaurant_id = ch.restaurant_id
                                        and (i.is_active or coalesce(def.pick_inactive, false))
                                        and (not (p.data ? 'category_id') or i.category_id = (p.data ->> 'category_id')::uuid)) then
      update private.bot_pending set data = data || jsonb_build_object('item_id', p_arg)
      where channel_id = ch.id returning * into p;
    else
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'c' then
    select * into def from private.bot_actions a where a.id = p.action;
    if p.want <> 'choice' or def.id is null or not (p_arg = any (def.choices)) then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    update private.bot_pending set data = data || jsonb_build_object('choice', p_arg)
    where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'g' then
    if p.want not in ('category', 'item', 'promo') or p_arg !~ '^[0-9]{1,3}$' then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    update private.bot_pending set page = p_arg::integer, expires_at = now() + interval '10 minutes'
    where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_list(ch, p, p.want));

  elsif p_verb = 's' then
    -- Skip an optional step: the answer is recorded as empty (JSON null).
    select * into def from private.bot_actions a where a.id = p.action;
    if def.id is null or not (p.want = any (def.optional_steps)) then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    update private.bot_pending
       set data = data || jsonb_build_object(case when p.want = 'photo' then 'photo' else substr(p.want, 6) end, null)
     where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'b' then
    -- Forget the newest answer and ask for it again; nothing left: back to the menu.
    v_data := p.data;
    select * into def from private.bot_actions a where a.id = p.action;
    if p.want = 'undo' or def.id is null then
      delete from private.bot_pending where channel_id = ch.id;
      return private.bot_out(ch, jsonb_build_object('type', 'menu'));
    end if;
    foreach v_last in array array(select s from unnest(def.steps) with ordinality t(s, i) order by i desc) loop
      if v_last = 'photo' and not private.bot_photo_enabled() then continue;   -- skipped by itself, not asked
      end if;
      if v_last = 'item' and v_data ? 'item_id' then v_data := v_data - 'item_id'; exit;
      elsif v_last = 'promo' and v_data ? 'promo_id' then v_data := v_data - 'promo_id'; exit;
      elsif v_last = 'photo' and v_data ? 'photo' then v_data := v_data - 'photo'; exit;
      elsif v_last like 'text\_%' and v_data ? substr(v_last, 6) then v_data := v_data - substr(v_last, 6); exit;
      elsif v_last in ('item', 'category') and v_data ? 'category_id' then v_data := v_data - 'category_id'; exit;
      elsif v_last = 'number' and v_data ? 'number' then v_data := v_data - 'number'; exit;
      elsif v_last = 'choice' and v_data ? 'choice' then v_data := v_data - 'choice'; exit;
      end if;
    end loop;
    if v_data = p.data then
      delete from private.bot_pending where channel_id = ch.id;
      return private.bot_out(ch, jsonb_build_object('type', 'menu'));
    end if;
    update private.bot_pending set data = v_data, page = 0 where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_next(ch, loc, p));

  elsif p_verb = 'k' then
    if p.want not in ('confirm', 'undo') or p.token is distinct from p_arg then
      return private.bot_out(ch, jsonb_build_object('type', 'expired'));
    end if;
    delete from private.bot_pending where channel_id = ch.id;   -- one confirmation, one change

    if p.want = 'undo' then
      select * into chg from private.bot_changes b
      where b.id = (p.data ->> 'change_id')::bigint and b.channel_id = ch.id and b.undone_at is null for update;
      if chg.id is null then
        return private.bot_out(ch, jsonb_build_object('type', 'expired'));
      end if;
      if not exists (select 1 from private.bot_actions a where a.id = chg.action) then
        return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
      end if;
      execute format('select private.%I($1, $2, $3)', 'bot_undo_' || chg.action) into v_ok using ch, chg.location_id, chg;
      if not v_ok then
        return private.bot_out(ch, jsonb_build_object('type', 'undo_result', 'ok', false,
          'change', jsonb_build_object('action', chg.action, 'label', chg.label)));
      end if;
      update private.bot_changes set undone_at = now() where id = chg.id;
      perform private.bot_record(ch, chg.location_id, 'undo',
        jsonb_build_object('entity', chg.entity, 'entity_id', chg.entity_id, 'label', chg.label,
                           'old', chg.new_value, 'new', chg.old_value), chg.id);
      return private.bot_out(ch, jsonb_build_object('type', 'undo_result', 'ok', true,
        'change', jsonb_build_object('action', chg.action, 'label', chg.label, 'old', chg.new_value, 'new', chg.old_value)));
    end if;

    v_rec := private.bot_call('bot_apply_' || p.action, ch, loc, p.data);
    perform private.bot_record(ch, loc, p.action, v_rec);
    return private.bot_out(ch, jsonb_build_object('type', 'done', 'action', p.action,
      'change', jsonb_build_object('label', v_rec -> 'label', 'old', v_rec -> 'old', 'new', v_rec -> 'new')));
  end if;

  return null;
end $$;

-- -----------------------------------------------------------------------------
-- The webhook: a photo message of a linked private chat goes to the bot too
-- -----------------------------------------------------------------------------
create or replace function api.telegram_update(p_secret text, p_update jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_expected text := private.secret('telegram_webhook_secret');
  v_msg jsonb := p_update -> 'message';
  v_cq jsonb := p_update -> 'callback_query';
  v_chat bigint;
  v_text text;
  v_lang public.app_locale;
  v_code text;
  v_link public.telegram_link_codes;
  v_locale public.app_locale;
  v_title text;
  v_name text;
  v_status text;
  v_data text;
  v_out jsonb;
  v_token text;
  v_file text;
  v_size text;
begin
  if v_expected is null or p_secret is null
     or extensions.digest(p_secret, 'sha256') <> extensions.digest(v_expected, 'sha256') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- The bot was removed from a group or blocked in a private chat
  if p_update ? 'my_chat_member' then
    v_chat := (p_update #>> '{my_chat_member,chat,id}')::bigint;
    v_status := p_update #>> '{my_chat_member,new_chat_member,status}';
    if v_status in ('kicked', 'left') then
      update public.notification_channels set is_active = false where kind = 'telegram' and telegram_chat_id = v_chat;
    end if;
    return '{}'::jsonb;
  end if;

  -- A button press. Only a private chat whose id is the sender's own counts.
  if jsonb_typeof(v_cq) = 'object' then
    v_data := v_cq ->> 'data';
    if jsonb_typeof(v_cq -> 'id') <> 'string' or v_data is null or length(v_data) > 64
       or v_data !~ '^[a-z](:[A-Za-z0-9_-]{1,40})?$'
       or jsonb_typeof(v_cq #> '{message,chat,id}') <> 'number'
       or (v_cq #>> '{message,chat,type}') is distinct from 'private'
       or (v_cq #>> '{message,chat,id}') is distinct from (v_cq #>> '{from,id}')
       or jsonb_typeof(v_cq #> '{message,message_id}') <> 'number' then
      return '{}'::jsonb;
    end if;
    v_chat := (v_cq #>> '{message,chat,id}')::bigint;
    v_out := private.bot_handle(v_chat, left(v_data, 1), nullif(substr(v_data, 3), ''));
    if v_out is null then
      return '{}'::jsonb;
    end if;
    v_token := private.secret('telegram_bot_token');
    if v_token is not null then
      begin
        perform net.http_post(
          url := 'https://api.telegram.org/bot' || v_token || '/answerCallbackQuery',
          body := jsonb_build_object('callback_query_id', v_cq ->> 'id'),
          headers := '{"Content-Type": "application/json"}'::jsonb,
          timeout_milliseconds := 5000);
      exception when others then
        null;   -- the spinner is cosmetic; never fail the update for it
      end;
    end if;
    return jsonb_build_object('bot', v_out || jsonb_build_object('chat_id', v_chat,
      'message_id', (v_cq #>> '{message,message_id}')::bigint));
  end if;

  -- A photo from a linked private chat belongs to the bot (an "add item" step may
  -- want it). Telegram sends several renditions, smallest first; take the largest
  -- one up to 2 MB, the size the menu-images bucket accepts. Documents and other
  -- files are ignored, so only real photos get this far.
  if jsonb_typeof(v_msg -> 'photo') = 'array' and jsonb_typeof(v_msg -> 'text') is distinct from 'string' then
    if (v_msg #>> '{chat,type}') = 'private' and (v_msg #>> '{from,id}') is not distinct from (v_msg #>> '{chat,id}')
       and jsonb_typeof(v_msg #> '{chat,id}') = 'number' then
      v_chat := (v_msg #>> '{chat,id}')::bigint;
      select e ->> 'file_id', e ->> 'file_size' into v_file, v_size
      from jsonb_array_elements(v_msg -> 'photo') with ordinality t(e, i)
      where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'file_id') = 'string'
        and jsonb_typeof(e -> 'file_size') = 'number' and (e ->> 'file_size') ~ '^[0-9]{1,9}$'
        and (e ->> 'file_size')::bigint between 1 and 2097152
      order by i desc limit 1;
      -- No usable rendition: still tell the step, which answers "too large" (size 0 is refused).
      v_out := private.bot_handle(v_chat, 'photo', coalesce(v_file, 'x'), coalesce(v_size, '0'));
      if v_out is not null then
        return jsonb_build_object('bot', v_out || jsonb_build_object('chat_id', v_chat));
      end if;
    end if;
    return '{}'::jsonb;
  end if;

  if v_msg is null or jsonb_typeof(v_msg -> 'text') <> 'string' then
    return '{}'::jsonb;
  end if;
  v_chat := (v_msg #>> '{chat,id}')::bigint;
  v_text := btrim(v_msg ->> 'text');
  v_lang := private.telegram_locale(v_msg #>> '{from,language_code}');

  if v_text ~ '^/stop(@\w+)?$' then
    select locale into v_locale from public.notification_channels
    where kind = 'telegram' and telegram_chat_id = v_chat and is_active order by created_at limit 1;
    update public.notification_channels set is_active = false where kind = 'telegram' and telegram_chat_id = v_chat;
    return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
      'text', private.render_notification('channel.stopped', '{}', coalesce(v_locale, v_lang, 'hy'))));
  end if;

  v_code := substring(v_text from '^/start(?:@\w+)?\s+([A-Za-z0-9_-]{8,64})$');
  if v_code is null then
    -- Typed text of a linked private chat belongs to the bot (menu, or a number
    -- the pending step asked for). Anybody else gets nothing, except the old
    -- greeting for a bare /start that tells how to connect.
    if (v_msg #>> '{chat,type}') = 'private' and (v_msg #>> '{from,id}') is not distinct from (v_msg #>> '{chat,id}') then
      v_out := private.bot_handle(v_chat, 'text', null, left(v_text, 200));
      if v_out is not null then
        return jsonb_build_object('bot', v_out || jsonb_build_object('chat_id', v_chat));
      end if;
    end if;
    if v_text ~ '^/start(@\w+)?$' then
      return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
        'text', private.render_notification('bot.hello', '{}', coalesce(v_lang, 'hy'))));
    end if;
    return '{}'::jsonb;
  end if;

  select * into v_link from public.telegram_link_codes
  where code_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
  for update;
  if not found
     or (v_link.consumed_at is null and v_link.expires_at <= now())
     or (v_link.consumed_at is not null and v_link.consumed_chat_id is distinct from v_chat) then
    return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
      'text', private.render_notification('link.invalid', '{}', coalesce(v_lang, 'hy'))));
  end if;

  -- The chat gets the language of whoever made the link; the owner can change it.
  select m.locale into v_locale from public.members m
  where m.restaurant_id = v_link.restaurant_id and m.user_id = v_link.created_by;
  select r.default_locale, r.name into v_lang, v_name from public.restaurants r where r.id = v_link.restaurant_id;
  v_locale := coalesce(v_locale, v_lang, 'hy');
  v_title := left(coalesce(nullif(v_msg #>> '{chat,title}', ''),
                           nullif(btrim(concat_ws(' ', v_msg #>> '{chat,first_name}', v_msg #>> '{chat,last_name}')), ''),
                           nullif(v_msg #>> '{chat,username}', ''), 'Telegram'), 80);

  insert into public.notification_channels (restaurant_id, location_id, kind, telegram_chat_id, title, locale, created_by)
  values (v_link.restaurant_id, v_link.location_id, 'telegram', v_chat, v_title, v_locale, v_link.created_by)
  on conflict (restaurant_id, telegram_chat_id) do update
    set is_active = true, title = excluded.title;
  if v_link.consumed_at is null then
    update public.telegram_link_codes set consumed_at = now(), consumed_chat_id = v_chat where code_hash = v_link.code_hash;
    insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, data)
    values (v_link.restaurant_id, 'system', v_link.created_by, 'telegram.linked', 'notification_channel',
            jsonb_build_object('chat_type', v_msg #>> '{chat,type}'));
  end if;

  select locale into v_locale from public.notification_channels
  where restaurant_id = v_link.restaurant_id and telegram_chat_id = v_chat;
  return jsonb_build_object('reply', jsonb_build_object('method', 'sendMessage', 'chat_id', v_chat,
    'text', private.render_notification('channel.linked', jsonb_build_object('restaurant', v_name), v_locale)));
end $$;


-- -----------------------------------------------------------------------------
-- Privileges: nothing here is client-callable except api.telegram_update (unchanged
-- grant, guarded by the webhook secret) and api.set_promo_on (authenticated, as before).
-- -----------------------------------------------------------------------------
revoke execute on function
  private.bot_photo_enabled(),
  private.bot_list(public.notification_channels, private.bot_pending, text),
  private.bot_next(public.notification_channels, uuid, private.bot_pending),
  private.bot_handle(bigint, text, text, text),
  private.bot_prepare_add_item(public.notification_channels, uuid, jsonb),
  private.bot_apply_add_item(public.notification_channels, uuid, jsonb),
  private.bot_undo_add_item(public.notification_channels, uuid, private.bot_changes),
  private.apply_promo_on(uuid, boolean, public.actor_kind, uuid),
  private.bot_prepare_promo(public.notification_channels, uuid, jsonb),
  private.bot_apply_promo(public.notification_channels, uuid, jsonb),
  private.bot_undo_promo(public.notification_channels, uuid, private.bot_changes)
from public, anon, authenticated;
