-- Game rewards (ADR-075): the owner can switch on a small reward for guests who
-- reach a level in a waiting-room game while their order is prepared. Off by
-- default. The reward is "N percent off" or a short promo text; the waiter
-- verifies it and applies it (this migration never changes a bill or a price).
--   * public.game_reward_settings: one row per café location (owner and
--     manager read; only api.set_game_rewards writes).
--   * public.game_reward_claims: one row per order at most. Staff of the
--     location read; guests have no access to the table, they read their own
--     claim through api.guest_game_reward. Only the api functions write.
--   * api.set_game_rewards      owner or manager
--   * api.guest_game_reward     a guest: the café's reward and their claim
--   * api.claim_game_reward     a guest: "I reached level N" (idempotent)
--   * api.resolve_game_reward   staff: applied or dismissed (audit_log)
-- Reuses private.clean_promo_text from 20261123165000_promos.

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------
create table public.game_reward_settings (
  location_id uuid primary key,
  restaurant_id uuid not null,
  game_rewards_on boolean not null default false,
  reward_kind text not null default 'percent' check (reward_kind in ('percent', 'text')),
  reward_level integer not null default 5 check (reward_level between 2 and 50),
  reward_percent integer check (reward_percent between 1 and 50),
  reward_text jsonb not null default '{}',   -- {"hy": "...", "ru": "...", "en": "..."}; hy required when kind = text and on
  reward_game text check (reward_game in ('runner', 'fighter', 'merge', 'slice', 'platformer')),   -- null: any game
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  constraint game_reward_text_shape check (jsonb_typeof(reward_text) = 'object'),
  constraint game_reward_ready check (
    not game_rewards_on
    or (reward_kind = 'percent' and reward_percent is not null)
    or (reward_kind = 'text' and nullif(btrim(coalesce(reward_text ->> 'hy', '')), '') is not null)
  )
);

alter table public.game_reward_settings enable row level security;
create policy game_reward_settings_read on public.game_reward_settings for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
revoke all on public.game_reward_settings from anon, authenticated;
grant select on public.game_reward_settings to authenticated;

-- -----------------------------------------------------------------------------
-- Claims
-- -----------------------------------------------------------------------------
create table public.game_reward_claims (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  order_id uuid not null unique,             -- one reward per order
  table_session_id uuid,
  table_id uuid,
  table_label text,
  guest_session_id uuid,
  game text not null check (game in ('runner', 'fighter', 'merge', 'slice', 'platformer')),
  level integer not null check (level between 1 and 100),
  reward jsonb not null,                     -- snapshot: {"kind", "percent", "text"} as the café had it then
  claimed_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users (id) on delete set null,
  dismissed_at timestamptz,
  dismissed_by uuid references auth.users (id) on delete set null,
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  constraint game_reward_one_outcome check (applied_at is null or dismissed_at is null)
);
create index game_reward_claims_open_idx on public.game_reward_claims (location_id, claimed_at desc)
  where applied_at is null and dismissed_at is null;

alter table public.game_reward_claims enable row level security;
create policy game_reward_claims_read on public.game_reward_claims for select to authenticated
  using (location_id in (select private.my_location_ids()));
revoke all on public.game_reward_claims from anon, authenticated;
grant select on public.game_reward_claims to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers (private)
-- -----------------------------------------------------------------------------

-- The guest session behind the call, checked the way api.guest_service_request
-- does: the caller owns it, it is live, and the table and café are still valid.
create function private.reward_guest(p_guest_session_id uuid) returns public.guest_sessions
language plpgsql stable security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> auth.uid() or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'table_unavailable';
  end if;
  return v_guest;
end $$;

-- What a guest sees of a claim. The status is the waiter's side of it.
create function private.reward_claim_json(p_claim public.game_reward_claims) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_claim.id, 'game', p_claim.game, 'level', p_claim.level,
    'kind', p_claim.reward ->> 'kind', 'percent', p_claim.reward -> 'percent', 'text', p_claim.reward -> 'text',
    'status', case when p_claim.applied_at is not null then 'applied'
                   when p_claim.dismissed_at is not null then 'dismissed' else 'open' end)
$$;

-- -----------------------------------------------------------------------------
-- Owner and manager: the settings
-- -----------------------------------------------------------------------------
create function api.set_game_rewards(
  p_location_id uuid,
  p_on boolean,
  p_kind text,
  p_level integer,
  p_percent integer default null,
  p_text jsonb default null,
  p_game text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_text jsonb;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_on is null or p_kind is null or p_kind not in ('percent', 'text') then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  if p_level is null or p_level not between 2 and 50 then
    raise exception using errcode = '22023', message = 'invalid_level';
  end if;
  if p_percent is not null and p_percent not between 1 and 50 then
    raise exception using errcode = '22023', message = 'invalid_percent';
  end if;
  if p_game is not null and p_game not in ('runner', 'fighter', 'merge', 'slice', 'platformer') then
    raise exception using errcode = '22023', message = 'invalid_game';
  end if;
  v_text := private.clean_promo_text(p_text, 80, false);
  if p_on and p_kind = 'percent' and p_percent is null then
    raise exception using errcode = '22023', message = 'invalid_percent';
  end if;
  if p_on and p_kind = 'text' and not (v_text ? 'hy') then
    raise exception using errcode = '22023', message = 'name_required';
  end if;

  select restaurant_id into v_restaurant from public.locations where id = p_location_id;
  insert into public.game_reward_settings
    (location_id, restaurant_id, game_rewards_on, reward_kind, reward_level, reward_percent, reward_text,
     reward_game, updated_by, updated_at)
  values (p_location_id, v_restaurant, p_on, p_kind, p_level, p_percent, v_text, p_game, auth.uid(), now())
  on conflict (location_id) do update
  set game_rewards_on = excluded.game_rewards_on, reward_kind = excluded.reward_kind,
      reward_level = excluded.reward_level, reward_percent = excluded.reward_percent,
      reward_text = excluded.reward_text, reward_game = excluded.reward_game,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'game_rewards.updated', 'location', p_location_id,
          jsonb_build_object('on', p_on, 'kind', p_kind, 'level', p_level, 'percent', p_percent,
                             'text', v_text, 'game', p_game));
end $$;

-- -----------------------------------------------------------------------------
-- Guest: what the café offers, and their own claim for this order
-- -----------------------------------------------------------------------------
create function api.guest_game_reward(p_guest_session_id uuid, p_order_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_set public.game_reward_settings;
  v_claim public.game_reward_claims;
begin
  v_guest := private.reward_guest(p_guest_session_id);
  if p_order_id is not null then
    select c.* into v_claim from public.game_reward_claims c
    join public.orders o on o.id = c.order_id
    where c.order_id = p_order_id and o.guest_session_id = v_guest.id;
  end if;
  select * into v_set from public.game_reward_settings where location_id = v_guest.location_id;
  if (not found or not v_set.game_rewards_on) and v_claim.id is null then
    return jsonb_build_object('on', false);
  end if;
  return jsonb_build_object(
    'on', coalesce(v_set.game_rewards_on, false),
    'kind', v_set.reward_kind, 'level', v_set.reward_level, 'percent', v_set.reward_percent,
    'text', v_set.reward_text, 'game', v_set.reward_game,
    'claim', case when v_claim.id is not null then private.reward_claim_json(v_claim) end);
end $$;

-- -----------------------------------------------------------------------------
-- Guest: "I reached level N". The level is reported by the phone, so it can be
-- faked: the waiter looks and applies the reward, and the checks below keep it
-- sane (one per order, only while the order is open and has been waiting a
-- moment, a hard maximum, a rate limit). Repeating the call returns the same claim.
-- -----------------------------------------------------------------------------
create function api.claim_game_reward(p_guest_session_id uuid, p_order_id uuid, p_game text, p_level integer)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_order public.orders;
  v_set public.game_reward_settings;
  v_claim public.game_reward_claims;
  v_label text;
begin
  v_guest := private.reward_guest(p_guest_session_id);
  if p_game is null or p_game not in ('runner', 'fighter', 'merge', 'slice', 'platformer')
     or p_level is null or p_level not between 1 and 100 then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and guest_session_id = v_guest.id;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  -- Already claimed: the same reward, whatever the settings are now.
  select * into v_claim from public.game_reward_claims where order_id = v_order.id;
  if found then
    return private.reward_claim_json(v_claim);
  end if;

  if v_order.status not in ('placed', 'accepted') or v_order.served_at is not null or v_order.paid_at is not null then
    raise exception using errcode = 'RS409', message = 'order_not_open';
  end if;
  if now() < v_order.placed_at + interval '15 seconds' then
    raise exception using errcode = 'RS422', message = 'too_early';
  end if;

  select * into v_set from public.game_reward_settings where location_id = v_order.location_id;
  if not found or not v_set.game_rewards_on then
    raise exception using errcode = 'RS422', message = 'rewards_off';
  end if;
  if v_set.reward_game is not null and v_set.reward_game <> p_game then
    raise exception using errcode = 'RS422', message = 'game_not_eligible';
  end if;
  if p_level < v_set.reward_level then
    raise exception using errcode = 'RS422', message = 'level_too_low';
  end if;

  if not private.rate_limit_hit('reward:guest:' || v_guest.id, 10, interval '10 minutes') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  select label into v_label from public.tables where id = v_order.table_id;
  insert into public.game_reward_claims
    (restaurant_id, location_id, order_id, table_session_id, table_id, table_label, guest_session_id,
     game, level, reward)
  values (v_order.restaurant_id, v_order.location_id, v_order.id, v_order.table_session_id, v_order.table_id,
          v_label, v_guest.id, p_game, p_level,
          jsonb_build_object('kind', v_set.reward_kind, 'percent', v_set.reward_percent, 'text', v_set.reward_text))
  on conflict (order_id) do nothing
  returning * into v_claim;
  if v_claim.id is null then
    -- Another phone at the table claimed at the same moment.
    select * into v_claim from public.game_reward_claims where order_id = v_order.id;
    return private.reward_claim_json(v_claim);
  end if;

  perform realtime.send(jsonb_build_object('id', v_claim.id, 'table_id', v_claim.table_id, 'status', 'open'),
                        'reward', 'loc:' || v_claim.location_id, true);
  return private.reward_claim_json(v_claim);
end $$;

-- -----------------------------------------------------------------------------
-- Staff: applied or dismissed. Applied only records that the waiter gave the
-- reward (there is no bill discount function yet); the audit entry says who.
-- Repeating the same answer is fine; the opposite one is refused.
-- -----------------------------------------------------------------------------
create function api.resolve_game_reward(p_claim_id uuid, p_action text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_claim public.game_reward_claims;
begin
  if p_action is null or p_action not in ('applied', 'dismissed') then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select * into v_claim from public.game_reward_claims where id = p_claim_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_claim.location_id, '{owner,manager,waiter,cashier}');

  if v_claim.applied_at is not null or v_claim.dismissed_at is not null then
    if (p_action = 'applied') = (v_claim.applied_at is not null) then
      return;
    end if;
    raise exception using errcode = 'RS409', message = 'already_handled';
  end if;

  if p_action = 'applied' then
    update public.game_reward_claims set applied_at = now(), applied_by = auth.uid() where id = v_claim.id;
  else
    update public.game_reward_claims set dismissed_at = now(), dismissed_by = auth.uid() where id = v_claim.id;
  end if;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_claim.restaurant_id, v_claim.location_id, 'member', auth.uid(),
          case when p_action = 'applied' then 'game_reward.applied' else 'game_reward.dismissed' end,
          'game_reward_claim', v_claim.id,
          jsonb_build_object('order_id', v_claim.order_id, 'table', v_claim.table_label, 'level', v_claim.level,
                             'game', v_claim.game, 'reward', v_claim.reward));
  perform realtime.send(jsonb_build_object('id', v_claim.id, 'table_id', v_claim.table_id, 'status', p_action),
                        'reward', 'loc:' || v_claim.location_id, true);
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing is callable until granted by name. Guests are signed-in
-- anonymous users (the authenticated role); anon cannot call any of them.
-- -----------------------------------------------------------------------------
revoke execute on function private.reward_guest(uuid) from public, anon, authenticated;
revoke execute on function private.reward_claim_json(public.game_reward_claims) from public, anon, authenticated;
revoke execute on function api.set_game_rewards(uuid, boolean, text, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function api.set_game_rewards(uuid, boolean, text, integer, integer, jsonb, text) to authenticated;
revoke execute on function api.guest_game_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function api.guest_game_reward(uuid, uuid) to authenticated;
revoke execute on function api.claim_game_reward(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function api.claim_game_reward(uuid, uuid, text, integer) to authenticated;
revoke execute on function api.resolve_game_reward(uuid, text) from public, anon, authenticated;
grant execute on function api.resolve_game_reward(uuid, text) to authenticated;
