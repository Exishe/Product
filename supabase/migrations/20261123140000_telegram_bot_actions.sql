-- Telegram manager bot (ADR-069): buttons only, no AI. A linked chat (the owner's
-- one-time link code, ADR-016) can change the café through a small action
-- framework. The database holds every rule: who the chat is, which step comes
-- next, what the preview says and what changes. The app only draws the screens
-- (src/features/telegram-bot) and sends them as the webhook's answer.
--
-- Adding an action = one row in private.bot_actions + three functions
-- (bot_prepare_<id>, bot_apply_<id>, bot_undo_<id>); see docs/02-stack/telegram-bot.md.

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
-- The manager's language in the bot; null until they pick one on first use.
alter table public.notification_channels add column bot_locale public.app_locale;

-- The registry. `steps` are collected in order ('item', 'number', 'choice');
-- `choices` are the allowed values of a 'choice' step; `ready` false shows
-- "coming soon". Ids must match src/features/telegram-bot/registry.ts (a test
-- compares them).
create table private.bot_actions (
  id text primary key check (id ~ '^[a-z_]{2,24}$'),
  sort integer not null,
  steps text[] not null default '{}' check (steps <@ '{item,number,choice}'::text[]),
  choices text[] not null default '{}',
  ready boolean not null default false
);
insert into private.bot_actions (id, sort, steps, choices, ready) values
  ('sold_out',      1, '{item}',   '{}', true),
  ('price',         2, '{item,number}', '{}', false),
  ('hide',          3, '{item}',   '{}', false),
  ('add_item',      4, '{}',       '{}', false),
  ('category',      5, '{}',       '{}', false),
  ('promo',         6, '{}',       '{}', false),
  ('pause',         7, '{choice}', '{10,20,30,inf,resume}', true),
  ('close_kitchen', 8, '{}',       '{}', false),
  ('report',        9, '{}',       '{}', false),
  ('help',         10, '{}',       '{}', true);

-- One pending step per linked chat; gone after 10 minutes.
create table private.bot_pending (
  channel_id uuid primary key references public.notification_channels (id) on delete cascade,
  action text not null,
  want text not null check (want in ('category', 'item', 'number', 'choice', 'confirm', 'undo')),
  data jsonb not null default '{}',
  token text not null,
  page integer not null default 0 check (page >= 0),
  expires_at timestamptz not null
);

-- Every change made through the bot, and every undo of one.
create table private.bot_changes (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  location_id uuid not null,
  channel_id uuid references public.notification_channels (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  label text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undo_of bigint references private.bot_changes (id)
);
create index bot_changes_channel_idx on private.bot_changes (channel_id, id desc);
create index bot_changes_restaurant_idx on private.bot_changes (restaurant_id, id desc);

alter table private.bot_actions enable row level security;
alter table private.bot_pending enable row level security;
alter table private.bot_changes enable row level security;
revoke all on private.bot_actions, private.bot_pending, private.bot_changes from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Who is this chat?
-- -----------------------------------------------------------------------------
-- The linked account of a chat, or no row. Linked = an active Telegram channel
-- made with a link code by someone who is still an active owner or manager of
-- that café. Several links of one chat: the newest one wins.
create function private.bot_channel(p_chat bigint) returns public.notification_channels
language sql stable security definer set search_path = '' as $$
  select c.* from public.notification_channels c
  where c.kind = 'telegram' and c.telegram_chat_id = p_chat and c.is_active
    and exists (select 1 from public.members m
                where m.restaurant_id = c.restaurant_id and m.user_id = c.created_by
                  and m.is_active and m.role in ('owner', 'manager'))
  order by c.created_at desc
  limit 1
$$;

-- The location the chat acts for: the one it was linked to, else the café's
-- oldest active location (a café with several locations picks one at link time).
create function private.bot_location(p_ch public.notification_channels) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.id from public.locations l
  where l.restaurant_id = p_ch.restaurant_id and l.status = 'active'
    and (p_ch.location_id is null or l.id = p_ch.location_id)
  order by l.created_at, l.id
  limit 1
$$;

create function private.bot_label(p_kind text, p_id uuid, p_locale public.app_locale) returns text
language sql stable security definer set search_path = '' as $$
  select private.pick_name(
    case p_kind
      when 'item' then (select jsonb_object_agg(t.locale::text, t.name) from public.item_translations t where t.item_id = p_id)
      else (select jsonb_object_agg(t.locale::text, t.name) from public.category_translations t where t.category_id = p_id)
    end, p_locale)
$$;

-- The next business-day opening: where "not today" on the stop list ends.
create function private.bot_day_end(p_location uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (case when date_trunc('day', now() at time zone l.timezone) + l.business_day_starts <= now() at time zone l.timezone
               then date_trunc('day', now() at time zone l.timezone) + l.business_day_starts + interval '1 day'
               else date_trunc('day', now() at time zone l.timezone) + l.business_day_starts end) at time zone l.timezone
  from public.locations l where l.id = p_location
$$;

-- Calls private.<p_fn>(channel, location, data). The name is built from a
-- registry id and must look like bot_(prepare|apply|ctx)_<id>. A missing
-- bot_ctx_ function means "no context".
create function private.bot_call(p_fn text, p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if p_fn !~ '^bot_(prepare|apply|ctx)_[a-z_]{2,24}$' then
    raise exception using errcode = '22023', message = 'invalid_bot_function';
  end if;
  if p_fn like 'bot_ctx\_%' and to_regprocedure(format('private.%I(public.notification_channels,uuid,jsonb)', p_fn)) is null then
    return '{}'::jsonb;
  end if;
  execute format('select private.%I($1, $2, $3)', p_fn) into v using p_ch, p_loc, p_data;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Pausing ordering: the rule, shared by the admin and the bot
-- -----------------------------------------------------------------------------
create function private.apply_ordering_pause(
  p_location_id uuid, p_paused boolean, p_until timestamptz, p_minutes integer,
  p_actor_kind public.actor_kind, p_actor_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  update public.locations
  set ordering_paused = p_paused, ordering_paused_until = p_until
  where id = p_location_id
  returning restaurant_id into v_restaurant;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, p_actor_kind, p_actor_user,
          case when p_paused then 'ordering.paused' else 'ordering.resumed' end,
          'location', p_location_id, jsonb_build_object('minutes', p_minutes, 'until', p_until));
end $$;

create or replace function api.set_ordering_pause(p_location_id uuid, p_paused boolean, p_minutes integer default null)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_until timestamptz;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_paused is null or (p_paused and p_minutes is not null and p_minutes not between 1 and 720)
     or (not p_paused and p_minutes is not null) then
    raise exception using errcode = '22023', message = 'invalid_minutes';
  end if;
  v_until := case when p_paused and p_minutes is not null then now() + make_interval(mins => p_minutes) end;
  perform private.apply_ordering_pause(p_location_id, p_paused, v_until, p_minutes, 'member', auth.uid());
  return v_until;
end $$;

-- -----------------------------------------------------------------------------
-- Action: sold out / back in stock
-- -----------------------------------------------------------------------------
create function private.bot_item_sold_out(p_loc uuid, p_item uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.stop_list s
                 where s.location_id = p_loc and s.item_id = p_item and (s.until is null or s.until > now()))
$$;

create function private.bot_prepare_sold_out(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
begin
  if not exists (select 1 from public.items i where i.id = v_item and i.restaurant_id = p_ch.restaurant_id and i.is_active) then
    return jsonb_build_object('error', 'not_found');
  end if;
  return jsonb_build_object('item', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
                            'to_sold_out', not private.bot_item_sold_out(p_loc, v_item));
end $$;

-- Same effect as the stop list in the admin: "not today" ends with the business day.
create function private.bot_apply_sold_out(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid := (p_data ->> 'item_id')::uuid;
  v_was boolean;
begin
  if not exists (select 1 from public.items i where i.id = v_item and i.restaurant_id = p_ch.restaurant_id and i.is_active) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  v_was := private.bot_item_sold_out(p_loc, v_item);
  if v_was then
    delete from public.stop_list where location_id = p_loc and item_id = v_item;
  else
    insert into public.stop_list (restaurant_id, location_id, item_id, until, created_by)
    values (p_ch.restaurant_id, p_loc, v_item, private.bot_day_end(p_loc), p_ch.created_by)
    on conflict (location_id, item_id) do update set until = excluded.until, created_by = excluded.created_by;
  end if;
  return jsonb_build_object('entity', 'item', 'entity_id', v_item,
    'label', private.bot_label('item', v_item, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('sold_out', v_was), 'new', jsonb_build_object('sold_out', not v_was));
end $$;

-- Restores only while the stop-list state is still what the bot set.
create function private.bot_undo_sold_out(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if private.bot_item_sold_out(p_loc, p_change.entity_id) is distinct from (p_change.new_value ->> 'sold_out')::boolean then
    return false;
  end if;
  if (p_change.old_value ->> 'sold_out')::boolean then
    insert into public.stop_list (restaurant_id, location_id, item_id, until, created_by)
    values (p_ch.restaurant_id, p_loc, p_change.entity_id, private.bot_day_end(p_loc), p_ch.created_by)
    on conflict (location_id, item_id) do update set until = excluded.until, created_by = excluded.created_by;
  else
    delete from public.stop_list where location_id = p_loc and item_id = p_change.entity_id;
  end if;
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Action: pause ordering / resume
-- -----------------------------------------------------------------------------
-- Effective state: the flag counts only while its end is open or in the future.
create function private.bot_pause_state(p_loc uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'paused', l.ordering_paused and (l.ordering_paused_until is null or l.ordering_paused_until > now()),
    'until', case when l.ordering_paused and l.ordering_paused_until > now() then l.ordering_paused_until end,
    'until_local', case when l.ordering_paused and l.ordering_paused_until > now()
                        then to_char(l.ordering_paused_until at time zone l.timezone, 'HH24:MI') end)
  from public.locations l where l.id = p_loc
$$;

create function private.bot_ctx_pause(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.bot_pause_state(p_loc)
$$;

create function private.bot_prepare_pause(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb := private.bot_pause_state(p_loc);
  v_choice text := p_data ->> 'choice';
begin
  if v_choice = 'resume' and not (v_state ->> 'paused')::boolean then
    return jsonb_build_object('error', 'not_paused');
  end if;
  return jsonb_build_object('choice', v_choice, 'paused_now', (v_state ->> 'paused')::boolean,
                            'until_now_local', v_state ->> 'until_local');
end $$;

create function private.bot_apply_pause(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_choice text := p_data ->> 'choice';
  v_old jsonb := private.bot_pause_state(p_loc);
  v_minutes integer := case when v_choice in ('10', '20', '30') then v_choice::integer end;
  v_paused boolean := v_choice <> 'resume';
  v_until timestamptz := case when v_minutes is not null then now() + make_interval(mins => v_minutes) end;
  v_tz text;
  v_name text;
begin
  if v_choice not in ('10', '20', '30', 'inf', 'resume') then
    raise exception using errcode = '22023', message = 'invalid_choice';
  end if;
  perform private.apply_ordering_pause(p_loc, v_paused, v_until, v_minutes, 'system', p_ch.created_by);
  select l.name, l.timezone into v_name, v_tz from public.locations l where l.id = p_loc;
  return jsonb_build_object('entity', 'location', 'entity_id', p_loc, 'label', v_name,
    'old', jsonb_build_object('paused', v_old -> 'paused', 'until', v_old -> 'until'),
    'new', jsonb_build_object('paused', v_paused, 'until', v_until,
                              'until_local', case when v_until is not null then to_char(v_until at time zone v_tz, 'HH24:MI') end));
end $$;

create function private.bot_undo_pause(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now jsonb := private.bot_pause_state(p_loc);
  v_paused boolean := (p_change.old_value ->> 'paused')::boolean;
  v_until timestamptz := (p_change.old_value ->> 'until')::timestamptz;
begin
  if (v_now ->> 'paused')::boolean is distinct from (p_change.new_value ->> 'paused')::boolean
     or (v_now ->> 'until')::timestamptz is distinct from (p_change.new_value ->> 'until')::timestamptz then
    return false;
  end if;
  if v_paused and v_until is not null and v_until <= now() then
    v_paused := false;
    v_until := null;
  end if;
  perform private.apply_ordering_pause(p_loc, v_paused, v_until, null, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- The engine
-- -----------------------------------------------------------------------------
create function private.bot_out(p_ch public.notification_channels, p_screen jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('locale', p_ch.bot_locale, 'screen', p_screen)
$$;


-- One page (8) of categories or items; a 9th row only tells that a next page exists.
create function private.bot_list(p_ch public.notification_channels, p private.bot_pending, p_kind text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_l public.app_locale := coalesce(p_ch.bot_locale, 'hy');
  v_rows jsonb;
begin
  if p_kind = 'category' then
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', private.bot_label('category', x.id, v_l)) order by x.ord), '[]')
    into v_rows
    from (select c.id, row_number() over (order by c.sort, c.id) as ord
          from public.categories c where c.restaurant_id = p_ch.restaurant_id and c.is_active
          order by c.sort, c.id limit 9 offset p.page * 8) x;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', private.bot_label('item', x.id, v_l)) order by x.ord), '[]')
    into v_rows
    from (select i.id, row_number() over (order by c.sort, i.sort, i.id) as ord
          from public.items i join public.categories c on c.id = i.category_id
          where i.restaurant_id = p_ch.restaurant_id and i.is_active
            and (not (p.data ? 'category_id') or i.category_id = (p.data ->> 'category_id')::uuid)
          order by c.sort, i.sort, i.id limit 9 offset p.page * 8) x;
  end if;
  return jsonb_build_object('type', 'pick_' || p_kind, 'action', p.action, 'page', p.page,
    'has_prev', p.page > 0, 'has_next', jsonb_array_length(v_rows) > 8,
    'rows', jsonb_path_query_array(v_rows, '$[0 to 7]'),
    'category', case when p.data ? 'category_id' then private.bot_label('category', (p.data ->> 'category_id')::uuid, v_l) end);
end $$;

-- Moves a pending step on: asks for the next missing value, or shows the preview.
create function private.bot_next(p_ch public.notification_channels, p_loc uuid, p private.bot_pending) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  def private.bot_actions;
  s text;
  v_facts jsonb;
  v_token text := substr(private.b64url(extensions.gen_random_bytes(6)), 1, 8);
begin
  select * into def from private.bot_actions a where a.id = p.action;
  foreach s in array def.steps loop
    if s = 'item' and not (p.data ? 'item_id') then
      if not (p.data ? 'category_id')
         and (select count(*) from public.items i where i.restaurant_id = p_ch.restaurant_id and i.is_active) > 24 then
        update private.bot_pending set want = 'category', expires_at = now() + interval '10 minutes'
        where channel_id = p_ch.id returning * into p;
        return private.bot_list(p_ch, p, 'category');
      end if;
      update private.bot_pending set want = 'item', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return private.bot_list(p_ch, p, 'item');
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

-- Writes the change record and the audit entry for a done change.
create function private.bot_record(p_ch public.notification_channels, p_loc uuid, p_action text, p_rec jsonb,
                                   p_undo_of bigint default null) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  insert into private.bot_changes (restaurant_id, location_id, channel_id, action, entity, entity_id, label, old_value, new_value, undo_of)
  values (p_ch.restaurant_id, p_loc, p_ch.id, p_action, p_rec ->> 'entity', (p_rec ->> 'entity_id')::uuid, p_rec ->> 'label',
          p_rec -> 'old', p_rec -> 'new', p_undo_of)
  returning id into v_id;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (p_ch.restaurant_id, p_loc, 'system', p_ch.created_by, 'bot.' || p_action, p_rec ->> 'entity',
          (p_rec ->> 'entity_id')::uuid,
          jsonb_build_object('via', 'telegram', 'change_id', v_id, 'old', p_rec -> 'old', 'new', p_rec -> 'new'));
  return v_id;
end $$;

-- One button press or typed message from a chat. Returns {locale, screen} for
-- the app to draw, or null: the chat is not linked (or is flooding), so the bot
-- stays silent. Everything the caller sent is checked here; callback data is a
-- verb plus at most one opaque argument, validated against the linked account:
--   m menu | a:<action> | p:<uuid> pick | c:<choice> | g:<page> | b back | x cancel
--   k:<token> confirm | u undo | h history | l:<hy|ru|en>
create function private.bot_handle(p_chat bigint, p_verb text, p_arg text, p_text text default null) returns jsonb
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
      v_num := regexp_replace(btrim(coalesce(p_text, '')), '[  ,.]', '', 'g');
      v_num := regexp_replace(v_num, '(amd|֏|դրամ|դր|драм|руб)$', '', 'i');
      if v_num ~ '^[0-9]{1,8}$' then
        update private.bot_pending set data = data || jsonb_build_object('number', v_num::integer)
        where channel_id = ch.id returning * into p;
        return private.bot_out(ch, private.bot_next(ch, loc, p));
      end if;
      return private.bot_out(ch, jsonb_build_object('type', 'bad_number', 'action', p.action,
        'context', private.bot_call('bot_ctx_' || p.action, ch, loc, p.data)));
    end if;
    delete from private.bot_pending where channel_id = ch.id;
    return private.bot_out(ch, jsonb_build_object('type', 'menu'));

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
    if p.want = 'category' and exists (select 1 from public.categories c
                                       where c.id = p_arg::uuid and c.restaurant_id = ch.restaurant_id and c.is_active) then
      update private.bot_pending set data = data || jsonb_build_object('category_id', p_arg), page = 0
      where channel_id = ch.id returning * into p;
    elsif p.want = 'item' and exists (select 1 from public.items i
                                      where i.id = p_arg::uuid and i.restaurant_id = ch.restaurant_id and i.is_active
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
    if p.want not in ('category', 'item') or p_arg !~ '^[0-9]{1,3}$' then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    update private.bot_pending set page = p_arg::integer, expires_at = now() + interval '10 minutes'
    where channel_id = ch.id returning * into p;
    return private.bot_out(ch, private.bot_list(ch, p, p.want));

  elsif p_verb = 'b' then
    -- Forget the newest answer and ask for it again; nothing left: back to the menu.
    v_data := p.data;
    select * into def from private.bot_actions a where a.id = p.action;
    if p.want = 'undo' or def.id is null then
      delete from private.bot_pending where channel_id = ch.id;
      return private.bot_out(ch, jsonb_build_object('type', 'menu'));
    end if;
    foreach v_last in array array(select s from unnest(def.steps) with ordinality t(s, i) order by i desc) loop
      if v_last = 'item' and v_data ? 'item_id' then v_data := v_data - 'item_id'; exit;
      elsif v_last = 'item' and v_data ? 'category_id' then v_data := v_data - 'category_id'; exit;
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
-- The webhook (replaces the one from 20261109200000_telegram_link.sql)
-- -----------------------------------------------------------------------------
-- New: button presses (callback_query) and any text from a linked private chat
-- go to private.bot_handle. Everything else is as before. The bot answers in the
-- webhook's own HTTP reply; only the "stop the spinner" call (answerCallbackQuery)
-- goes out through pg_net with the Vault token, because a webhook reply can
-- carry just one method.
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

-- Same as before, with callback_query added to the updates Telegram sends.
create or replace function private.telegram_set_webhook(p_url text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.secret('telegram_bot_token');
  v_bypass text := private.secret('vercel_bypass_secret');
  v_id bigint;
begin
  perform private.ensure_random_secret('telegram_webhook_secret',
    'Telegram sends it in X-Telegram-Bot-Api-Secret-Token; checked by api.telegram_update');
  if v_token is null then
    return 'no_token';
  end if;
  if p_url !~ '^https://[^/]+/' then
    raise exception using errcode = '22023', message = 'invalid_url';
  end if;
  v_id := net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/setWebhook',
    body := jsonb_build_object(
      'url', p_url || case when v_bypass is null then ''
                           else case when p_url like '%?%' then '&' else '?' end
                                || 'x-vercel-protection-bypass=' || v_bypass end,
      'secret_token', private.secret('telegram_webhook_secret'),
      'allowed_updates', jsonb_build_array('message', 'callback_query', 'my_chat_member'),
      'drop_pending_updates', true),
    timeout_milliseconds := 10000);
  return 'requested:' || v_id;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing here is callable by clients except api.telegram_update
-- (unchanged grant: anon, authenticated, guarded by the webhook secret).
-- -----------------------------------------------------------------------------
revoke execute on function
  private.bot_channel(bigint), private.bot_location(public.notification_channels),
  private.bot_label(text, uuid, public.app_locale), private.bot_day_end(uuid),
  private.bot_call(text, public.notification_channels, uuid, jsonb),
  private.apply_ordering_pause(uuid, boolean, timestamptz, integer, public.actor_kind, uuid),
  private.bot_item_sold_out(uuid, uuid),
  private.bot_prepare_sold_out(public.notification_channels, uuid, jsonb),
  private.bot_apply_sold_out(public.notification_channels, uuid, jsonb),
  private.bot_undo_sold_out(public.notification_channels, uuid, private.bot_changes),
  private.bot_pause_state(uuid),
  private.bot_ctx_pause(public.notification_channels, uuid, jsonb),
  private.bot_prepare_pause(public.notification_channels, uuid, jsonb),
  private.bot_apply_pause(public.notification_channels, uuid, jsonb),
  private.bot_undo_pause(public.notification_channels, uuid, private.bot_changes),
  private.bot_out(public.notification_channels, jsonb),
  private.bot_list(public.notification_channels, private.bot_pending, text),
  private.bot_next(public.notification_channels, uuid, private.bot_pending),
  private.bot_record(public.notification_channels, uuid, text, jsonb, bigint),
  private.bot_handle(bigint, text, text, text)
from public, anon, authenticated;
