-- Telegram manager bot (ADR-069), "Ingredient out" (ADR-078, spec A, bot part).
--
-- 1. Action `ingredient_out`: the manager taps through the café's ingredients
--    (most used in recipes first, 8 a page) or TYPES a name (hy / ru / en,
--    simple case-insensitive substring, no AI), previews "out?" / "back?", and
--    on confirm the same core as the kitchen button runs
--    (private.apply_ingredient_out): hide, substitute note and live menu update
--    are exactly the kitchen's. The result says how many dishes are hidden and
--    how many have a substitute. History row and undo (only while the state is
--    still what the bot set).
--    Engine: step kind 'ingredient' (a picker; typed text while it is asked is
--    a search of 1 to 40 characters, stored as data.q) and the callback verbs
--    y / n for the morning question below.
-- 2. Next-morning question: an outage ends by itself with the business day, so
--    nothing is needed for "back". Only for an ingredient that was out
--    YESTERDAY (its outage ended at the opening that started today's business
--    day and was not set again) the bot asks once per ingredient, within 30
--    minutes after the business day starts: "«Salmon» back today?" with two
--    buttons. Yes = nothing to do. No = out again for today, through the same
--    core, with a history row and undo. Delivery uses the outbox (event
--    'ingredient.morning'); the buttons are added by deliver_outbox from the
--    ingredient id in the payload. Outage rows stay for two days, so no
--    retention change is needed.
--
-- Access rules of the engine stay: only a linked account, unlinked chats get
-- silence, callback data is opaque and re-validated here, nothing in p_data is
-- trusted, every function is SECURITY DEFINER with an empty search_path and is
-- revoked from clients.

-- -----------------------------------------------------------------------------
-- Registry
-- -----------------------------------------------------------------------------
alter table private.bot_actions drop constraint bot_actions_steps_check;
alter table private.bot_actions add constraint bot_actions_steps_check
  check (steps <@ '{category,item,number,choice,promo,ingredient,text_name_hy,text_name_ru,text_name_en,photo}'::text[]);

alter table private.bot_pending drop constraint bot_pending_want_check;
alter table private.bot_pending add constraint bot_pending_want_check
  check (want in ('category', 'item', 'number', 'choice', 'promo', 'ingredient', 'text_name_hy', 'text_name_ru', 'text_name_en',
                  'photo', 'confirm', 'undo'));

-- before Help in the menu
update private.bot_actions set sort = 11 where id = 'help';
insert into private.bot_actions (id, sort, steps, choices, ready) values ('ingredient_out', 10, '{ingredient}', '{}', true);

-- -----------------------------------------------------------------------------
-- The one search both the admin API and the bot use: the café's active
-- ingredients whose Armenian, Russian or English name contains the text
-- (case-insensitive plain substring), most used in recipes first. A blank text
-- lists everything. Private: the callers decide who may ask.
-- -----------------------------------------------------------------------------
create function private.search_ingredients_core(p_restaurant_id uuid, p_location_id uuid, p_query text,
                                                p_limit integer, p_offset integer default 0)
returns table (id uuid, name text, names jsonb, unit text, is_out boolean, uses integer)
language sql stable security definer set search_path = '' as $$
  select i.id, i.name, private.ingredient_names(i.id), i.unit,
         exists (select 1 from public.ingredient_outages o
                 where o.location_id = p_location_id and o.ingredient_id = i.id and o.until > now()),
         (select count(*)::integer from public.recipe_lines rl where rl.ingredient_id = i.id)
  from public.ingredients i
  where i.restaurant_id = p_restaurant_id and i.is_active
    and (lower(btrim(coalesce(p_query, ''))) = ''
         or position(lower(btrim(p_query)) in lower(i.name)) > 0
         or position(lower(btrim(p_query)) in lower(coalesce(i.name_i18n ->> 'ru', ''))) > 0
         or position(lower(btrim(p_query)) in lower(coalesce(i.name_i18n ->> 'en', ''))) > 0)
  order by 6 desc, lower(i.name), i.id
  limit p_limit offset p_offset
$$;

-- Same answer as before (at most 30), now through the shared core.
create or replace function api.search_ingredients(p_location_id uuid, p_query text default null)
returns table (id uuid, name text, names jsonb, unit text, is_out boolean, uses integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,kitchen,waiter}');
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  return query
  select s.id, s.name, s.names, s.unit, s.is_out, s.uses
  from private.search_ingredients_core(v_restaurant, p_location_id, p_query, 30, 0) s;
end $$;

-- The business day a moment belongs to, as a date (the day the café would put
-- on its books): the local date after taking away the opening time.
create function private.business_date_of(p_location_id uuid, p_at timestamptz) returns date
language sql stable security definer set search_path = '' as $$
  select ((p_at at time zone l.timezone) - (l.business_day_starts - time '00:00'))::date
  from public.locations l where l.id = p_location_id
$$;

-- Is the ingredient out right now at this location?
create function private.bot_ingredient_is_out(p_loc uuid, p_ingredient uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ingredient_outages o
                 where o.location_id = p_loc and o.ingredient_id = p_ingredient and o.until > now())
$$;

-- Name in the manager's language (a missing translation falls back to Armenian).
create function private.bot_ingredient_label(p_ingredient uuid, p_locale public.app_locale) returns text
language sql stable security definer set search_path = '' as $$
  select private.ingredient_names(p_ingredient) ->> p_locale::text
$$;

-- Dishes this ingredient affects right now: those whose key line uses it and
-- that the outage hides, and those that get a substitute. Counts only.
create function private.bot_ingredient_effects(p_loc uuid, p_ingredient uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'hidden', count(*) filter (where e.hidden),
    'substituted', count(*) filter (where not e.hidden))
  from private.outage_effects(p_loc) e
  join public.items it on it.id = e.item_id and it.is_active
  where exists (select 1 from public.recipe_lines rl
                where rl.item_id = e.item_id and rl.ingredient_id = p_ingredient and rl.is_key)
$$;

-- Morning questions: one row per location, ingredient and business day. It is
-- the guard against asking twice and the record of the answer.
create table private.ingredient_morning_prompts (
  location_id uuid not null references public.locations (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  day date not null,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  answer text check (answer in ('back', 'out')),
  primary key (location_id, ingredient_id, day)
);
alter table private.ingredient_morning_prompts enable row level security;
revoke all on private.ingredient_morning_prompts from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Engine: one page (8) of sections, items, promos or ingredients
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
  elsif p_kind = 'ingredient' then
    -- the same ordering and matching as api.search_ingredients (shared core); a typed
    -- search is data.q; 'off' marks an ingredient that is out now
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'label', x.names ->> v_l::text, 'off', x.is_out) order by x.n), '[]')
    into v_rows
    from private.search_ingredients_core(p_ch.restaurant_id, private.bot_location(p_ch), p.data ->> 'q', 9, p.page * 8)
         with ordinality as x (id, name, names, unit, is_out, uses, n);
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
    'category', case when p.data ? 'category_id' then private.bot_label('category', (p.data ->> 'category_id')::uuid, v_l) end,
    'q', p.data ->> 'q');
end $$;

-- -----------------------------------------------------------------------------
-- Engine: next step (adds the ingredient picker)
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
    elsif s = 'ingredient' and not (p.data ? 'ingredient_id') then
      update private.bot_pending set want = 'ingredient', expires_at = now() + interval '10 minutes'
      where channel_id = p_ch.id returning * into p;
      return private.bot_list(p_ch, p, 'ingredient');
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
-- Engine: a press or a message (adds the ingredient picker and search, and the
-- morning question's two verbs)
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
  v_day date;
  v_prompt private.ingredient_morning_prompts;
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
    if p.channel_id is not null and p.want = 'ingredient' then
      -- A search: one line, no control or invisible characters, 1 to 40 characters,
      -- not a command. Too long is refused, never cut. It is matched by plain
      -- substring over the three names (private.search_ingredients_core).
      v_txt := regexp_replace(coalesce(p_text, ''), '\s+', ' ', 'g');
      v_txt := btrim(regexp_replace(v_txt, '[[:cntrl:]\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]', '', 'g'));
      if char_length(v_txt) between 1 and 40 and left(v_txt, 1) <> '/' then
        update private.bot_pending set data = data || jsonb_build_object('q', v_txt), page = 0,
               expires_at = now() + interval '10 minutes'
        where channel_id = ch.id returning * into p;
        return private.bot_out(ch, private.bot_list(ch, p, 'ingredient'));
      end if;
      return private.bot_out(ch, jsonb_build_object('type', 'bad_search', 'action', p.action));
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

  elsif p_verb in ('y', 'n') then
    -- The two buttons of the next-morning question ("back today?"): y = it is back
    -- (nothing to do), n = still out, mark it out again for today. They need no
    -- pending step but the question must exist for this café, today, unanswered.
    if p_arg is null or p_arg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    v_day := private.business_date_of(loc, now());
    select * into v_prompt from private.ingredient_morning_prompts q
    where q.location_id = loc and q.ingredient_id = p_arg::uuid and q.day = v_day for update;
    if v_prompt.location_id is null
       or not exists (select 1 from public.ingredients g
                      where g.id = p_arg::uuid and g.restaurant_id = ch.restaurant_id and g.is_active) then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'invalid'));
    end if;
    if v_prompt.answered_at is not null then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'answered'));
    end if;
    if p_verb = 'y' then
      update private.ingredient_morning_prompts set answered_at = now(), answer = 'back'
      where location_id = loc and ingredient_id = v_prompt.ingredient_id and day = v_day;
      return private.bot_out(ch, jsonb_build_object('type', 'morning_back',
        'label', private.bot_ingredient_label(v_prompt.ingredient_id, v_l)));
    end if;
    update private.ingredient_morning_prompts set answered_at = now(), answer = 'out'
    where location_id = loc and ingredient_id = v_prompt.ingredient_id and day = v_day;
    if private.bot_ingredient_is_out(loc, v_prompt.ingredient_id) then
      return private.bot_out(ch, jsonb_build_object('type', 'failed', 'code', 'unchanged'));   -- someone already did
    end if;
    v_rec := private.bot_call('bot_apply_ingredient_out', ch, loc,
                              jsonb_build_object('ingredient_id', v_prompt.ingredient_id, 'ing_out', true));
    perform private.bot_record(ch, loc, 'ingredient_out', v_rec);
    return private.bot_out(ch, jsonb_build_object('type', 'done', 'action', 'ingredient_out',
      'change', jsonb_build_object('label', v_rec -> 'label', 'old', v_rec -> 'old', 'new', v_rec -> 'new')));
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
    elsif p.want = 'ingredient' and exists (select 1 from public.ingredients g
                                            where g.id = p_arg::uuid and g.restaurant_id = ch.restaurant_id and g.is_active) then
      -- the direction is decided here, from what is true now: out when it is in, back when it is out
      update private.bot_pending
         set data = data || jsonb_build_object('ingredient_id', p_arg, 'ing_out', not private.bot_ingredient_is_out(loc, p_arg::uuid))
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
    if p.want not in ('category', 'item', 'promo', 'ingredient') or p_arg !~ '^[0-9]{1,3}$' then
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
      if v_last = 'ingredient' and v_data ? 'ingredient_id' then v_data := v_data - 'ingredient_id' - 'ing_out'; exit;
      elsif v_last = 'ingredient' and v_data ? 'q' then v_data := v_data - 'q'; exit;
      elsif v_last = 'item' and v_data ? 'item_id' then v_data := v_data - 'item_id'; exit;
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
-- Action: ingredient out / back. The engine stored data.ingredient_id (checked
-- against the café) and data.ing_out (the direction it decided from the state at
-- the moment of the pick). Everything is checked again here.
-- -----------------------------------------------------------------------------
create function private.bot_prepare_ingredient_out(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ing uuid := (p_data ->> 'ingredient_id')::uuid;
begin
  if v_ing is null or not exists (select 1 from public.ingredients g
                                  where g.id = v_ing and g.restaurant_id = p_ch.restaurant_id and g.is_active) then
    return jsonb_build_object('error', 'no_ingredient');
  end if;
  return jsonb_build_object('ingredient', private.bot_ingredient_label(v_ing, coalesce(p_ch.bot_locale, 'hy')),
                            'to_out', coalesce((p_data ->> 'ing_out')::boolean, not private.bot_ingredient_is_out(p_loc, v_ing)));
end $$;

-- The same core as the kitchen button (private.apply_ingredient_out): the outage
-- ends with the business day, dishes hide or get a substitute through the live
-- overlay, guests see it within one poll. No publish is needed.
create function private.bot_apply_ingredient_out(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ing uuid := (p_data ->> 'ingredient_id')::uuid;
  v_to boolean := coalesce((p_data ->> 'ing_out')::boolean, true);
  v_was boolean;
  v_member uuid;
  v_fx jsonb;
begin
  if v_ing is null or not exists (select 1 from public.ingredients g
                                  where g.id = v_ing and g.restaurant_id = p_ch.restaurant_id and g.is_active) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  v_was := private.bot_ingredient_is_out(p_loc, v_ing);
  select m.id into v_member from public.members m
  where m.restaurant_id = p_ch.restaurant_id and m.user_id = p_ch.created_by and m.is_active;
  perform private.apply_ingredient_out(p_loc, v_ing, v_to, 'bot', 'system', p_ch.created_by, v_member);
  v_fx := case when v_to then private.bot_ingredient_effects(p_loc, v_ing) else '{}'::jsonb end;
  return jsonb_build_object('entity', 'ingredient', 'entity_id', v_ing,
    'label', private.bot_ingredient_label(v_ing, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('out', v_was),
    'new', jsonb_build_object('out', v_to) || v_fx);
end $$;

-- Only while the state is still what the bot set: someone else marking it back
-- (or out) in the meantime is not overruled.
create function private.bot_undo_ingredient_out(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
begin
  if not exists (select 1 from public.ingredients g where g.id = p_change.entity_id and g.restaurant_id = p_ch.restaurant_id)
     or private.bot_ingredient_is_out(p_loc, p_change.entity_id) is distinct from (p_change.new_value ->> 'out')::boolean then
    return false;
  end if;
  select m.id into v_member from public.members m
  where m.restaurant_id = p_ch.restaurant_id and m.user_id = p_ch.created_by and m.is_active;
  perform private.apply_ingredient_out(p_loc, p_change.entity_id, coalesce((p_change.old_value ->> 'out')::boolean, false),
                                       'bot', 'system', p_ch.created_by, v_member);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- The next-morning question
-- -----------------------------------------------------------------------------
-- Telegram chats that may be asked for this café: active, linked by a person
-- who is still an active owner or manager (the bot's own rule, so the answer
-- buttons will be accepted), the chat's newest link, and a language chosen in
-- the bot (a chat that never used the bot is not surprised by a question).
create function private.ingredient_morning_channels(p_location_id uuid) returns setof public.notification_channels
language sql stable security definer set search_path = '' as $$
  select c.* from public.notification_channels c
  where c.kind = 'telegram' and c.is_active and c.bot_locale is not null
    and c.restaurant_id = (select l.restaurant_id from public.locations l where l.id = p_location_id)
    and (select b.id from private.bot_channel(c.telegram_chat_id) b) = c.id
    and private.bot_location(c) = p_location_id
$$;

-- Runs every five minutes. For each active location, in the first 30 minutes
-- after its business day starts: every ingredient whose outage ended at that
-- opening (an outage ending within the 20 hours before the day started; one set
-- again today has a later end and is not listed) gets one question per chat, at
-- most 10 ingredients (most used first). The question row is the guard (one per
-- ingredient and business day); the outbox key keeps a chat from getting it twice.
create function private.enqueue_ingredient_morning(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  g record;
  v_local timestamp;
  v_start timestamp;
  v_start_at timestamptz;
  v_day date;
  v_rows integer;
  v_n integer := 0;
begin
  for r in select l.id, l.restaurant_id, l.timezone, l.business_day_starts from public.locations l where l.status = 'active' loop
    v_local := p_now at time zone r.timezone;
    v_start := date_trunc('day', v_local - (r.business_day_starts - time '00:00')) + (r.business_day_starts - time '00:00');
    continue when v_local - v_start >= interval '30 minutes';
    v_start_at := v_start at time zone r.timezone;
    v_day := v_start::date;
    continue when not exists (select 1 from private.ingredient_morning_channels(r.id));

    for g in
      select o.ingredient_id
      from public.ingredient_outages o
      join public.ingredients i on i.id = o.ingredient_id and i.is_active
      where o.location_id = r.id and o.until <= p_now and o.until > v_start_at - interval '20 hours'
        and not exists (select 1 from public.ingredient_outages a
                        where a.location_id = r.id and a.ingredient_id = o.ingredient_id and a.until > p_now)
      order by (select count(*) from public.recipe_lines rl where rl.ingredient_id = o.ingredient_id) desc, i.name, o.ingredient_id
      limit 10
    loop
      insert into private.ingredient_morning_prompts (location_id, ingredient_id, day)
      values (r.id, g.ingredient_id, v_day)
      on conflict do nothing;
      continue when exists (select 1 from private.ingredient_morning_prompts q
                            where q.location_id = r.id and q.ingredient_id = g.ingredient_id and q.day = v_day
                              and q.answered_at is not null);
      insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
      select r.restaurant_id, c.id, 'ingredient.morning',
             'ingredient.morning:' || r.id || ':' || g.ingredient_id || ':' || v_day,
             jsonb_build_object('ingredient_id', g.ingredient_id, 'location_id', r.id,
                                'names', private.ingredient_names(g.ingredient_id),
                                'locale', coalesce(c.bot_locale, c.locale, 'hy'))
      from private.ingredient_morning_channels(r.id) c
      on conflict (channel_id, dedupe_key) do nothing;
      get diagnostics v_rows = row_count;
      v_n := v_n + v_rows;
    end loop;
  end loop;
  return v_n;
end $$;

-- The message text of the question, for the chat's language. The two buttons
-- are symbols only (see deliver_outbox). Staff-facing: "out" wording is fine.
alter function private.render_notification(text, jsonb, public.app_locale) rename to render_notification_ingredient;

create function private.render_notification(p_kind text, p_payload jsonb, p_locale public.app_locale) returns text
language plpgsql stable set search_path = '' as $$
declare
  l public.app_locale := coalesce(p_locale, 'hy');
  v_name text;
begin
  if p_kind <> 'ingredient.morning' then
    return private.render_notification_ingredient(p_kind, p_payload, p_locale);
  end if;
  v_name := coalesce(nullif(btrim(p_payload #>> array['names', l::text]), ''), nullif(btrim(p_payload #>> '{names,hy}'), ''), '?');
  return case l
    when 'hy' then '«' || v_name || E'»-ը երեկ չկար։ Այսօր կա՞։\n✅ կա՝ ոչինչ անել պետք չէ։ ❌ դեռ չկա՝ նշել, որ այսօր էլ չկա։'
    when 'ru' then '«' || v_name || E'» вчера не было. Сегодня есть?\n✅ есть, ничего не нужно. ❌ ещё нет, отметить, что и сегодня нет.'
    else '«' || v_name || E'» was out yesterday. Is it back today?\n✅ yes, nothing to do. ❌ not yet, mark it out again for today.'
  end;
end $$;

-- deliver_outbox: unchanged except that a Telegram message of the morning
-- question carries two inline buttons, y:<ingredient id> and n:<ingredient id>,
-- built from the id in the payload (never from text). They reach
-- private.bot_handle like every other press.

-- -----------------------------------------------------------------------------
-- Delivery
-- -----------------------------------------------------------------------------
create or replace function private.deliver_outbox(p_limit integer default 50) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_token text := private.secret('telegram_bot_token');
  v_base text := rtrim(private.secret('app_base_url'), '/');
  v_bypass text := private.secret('vercel_bypass_secret');
  v_push boolean := private.secret('app_base_url') is not null and private.secret('push_job_key') is not null;
  r record;
  v_text text;
  v_req bigint;
  v_n integer := 0;
begin
  update public.notification_outbox o set status = 'dead', last_error = 'channel_off', net_request_id = null
  from public.notification_channels c
  where c.id = o.channel_id and not c.is_active and o.status in ('pending', 'failed') and o.net_request_id is null;

  update public.notification_outbox o set status = 'dead', last_error = 'stale'
  from public.notification_channels c
  where c.id = o.channel_id
    and ((c.kind = 'telegram' and v_token is not null) or (c.kind = 'web_push' and v_push))
    and o.status in ('pending', 'failed') and o.net_request_id is null
    and o.created_at < now() - case when o.event in ('order.ready', 'service.call', 'service.bill')
                                    then interval '15 minutes' else interval '6 hours' end;

  for r in
    select o.id, o.event, o.payload, o.attempts, c.kind, c.telegram_chat_id, c.locale
    from public.notification_outbox o
    join public.notification_channels c on c.id = o.channel_id
    where o.status in ('pending', 'failed') and o.net_request_id is null and o.next_attempt_at <= now()
      and c.is_active
      and ((c.kind = 'telegram' and v_token is not null) or (c.kind = 'web_push' and v_push))
    order by o.id
    limit p_limit
    for update of o skip locked
  loop
    begin
      v_text := private.render_notification(r.event, r.payload, private.outbox_locale(r.payload, r.locale));
    exception when others then
      update public.notification_outbox set status = 'dead', last_error = left('render: ' || sqlerrm, 300) where id = r.id;
      continue;
    end;
    if r.kind = 'telegram' then
      v_req := net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        body := jsonb_build_object('chat_id', r.telegram_chat_id, 'text', v_text, 'disable_web_page_preview', true)
                || case when r.event = 'ingredient.morning' and (r.payload ->> 'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', jsonb_build_array(jsonb_build_array(
                               jsonb_build_object('text', '✅', 'callback_data', 'y:' || (r.payload ->> 'ingredient_id')),
                               jsonb_build_object('text', '❌', 'callback_data', 'n:' || (r.payload ->> 'ingredient_id'))))))
                        else '{}'::jsonb end,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 10000);
    else
      v_req := net.http_post(
        url := v_base || '/api/push',
        body := jsonb_build_object('id', r.id, 'attempt', r.attempts + 1, 'sig', private.push_sig(r.id, r.attempts + 1)),
        headers := jsonb_strip_nulls(jsonb_build_object('Content-Type', 'application/json',
                                                        'x-vercel-protection-bypass', v_bypass)),
        timeout_milliseconds := 15000);
    end if;
    update public.notification_outbox
    set net_request_id = v_req, attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes'
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;


-- The job: every five minutes (the window is 30 minutes after the business day starts).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'pativ-bot-ingredient-morning') then
      perform cron.unschedule('pativ-bot-ingredient-morning');
    end if;
    perform cron.schedule('pativ-bot-ingredient-morning', '*/5 * * * *', $job$select private.enqueue_ingredient_morning()$job$);
  else
    raise notice 'pg_cron is not available: pativ-bot-ingredient-morning is not scheduled';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing here is client-callable (api.search_ingredients keeps its
-- grant to authenticated; create or replace does not change it)
-- -----------------------------------------------------------------------------
revoke execute on function
  private.search_ingredients_core(uuid, uuid, text, integer, integer),
  private.business_date_of(uuid, timestamptz), private.bot_ingredient_is_out(uuid, uuid),
  private.bot_ingredient_label(uuid, public.app_locale), private.bot_ingredient_effects(uuid, uuid),
  private.bot_list(public.notification_channels, private.bot_pending, text),
  private.bot_next(public.notification_channels, uuid, private.bot_pending),
  private.bot_handle(bigint, text, text, text),
  private.bot_prepare_ingredient_out(public.notification_channels, uuid, jsonb),
  private.bot_apply_ingredient_out(public.notification_channels, uuid, jsonb),
  private.bot_undo_ingredient_out(public.notification_channels, uuid, private.bot_changes),
  private.ingredient_morning_channels(uuid), private.enqueue_ingredient_morning(timestamptz),
  private.render_notification_ingredient(text, jsonb, public.app_locale),
  private.render_notification(text, jsonb, public.app_locale),
  private.deliver_outbox(integer)
from public, anon, authenticated;
