-- ADR-067: ready-made staff logins (a username and a password per waiter or
-- kitchen screen), created and managed by the café's owner or manager, with
-- no Supabase secret key in the app (ADR-038).
--
-- A staff login is an ordinary auth user with the synthetic address
-- <username>@staff.pativ.invalid, a `person` member with role waiter or
-- kitchen, and a row in public.staff_logins. Every waiter and kitchen function
-- already authorises through public.members (private.my_location_ids), so a
-- switched-off login (members.is_active = false) is refused by all of them at
-- once; its sessions are revoked and the auth user is banned as well.
-- The domain ends in .invalid, which can never be delivered to, and does not
-- end in @pativ.test, so the nightly purge of test cafés never matches it.

-- -----------------------------------------------------------------------------
-- Table
-- -----------------------------------------------------------------------------
create table public.staff_logins (
  member_id uuid primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  station_id uuid references public.stations (id) on delete set null,
  password_set boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, member_id) references public.members (restaurant_id, id) on delete cascade
);
create index staff_logins_restaurant_idx on public.staff_logins (restaurant_id);

alter table public.staff_logins enable row level security;
create policy staff_logins_read on public.staff_logins for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
revoke all on public.staff_logins from anon, authenticated;
grant select on public.staff_logins to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers (private: nobody but the api functions below can call them)
-- -----------------------------------------------------------------------------
create function private.staff_email_domain() returns text
language sql immutable set search_path = '' as $$ select 'staff.pativ.invalid' $$;

-- Sessions and refresh tokens of one user end now. Wrapped like
-- api.revoke_member: where the role has no privilege on the auth tables the
-- members.is_active / banned_until checks still hold.
create function private.revoke_user_sessions(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update auth.refresh_tokens set revoked = true
  where user_id = p_user::text and coalesce(revoked, false) = false;
  update auth.sessions set not_after = now()
  where user_id = p_user and (not_after is null or not_after > now());
exception when insufficient_privilege then
  raise warning 'sessions of % not revoked: no privilege on auth tables', p_user;
end $$;

-- Creates the auth user, the member and the login row. p_password null: a
-- random password that nobody ever sees (the owner sets one later).
create function private.make_staff_login(
  p_restaurant uuid,
  p_location uuid,
  p_role public.member_role,
  p_station uuid,
  p_suffix text,
  p_password text,
  p_created_by uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text;
  v_username text;
  v_email text;
  v_user uuid := gen_random_uuid();
  v_member uuid;
  v_hash text;
begin
  select r.slug into v_slug from public.restaurants r where r.id = p_restaurant;
  if p_suffix is null or p_suffix !~ '^[a-z0-9](?:[a-z0-9-]{0,13}[a-z0-9])?$' then
    raise exception using errcode = 'RS422', message = 'invalid_username';
  end if;
  v_username := v_slug || '-' || p_suffix;
  if v_username !~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' then
    raise exception using errcode = 'RS422', message = 'invalid_username';
  end if;
  if exists (select 1 from public.staff_logins s where s.username = v_username) then
    raise exception using errcode = 'RS409', message = 'username_taken';
  end if;
  v_email := v_username || '@' || private.staff_email_domain();
  v_hash := extensions.crypt(
    coalesce(p_password, translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')),
    extensions.gen_salt('bf', 10));

  begin
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email, v_hash, now(),
            '{"provider": "email", "providers": ["email"]}',
            jsonb_build_object('display_name', v_username, 'staff_login', true),
            now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_user::text, v_user,
            jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true),
            'email', null, now(), now());
  exception when unique_violation then
    -- Somebody registered this address on their own; we never adopt a user.
    raise exception using errcode = 'RS409', message = 'username_taken';
  end;

  insert into public.members (restaurant_id, user_id, role, kind, display_name, all_locations)
  values (p_restaurant, v_user, p_role, 'person', v_username, false)
  returning id into v_member;
  insert into public.member_locations (restaurant_id, member_id, location_id)
  values (p_restaurant, v_member, p_location);
  insert into public.staff_logins (member_id, restaurant_id, user_id, username, station_id, password_set, created_by)
  values (v_member, p_restaurant, v_user, v_username,
          case when p_role = 'kitchen' then p_station end, p_password is not null, p_created_by);
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (p_restaurant, case when p_created_by is null then 'system' else 'member' end::public.actor_kind,
          p_created_by, 'staff_login.created', 'member', v_member,
          jsonb_build_object('username', v_username, 'role', p_role));
  return jsonb_build_object('member_id', v_member, 'username', v_username);
end $$;

-- A new café gets one waiter and one kitchen login. Nobody knows their
-- passwords: the owner presses "Set a new password" to see one, once. A name
-- that is already taken (another café's custom ending, or an address somebody
-- registered) moves on to -2, -3 …; this never makes café creation fail.
create function private.create_default_staff_logins(p_restaurant uuid, p_location uuid, p_station uuid, p_created_by uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_role public.member_role;
  v_n integer;
begin
  foreach v_role in array array['waiter', 'kitchen']::public.member_role[] loop
    for v_n in 1..20 loop
      begin
        perform private.make_staff_login(p_restaurant, p_location, v_role, p_station,
                                         case when v_n = 1 then v_role::text else v_role::text || '-' || v_n end,
                                         null, p_created_by);
        exit;
      exception when sqlstate 'RS409' then
        null;
      end;
    end loop;
  end loop;
end $$;

-- The café creator creates the café; staff logins never do (they would
-- become the owner of a café of their own).
create or replace function api.create_restaurant(p_name text, p_slug text, p_location_name text, p_display_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_location uuid;
  v_station uuid;
  v_area uuid;
begin
  if not private.is_real_user() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if exists (select 1 from public.staff_logins s where s.user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  insert into public.restaurants (name, slug, created_by)
  values (p_name, p_slug, auth.uid()) returning id into v_restaurant;
  insert into public.locations (restaurant_id, name, slug)
  values (v_restaurant, p_location_name, 'main') returning id into v_location;
  insert into public.members (restaurant_id, user_id, role, display_name)
  values (v_restaurant, auth.uid(), 'owner', p_display_name);
  insert into public.stations (restaurant_id, location_id, name, is_default)
  values (v_restaurant, v_location, 'Kitchen', true) returning id into v_station;
  insert into public.prep_areas (restaurant_id, name) values (v_restaurant, 'Kitchen') returning id into v_area;
  insert into public.station_prep_areas (restaurant_id, location_id, prep_area_id, station_id)
  values (v_restaurant, v_location, v_area, v_station);
  insert into public.subscriptions (restaurant_id, location_id, plan, status, price_amd, trial_ends_at)
  values (v_restaurant, v_location, 'service', 'trialing', 0, now() + interval '30 days');
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, 'member', auth.uid(), 'restaurant.created', 'restaurant', v_restaurant);
  perform private.create_default_staff_logins(v_restaurant, v_location, v_station, auth.uid());
  return v_restaurant;
end $$;

-- -----------------------------------------------------------------------------
-- api: owner and manager
-- -----------------------------------------------------------------------------
-- p_suffix null: the role's name, then -2, -3 … until one is free.
create function api.create_staff_login(
  p_location_id uuid,
  p_role public.member_role,
  p_password text,
  p_suffix text default null,
  p_station_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_station uuid := p_station_id;
  v_n integer := 1;
  v_suffix text := nullif(lower(trim(p_suffix)), '');
  v_slug text;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_role not in ('waiter', 'kitchen') then
    raise exception using errcode = '22023', message = 'invalid_staff_role';
  end if;
  if p_password is null or char_length(p_password) < 8 or octet_length(p_password) > 72 then
    raise exception using errcode = 'RS422', message = 'weak_password';
  end if;
  select l.restaurant_id, r.slug into v_restaurant, v_slug
  from public.locations l join public.restaurants r on r.id = l.restaurant_id where l.id = p_location_id;

  if p_role = 'kitchen' then
    if v_station is null then
      select s.id into v_station from public.stations s
      where s.location_id = p_location_id order by s.is_default desc, s.sort, s.name limit 1;
    elsif not exists (select 1 from public.stations s where s.id = v_station and s.location_id = p_location_id) then
      raise exception using errcode = '42501', message = 'forbidden';
    end if;
  end if;

  if v_suffix is null then
    while exists (select 1 from public.staff_logins s
                  where s.username = v_slug || '-' || case when v_n = 1 then p_role::text else p_role::text || '-' || v_n end)
          and v_n < 50 loop
      v_n := v_n + 1;
    end loop;
    v_suffix := case when v_n = 1 then p_role::text else p_role::text || '-' || v_n end;
  end if;

  return private.make_staff_login(v_restaurant, p_location_id, p_role, v_station, v_suffix, p_password, auth.uid());
end $$;

-- Owner or manager of the café that holds this login; returns the login row.
create function private.assert_staff_login_manager(p_member_id uuid) returns public.staff_logins
language plpgsql stable security definer set search_path = '' as $$
declare
  v_login public.staff_logins;
begin
  select * into v_login from public.staff_logins s where s.member_id = p_member_id;
  if not found
     or not exists (select 1 from private.my_restaurant_ids('{owner,manager}') x where x = v_login.restaurant_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return v_login;
end $$;

create function api.set_staff_password(p_member_id uuid, p_password text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_login public.staff_logins := private.assert_staff_login_manager(p_member_id);
begin
  if p_password is null or char_length(p_password) < 8 or octet_length(p_password) > 72 then
    raise exception using errcode = 'RS422', message = 'weak_password';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)), updated_at = now()
  where id = v_login.user_id;
  update public.staff_logins set password_set = true where member_id = v_login.member_id;
  perform private.revoke_user_sessions(v_login.user_id);
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_login.restaurant_id, 'member', auth.uid(), 'staff_login.password_set', 'member', v_login.member_id,
          jsonb_build_object('username', v_login.username));
end $$;

create function api.set_staff_login_active(p_member_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_login public.staff_logins := private.assert_staff_login_manager(p_member_id);
begin
  update public.members set is_active = p_active where id = v_login.member_id;
  update auth.users
  set banned_until = case when p_active then null else now() + interval '100 years' end, updated_at = now()
  where id = v_login.user_id;
  if not p_active then
    perform private.revoke_user_sessions(v_login.user_id);
  end if;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_login.restaurant_id, 'member', auth.uid(),
          case when p_active then 'staff_login.enabled' else 'staff_login.disabled' end, 'member', v_login.member_id,
          jsonb_build_object('username', v_login.username));
end $$;

-- The "Staff logins" list as a JSON array, with the last sign-in (it lives in auth.users).
create function api.list_staff_logins(p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'member_id', s.member_id, 'username', s.username, 'role', m.role,
             'station_id', s.station_id, 'station_name', st.name, 'is_active', m.is_active,
             'password_set', s.password_set, 'last_sign_in_at', u.last_sign_in_at, 'created_at', s.created_at)
           order by s.created_at, s.username)
    from public.staff_logins s
    join public.members m on m.id = s.member_id
    join public.member_locations ml on ml.member_id = m.id and ml.location_id = p_location_id
    left join public.stations st on st.id = s.station_id
    left join auth.users u on u.id = s.user_id
  ), '[]'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- api: the staff login itself
-- -----------------------------------------------------------------------------
-- Where this login lands after signing in. Null for everyone else.
create function api.my_staff_login() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'role', m.role,
           'station_id', case when m.role = 'kitchen' then coalesce(
              (select st.id from public.stations st where st.id = s.station_id),
              (select st2.id from public.stations st2 join public.member_locations ml on ml.location_id = st2.location_id
               where ml.member_id = m.id order by st2.is_default desc, st2.sort, st2.name limit 1)) end)
  from public.staff_logins s
  join public.members m on m.id = s.member_id and m.is_active
  where s.user_id = auth.uid() and private.is_real_user()
$$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing is callable until granted by name
-- -----------------------------------------------------------------------------
revoke execute on function
  private.staff_email_domain(), private.revoke_user_sessions(uuid),
  private.make_staff_login(uuid, uuid, public.member_role, uuid, text, text, uuid),
  private.create_default_staff_logins(uuid, uuid, uuid, uuid), private.assert_staff_login_manager(uuid),
  api.create_staff_login(uuid, public.member_role, text, text, uuid), api.set_staff_password(uuid, text),
  api.set_staff_login_active(uuid, boolean), api.list_staff_logins(uuid), api.my_staff_login()
from public, anon, authenticated;
grant execute on function
  api.create_staff_login(uuid, public.member_role, text, text, uuid), api.set_staff_password(uuid, text),
  api.set_staff_login_active(uuid, boolean), api.list_staff_logins(uuid), api.my_staff_login()
to authenticated;
