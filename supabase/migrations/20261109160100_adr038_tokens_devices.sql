-- ADR-038: the app never holds the Supabase secret key.
-- Table QR tokens are signed and checked here with keys in Vault; guests,
-- devices and invited staff call api.* functions that check the caller
-- themselves. Keys are generated inside the database, so nobody sees them.

-- -----------------------------------------------------------------------------
-- Encoding helpers
-- -----------------------------------------------------------------------------
create function private.b64url(p bytea) returns text
language sql immutable set search_path = '' as $$
  select translate(replace(encode(p, 'base64'), E'\n', ''), '+/=', '-_')
$$;

create function private.b64url_decode(p text) returns bytea
language sql immutable set search_path = '' as $$
  select decode(rpad(translate(p, '-_', '+/'), ((length(p) + 3) / 4) * 4, '='), 'base64')
$$;

-- -----------------------------------------------------------------------------
-- QR signing keys (secret material lives in Vault as qr_key_<kid>)
-- -----------------------------------------------------------------------------
create table private.qr_keys (
  kid smallint primary key check (kid between 1 and 255),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create unique index qr_keys_one_current on private.qr_keys (is_current) where is_current;
alter table private.qr_keys enable row level security;

create function private.qr_key(p_kid smallint) returns bytea
language sql stable security definer set search_path = '' as $$
  select decode(s.decrypted_secret, 'base64') from vault.decrypted_secrets s where s.name = 'qr_key_' || p_kid
$$;

-- New prints use the new key; stickers signed with older keys keep working
-- until their key is retired (set retired_at).
create function private.rotate_qr_key() returns smallint
language plpgsql security definer set search_path = '' as $$
declare
  v_kid smallint;
begin
  select coalesce(max(kid), 0) + 1 into v_kid from private.qr_keys;
  perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'qr_key_' || v_kid,
                              'Table QR signing key ' || v_kid || ' (ADR-038)');
  update private.qr_keys set is_current = false where is_current;
  insert into private.qr_keys (kid, is_current) values (v_kid, true);
  return v_kid;
end $$;

do $$ begin
  if not exists (select 1 from private.qr_keys) then
    perform private.rotate_qr_key();
  end if;
end $$;

-- Token (ADR-006): version 1 byte, kid 1 byte, table id 16 bytes, qr_version
-- 4 bytes big-endian, then the first 12 bytes of HMAC-SHA256 over those 22.
-- 34 bytes, 46 base64url characters.
create function private.sign_table_token(p_table_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_kid smallint;
  v_qr integer;
  v_key bytea;
  v_body bytea;
begin
  select k.kid into v_kid from private.qr_keys k where k.is_current and k.retired_at is null;
  if v_kid is null then
    raise exception using errcode = 'RS500', message = 'no_current_qr_key';
  end if;
  select t.qr_version into v_qr from public.tables t where t.id = p_table_id;
  if v_qr is null then
    raise exception using errcode = 'RS404', message = 'table_not_found';
  end if;
  v_key := private.qr_key(v_kid);
  if v_key is null then
    raise exception using errcode = 'RS500', message = 'qr_key_missing';
  end if;
  v_body := '\x01'::bytea || set_byte('\x00'::bytea, 0, v_kid)
            || decode(replace(p_table_id::text, '-', ''), 'hex') || int4send(v_qr);
  return private.b64url(v_body || substring(extensions.hmac(v_body, v_key, 'sha256') from 1 for 12));
end $$;

create function private.verify_table_token(p_token text) returns table (table_id uuid, qr_version integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_raw bytea;
  v_body bytea;
  v_kid integer;
  v_key bytea;
  v_table uuid;
  v_qr integer;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{46}$' then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  v_raw := private.b64url_decode(p_token);
  if length(v_raw) <> 34 or get_byte(v_raw, 0) <> 1 then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  v_kid := get_byte(v_raw, 1);
  if not exists (select 1 from private.qr_keys k where k.kid = v_kid and k.retired_at is null) then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  v_key := private.qr_key(v_kid::smallint);
  v_body := substring(v_raw from 1 for 22);
  if v_key is null
     or substring(extensions.hmac(v_body, v_key, 'sha256') from 1 for 12) <> substring(v_raw from 23 for 12) then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  v_table := encode(substring(v_raw from 3 for 16), 'hex')::uuid;
  v_qr := (get_byte(v_raw, 18) << 24) | (get_byte(v_raw, 19) << 16) | (get_byte(v_raw, 20) << 8) | get_byte(v_raw, 21);
  if not exists (select 1 from public.tables t where t.id = v_table and t.qr_version = v_qr and t.is_active) then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  table_id := v_table;
  qr_version := v_qr;
  return next;
end $$;

-- Owners and managers print QR cards.
create function api.table_qr_token(p_table_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_location uuid;
begin
  select t.location_id into v_location from public.tables t where t.id = p_table_id;
  if v_location is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_location, '{owner,manager}');
  return private.sign_table_token(p_table_id);
end $$;

-- The scan page: anyone may ask which café and table a token belongs to.
create function api.resolve_table_token(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
           'restaurant_slug', r.slug,
           'restaurant_name', r.name,
           'location_slug', l.slug,
           'location_id', l.id,
           'table_id', t.id,
           'table_label', t.label,
           'guest_locales', to_jsonb(l.guest_locales),
           'default_locale', r.default_locale)
    into v
  from private.verify_table_token(p_token) x
  join public.tables t on t.id = x.table_id
  join public.locations l on l.id = t.location_id
  join public.restaurants r on r.id = l.restaurant_id
  where l.status = 'active' and r.status = 'active';
  if v is null then
    raise exception using errcode = 'RS403', message = 'invalid_table_token';
  end if;
  return v;
end $$;

-- -----------------------------------------------------------------------------
-- Guests: their anonymous session calls these directly
-- -----------------------------------------------------------------------------
create function api.guest_join_table(p_token text, p_locale public.app_locale) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_table uuid;
  v_qr integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select x.table_id, x.qr_version into v_table, v_qr from private.verify_table_token(p_token) x;
  return private.join_table(auth.uid(), v_table, v_qr, p_locale);
end $$;

create function api.guest_place_order(
  p_guest_session_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return private.place_guest_order(auth.uid(), p_guest_session_id, p_idempotency_key, p_lines, p_note);
end $$;

-- -----------------------------------------------------------------------------
-- Devices: a kitchen screen or waiter tablet signs in anonymously, then
-- redeems the code the owner shows in the admin.
-- -----------------------------------------------------------------------------
create function private.pairing_hash(p_code text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_key bytea;
begin
  select decode(s.decrypted_secret, 'base64') into v_key from vault.decrypted_secrets s where s.name = 'pairing_key';
  if v_key is null then
    raise exception using errcode = 'RS500', message = 'pairing_key_missing';
  end if;
  return encode(extensions.hmac(convert_to(p_code, 'UTF8'), v_key, 'sha256'), 'hex');
end $$;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pairing_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'pairing_key',
                                'Device pairing code key (ADR-038)');
  end if;
end $$;

create function api.create_device_pairing(p_location_id uuid, p_role public.member_role, p_label text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_code text;
  v_hash text;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_role not in ('waiter', 'kitchen') then
    raise exception using errcode = '22023', message = 'invalid_device_role';
  end if;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  loop
    v_code := lpad((abs(('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 1000000)::text, 6, '0');
    v_hash := private.pairing_hash(v_code);
    exit when not exists (select 1 from public.device_pairings d where d.code_hash = v_hash);
  end loop;
  insert into public.device_pairings (restaurant_id, location_id, role, label, code_hash, expires_at, created_by)
  values (v_restaurant, p_location_id, p_role, p_label, v_hash, now() + interval '10 minutes', auth.uid());
  return v_code;
end $$;

-- Wrong codes come back as data, not as errors: an error would roll back the
-- rate-limit counter with it, and brute force would never be counted.
create function api.redeem_device_pairing(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pair public.device_pairings;
  v_member uuid;
  v_ip text;
  v_station uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('error', 'anonymous_session_required');
  end if;
  if not private.rate_limit_hit('pair:user:' || auth.uid(), 5, interval '10 minutes') then
    return jsonb_build_object('error', 'rate_limited');
  end if;
  v_ip := nullif(split_part(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ''), ',', 1), '');
  if v_ip is not null and not private.rate_limit_hit('pair:ip:' || v_ip, 20, interval '10 minutes') then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  select * into v_pair from public.device_pairings d
  where d.code_hash = private.pairing_hash(coalesce(p_code, ''))
    and d.consumed_at is null
    and d.expires_at > now()
  for update;
  if not found then
    return jsonb_build_object('error', 'invalid_pairing_code');
  end if;

  insert into public.members (restaurant_id, user_id, role, kind, display_name, all_locations)
  values (v_pair.restaurant_id, auth.uid(), v_pair.role, 'device', v_pair.label, false)
  on conflict (restaurant_id, user_id) do update
    set role = excluded.role, kind = 'device', display_name = excluded.display_name,
        is_active = true, all_locations = false
  returning id into v_member;
  insert into public.member_locations (restaurant_id, member_id, location_id)
  values (v_pair.restaurant_id, v_member, v_pair.location_id)
  on conflict do nothing;
  update public.device_pairings set consumed_at = now(), member_id = v_member where id = v_pair.id;

  select s.id into v_station from public.stations s where s.location_id = v_pair.location_id and s.is_default limit 1;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_pair.restaurant_id, 'member', auth.uid(), 'device.paired', 'member', v_member);
  return jsonb_build_object('member_id', v_member, 'role', v_pair.role, 'location_id', v_pair.location_id,
                            'station_id', v_station);
end $$;

-- Staff helpers accept an anonymous user only when it's an active device.
create or replace function private.is_real_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
          or exists (select 1 from public.members m
                     where m.user_id = auth.uid() and m.kind = 'device' and m.is_active))
$$;

-- Owners revoke anyone but an owner; managers revoke devices. RLS denies at
-- once (is_active); the session can't be refreshed either.
create function api.revoke_member(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_m public.members;
begin
  select * into v_m from public.members where id = p_member_id;
  if not found
     or (not exists (select 1 from private.my_restaurant_ids('{owner}') x where x = v_m.restaurant_id)
         and not (v_m.kind = 'device'
                  and exists (select 1 from private.my_restaurant_ids('{manager}') x where x = v_m.restaurant_id))) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if v_m.role = 'owner' then
    raise exception using errcode = 'RS403', message = 'cannot_revoke_owner';
  end if;
  update public.members set is_active = false where id = p_member_id;
  begin
    update auth.refresh_tokens set revoked = true
    where user_id = v_m.user_id::text and coalesce(revoked, false) = false;
    update auth.sessions set not_after = now()
    where user_id = v_m.user_id and (not_after is null or not_after > now());
  exception when insufficient_privilege then
    raise warning 'sessions of % not revoked: no privilege on auth tables', v_m.user_id;
  end;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_m.restaurant_id, 'member', auth.uid(), 'member.revoked', 'member', p_member_id);
end $$;

-- -----------------------------------------------------------------------------
-- Invitations: a link the owner shares; email binding is optional
-- -----------------------------------------------------------------------------
alter table public.invitations alter column email drop not null;

create function api.create_invitation(
  p_restaurant_id uuid,
  p_role public.member_role,
  p_location_id uuid default null,
  p_email text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_token text;
begin
  if not exists (select 1 from private.my_restaurant_ids('{owner}') x where x = p_restaurant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_location_id is not null
     and not exists (select 1 from public.locations l where l.id = p_location_id and l.restaurant_id = p_restaurant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  v_token := private.b64url(extensions.gen_random_bytes(24));
  insert into public.invitations (restaurant_id, email, role, location_id, token_hash, invited_by, expires_at)
  values (p_restaurant_id, lower(nullif(trim(p_email), '')), p_role, p_location_id,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(), now() + interval '7 days');
  return v_token;
end $$;

create function api.accept_invitation(p_token text, p_display_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_inv public.invitations;
  v_member uuid;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  select * into v_inv from public.invitations i
  where i.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
    and i.accepted_at is null
    and i.expires_at > now()
  for update;
  if not found then
    raise exception using errcode = 'RS403', message = 'invitation_invalid';
  end if;
  if v_inv.email is not null and lower(coalesce(auth.jwt() ->> 'email', '')) <> v_inv.email then
    raise exception using errcode = 'RS403', message = 'invitation_email_mismatch';
  end if;
  insert into public.members (restaurant_id, user_id, role, kind, display_name, all_locations)
  values (v_inv.restaurant_id, auth.uid(), v_inv.role, 'person', p_display_name, v_inv.location_id is null)
  on conflict (restaurant_id, user_id) do nothing
  returning id into v_member;
  if v_member is null then
    raise exception using errcode = 'RS409', message = 'already_member';
  end if;
  if v_inv.location_id is not null then
    insert into public.member_locations (restaurant_id, member_id, location_id)
    values (v_inv.restaurant_id, v_member, v_inv.location_id);
  end if;
  update public.invitations set accepted_at = now() where id = v_inv.id;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_inv.restaurant_id, 'member', auth.uid(), 'invitation.accepted', 'member', v_member);
  return v_member;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing new is callable until granted by name
-- -----------------------------------------------------------------------------
revoke execute on function
  private.b64url(bytea), private.b64url_decode(text), private.qr_key(smallint), private.rotate_qr_key(),
  private.sign_table_token(uuid), private.verify_table_token(text), private.pairing_hash(text),
  api.table_qr_token(uuid), api.resolve_table_token(text),
  api.guest_join_table(text, public.app_locale), api.guest_place_order(uuid, uuid, jsonb, text),
  api.create_device_pairing(uuid, public.member_role, text), api.redeem_device_pairing(text),
  api.revoke_member(uuid), api.create_invitation(uuid, public.member_role, uuid, text),
  api.accept_invitation(text, text)
from public, anon, authenticated;

grant execute on function api.resolve_table_token(text) to anon, authenticated;
grant execute on function
  api.table_qr_token(uuid),
  api.guest_join_table(text, public.app_locale), api.guest_place_order(uuid, uuid, jsonb, text),
  api.create_device_pairing(uuid, public.member_role, text), api.redeem_device_pairing(text),
  api.revoke_member(uuid), api.create_invitation(uuid, public.member_role, uuid, text),
  api.accept_invitation(text, text)
to authenticated;
