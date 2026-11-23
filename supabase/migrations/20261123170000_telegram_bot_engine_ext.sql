-- Telegram manager bot (ADR-069), engine extension: a "category" (section) step,
-- read-only actions, and pickers that can list hidden things. Then the three
-- actions that needed them:
--   category   Category on / off   (steps {category}; flips categories.is_active)
--   report     Today's report      (kind 'read': no confirm, no history)
--   hide       now offers hidden items too, so "show" is reachable
--
-- Engine changes (docs/02-stack/telegram-bot.md):
--   steps       'category' joins item / number / choice. It asks for a section
--               (8 per page, like items) and stores data.category_id. Before an
--               'item' step it narrows the item list; the engine also inserts it
--               by itself for an item step on a menu of more than 24 dishes.
--   pick_inactive  true: the pickers also list inactive sections and hidden items,
--               marked off. Picking one is checked against the café, not against
--               is_active.
--   kind        'change' (default: steps, preview, confirm, history, undo) or
--               'read' (no steps, no pending row, no history: the engine calls
--               private.bot_read_<id> and shows the facts at once).

-- -----------------------------------------------------------------------------
-- Registry
-- -----------------------------------------------------------------------------
alter table private.bot_actions drop constraint bot_actions_steps_check;
alter table private.bot_actions add constraint bot_actions_steps_check
  check (steps <@ '{category,item,number,choice}'::text[]);
alter table private.bot_actions add column kind text not null default 'change'
  check (kind in ('change', 'read'));
alter table private.bot_actions add column pick_inactive boolean not null default false;
alter table private.bot_actions add constraint bot_actions_read_no_steps
  check (kind = 'change' or steps = '{}');

update private.bot_actions set steps = '{category}', pick_inactive = true, ready = true where id = 'category';
update private.bot_actions set kind = 'read', ready = true where id = 'report';
update private.bot_actions set pick_inactive = true where id = 'hide';

-- -----------------------------------------------------------------------------
-- Engine: bot_call accepts bot_read_<id>
-- -----------------------------------------------------------------------------
create or replace function private.bot_call(p_fn text, p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if p_fn !~ '^bot_(prepare|apply|ctx|read)_[a-z_]{2,24}$' then
    raise exception using errcode = '22023', message = 'invalid_bot_function';
  end if;
  if p_fn like 'bot_ctx\_%' and to_regprocedure(format('private.%I(public.notification_channels,uuid,jsonb)', p_fn)) is null then
    return '{}'::jsonb;
  end if;
  execute format('select private.%I($1, $2, $3)', p_fn) into v using p_ch, p_loc, p_data;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Engine: one page (8) of sections or items; hidden ones are marked off
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
-- Engine: next step (adds the 'category' step)
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
-- Engine: bot_handle (read-only kind, section step, pickers with hidden things)
-- Same as before except: verb 'a' answers a 'read' action at once; verb 'p'
-- accepts inactive sections and hidden items when the action says pick_inactive;
-- verb 'b' also steps back over a 'category' step.
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
-- Action: category (section) on / off. Same rule as the admin's
-- api.save_category(... p_is_active ...): categories.is_active. The guest menu
-- follows on publish, which the bot does as the linked account (like price, hide).
-- -----------------------------------------------------------------------------
create function private.bot_prepare_category(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cat uuid := (p_data ->> 'category_id')::uuid;
  v_on boolean;
begin
  select c.is_active into v_on from public.categories c
  where c.id = v_cat and c.restaurant_id = p_ch.restaurant_id;
  if v_on is null then
    return jsonb_build_object('error', 'not_found');
  end if;
  if private.menu_has_unreviewed_ai(p_loc) then
    return jsonb_build_object('error', 'unreviewed_ai');
  end if;
  return jsonb_build_object('category', private.bot_label('category', v_cat, coalesce(p_ch.bot_locale, 'hy')),
                            'active_now', v_on, 'to_active', not v_on,
                            'items', (select count(*) from public.items i where i.category_id = v_cat and i.is_active));
end $$;

create function private.bot_apply_category(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cat uuid := (p_data ->> 'category_id')::uuid;
  v_was boolean;
begin
  select c.is_active into v_was from public.categories c
  where c.id = v_cat and c.restaurant_id = p_ch.restaurant_id
  for update;
  if v_was is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  update public.categories set is_active = not v_was, updated_at = now() where id = v_cat;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return jsonb_build_object('entity', 'category', 'entity_id', v_cat,
    'label', private.bot_label('category', v_cat, coalesce(p_ch.bot_locale, 'hy')),
    'old', jsonb_build_object('active', v_was), 'new', jsonb_build_object('active', not v_was));
end $$;

-- Restores only while the section is still in the state the bot set.
create function private.bot_undo_category(p_ch public.notification_channels, p_loc uuid, p_change private.bot_changes) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_now boolean;
begin
  select c.is_active into v_now from public.categories c
  where c.id = p_change.entity_id and c.restaurant_id = p_ch.restaurant_id;
  if v_now is distinct from (p_change.new_value ->> 'active')::boolean then
    return false;
  end if;
  update public.categories set is_active = (p_change.old_value ->> 'active')::boolean, updated_at = now()
  where id = p_change.entity_id;
  perform private.publish_menu_core(p_loc, 'system', p_ch.created_by);
  return true;
end $$;

-- -----------------------------------------------------------------------------
-- Action: today's report (read-only). The numbers of the current business day in
-- the café's time zone, test orders and test bills left out. Orders, revenue and
-- average bill are private.day_summary_payload (the same numbers as the evening
-- summary); the top five dishes are counted the way the dashboard counts them
-- (accepted real orders, cancelled quantities taken off).
-- -----------------------------------------------------------------------------
create function private.bot_read_report(p_ch public.notification_channels, p_loc uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := private.business_date(p_loc);
  v_sum jsonb := private.day_summary_payload(p_loc, v_date);
  v_l public.app_locale := coalesce(p_ch.bot_locale, 'hy');
begin
  return jsonb_build_object(
    'date', to_char(v_date, 'DD.MM'),
    'orders', v_sum -> 'orders',
    'revenue', v_sum -> 'revenue',
    'avg_bill', v_sum -> 'average_bill',
    'top', (select coalesce(jsonb_agg(jsonb_build_object('name', t.n, 'qty', t.qty) order by t.qty desc, t.n), '[]'::jsonb)
            from (select private.pick_name((array_agg(oi.name_i18n order by oi.created_at desc))[1], v_l) as n,
                         sum(oi.quantity - oi.cancelled_quantity)::integer as qty
                  from public.order_items oi join public.orders o on o.id = oi.order_id
                  where o.location_id = p_loc and o.business_date = v_date
                    and o.status = 'accepted' and not o.is_test
                    and oi.quantity > oi.cancelled_quantity
                  group by coalesce(oi.item_id::text, oi.name_i18n ->> 'hy')
                  order by qty desc, n
                  limit 5) t));
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing here is client-callable.
-- -----------------------------------------------------------------------------
revoke execute on function
  private.bot_call(text, public.notification_channels, uuid, jsonb),
  private.bot_list(public.notification_channels, private.bot_pending, text),
  private.bot_next(public.notification_channels, uuid, private.bot_pending),
  private.bot_handle(bigint, text, text, text),
  private.bot_prepare_category(public.notification_channels, uuid, jsonb),
  private.bot_apply_category(public.notification_channels, uuid, jsonb),
  private.bot_undo_category(public.notification_channels, uuid, private.bot_changes),
  private.bot_read_report(public.notification_channels, uuid, jsonb)
from public, anon, authenticated;
