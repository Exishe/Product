-- POS connection (ADR-093): every accepted order round goes into the café's
-- own POS (iiko, Syrve, Poster, a webhook, or the built-in Test POS), so a
-- waiter never types an order twice. The POS keeps printing the kitchen
-- ticket, the bill and the fiscal receipt.
--
-- Same shape as web push (ADR-035, ADR-038): acceptance queues a row in
-- pos_outbox with a vendor-neutral payload; the 10-second notification job
-- pokes the app's /api/pos with the row id signed by a Vault key; the route
-- claims the row with that signature (api.pos_claim gives it the payload, the
-- settings and the connection's secret), calls the vendor and reports back
-- (api.pos_report). The app still holds no Supabase secret key, and the
-- vendor's key lives only in Vault.

select private.ensure_random_secret('pos_job_key', 'Signs pos_outbox row ids for /api/pos (private.pos_sig)');

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
-- One connection per location (so at most one active). The secret is in Vault
-- as pos_secret_<id>; has_secret only says whether one was saved.
create table public.pos_connections (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  vendor text not null check (vendor in ('test', 'webhook', 'iiko', 'syrve', 'poster')),
  is_active boolean not null default false,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and pg_column_size(settings) <= 4000),
  has_secret boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
create unique index pos_connections_one_active on public.pos_connections (location_id) where is_active;

-- Pativ dish → POS product. modifiers: {"<pativ modifier id>": {"external_id": "...", "group_id": "..."|null}}
-- (group_id: iiko's productGroupId of a group modifier, or Poster's dish
-- modification set; null for a simple iiko modifier or a Poster product modificator).
create table public.pos_item_links (
  connection_id uuid not null,
  restaurant_id uuid not null,
  item_id uuid not null,
  external_id text not null check (char_length(external_id) between 1 and 64),
  external_name text check (char_length(external_name) <= 200),
  modifiers jsonb not null default '{}' check (jsonb_typeof(modifiers) = 'object'),
  auto_matched boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (connection_id, item_id),
  foreign key (restaurant_id, connection_id) references public.pos_connections (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade
);
create index pos_item_links_item_idx on public.pos_item_links (item_id);

-- Pativ table → POS table (iiko's tableIds).
create table public.pos_table_links (
  connection_id uuid not null,
  restaurant_id uuid not null,
  table_id uuid not null,
  external_table_id text not null check (char_length(external_table_id) between 1 and 64),
  external_name text check (char_length(external_name) <= 120),
  primary key (connection_id, table_id),
  foreign key (restaurant_id, connection_id) references public.pos_connections (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id) on delete cascade
);
create index pos_table_links_table_idx on public.pos_table_links (table_id);

-- One row per accepted order round (or one "Send test order").
-- pending: due at next_attempt_at; sending: a POST to /api/pos is out
-- (lease_until); sent; failed: retried at next_attempt_at ('infinity' when
-- retrying cannot help, e.g. unmapped dishes); dead: gave up; skipped: the
-- connection was switched off before it went.
create table public.pos_outbox (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  location_id uuid not null,
  connection_id uuid not null,
  vendor text not null,
  order_id uuid,
  table_session_id uuid,
  is_test boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'dead', 'skipped')),
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  net_request_id bigint,
  idempotency_key text not null unique,
  payload jsonb not null,
  external_order_id text check (char_length(external_order_id) <= 120),
  last_error text check (char_length(last_error) <= 600),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  check (is_test or order_id is not null),
  foreign key (restaurant_id, connection_id) references public.pos_connections (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
-- The worker's "anything to do?" check reads only this small index.
create index pos_outbox_open_idx on public.pos_outbox (next_attempt_at) where status in ('pending', 'sending', 'failed');
create index pos_outbox_order_idx on public.pos_outbox (order_id);
create index pos_outbox_location_idx on public.pos_outbox (location_id, created_at desc);
create index pos_outbox_connection_idx on public.pos_outbox (connection_id, created_at desc);

-- iiko and Syrve: the POS order of a table session, so later rounds are added
-- to it (order/add_items) instead of opening a new order.
create table public.pos_session_orders (
  connection_id uuid not null,
  restaurant_id uuid not null,
  table_session_id uuid not null,
  external_order_id text not null check (char_length(external_order_id) <= 120),
  created_at timestamptz not null default now(),
  primary key (connection_id, table_session_id),
  foreign key (restaurant_id, connection_id) references public.pos_connections (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_session_id) references public.table_sessions (restaurant_id, id) on delete cascade
);

create trigger pos_connections_touch before update on public.pos_connections
  for each row execute function private.touch_updated_at();
create trigger pos_outbox_touch before update on public.pos_outbox
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- RLS: owners and managers read their café's connection, links and sends;
-- waiters (and the waiter tablet) read the sends of their location for the
-- status on each order. Nobody writes directly; the api functions do.
-- -----------------------------------------------------------------------------
alter table public.pos_connections enable row level security;
alter table public.pos_item_links enable row level security;
alter table public.pos_table_links enable row level security;
alter table public.pos_outbox enable row level security;
alter table public.pos_session_orders enable row level security;

create policy pos_connections_admin_read on public.pos_connections for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy pos_item_links_admin_read on public.pos_item_links for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy pos_table_links_admin_read on public.pos_table_links for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy pos_outbox_staff_read on public.pos_outbox for select to authenticated
  using (location_id in (select private.my_location_ids('{owner,manager,waiter}')));

revoke all on public.pos_connections, public.pos_item_links, public.pos_table_links, public.pos_outbox,
  public.pos_session_orders from public, anon, authenticated;
grant select on public.pos_connections, public.pos_item_links, public.pos_table_links, public.pos_outbox to authenticated;
grant all on public.pos_connections, public.pos_item_links, public.pos_table_links, public.pos_outbox,
  public.pos_session_orders to service_role;

-- -----------------------------------------------------------------------------
-- Settings and the secret
-- -----------------------------------------------------------------------------
-- An https URL whose host is a public name: no localhost, no IP literal in a
-- private, loopback or link-local range, no IPv6 literal, no single-label
-- host. The app checks again at send time, after resolving the name.
create function private.pos_url_ok(p_url text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_host text;
  v_o integer[];
begin
  if p_url is null or char_length(p_url) > 500 or p_url !~ '^https://[^\s/?#@]+(/\S*)?$' then
    return false;
  end if;
  v_host := lower(substring(p_url from '^https://([^/?#:]+)'));
  if v_host is null or v_host = '' or p_url ~ '^https://\[' then
    return false;
  end if;
  v_host := rtrim(v_host, '.');
  if v_host !~ '\.' or v_host = 'localhost' or v_host ~ '\.(localhost|local|internal|lan|home|corp)$' then
    return false;
  end if;
  if v_host ~ '^[0-9]+(\.[0-9]+){3}$' then
    v_o := string_to_array(v_host, '.')::integer[];
    if v_o[1] in (0, 10, 127) or v_o[1] >= 224
       or (v_o[1] = 100 and v_o[2] between 64 and 127)
       or (v_o[1] = 169 and v_o[2] = 254)
       or (v_o[1] = 172 and v_o[2] between 16 and 31)
       or (v_o[1] = 192 and v_o[2] = 168)
       or (v_o[1] = 192 and v_o[2] = 0 and v_o[3] = 0)
       or (v_o[1] = 198 and v_o[2] between 18 and 19) then
      return false;
    end if;
  elsif v_host ~ '^[0-9.]+$' or v_host ~ '^0x' then
    return false;   -- shortened or hex forms of an address
  end if;
  return true;
end $$;

-- The non-secret settings each vendor takes; anything else is refused.
create function private.pos_clean_settings(p_vendor text, p_settings jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_allowed text[] := case p_vendor
    when 'webhook' then '{url}'
    when 'iiko' then '{organization_id,organization_name,terminal_group_id,terminal_group_name,base_url}'
    when 'syrve' then '{organization_id,organization_name,terminal_group_id,terminal_group_name,base_url}'
    when 'poster' then '{spot_id,spot_name,phone}'
    else '{}' end;
  v_key text;
  v_val jsonb;
  v_out jsonb := '{}';
begin
  if p_settings is null then
    return '{}';
  end if;
  if jsonb_typeof(p_settings) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_settings';
  end if;
  for v_key, v_val in select * from jsonb_each(p_settings) loop
    continue when v_val = 'null'::jsonb or v_val = '""'::jsonb;
    if not v_key = any (v_allowed) or jsonb_typeof(v_val) <> 'string' or char_length(v_val #>> '{}') > 500 then
      raise exception using errcode = '22023', message = 'invalid_settings', detail = v_key;
    end if;
    if v_key in ('url', 'base_url') and not private.pos_url_ok(v_val #>> '{}') then
      raise exception using errcode = '22023', message = 'invalid_url', detail = v_key;
    end if;
    v_out := v_out || jsonb_build_object(v_key, btrim(v_val #>> '{}'));
  end loop;
  return v_out;
end $$;

create function private.pos_secret_name(p_connection_id uuid) returns text
language sql immutable set search_path = '' as $$
  select 'pos_secret_' || p_connection_id
$$;

-- Removes the connection's secret from Vault.
create function private.pos_drop_secret(p_connection_id uuid) returns void
language sql security definer set search_path = '' as $$
  delete from vault.secrets where name = private.pos_secret_name(p_connection_id)
$$;

create function private.pos_connection_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.pos_drop_secret(old.id);
  return null;
end $$;
create trigger pos_connections_drop_secret after delete on public.pos_connections
  for each row execute function private.pos_connection_deleted();

-- Creates or changes the location's connection. Choosing another vendor
-- starts over: the matches and the saved key go, and it is switched off.
create function api.pos_save_connection(p_location_id uuid, p_vendor text, p_settings jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_old public.pos_connections;
  v_settings jsonb;
  v_id uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_vendor is null or p_vendor not in ('test', 'webhook', 'iiko', 'syrve', 'poster') then
    raise exception using errcode = '22023', message = 'invalid_vendor';
  end if;
  v_settings := private.pos_clean_settings(p_vendor, p_settings);
  select restaurant_id into v_restaurant from public.locations where id = p_location_id;
  select * into v_old from public.pos_connections where location_id = p_location_id for update;
  if not found then
    insert into public.pos_connections (restaurant_id, location_id, vendor, settings, created_by)
    values (v_restaurant, p_location_id, p_vendor, v_settings, auth.uid())
    returning id into v_id;
  elsif v_old.vendor <> p_vendor then
    delete from public.pos_item_links where connection_id = v_old.id;
    delete from public.pos_table_links where connection_id = v_old.id;
    delete from public.pos_session_orders where connection_id = v_old.id;
    perform private.pos_drop_secret(v_old.id);
    update public.pos_connections set vendor = p_vendor, settings = v_settings, is_active = false, has_secret = false
    where id = v_old.id;
    v_id := v_old.id;
  else
    update public.pos_connections set settings = v_settings where id = v_old.id;
    if v_settings ->> 'url' is distinct from v_old.settings ->> 'url'
       or v_settings ->> 'base_url' is distinct from v_old.settings ->> 'base_url' then
      -- A key must never follow a new address the owner did not type it for.
      -- (Same vendor, new URL: the owner saves the key again.)
      perform private.pos_drop_secret(v_old.id);
      update public.pos_connections set has_secret = false, is_active = false where id = v_old.id;
    end if;
    v_id := v_old.id;
  end if;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'pos.connection_saved', 'pos_connection',
          jsonb_build_object('vendor', p_vendor));
  return v_id;
end $$;

-- Write-only: the key, Poster token or webhook signing secret goes to Vault.
create function api.pos_set_secret(p_connection_id uuid, p_secret text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
  v_id uuid;
begin
  select * into v_c from public.pos_connections where id = p_connection_id for update;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if p_secret is null or char_length(btrim(p_secret)) not between 8 and 500 or btrim(p_secret) ~ '\s' then
    raise exception using errcode = '22023', message = 'invalid_secret';
  end if;
  select id into v_id from vault.secrets where name = private.pos_secret_name(p_connection_id);
  if v_id is null then
    perform vault.create_secret(btrim(p_secret), private.pos_secret_name(p_connection_id), 'POS connection key (ADR-093)');
  else
    perform vault.update_secret(v_id, btrim(p_secret));
  end if;
  update public.pos_connections set has_secret = true where id = p_connection_id;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, data)
  values (v_c.restaurant_id, v_c.location_id, 'member', auth.uid(), 'pos.secret_saved', 'pos_connection',
          jsonb_build_object('connection_id', p_connection_id));
end $$;

-- For the owner's server actions only ("Check connection", "Load POS menu"):
-- the key of their own connection. Never sent to the browser by the app.
create function api.pos_connection_secret(p_connection_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
begin
  select * into v_c from public.pos_connections where id = p_connection_id;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  return private.secret(private.pos_secret_name(p_connection_id));
end $$;

create function api.pos_set_active(p_connection_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
begin
  select * into v_c from public.pos_connections where id = p_connection_id for update;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if p_active is null then
    raise exception using errcode = '22023', message = 'invalid_active';
  end if;
  if p_active and v_c.vendor <> 'test' and not v_c.has_secret then
    raise exception using errcode = 'RS409', message = 'pos_no_secret';
  end if;
  if p_active and v_c.vendor = 'webhook' and v_c.settings ->> 'url' is null then
    raise exception using errcode = 'RS409', message = 'pos_no_url';
  end if;
  if p_active and v_c.vendor in ('iiko', 'syrve')
     and (v_c.settings ->> 'organization_id' is null or v_c.settings ->> 'terminal_group_id' is null) then
    raise exception using errcode = 'RS409', message = 'pos_not_configured';
  end if;
  if p_active and v_c.vendor = 'poster' and v_c.settings ->> 'spot_id' is null then
    raise exception using errcode = 'RS409', message = 'pos_not_configured';
  end if;
  update public.pos_connections set is_active = p_active where id = p_connection_id;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, data)
  values (v_c.restaurant_id, v_c.location_id, 'member', auth.uid(), 'pos.active', 'pos_connection',
          jsonb_build_object('connection_id', p_connection_id, 'active', p_active));
end $$;

-- Replaces every dish match: [{item_id, external_id, external_name, modifiers, auto_matched}].
create function api.pos_save_item_links(p_connection_id uuid, p_links jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
  v_n integer;
begin
  select * into v_c from public.pos_connections where id = p_connection_id for update;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 2000 then
    raise exception using errcode = '22023', message = 'invalid_links';
  end if;
  if exists (select 1 from jsonb_array_elements(p_links) l
             where jsonb_typeof(l) <> 'object' or coalesce(l ->> 'item_id', '') !~ '^[0-9a-f-]{36}$'
                or coalesce(l ->> 'external_id', '') = '' or char_length(l ->> 'external_id') > 64
                or (l ? 'modifiers' and jsonb_typeof(l -> 'modifiers') not in ('object', 'null'))) then
    raise exception using errcode = '22023', message = 'invalid_links';
  end if;
  delete from public.pos_item_links where connection_id = p_connection_id;
  insert into public.pos_item_links (connection_id, restaurant_id, item_id, external_id, external_name, modifiers, auto_matched)
  select distinct on ((l ->> 'item_id')::uuid) p_connection_id, v_c.restaurant_id, (l ->> 'item_id')::uuid, l ->> 'external_id',
         left(l ->> 'external_name', 200),
         coalesce((select jsonb_object_agg(m.key, jsonb_build_object('external_id', left(m.value ->> 'external_id', 64),
                                                                     'group_id', left(m.value ->> 'group_id', 64)))
                   from jsonb_each(case when jsonb_typeof(l -> 'modifiers') = 'object' then l -> 'modifiers' else '{}' end) m
                   where m.key ~ '^[0-9a-f-]{36}$' and jsonb_typeof(m.value) = 'object'
                     and coalesce(m.value ->> 'external_id', '') <> ''), '{}'),
         coalesce((l ->> 'auto_matched')::boolean, false)
  from jsonb_array_elements(p_links) l
  -- Only the café's own dishes.
  where exists (select 1 from public.items i where i.id = (l ->> 'item_id')::uuid and i.restaurant_id = v_c.restaurant_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Replaces every table match: [{table_id, external_table_id, external_name}].
create function api.pos_save_table_links(p_connection_id uuid, p_links jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
  v_n integer;
begin
  select * into v_c from public.pos_connections where id = p_connection_id for update;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) > 500
     or exists (select 1 from jsonb_array_elements(p_links) l
                where jsonb_typeof(l) <> 'object' or coalesce(l ->> 'table_id', '') !~ '^[0-9a-f-]{36}$'
                   or coalesce(l ->> 'external_table_id', '') = '' or char_length(l ->> 'external_table_id') > 64) then
    raise exception using errcode = '22023', message = 'invalid_links';
  end if;
  delete from public.pos_table_links where connection_id = p_connection_id;
  insert into public.pos_table_links (connection_id, restaurant_id, table_id, external_table_id, external_name)
  select distinct on ((l ->> 'table_id')::uuid) p_connection_id, v_c.restaurant_id, (l ->> 'table_id')::uuid,
         l ->> 'external_table_id', left(l ->> 'external_name', 120)
  from jsonb_array_elements(p_links) l
  where exists (select 1 from public.tables t where t.id = (l ->> 'table_id')::uuid and t.location_id = v_c.location_id);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- -----------------------------------------------------------------------------
-- The payload (vendor-neutral, built when queued and again on a manual retry)
-- -----------------------------------------------------------------------------
create function private.pos_order_payload(p_connection_id uuid, p_order_id uuid, p_idempotency_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'event', 'order.accepted',
    'idempotency_key', p_idempotency_key,
    'test', false,
    'cafe', jsonb_build_object('id', r.id, 'name', r.name),
    'location', jsonb_build_object('id', o.location_id),
    'table', case when t.id is null then null else jsonb_build_object(
      'id', t.id, 'label', t.label,
      'external_id', (select tl.external_table_id from public.pos_table_links tl
                      where tl.connection_id = p_connection_id and tl.table_id = t.id)) end,
    'table_session_id', o.table_session_id,
    'order', jsonb_build_object(
      'id', o.id, 'number', o.number, 'created_at', o.placed_at, 'source', o.source, 'note', o.guest_note,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'pativ_item_id', oi.item_id,
                 'external_id', l.external_id,
                 'name', private.pick_name(oi.name_i18n, 'hy'),
                 'quantity', oi.quantity - oi.cancelled_quantity,
                 'unit_price', oi.unit_price,
                 'modifiers', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'pativ_id', m.modifier_id,
                            'external_id', l.modifiers -> (m.modifier_id::text) ->> 'external_id',
                            'external_group_id', l.modifiers -> (m.modifier_id::text) ->> 'group_id',
                            'name', private.pick_name(m.name_i18n, 'hy'),
                            'price_delta', m.price_delta) order by m.id)
                   from public.order_item_modifiers m where m.order_item_id = oi.id), '[]'),
                 'note', oi.note,
                 'substitution', oi.substitution) order by oi.sort, oi.created_at)
        from public.order_items oi
        left join public.pos_item_links l on l.connection_id = p_connection_id and l.item_id = oi.item_id
        where oi.order_id = o.id and oi.quantity > oi.cancelled_quantity), '[]')),
    'total', o.total)
  from public.orders o
  join public.restaurants r on r.id = o.restaurant_id
  left join public.tables t on t.id = o.table_id
  where o.id = p_order_id
$$;

-- Queues an accepted order for the location's active connection (if any).
-- Returns the outbox id, or null when nothing was queued.
create function private.pos_enqueue_order(p_order_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_o public.orders;
  v_c public.pos_connections;
  v_key text;
  v_id bigint;
begin
  select * into v_o from public.orders where id = p_order_id;
  if not found or v_o.status <> 'accepted' then
    return null;
  end if;
  select * into v_c from public.pos_connections where location_id = v_o.location_id and is_active;
  if not found then
    return null;
  end if;
  v_key := 'pativ-order-' || v_o.id;
  insert into public.pos_outbox (restaurant_id, location_id, connection_id, vendor, order_id, table_session_id,
                                 idempotency_key, payload)
  values (v_o.restaurant_id, v_o.location_id, v_c.id, v_c.vendor, v_o.id, v_o.table_session_id,
          v_key, private.pos_order_payload(v_c.id, v_o.id, v_key))
  on conflict (idempotency_key) do nothing
  returning id into v_id;
  return v_id;
end $$;

-- Every way an order becomes accepted is an UPDATE of orders.status after its
-- lines exist (place_order_core, place_guest_order, accept_order). A POS
-- problem must never block the order itself.
create function private.pos_order_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.pos_enqueue_order(new.id);
  return null;
exception when others then
  raise warning 'pos_order_accepted: %', sqlerrm;
  return null;
end $$;
create trigger orders_pos_enqueue after update of status on public.orders
  for each row when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function private.pos_order_accepted();

-- «Send test order»: one dish (a matched one if there is any) through the real
-- path, with no order in Pativ and nothing for the kitchen screen.
create function api.pos_send_test(p_connection_id uuid) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.pos_connections;
  v_r public.restaurants;
  v_item record;
  v_table record;
  v_key text := 'pativ-test-' || gen_random_uuid();
  v_n bigint;
  v_id bigint;
begin
  select * into v_c from public.pos_connections where id = p_connection_id;
  perform private.assert_restaurant_role(v_c.restaurant_id, '{owner,manager}');
  if v_c.vendor <> 'test' and not v_c.has_secret then
    raise exception using errcode = 'RS409', message = 'pos_no_secret';
  end if;
  if not private.rate_limit_hit('postest:' || p_connection_id, 5, interval '1 minute') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  select * into v_r from public.restaurants where id = v_c.restaurant_id;
  select i.id, i.price, l.external_id,
         (select coalesce(nullif(tr.name, ''), '?') from public.item_translations tr
          where tr.item_id = i.id order by (tr.locale = 'hy') desc, tr.locale limit 1) as name
  into v_item
  from public.items i
  left join public.pos_item_links l on l.connection_id = v_c.id and l.item_id = i.id
  where i.restaurant_id = v_c.restaurant_id and i.is_active
  order by (l.external_id is null), i.sort, i.created_at
  limit 1;
  select t.id, t.label, tl.external_table_id into v_table
  from public.tables t left join public.pos_table_links tl on tl.connection_id = v_c.id and tl.table_id = t.id
  where t.location_id = v_c.location_id and t.is_active
  order by (tl.external_table_id is null), t.sort, t.label
  limit 1;
  select count(*) + 1 into v_n from public.pos_outbox where connection_id = v_c.id and is_test;

  insert into public.pos_outbox (restaurant_id, location_id, connection_id, vendor, is_test, idempotency_key, payload)
  values (v_c.restaurant_id, v_c.location_id, v_c.id, v_c.vendor, true, v_key, jsonb_build_object(
    'event', 'order.accepted',
    'idempotency_key', v_key,
    'test', true,
    'cafe', jsonb_build_object('id', v_r.id, 'name', v_r.name),
    'location', jsonb_build_object('id', v_c.location_id),
    'table', case when v_table.id is null then null
                  else jsonb_build_object('id', v_table.id, 'label', v_table.label, 'external_id', v_table.external_table_id) end,
    'table_session_id', null,
    'order', jsonb_build_object(
      'id', null, 'number', v_n, 'created_at', now(), 'source', 'test', 'note', 'Pativ test',
      'items', case when v_item.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'pativ_item_id', v_item.id, 'external_id', v_item.external_id, 'name', v_item.name, 'quantity', 1,
        'unit_price', v_item.price, 'modifiers', '[]'::jsonb, 'note', null, 'substitution', null)) end),
    'total', coalesce(v_item.price, 0)))
  returning id into v_id;
  return v_id;
end $$;

-- «Կրկին ուղարկել»: a failed or dead send goes again, with the payload built
-- anew so dishes matched since then are included. Waiters, managers, owners.
create function api.pos_retry(p_outbox_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.pos_outbox;
  v_c public.pos_connections;
begin
  select * into v_row from public.pos_outbox where id = p_outbox_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_location_role(v_row.location_id, '{owner,manager,waiter}');
  if v_row.status in ('pending', 'sending', 'sent') then
    return;   -- already on its way, or done: nothing to do (idempotent)
  end if;
  if not private.rate_limit_hit('posretry:' || p_outbox_id, 10, interval '10 minutes') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;
  select * into v_c from public.pos_connections where id = v_row.connection_id;
  if not v_c.is_active and not v_row.is_test then
    raise exception using errcode = 'RS409', message = 'pos_off';
  end if;
  update public.pos_outbox
  set status = 'pending', attempts = 0, next_attempt_at = now(), lease_until = null, net_request_id = null,
      last_error = null, vendor = v_c.vendor,
      payload = case when order_id is null then payload
                     else coalesce(private.pos_order_payload(v_c.id, order_id, idempotency_key), payload) end
  where id = p_outbox_id;
end $$;

-- -----------------------------------------------------------------------------
-- Delivery through /api/pos
-- -----------------------------------------------------------------------------
-- HMAC of "pos:<row id>:<attempt>" with the Vault key: one attempt only.
create function private.pos_sig(p_id bigint, p_attempt integer) returns text
language sql stable security definer set search_path = '' as $$
  select private.b64url(extensions.hmac('pos:' || p_id || ':' || p_attempt, private.secret('pos_job_key'), 'sha256'))
$$;

create function private.assert_pos_sig(p_id bigint, p_attempt integer, p_sig text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.secret('pos_job_key') is null or p_sig is null or p_id is null or p_attempt is null
     or extensions.digest(p_sig, 'sha256') <> extensions.digest(private.pos_sig(p_id, p_attempt), 'sha256') then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

-- Waits before attempt n+1 after n failures: 30 s, 1, 3, 5 minutes; the 5th
-- failure is final (about ten minutes in all).
create function private.pos_backoff(p_attempts integer) returns interval
language sql immutable set search_path = '' as $$
  select case when p_attempts <= 1 then interval '30 seconds'
              when p_attempts = 2 then interval '1 minute'
              when p_attempts = 3 then interval '3 minutes'
              else interval '5 minutes' end
$$;

create function private.pos_fail(p_id bigint, p_error text, p_retry boolean default true) returns void
language sql security definer set search_path = '' as $$
  update public.pos_outbox
  set status = case when p_retry and attempts >= 5 then 'dead' else 'failed' end,
      next_attempt_at = case when p_retry then now() + private.pos_backoff(attempts) else 'infinity' end,
      last_error = left(coalesce(p_error, 'error'), 600),
      lease_until = null,
      net_request_id = null
  where id = p_id
$$;

create function private.pos_hint(p_location_id uuid, p_id bigint, p_order_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(jsonb_build_object('id', p_id, 'order_id', p_order_id, 'status', p_status),
                        'pos', 'loc:' || p_location_id, true);
exception when others then
  null;   -- a hint is only a hint
end $$;

-- The route trades a signed id for everything one send needs.
create function api.pos_claim(p_id bigint, p_attempt integer, p_sig text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.pos_outbox;
  v_c public.pos_connections;
begin
  perform private.assert_pos_sig(p_id, p_attempt, p_sig);
  select * into v_row from public.pos_outbox where id = p_id;
  if not found or v_row.status <> 'sending' or v_row.attempts <> p_attempt then
    raise exception using errcode = 'RS409', message = 'not_in_flight';
  end if;
  select * into v_c from public.pos_connections where id = v_row.connection_id;
  return jsonb_build_object(
    'id', v_row.id,
    'vendor', v_c.vendor,
    'settings', v_c.settings,
    'secret', private.secret(private.pos_secret_name(v_c.id)),
    'payload', v_row.payload,
    'is_test', v_row.is_test,
    'session_order_id', (select s.external_order_id from public.pos_session_orders s
                         where s.connection_id = v_c.id and s.table_session_id = v_row.table_session_id));
end $$;

-- What the vendor answered. p_retry false: retrying cannot help (unmapped
-- dishes, a refused key): failed until someone retries by hand.
create function api.pos_report(
  p_id bigint, p_attempt integer, p_sig text, p_ok boolean, p_external_order_id text default null,
  p_error text default null, p_retry boolean default true
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.pos_outbox;
  v_status text;
begin
  perform private.assert_pos_sig(p_id, p_attempt, p_sig);
  select * into v_row from public.pos_outbox where id = p_id for update;
  if not found or v_row.status <> 'sending' or v_row.attempts <> p_attempt then
    raise exception using errcode = 'RS409', message = 'not_in_flight';
  end if;
  if p_ok is null then
    raise exception using errcode = '22023', message = 'invalid_report';
  end if;
  if p_ok then
    update public.pos_outbox
    set status = 'sent', sent_at = now(), lease_until = null, net_request_id = null, last_error = null,
        external_order_id = left(nullif(btrim(p_external_order_id), ''), 120)
    where id = p_id;
    if v_row.vendor in ('iiko', 'syrve') and v_row.table_session_id is not null
       and nullif(btrim(p_external_order_id), '') is not null then
      insert into public.pos_session_orders (connection_id, restaurant_id, table_session_id, external_order_id)
      values (v_row.connection_id, v_row.restaurant_id, v_row.table_session_id, left(btrim(p_external_order_id), 120))
      on conflict (connection_id, table_session_id) do nothing;
    end if;
  else
    perform private.pos_fail(p_id, p_error, coalesce(p_retry, true));
  end if;
  select status into v_status from public.pos_outbox where id = p_id;
  perform private.pos_hint(v_row.location_id, p_id, v_row.order_id, v_status);
end $$;

-- The worker, run with the notifications every 10 seconds. With nothing open
-- it reads one tiny index and returns.
create function private.run_pos(p_limit integer default 20) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_base text;
  v_bypass text;
  r record;
  v_req bigint;
  v_n integer := 0;
begin
  if not exists (select 1 from public.pos_outbox where status in ('pending', 'sending', 'failed')
                 and next_attempt_at <= now() + interval '1 minute') then
    return 0;
  end if;

  -- A POST whose report never came: the lease ran out.
  for r in
    select id from public.pos_outbox where status = 'sending' and lease_until < now()
    for update skip locked
  loop
    perform private.pos_fail(r.id, 'no_response');
  end loop;

  -- Rows of a connection switched off (or changed to another vendor) are skipped.
  update public.pos_outbox o set status = 'skipped', last_error = 'pos_off', lease_until = null, net_request_id = null
  from public.pos_connections c
  where c.id = o.connection_id and o.status in ('pending', 'failed') and not o.is_test
    and (not c.is_active or c.vendor <> o.vendor);

  v_base := rtrim(private.secret('app_base_url'), '/');
  v_bypass := private.secret('vercel_bypass_secret');
  if v_base is null or private.secret('pos_job_key') is null then
    return 0;   -- rows wait, like Telegram rows without a token
  end if;

  for r in
    select o.id, o.attempts, o.vendor, o.connection_id, o.table_session_id
    from public.pos_outbox o
    where o.status in ('pending', 'failed') and o.next_attempt_at <= now()
    order by o.id
    limit p_limit
    for update of o skip locked
  loop
    -- iiko and Syrve add later rounds to the table's POS order: one round of
    -- a session at a time, so the first one creates it.
    continue when r.vendor in ('iiko', 'syrve') and r.table_session_id is not null and exists (
      select 1 from public.pos_outbox x
      where x.connection_id = r.connection_id and x.table_session_id = r.table_session_id and x.id <> r.id
        and (x.status = 'sending' or (x.id < r.id and x.status in ('pending', 'failed') and x.next_attempt_at <> 'infinity')));
    v_req := net.http_post(
      url := v_base || '/api/pos',
      body := jsonb_build_object('id', r.id, 'attempt', r.attempts + 1, 'sig', private.pos_sig(r.id, r.attempts + 1)),
      headers := jsonb_strip_nulls(jsonb_build_object('Content-Type', 'application/json',
                                                      'x-vercel-protection-bypass', v_bypass)),
      timeout_milliseconds := 30000);
    update public.pos_outbox
    set status = 'sending', attempts = attempts + 1, net_request_id = v_req, lease_until = now() + interval '90 seconds'
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- The 10-second job also runs the POS worker; a POS problem never stops alerts.
create or replace function private.run_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform private.run_pos();
  exception when others then
    raise warning 'run_pos: %', sqlerrm;
  end;
  perform private.collect_outbox_responses();
  return private.deliver_outbox();
end $$;

-- Old finished sends go after 30 days, with the other outbox housekeeping.
create function private.purge_pos_outbox() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.pos_outbox where status in ('sent', 'dead', 'skipped') and created_at < now() - interval '30 days'
             returning 1)
  select count(*)::integer from d
$$;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('pativ-purge-pos-outbox', '35 3 * * *', $job$select private.purge_pos_outbox()$job$);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
revoke execute on function
  private.pos_url_ok(text), private.pos_clean_settings(text, jsonb), private.pos_secret_name(uuid),
  private.pos_drop_secret(uuid), private.pos_connection_deleted(),
  api.pos_save_connection(uuid, text, jsonb), api.pos_set_secret(uuid, text), api.pos_connection_secret(uuid),
  api.pos_set_active(uuid, boolean), api.pos_save_item_links(uuid, jsonb), api.pos_save_table_links(uuid, jsonb),
  private.pos_order_payload(uuid, uuid, text), private.pos_enqueue_order(uuid), private.pos_order_accepted(),
  api.pos_send_test(uuid), api.pos_retry(bigint), private.pos_sig(bigint, integer),
  private.assert_pos_sig(bigint, integer, text), private.pos_backoff(integer), private.pos_fail(bigint, text, boolean),
  private.pos_hint(uuid, bigint, uuid, text), api.pos_claim(bigint, integer, text),
  api.pos_report(bigint, integer, text, boolean, text, text, boolean), private.run_pos(integer),
  private.run_notifications(), private.purge_pos_outbox()
from public, anon, authenticated;
grant execute on function
  api.pos_save_connection(uuid, text, jsonb), api.pos_set_secret(uuid, text), api.pos_connection_secret(uuid),
  api.pos_set_active(uuid, boolean), api.pos_save_item_links(uuid, jsonb), api.pos_save_table_links(uuid, jsonb),
  api.pos_send_test(uuid), api.pos_retry(bigint)
to authenticated;
-- /api/pos calls these with the publishable key; the signature is the check.
grant execute on function api.pos_claim(bigint, integer, text),
  api.pos_report(bigint, integer, text, boolean, text, text, boolean)
to anon, authenticated;
