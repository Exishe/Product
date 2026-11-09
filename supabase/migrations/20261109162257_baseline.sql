-- Baseline: the validated Phase 1 target schema, copied from
-- docs/01-architecture/sql/10-schema.sql on 9 Nov 2026. From here on the
-- migrations are the source of truth; the docs file is the design record.

-- =============================================================================
-- Restaurant OS: target Postgres schema for all four stages
-- =============================================================================
-- Companion to docs/01-architecture/data-model.md. Phase 6 splits this file
-- into Supabase migrations. Stage tags: [S1] is built now, [S2]..[S4] later.
--
-- Conventions
--  * Every tenant row carries restaurant_id. Children reference parents through
--    (restaurant_id, id), so a row can never point at another tenant's row.
--  * Money is integer AMD (whole drams).
--  * Guest-facing text lives in *_translations tables (hy, ru, en).
--  * Clients read through RLS. Operational state changes go through functions:
--    `api.*` for signed-in staff, `private.*` for guest flows (called only by
--    our server). Clients get no INSERT/UPDATE/DELETE on operational tables.
-- =============================================================================

create schema if not exists private;
create schema if not exists api;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
revoke all on schema api from public;
grant usage on schema api to anon, authenticated, service_role;

-- Note: Postgres grants EXECUTE on new functions to PUBLIC, and Supabase adds
-- default grants to anon/authenticated in public. Per-schema default privileges
-- cannot remove the global PUBLIC grant, so section 17 revokes explicitly after
-- the functions exist. Every later migration must do the same.

-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------
create type public.app_locale as enum ('hy', 'ru', 'en');
create type public.member_role as enum ('owner', 'manager', 'waiter', 'kitchen', 'cashier'); -- cashier: S2
create type public.member_kind as enum ('person', 'device');
create type public.record_status as enum ('active', 'suspended', 'closed');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.table_session_status as enum ('open', 'closed', 'void');
create type public.order_source as enum ('qr', 'waiter', 'kiosk', 'online');      -- kiosk, online: S3
create type public.fulfillment as enum ('dine_in', 'takeaway', 'delivery');       -- takeaway, delivery: S3
create type public.order_status as enum ('placed', 'accepted', 'rejected', 'cancelled');
create type public.kitchen_status as enum ('pending', 'cooking', 'ready', 'served');
create type public.ticket_kind as enum ('order', 'void');
create type public.ticket_status as enum ('new', 'cooking', 'ready', 'served', 'cancelled');
create type public.service_request_kind as enum ('call_waiter', 'bring_bill');
create type public.service_request_status as enum ('open', 'acknowledged', 'resolved');
create type public.bill_status as enum ('open', 'paid', 'void');
create type public.payment_method as enum ('cash', 'card_terminal', 'online_card', 'idram', 'telcell', 'other');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'cancelled', 'refunded');
create type public.translation_source as enum ('owner', 'ai', 'import');
create type public.menu_import_status as enum ('uploaded', 'processing', 'needs_review', 'applied', 'failed', 'discarded');
create type public.actor_kind as enum ('member', 'guest', 'system', 'platform_admin');
create type public.outbox_status as enum ('pending', 'sent', 'failed', 'dead');

create function private.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Tenancy and platform [S1]
-- -----------------------------------------------------------------------------
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,47}$'),
  default_locale public.app_locale not null default 'hy',
  currency char(3) not null default 'AMD' check (currency = 'AMD'),
  timezone text not null default 'Asia/Yerevan',
  tax_id text,                                   -- ՀՎՀՀ, optional in S1
  logo_path text,
  brand_color text check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  status public.record_status not null default 'active',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  address text,
  phone text,
  timezone text not null default 'Asia/Yerevan',
  kitchen_locale public.app_locale not null default 'hy',
  guest_locales public.app_locale[] not null default '{hy,ru,en}',
  qr_ordering_enabled boolean not null default true,
  require_acceptance boolean not null default false,  -- waiter confirms QR orders before the kitchen sees them
  max_auto_accept_total integer not null default 100000 check (max_auto_accept_total > 0),
  business_day_starts time not null default '05:00',  -- numbering and reports roll over here
  published_menu_version_id uuid,                     -- FK added after menu_versions
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, slug),
  unique (restaurant_id, id)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null,
  kind public.member_kind not null default 'person',
  display_name text not null check (char_length(display_name) between 1 and 80),
  locale public.app_locale not null default 'hy',
  all_locations boolean not null default true,
  is_active boolean not null default true,
  pin_hash text,                                       -- S2: PIN switching on shared tablets
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, user_id),
  unique (restaurant_id, id),
  check (kind = 'person' or role in ('waiter', 'kitchen', 'cashier'))
);
create index members_user_idx on public.members (user_id) where is_active;

create table public.member_locations (
  restaurant_id uuid not null,
  member_id uuid not null,
  location_id uuid not null,
  primary key (member_id, location_id),
  foreign key (restaurant_id, member_id) references public.members (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  email text not null,
  role public.member_role not null check (role <> 'owner'),
  location_id uuid,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

-- A kitchen screen or shared waiter tablet is paired with a short code that
-- the owner shows in the admin panel. The device gets its own auth user.
create table public.device_pairings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  location_id uuid not null,
  role public.member_role not null check (role in ('waiter', 'kitchen', 'cashier')),
  label text not null check (char_length(label) between 1 and 60),
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  member_id uuid,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  location_id uuid not null,
  plan text not null,
  status public.subscription_status not null default 'trialing',
  price_amd integer not null check (price_amd >= 0),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  restaurant_id uuid references public.restaurants (id) on delete cascade,  -- null: platform-level
  location_id uuid,
  actor_kind public.actor_kind not null,
  actor_user_id uuid,
  action text not null,                 -- e.g. 'menu.published', 'order.rejected'
  entity text not null,
  entity_id uuid,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_log_restaurant_idx on public.audit_log (restaurant_id, created_at desc);

-- -----------------------------------------------------------------------------
-- 3. Floor and kitchen setup [S1]
-- -----------------------------------------------------------------------------
create table public.areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  name text not null check (char_length(name) between 1 and 60),   -- staff-facing
  sort integer not null default 0,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  area_id uuid,
  label text not null check (char_length(label) between 1 and 12),
  seats smallint not null default 2 check (seats between 1 and 50),
  shape text not null default 'square' check (shape in ('square', 'round', 'rect')),
  pos_x smallint,                       -- cell on the waiter's floor map
  pos_y smallint,
  sort integer not null default 0,
  qr_version integer not null default 1 check (qr_version > 0),  -- bump to invalidate a printed QR
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (location_id, label),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, area_id) references public.areas (restaurant_id, id) on delete set null (area_id)
);

-- What a dish needs: kitchen, bar, pastry. Defined once per restaurant.
create table public.prep_areas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  sort integer not null default 0,
  unique (restaurant_id, id)
);

-- A screen in one location. Each prep area maps to exactly one station there.
create table public.stations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  is_default boolean not null default false,
  sort integer not null default 0,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
create unique index stations_one_default on public.stations (location_id) where is_default;

create table public.station_prep_areas (
  restaurant_id uuid not null,
  location_id uuid not null,
  prep_area_id uuid not null,
  station_id uuid not null,
  primary key (location_id, prep_area_id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, prep_area_id) references public.prep_areas (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, station_id) references public.stations (restaurant_id, id) on delete cascade
);

-- One open "check" per table. Every order round at the table joins it.
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  table_id uuid not null,
  status public.table_session_status not null default 'open',
  guest_count smallint check (guest_count between 1 and 100),
  opened_at timestamptz not null default now(),
  opened_by uuid,                       -- member id; null when a guest scan opened it
  closed_at timestamptz,
  closed_by uuid,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id) on delete cascade
);
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';
create index table_sessions_location_idx on public.table_sessions (location_id, opened_at desc);

-- -----------------------------------------------------------------------------
-- 4. Menu [S1]
-- -----------------------------------------------------------------------------
create table public.menus (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  internal_name text not null check (char_length(internal_name) between 1 and 80),
  sort integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id)
);

create table public.menu_locations (
  restaurant_id uuid not null,
  menu_id uuid not null,
  location_id uuid not null,
  primary key (menu_id, location_id),
  foreign key (restaurant_id, menu_id) references public.menus (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  menu_id uuid not null,
  prep_area_id uuid,                    -- default for items in this category
  sort integer not null default 0,
  is_active boolean not null default true,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id, menu_id) references public.menus (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, prep_area_id) references public.prep_areas (restaurant_id, id) on delete set null (prep_area_id)
);
create index categories_menu_idx on public.categories (menu_id, sort);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  category_id uuid not null,
  price integer not null check (price between 0 and 10000000),
  prep_area_id uuid,                    -- overrides the category's prep area
  sort integer not null default 0,
  is_active boolean not null default true,
  image_path text,
  image_blurhash text,
  portion_amount integer check (portion_amount > 0),
  portion_unit text check (portion_unit in ('g', 'ml', 'pcs')),
  tags text[] not null default '{}',    -- vegan, spicy, new, popular
  allergens text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  check ((portion_amount is null) = (portion_unit is null)),
  foreign key (restaurant_id, category_id) references public.categories (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, prep_area_id) references public.prep_areas (restaurant_id, id) on delete set null (prep_area_id)
);
create index items_category_idx on public.items (category_id, sort);

-- Reusable option groups: sizes, milk, doneness, extras. Sizes are a required
-- group with min = max = 1, so there is no separate "variants" table.
create table public.modifier_groups (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  min_select smallint not null default 0 check (min_select >= 0),
  max_select smallint not null default 1 check (max_select between 1 and 20),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  check (min_select <= max_select)
);

create table public.modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  group_id uuid not null,
  price_delta integer not null default 0 check (price_delta between -1000000 and 1000000),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort integer not null default 0,
  unique (restaurant_id, id),
  foreign key (restaurant_id, group_id) references public.modifier_groups (restaurant_id, id) on delete cascade
);

create table public.item_modifier_groups (
  restaurant_id uuid not null,
  item_id uuid not null,
  group_id uuid not null,
  sort integer not null default 0,
  primary key (item_id, group_id),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, group_id) references public.modifier_groups (restaurant_id, id) on delete cascade
);

-- Translations: one row per entity and language. `source` and `reviewed_at`
-- let publish_menu refuse AI text the owner has not looked at.
create table public.menu_translations (
  restaurant_id uuid not null,
  menu_id uuid not null,
  locale public.app_locale not null,
  name text not null check (char_length(name) between 1 and 80),
  source public.translation_source not null default 'owner',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (menu_id, locale),
  foreign key (restaurant_id, menu_id) references public.menus (restaurant_id, id) on delete cascade
);

create table public.category_translations (
  restaurant_id uuid not null,
  category_id uuid not null,
  locale public.app_locale not null,
  name text not null check (char_length(name) between 1 and 80),
  source public.translation_source not null default 'owner',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (category_id, locale),
  foreign key (restaurant_id, category_id) references public.categories (restaurant_id, id) on delete cascade
);

create table public.item_translations (
  restaurant_id uuid not null,
  item_id uuid not null,
  locale public.app_locale not null,
  name text not null check (char_length(name) between 1 and 120),
  description text check (char_length(description) <= 600),
  source public.translation_source not null default 'owner',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (item_id, locale),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade
);

create table public.modifier_group_translations (
  restaurant_id uuid not null,
  group_id uuid not null,
  locale public.app_locale not null,
  name text not null check (char_length(name) between 1 and 80),
  source public.translation_source not null default 'owner',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (group_id, locale),
  foreign key (restaurant_id, group_id) references public.modifier_groups (restaurant_id, id) on delete cascade
);

create table public.modifier_translations (
  restaurant_id uuid not null,
  modifier_id uuid not null,
  locale public.app_locale not null,
  name text not null check (char_length(name) between 1 and 80),
  source public.translation_source not null default 'owner',
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (modifier_id, locale),
  foreign key (restaurant_id, modifier_id) references public.modifiers (restaurant_id, id) on delete cascade
);

-- "Stop list": sold out today at this location. Applied live on top of the
-- published menu, so the kitchen does not need to republish.
create table public.stop_list (
  restaurant_id uuid not null,
  location_id uuid not null,
  item_id uuid not null,
  until timestamptz,                    -- null: until removed
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (location_id, item_id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade
);

-- Immutable published menus. Guests and waiters read only these.
create table public.menu_versions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  item_count integer not null,
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (location_id, version),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

alter table public.locations
  add foreign key (restaurant_id, published_menu_version_id)
  references public.menu_versions (restaurant_id, id) on delete set null (published_menu_version_id);

-- AI onboarding: photo of a paper menu -> reviewed draft -> menu rows.
create table public.menu_imports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  menu_id uuid,                         -- target menu once applied
  status public.menu_import_status not null default 'uploaded',
  source_locale public.app_locale,      -- detected language of the paper menu
  model text,
  input_tokens integer,
  output_tokens integer,
  draft jsonb,                          -- Zod-validated, translated, edited during review
  error text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  applied_at timestamptz,
  applied_by uuid references auth.users (id),
  unique (restaurant_id, id),
  foreign key (restaurant_id, menu_id) references public.menus (restaurant_id, id) on delete set null (menu_id)
);

create table public.menu_import_images (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  import_id uuid not null,
  storage_path text not null,           -- bucket 'menu-imports', '{restaurant_id}/{import_id}/{n}.jpg'
  page smallint not null default 1,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, import_id) references public.menu_imports (restaurant_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- 5. Guests, orders, kitchen [S1]
-- -----------------------------------------------------------------------------
-- One guest device at one table. user_id is a Supabase anonymous user.
create table public.guest_sessions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  table_id uuid not null,
  table_session_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  qr_version integer not null,
  locale public.app_locale not null default 'hy',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_session_id) references public.table_sessions (restaurant_id, id) on delete cascade
);
create index guest_sessions_user_idx on public.guest_sessions (user_id, table_id) where revoked_at is null;

create table public.location_counters (
  location_id uuid not null references public.locations (id) on delete cascade,
  business_date date not null,
  kind text not null check (kind in ('order', 'bill')),
  last_value integer not null,
  primary key (location_id, business_date, kind)
);

-- One order = one round sent to the kitchen. A table's rounds share a table session.
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  table_id uuid,
  table_session_id uuid,
  guest_session_id uuid,
  created_by_member uuid,
  customer_id uuid,                     -- S3
  source public.order_source not null,
  fulfillment public.fulfillment not null default 'dine_in',
  status public.order_status not null default 'placed',
  kitchen_status public.kitchen_status not null default 'pending',
  locale public.app_locale not null,    -- language the order was placed in
  business_date date not null,
  number integer not null,              -- shown to guests and on tickets, per location per day
  idempotency_key uuid not null,
  request_hash text not null,
  guest_note text check (char_length(guest_note) <= 300),
  item_count integer not null default 0,
  subtotal integer not null default 0 check (subtotal >= 0),
  total integer not null default 0 check (total >= 0),
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  reject_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  ready_at timestamptz,
  served_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (location_id, business_date, number),
  unique (restaurant_id, idempotency_key),
  unique (restaurant_id, id),
  check (source <> 'qr' or guest_session_id is not null),
  check (source <> 'waiter' or created_by_member is not null),
  check (fulfillment <> 'dine_in' or table_id is not null),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id) on delete set null (table_id),
  foreign key (restaurant_id, table_session_id) references public.table_sessions (restaurant_id, id) on delete set null (table_session_id),
  foreign key (restaurant_id, guest_session_id) references public.guest_sessions (restaurant_id, id) on delete set null (guest_session_id),
  foreign key (restaurant_id, created_by_member) references public.members (restaurant_id, id) on delete set null (created_by_member)
);
create index orders_location_live_idx on public.orders (location_id, placed_at desc)
  where status in ('placed', 'accepted') and paid_at is null;
create index orders_location_date_idx on public.orders (location_id, business_date);
create index orders_table_session_idx on public.orders (table_session_id);
create index orders_guest_session_idx on public.orders (guest_session_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,
  item_id uuid,                         -- null if the dish was deleted later
  name_i18n jsonb not null,             -- {"hy": "...", "ru": "...", "en": "..."} at order time
  prep_area_id uuid,
  station_id uuid,
  unit_price integer not null check (unit_price >= 0),
  modifiers_total integer not null default 0,
  quantity smallint not null check (quantity between 1 and 50),
  cancelled_quantity smallint not null default 0,
  line_total integer not null,          -- (unit_price + modifiers_total) * (quantity - cancelled_quantity)
  note text check (char_length(note) <= 200),
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  check (cancelled_quantity between 0 and quantity),
  check (line_total = (unit_price + modifiers_total) * (quantity - cancelled_quantity)),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete set null (item_id),
  foreign key (restaurant_id, station_id) references public.stations (restaurant_id, id) on delete set null (station_id)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_item_idx on public.order_items (item_id);

create table public.order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  order_id uuid not null,               -- denormalised for RLS
  order_item_id uuid not null,
  modifier_id uuid,
  name_i18n jsonb not null,
  price_delta integer not null,
  foreign key (restaurant_id, order_item_id) references public.order_items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, modifier_id) references public.modifiers (restaurant_id, id) on delete set null (modifier_id)
);
create index order_item_modifiers_item_idx on public.order_item_modifiers (order_item_id);

-- Kitchen tickets never change content. Changes create new 'void' tickets.
create table public.kitchen_tickets (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  order_id uuid not null,
  station_id uuid not null,
  kind public.ticket_kind not null default 'order',
  voids_ticket_id uuid,
  status public.ticket_status not null default 'new',
  number integer not null,              -- same as the order number
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ready_at timestamptz,
  served_at timestamptz,
  cancelled_at timestamptz,
  acknowledged_at timestamptz,          -- void tickets stay on screen until acknowledged
  acknowledged_by uuid,
  updated_at timestamptz not null default now(),
  unique (restaurant_id, id),
  check ((kind = 'void') = (voids_ticket_id is not null)),
  check (kind = 'order' or status = 'new'),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, station_id) references public.stations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, voids_ticket_id) references public.kitchen_tickets (restaurant_id, id) on delete cascade
);
create index kitchen_tickets_live_idx on public.kitchen_tickets (station_id, created_at)
  where (kind = 'order' and status in ('new', 'cooking', 'ready')) or (kind = 'void' and acknowledged_at is null);
create index kitchen_tickets_order_idx on public.kitchen_tickets (order_id);

create table public.kitchen_ticket_items (
  restaurant_id uuid not null,
  ticket_id uuid not null,
  order_item_id uuid not null,
  quantity smallint not null check (quantity > 0),
  primary key (ticket_id, order_item_id),
  foreign key (restaurant_id, ticket_id) references public.kitchen_tickets (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, order_item_id) references public.order_items (restaurant_id, id) on delete cascade
);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  order_id uuid not null,
  ticket_id uuid,
  entity text not null check (entity in ('order', 'ticket', 'order_item')),
  from_status text,
  to_status text not null,
  actor_kind public.actor_kind not null,
  actor_user_id uuid,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  table_id uuid not null,
  table_session_id uuid,
  guest_session_id uuid,
  kind public.service_request_kind not null,
  status public.service_request_status not null default 'open',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_id) references public.tables (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, guest_session_id) references public.guest_sessions (restaurant_id, id) on delete set null (guest_session_id)
);
-- Repeated taps on "call waiter" collapse into one open request.
create unique index service_requests_one_open on public.service_requests (table_id, kind) where status <> 'resolved';

-- -----------------------------------------------------------------------------
-- 6. Bills and payments [S1 minimal: one bill per table session, manual payment]
-- -----------------------------------------------------------------------------
create table public.bills (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  table_session_id uuid,
  business_date date not null,
  number integer not null,
  status public.bill_status not null default 'open',
  subtotal integer not null default 0,
  discount_total integer not null default 0,     -- S2
  service_charge integer not null default 0,     -- S2
  total integer not null default 0 check (total >= 0),
  idempotency_key uuid not null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid,
  unique (location_id, business_date, number),
  unique (restaurant_id, idempotency_key),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, table_session_id) references public.table_sessions (restaurant_id, id) on delete set null (table_session_id)
);
create index bills_location_date_idx on public.bills (location_id, business_date);

-- In S1 every item of the session lands on one bill. S2 split bills = several
-- bills, each with a subset of lines.
create table public.bill_lines (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  bill_id uuid not null,
  order_item_id uuid not null,
  quantity smallint not null check (quantity > 0),
  amount integer not null check (amount >= 0),
  unique (bill_id, order_item_id),
  foreign key (restaurant_id, bill_id) references public.bills (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, order_item_id) references public.order_items (restaurant_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  bill_id uuid not null,
  method public.payment_method not null,
  status public.payment_status not null default 'succeeded',
  amount integer not null check (amount > 0),
  tip_amount integer not null default 0 check (tip_amount >= 0),
  recorded_by uuid,
  provider text,                        -- S3: 'ameriabank_vpos', ...
  provider_payment_id text,             -- S3
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, bill_id) references public.bills (restaurant_id, id) on delete cascade
);
create index payments_bill_idx on public.payments (bill_id);

-- -----------------------------------------------------------------------------
-- 7. Notifications [S1: Telegram]
-- -----------------------------------------------------------------------------
create table public.notification_channels (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  location_id uuid,                     -- null: all locations
  kind text not null default 'telegram' check (kind in ('telegram')),
  telegram_chat_id bigint not null,
  title text,
  locale public.app_locale not null default 'hy',
  events text[] not null default '{order.placed,order.overdue,day.summary}',
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, telegram_chat_id),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

-- Owner presses "Connect Telegram", gets t.me/<bot>?start=<code>.
create table public.telegram_link_codes (
  code_hash text primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  location_id uuid,
  created_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  channel_id uuid not null,
  event text not null,
  dedupe_key text not null,             -- e.g. 'order.placed:<order_id>'
  payload jsonb not null,
  status public.outbox_status not null default 'pending',
  attempts smallint not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (channel_id, dedupe_key),
  foreign key (restaurant_id, channel_id) references public.notification_channels (restaurant_id, id) on delete cascade
);
create index notification_outbox_due_idx on public.notification_outbox (next_attempt_at) where status in ('pending', 'failed');

-- -----------------------------------------------------------------------------
-- 8. Stage 2: POS (shifts, discounts, printing)
-- -----------------------------------------------------------------------------
create table public.shifts (                                              -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  opening_cash integer not null default 0,
  closed_by uuid,
  closed_at timestamptz,
  closing_cash integer,
  expected_cash integer,
  note text,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);
create unique index shifts_one_open on public.shifts (location_id) where closed_at is null;

create table public.cash_movements (                                      -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  shift_id uuid not null,
  kind text not null check (kind in ('in', 'out')),
  amount integer not null check (amount > 0),
  reason text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, shift_id) references public.shifts (restaurant_id, id) on delete cascade
);

create table public.discounts (                                           -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('percent', 'amount')),
  value integer not null check (value > 0),
  min_role public.member_role not null default 'manager',
  is_active boolean not null default true,
  unique (restaurant_id, id),
  check (kind <> 'percent' or value <= 100)
);

create table public.bill_discounts (                                      -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  bill_id uuid not null,
  discount_id uuid,
  amount integer not null check (amount > 0),
  reason text,
  applied_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, bill_id) references public.bills (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, discount_id) references public.discounts (restaurant_id, id) on delete set null (discount_id)
);

create table public.printers (                                            -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  name text not null,
  connection text not null check (connection in ('usb', 'network', 'bluetooth', 'serial')),
  address text,                         -- IP:port for network printers
  paper_width_mm smallint not null default 80 check (paper_width_mm in (58, 80)),
  model text,                           -- ReceiptPrinterEncoder printer profile
  station_id uuid,                      -- prints this station's tickets
  prints text[] not null default '{bill}',  -- bill, ticket
  is_active boolean not null default true,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, station_id) references public.stations (restaurant_id, id) on delete set null (station_id)
);

create table public.print_jobs (                                          -- [S2]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  printer_id uuid not null,
  kind text not null check (kind in ('bill', 'ticket', 'void', 'test')),
  ref_id uuid,
  status text not null default 'queued' check (status in ('queued', 'sent', 'printed', 'failed')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  printed_at timestamptz,
  foreign key (restaurant_id, printer_id) references public.printers (restaurant_id, id) on delete cascade
);

-- -----------------------------------------------------------------------------
-- 9. Stage 3: online payments, own-site ordering, delivery
-- -----------------------------------------------------------------------------
create table public.payment_provider_accounts (                          -- [S3]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  provider text not null check (provider in ('ameriabank_vpos', 'arca_epg', 'idram', 'telcell')),
  mode text not null check (mode in ('test', 'live')),
  credentials_secret_id uuid not null,  -- vault.secrets.id; never stored in plain text
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (location_id, provider, mode),
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.payment_attempts (                                    -- [S3]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  payment_id uuid not null,
  provider_account_id uuid not null,
  provider_order_id bigint not null,    -- Ameria needs a new integer OrderID per attempt
  provider_payment_id text,
  state text not null,                  -- provider's state, e.g. Ameria PaymentState
  response_code text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_account_id, provider_order_id),
  foreign key (restaurant_id, payment_id) references public.payments (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, provider_account_id) references public.payment_provider_accounts (restaurant_id, id)
);

create table public.customers (                                           -- [S3]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text,
  phone text,
  email text,
  locale public.app_locale not null default 'hy',
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id),
  unique (restaurant_id, id)
);
alter table public.orders
  add foreign key (restaurant_id, customer_id) references public.customers (restaurant_id, id) on delete set null (customer_id);

create table public.location_hours (                                      -- [S3]
  restaurant_id uuid not null,
  location_id uuid not null,
  weekday smallint not null check (weekday between 0 and 6),
  opens time not null,
  closes time not null,
  primary key (location_id, weekday, opens),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.delivery_zones (                                      -- [S3]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  location_id uuid not null,
  name text not null,
  polygon jsonb not null,               -- GeoJSON polygon
  fee integer not null default 0 check (fee >= 0),
  min_order integer not null default 0 check (min_order >= 0),
  eta_minutes smallint not null default 45,
  is_active boolean not null default true,
  unique (restaurant_id, id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade
);

create table public.order_deliveries (                                    -- [S3]
  order_id uuid primary key,
  restaurant_id uuid not null,
  customer_id uuid,
  zone_id uuid,
  address text not null,
  address_details text,                 -- entrance, floor, apartment
  phone text not null,
  fee integer not null default 0,
  eta timestamptz,
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'delivered', 'failed')),
  foreign key (restaurant_id, order_id) references public.orders (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, customer_id) references public.customers (restaurant_id, id) on delete set null (customer_id),
  foreign key (restaurant_id, zone_id) references public.delivery_zones (restaurant_id, id) on delete set null (zone_id)
);

-- -----------------------------------------------------------------------------
-- 10. Stage 4: inventory and recipes, loyalty, owner AI assistant
-- -----------------------------------------------------------------------------
create table public.ingredients (                                         -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('g', 'ml', 'pcs')),
  cost_per_unit numeric(12, 4) not null default 0,  -- AMD per g/ml/pc; fractional on purpose
  is_active boolean not null default true,
  unique (restaurant_id, id)
);

create table public.recipe_lines (                                        -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  item_id uuid,
  modifier_id uuid,
  ingredient_id uuid not null,
  quantity numeric(12, 3) not null check (quantity > 0),
  check (num_nonnulls(item_id, modifier_id) = 1),
  foreign key (restaurant_id, item_id) references public.items (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, modifier_id) references public.modifiers (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id) on delete cascade
);

create table public.suppliers (                                           -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  name text not null,
  phone text,
  note text,
  unique (restaurant_id, id)
);

create table public.stock_movements (                                     -- [S4]
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  location_id uuid not null,
  ingredient_id uuid not null,
  delta numeric(14, 3) not null,
  reason text not null check (reason in ('purchase', 'sale', 'waste', 'count', 'transfer')),
  unit_cost numeric(12, 4),
  order_item_id uuid,
  supplier_id uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, supplier_id) references public.suppliers (restaurant_id, id) on delete set null (supplier_id)
);
create index stock_movements_ingredient_idx on public.stock_movements (location_id, ingredient_id, created_at);

create table public.loyalty_programs (                                    -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  kind text not null check (kind in ('points', 'stamps')),
  rules jsonb not null,
  is_active boolean not null default true
);

create table public.loyalty_accounts (                                    -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  customer_id uuid not null,
  balance integer not null default 0,
  unique (restaurant_id, customer_id),
  unique (restaurant_id, id),
  foreign key (restaurant_id, customer_id) references public.customers (restaurant_id, id) on delete cascade
);

create table public.loyalty_ledger (                                      -- [S4]
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  account_id uuid not null,
  delta integer not null,
  order_id uuid,
  reason text not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, idempotency_key),
  foreign key (restaurant_id, account_id) references public.loyalty_accounts (restaurant_id, id) on delete cascade
);

create table public.ai_conversations (                                    -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  member_id uuid not null,
  title text,
  created_at timestamptz not null default now(),
  unique (restaurant_id, id),
  foreign key (restaurant_id, member_id) references public.members (restaurant_id, id) on delete cascade
);

create table public.ai_messages (                                         -- [S4]
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  conversation_id uuid not null,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content jsonb not null,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, conversation_id) references public.ai_conversations (restaurant_id, id) on delete cascade
);

-- Every action the assistant wants to take is proposed first and executed only
-- after a member approves it.
create table public.ai_actions (                                          -- [S4]
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  conversation_id uuid not null,
  tool text not null,
  input jsonb not null,
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed')),
  approved_by uuid,
  executed_at timestamptz,
  result jsonb,
  created_at timestamptz not null default now(),
  foreign key (restaurant_id, conversation_id) references public.ai_conversations (restaurant_id, id) on delete cascade
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['restaurants', 'locations', 'members', 'subscriptions', 'tables', 'menus',
                           'categories', 'items', 'modifier_groups', 'menu_imports', 'orders',
                           'kitchen_tickets', 'payment_attempts']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()',
                   t || '_touch', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 11. Access helpers (private schema; used by RLS policies and api functions)
-- -----------------------------------------------------------------------------
-- Guests are Supabase anonymous users. They must never match a staff rule.
create function private.is_real_user() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
$$;

create function private.my_restaurant_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.restaurant_id
  from public.members m
  where m.user_id = auth.uid()
    and m.is_active
    and private.is_real_user()
    and (p_roles is null or m.role = any (p_roles))
$$;

create function private.my_location_ids(p_roles public.member_role[] default null)
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select l.id
  from public.members m
  join public.locations l on l.restaurant_id = m.restaurant_id
  where m.user_id = auth.uid()
    and m.is_active
    and private.is_real_user()
    and (p_roles is null or m.role = any (p_roles))
    and (m.all_locations
         or exists (select 1 from public.member_locations ml
                    where ml.member_id = m.id and ml.location_id = l.id))
$$;

create function private.my_guest_session_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select g.id from public.guest_sessions g where g.user_id = auth.uid()
$$;

create function private.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_real_user()
     and exists (select 1 from public.platform_admins p where p.user_id = auth.uid())
$$;

create function private.assert_location_role(p_location_id uuid, p_roles public.member_role[])
returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.my_location_ids(p_roles) x where x = p_location_id) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
end $$;

create function private.current_member_id(p_restaurant_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id from public.members m
  where m.restaurant_id = p_restaurant_id and m.user_id = auth.uid() and m.is_active
$$;

-- Fixed-window counter. Returns false once p_max is exceeded in the window.
create unlogged table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key (key, window_start)
);

create function private.rate_limit_hit(p_key text, p_max integer, p_window interval)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_secs double precision := extract(epoch from p_window);
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / v_secs) * v_secs);
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;
  return v_hits <= p_max;
end $$;

create function private.next_number(p_location_id uuid, p_date date, p_kind text) returns integer
language sql security definer set search_path = '' as $$
  insert into public.location_counters as c (location_id, business_date, kind, last_value)
  values (p_location_id, p_date, p_kind, 1)
  on conflict (location_id, business_date, kind) do update set last_value = c.last_value + 1
  returning c.last_value
$$;

create function private.business_date(p_location_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select ((now() at time zone l.timezone) - (l.business_day_starts - time '00:00'))::date
  from public.locations l where l.id = p_location_id
$$;

-- What the guest sees, derived from the three state machines.
create function public.order_display_status(o public.orders) returns text
language sql stable set search_path = '' as $$
  select case
    when o.status in ('rejected', 'cancelled') then o.status::text
    when o.paid_at is not null then 'paid'
    when o.kitchen_status = 'served' then 'served'
    when o.kitchen_status = 'ready' then 'ready'
    when o.kitchen_status = 'cooking' then 'cooking'
    when o.status = 'accepted' then 'accepted'
    else 'received'
  end
$$;

-- -----------------------------------------------------------------------------
-- 12. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS on every table in public. Default: no access. Policies below open reads
-- to the right people; writes are opened only where a plain form edits a row.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Tenancy
create policy restaurants_read on public.restaurants for select to authenticated
  using (id in (select private.my_restaurant_ids()) or (select private.is_platform_admin()));
create policy restaurants_owner_update on public.restaurants for update to authenticated
  using (id in (select private.my_restaurant_ids('{owner}')))
  with check (id in (select private.my_restaurant_ids('{owner}')));

create policy locations_read on public.locations for select to authenticated
  using (id in (select private.my_location_ids()) or (select private.is_platform_admin()));
create policy locations_admin_update on public.locations for update to authenticated
  using (id in (select private.my_location_ids('{owner,manager}')))
  with check (id in (select private.my_location_ids('{owner,manager}')));

create policy members_read on public.members for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
create policy member_locations_read on public.member_locations for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids()));
create policy invitations_read on public.invitations for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy device_pairings_read on public.device_pairings for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy platform_admins_self on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()));
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner}')) or (select private.is_platform_admin()));
create policy audit_log_read on public.audit_log for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')) or (select private.is_platform_admin()));

-- Floor and kitchen setup: all staff of the location read; owner/manager edit.
do $$
declare t text;
begin
  foreach t in array array['areas', 'tables', 'stations', 'station_prep_areas'] loop
    execute format($f$
      create policy %1$s_read on public.%1$I for select to authenticated
        using (location_id in (select private.my_location_ids()));
      create policy %1$s_admin_write on public.%1$I for all to authenticated
        using (location_id in (select private.my_location_ids('{owner,manager}')))
        with check (location_id in (select private.my_location_ids('{owner,manager}')));
    $f$, t);
  end loop;
end $$;

-- Menu source tables: owner/manager only. Everyone else reads published versions.
do $$
declare t text;
begin
  foreach t in array array['prep_areas', 'menus', 'menu_locations', 'categories', 'items', 'modifier_groups',
                           'modifiers', 'item_modifier_groups', 'menu_translations', 'category_translations',
                           'item_translations', 'modifier_group_translations', 'modifier_translations',
                           'menu_imports', 'menu_import_images'] loop
    execute format($f$
      create policy %1$s_admin_all on public.%1$I for all to authenticated
        using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')))
        with check (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
    $f$, t);
  end loop;
end $$;

create policy menu_versions_read on public.menu_versions for select to authenticated
  using (location_id in (select private.my_location_ids()));

create policy stop_list_read on public.stop_list for select to authenticated
  using (location_id in (select private.my_location_ids()));
create policy stop_list_write on public.stop_list for all to authenticated
  using (location_id in (select private.my_location_ids('{owner,manager,kitchen,waiter}')))
  with check (location_id in (select private.my_location_ids('{owner,manager,kitchen,waiter}')));

-- Operational data: staff of the location read; guests read their own.
create policy table_sessions_read on public.table_sessions for select to authenticated
  using (location_id in (select private.my_location_ids()));

create policy guest_sessions_read on public.guest_sessions for select to authenticated
  using (user_id = (select auth.uid()) or location_id in (select private.my_location_ids()));

create policy orders_read on public.orders for select to authenticated
  using (location_id in (select private.my_location_ids())
         or guest_session_id in (select private.my_guest_session_ids()));

-- Children are visible when the parent order is visible (RLS applies inside).
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));
create policy order_item_modifiers_read on public.order_item_modifiers for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id));

create policy kitchen_tickets_read on public.kitchen_tickets for select to authenticated
  using (location_id in (select private.my_location_ids()));
create policy kitchen_ticket_items_read on public.kitchen_ticket_items for select to authenticated
  using (exists (select 1 from public.kitchen_tickets k where k.id = ticket_id));
create policy order_status_history_read on public.order_status_history for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and o.location_id in (select private.my_location_ids())));

create policy service_requests_read on public.service_requests for select to authenticated
  using (location_id in (select private.my_location_ids())
         or guest_session_id in (select private.my_guest_session_ids()));

create policy bills_read on public.bills for select to authenticated
  using (location_id in (select private.my_location_ids('{owner,manager,waiter,cashier}')));
create policy bill_lines_read on public.bill_lines for select to authenticated
  using (exists (select 1 from public.bills b where b.id = bill_id));
create policy payments_read on public.payments for select to authenticated
  using (location_id in (select private.my_location_ids('{owner,manager,waiter,cashier}')));

create policy notification_channels_admin on public.notification_channels for all to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')))
  with check (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));

-- location_counters, telegram_link_codes, notification_outbox: no client policy.
-- Stage 2-4 tables get their policies in their own migrations; until then RLS
-- is on with no policy, which means no client access at all.

-- -----------------------------------------------------------------------------
-- 13. Table privileges
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.areas, public.tables, public.stations, public.station_prep_areas, public.prep_areas,
  public.menus, public.menu_locations, public.categories, public.items, public.modifier_groups,
  public.modifiers, public.item_modifier_groups, public.menu_translations, public.category_translations,
  public.item_translations, public.modifier_group_translations, public.modifier_translations,
  public.menu_imports, public.menu_import_images, public.stop_list, public.notification_channels
  to authenticated;
grant update (name, default_locale, tax_id, logo_path, brand_color) on public.restaurants to authenticated;
grant update (name, address, phone, kitchen_locale, guest_locales, qr_ordering_enabled,
              require_acceptance, max_auto_accept_total, business_day_starts) on public.locations to authenticated;
grant all on all tables in schema public to service_role;
grant usage on all sequences in schema public to service_role;
-- orders, order_items, kitchen_tickets, bills, payments, guest_sessions,
-- table_sessions, service_requests, members: no client writes. Functions only.

-- -----------------------------------------------------------------------------
-- 14. Domain functions [S1]
-- -----------------------------------------------------------------------------

-- 14.1 Sign-up: a real user creates a restaurant, its first location and
-- becomes the owner.
create function api.create_restaurant(p_name text, p_slug text, p_location_name text, p_display_name text)
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
  values (v_restaurant, v_location, 'standard', 'trialing', 0, now() + interval '30 days');
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id)
  values (v_restaurant, 'member', auth.uid(), 'restaurant.created', 'restaurant', v_restaurant);
  return v_restaurant;
end $$;

-- 14.2 Publish: builds an immutable snapshot for one location.
create function api.publish_menu(p_location_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_version integer;
  v_id uuid;
  v_snapshot jsonb;
  v_items jsonb;
  v_count integer;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  select restaurant_id into v_restaurant from public.locations where id = p_location_id;

  -- AI output never reaches guests unreviewed.
  if exists (
    with mn as (select ml.menu_id as id from public.menu_locations ml where ml.location_id = p_location_id),
         ct as (select c.id from public.categories c where c.menu_id in (select id from mn)),
         it as (select i.id from public.items i where i.category_id in (select id from ct)),
         gr as (select img.group_id as id from public.item_modifier_groups img where img.item_id in (select id from it)),
         md as (select m.id from public.modifiers m where m.group_id in (select id from gr))
    select 1 from public.menu_translations t where t.menu_id in (select id from mn) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.category_translations t where t.category_id in (select id from ct) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.item_translations t where t.item_id in (select id from it) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.modifier_group_translations t where t.group_id in (select id from gr) and t.source = 'ai' and t.reviewed_at is null
    union all select 1 from public.modifier_translations t where t.modifier_id in (select id from md) and t.source = 'ai' and t.reviewed_at is null
  ) then
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
          v_count, auth.uid())
  returning id into v_id;

  update public.locations set published_menu_version_id = v_id where id = p_location_id;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'menu.published', 'menu_version', v_id,
          jsonb_build_object('version', v_version, 'items', v_count));
  return v_id;
end $$;

-- 14.3 Public menu for the guest page (no sign-in needed). Published data only.
create function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('name', r.name, 'logo', r.logo_path, 'brand_color', r.brand_color),
    'location', jsonb_build_object('id', l.id, 'name', l.name, 'locales', to_jsonb(l.guest_locales),
                                   'ordering', l.qr_ordering_enabled),
    'menu', v.snapshot,
    'sold_out', (select coalesce(jsonb_agg(s.item_id), '[]'::jsonb) from public.stop_list s
                 where s.location_id = l.id and (s.until is null or s.until > now())))
  from public.restaurants r
  join public.locations l on l.restaurant_id = r.id
  join public.menu_versions v on v.id = l.published_menu_version_id
  where r.slug = p_restaurant_slug and l.slug = p_location_slug
    and r.status = 'active' and l.status = 'active'
$$;

-- 14.4 Guest joins a table. Called by our server only (service_role), after it
-- has verified the signed QR token and the guest's anonymous JWT.
create function private.join_table(p_user_id uuid, p_table_id uuid, p_qr_version integer, p_locale public.app_locale)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables;
  v_location public.locations;
  v_session uuid;
  v_guest uuid;
begin
  select * into v_table from public.tables where id = p_table_id;
  if not found or not v_table.is_active or v_table.qr_version <> p_qr_version then
    raise exception using errcode = 'RS403', message = 'table_unavailable';
  end if;
  select * into v_location from public.locations where id = v_table.location_id;
  if v_location.status <> 'active' or not v_location.qr_ordering_enabled then
    raise exception using errcode = 'RS403', message = 'ordering_disabled';
  end if;
  if not private.rate_limit_hit('join:' || p_user_id, 20, interval '1 hour') then
    raise exception using errcode = 'RS429', message = 'rate_limited';
  end if;

  select g.id into v_guest from public.guest_sessions g
  where g.user_id = p_user_id and g.table_id = p_table_id and g.revoked_at is null and g.expires_at > now()
  order by g.created_at desc limit 1;
  if v_guest is not null then
    update public.guest_sessions set last_seen_at = now(), expires_at = now() + interval '4 hours', locale = p_locale
    where id = v_guest;
    return v_guest;
  end if;

  insert into public.table_sessions (restaurant_id, location_id, table_id)
  values (v_table.restaurant_id, v_table.location_id, v_table.id)
  on conflict (table_id) where status = 'open' do nothing;
  select id into v_session from public.table_sessions where table_id = p_table_id and status = 'open';

  insert into public.guest_sessions (restaurant_id, location_id, table_id, table_session_id, user_id,
                                     qr_version, locale, expires_at)
  values (v_table.restaurant_id, v_table.location_id, v_table.id, v_session, p_user_id,
          p_qr_version, p_locale, now() + interval '4 hours')
  returning id into v_guest;
  return v_guest;
end $$;

-- 14.5 Kitchen tickets for an accepted order: one per station.
create function private.create_tickets(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_station uuid;
  v_ticket uuid;
begin
  select * into v_order from public.orders where id = p_order_id;
  for v_station in select distinct oi.station_id from public.order_items oi where oi.order_id = p_order_id loop
    insert into public.kitchen_tickets (restaurant_id, location_id, order_id, station_id, number)
    values (v_order.restaurant_id, v_order.location_id, p_order_id, v_station, v_order.number)
    returning id into v_ticket;
    insert into public.kitchen_ticket_items (restaurant_id, ticket_id, order_item_id, quantity)
    select v_order.restaurant_id, v_ticket, oi.id, oi.quantity - oi.cancelled_quantity
    from public.order_items oi
    where oi.order_id = p_order_id and oi.station_id = v_station and oi.quantity > oi.cancelled_quantity;
  end loop;
end $$;

-- 14.6 Placing an order. One core used by the guest flow and the waiter app.
-- Prices come from the published snapshot, never from the client.
create function private.place_order_core(
  p_location_id uuid,
  p_table_id uuid,
  p_table_session_id uuid,
  p_guest_session_id uuid,
  p_member_id uuid,
  p_source public.order_source,
  p_locale public.app_locale,
  p_idempotency_key uuid,
  p_lines jsonb,             -- [{"item_id": uuid, "quantity": int, "modifier_ids": [uuid], "note": text}]
  p_note text,
  p_needs_acceptance boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_location public.locations;
  v_snapshot jsonb;
  v_hash text := encode(extensions.digest(p_lines::text || coalesce(p_note, ''), 'sha256'), 'hex');
  v_existing public.orders;
  v_order_id uuid;
  v_number integer;
  v_date date;
  v_line jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_selected jsonb;
  v_group jsonb;
  v_cnt integer;
  v_sum integer;
  v_mod_total integer;
  v_matched integer;
  v_station uuid;
  v_oi uuid;
  v_subtotal integer := 0;
  v_count integer := 0;
  v_sort integer := 0;
  v_auto boolean;
begin
  select * into v_location from public.locations where id = p_location_id;

  -- Idempotent replay: same key + same body returns the same order.
  select * into v_existing from public.orders
  where restaurant_id = v_location.restaurant_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash = v_hash
       and v_existing.guest_session_id is not distinct from p_guest_session_id
       and v_existing.created_by_member is not distinct from p_member_id then
      return v_existing.id;
    end if;
    raise exception using errcode = 'RS409', message = 'idempotency_key_reused';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception using errcode = 'RS422', message = 'invalid_lines';
  end if;

  select v.snapshot into v_snapshot from public.menu_versions v where v.id = v_location.published_menu_version_id;
  if v_snapshot is null then
    raise exception using errcode = 'RS422', message = 'menu_not_published';
  end if;

  v_date := private.business_date(p_location_id);
  v_number := private.next_number(p_location_id, v_date, 'order');

  insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id,
                             created_by_member, source, locale, business_date, number, idempotency_key,
                             request_hash, guest_note)
  values (v_location.restaurant_id, p_location_id, p_table_id, p_table_session_id, p_guest_session_id,
          p_member_id, p_source, p_locale, v_date, v_number, p_idempotency_key, v_hash,
          nullif(trim(left(p_note, 300)), ''))
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;
    v_item := v_snapshot -> 'items' -> (v_item_id::text);
    if v_item is null then
      raise exception using errcode = 'RS422', message = 'item_unavailable', detail = v_item_id::text;
    end if;
    if exists (select 1 from public.stop_list s where s.location_id = p_location_id and s.item_id = v_item_id
               and (s.until is null or s.until > now())) then
      raise exception using errcode = 'RS422', message = 'item_sold_out', detail = v_item_id::text;
    end if;
    if v_qty is null or v_qty not between 1 and 20 then
      raise exception using errcode = 'RS422', message = 'invalid_quantity';
    end if;

    v_selected := coalesce(v_line -> 'modifier_ids', '[]'::jsonb);
    v_mod_total := 0;
    v_matched := 0;
    for v_group in select * from jsonb_array_elements(v_item -> 'groups') loop
      select count(*), coalesce(sum((md ->> 'price_delta')::integer), 0)
      into v_cnt, v_sum
      from jsonb_array_elements(v_group -> 'modifiers') md
      where v_selected ? (md ->> 'id');
      if v_cnt < (v_group ->> 'min')::integer or v_cnt > (v_group ->> 'max')::integer then
        raise exception using errcode = 'RS422', message = 'invalid_modifiers', detail = v_group ->> 'id';
      end if;
      v_mod_total := v_mod_total + v_sum;
      v_matched := v_matched + v_cnt;
    end loop;
    if v_matched <> jsonb_array_length(v_selected) then
      raise exception using errcode = 'RS422', message = 'unknown_modifier';
    end if;

    v_station := null;
    select sp.station_id into v_station from public.station_prep_areas sp
    where sp.location_id = p_location_id and sp.prep_area_id = (v_item ->> 'prep_area_id')::uuid;
    if v_station is null then
      select s.id into v_station from public.stations s where s.location_id = p_location_id and s.is_default;
    end if;
    if v_station is null then
      raise exception using errcode = 'RS422', message = 'no_station_configured';
    end if;

    v_sort := v_sort + 1;
    insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, prep_area_id, station_id,
                                    unit_price, modifiers_total, quantity, line_total, note, sort)
    values (v_location.restaurant_id, v_order_id, v_item_id, v_item -> 'name', (v_item ->> 'prep_area_id')::uuid,
            v_station, (v_item ->> 'price')::integer, v_mod_total, v_qty,
            ((v_item ->> 'price')::integer + v_mod_total) * v_qty,
            nullif(left(trim(v_line ->> 'note'), 200), ''), v_sort)
    returning id into v_oi;

    insert into public.order_item_modifiers (restaurant_id, order_id, order_item_id, modifier_id, name_i18n, price_delta)
    select v_location.restaurant_id, v_order_id, v_oi, (md ->> 'id')::uuid, md -> 'name', (md ->> 'price_delta')::integer
    from jsonb_array_elements(v_item -> 'groups') g, jsonb_array_elements(g -> 'modifiers') md
    where v_selected ? (md ->> 'id');

    v_subtotal := v_subtotal + ((v_item ->> 'price')::integer + v_mod_total) * v_qty;
    v_count := v_count + v_qty;
  end loop;

  v_auto := not p_needs_acceptance;
  update public.orders
  set subtotal = v_subtotal, total = v_subtotal, item_count = v_count,
      status = case when v_auto then 'accepted'::public.order_status else 'placed'::public.order_status end,
      accepted_at = case when v_auto then now() end,
      accepted_by = case when v_auto then p_member_id end
  where id = v_order_id;

  if v_auto then
    perform private.create_tickets(v_order_id);
  end if;
  perform private.enqueue_order_notification(v_order_id);
  return v_order_id;
end $$;

-- Guest order: server-only (service_role), after the server has verified the
-- table QR signature and the guest's anonymous JWT.
create function private.place_guest_order(
  p_user_id uuid,
  p_guest_session_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
  v_total_guess integer;
  v_id uuid;
begin
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> p_user_id or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version
     or not v_location.qr_ordering_enabled or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'ordering_disabled';
  end if;
  if not exists (select 1 from public.orders o where o.restaurant_id = v_guest.restaurant_id
                 and o.idempotency_key = p_idempotency_key) then
    if not private.rate_limit_hit('order:guest:' || p_guest_session_id, 6, interval '10 minutes')
       or not private.rate_limit_hit('order:table:' || v_table.id, 30, interval '1 hour') then
      raise exception using errcode = 'RS429', message = 'rate_limited';
    end if;
  end if;

  v_id := private.place_order_core(v_location.id, v_table.id, v_guest.table_session_id, v_guest.id, null, 'qr',
                                   v_guest.locale, p_idempotency_key, p_lines, p_note, true);

  -- Large or flagged orders wait for a waiter; small ones go straight to the kitchen.
  select total into v_total_guess from public.orders where id = v_id;
  if not v_location.require_acceptance and v_total_guess <= v_location.max_auto_accept_total then
    update public.orders set status = 'accepted', accepted_at = now() where id = v_id and status = 'placed';
    if found then
      perform private.create_tickets(v_id);
    end if;
  end if;

  update public.guest_sessions set last_seen_at = now(), expires_at = now() + interval '4 hours' where id = v_guest.id;
  return v_id;
end $$;

-- Waiter order from the tablet: auto-accepted, opens the table if needed.
create function api.place_waiter_order(
  p_table_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null,
  p_locale public.app_locale default 'hy'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_table public.tables;
  v_session uuid;
  v_member uuid;
begin
  select * into v_table from public.tables where id = p_table_id;
  if not found then raise exception using errcode = 'P0002', message = 'table_not_found'; end if;
  perform private.assert_location_role(v_table.location_id, '{owner,manager,waiter}');
  v_member := private.current_member_id(v_table.restaurant_id);

  insert into public.table_sessions (restaurant_id, location_id, table_id, opened_by)
  values (v_table.restaurant_id, v_table.location_id, v_table.id, v_member)
  on conflict (table_id) where status = 'open' do nothing;
  select id into v_session from public.table_sessions where table_id = p_table_id and status = 'open';

  return private.place_order_core(v_table.location_id, v_table.id, v_session, null, v_member, 'waiter',
                                  p_locale, p_idempotency_key, p_lines, p_note, false);
end $$;

-- 14.7 Waiter accepts or rejects a 'placed' order.
create function api.accept_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order_not_found'; end if;
  perform private.assert_location_role(v_order.location_id, '{owner,manager,waiter}');
  if v_order.status = 'accepted' then return; end if;     -- idempotent replay
  if v_order.status <> 'placed' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_order.status::text;
  end if;
  update public.orders set status = 'accepted', accepted_at = now(),
         accepted_by = private.current_member_id(v_order.restaurant_id)
  where id = p_order_id;
  perform private.create_tickets(p_order_id);
end $$;

create function api.reject_order(p_order_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order_not_found'; end if;
  perform private.assert_location_role(v_order.location_id, '{owner,manager,waiter}');
  if v_order.status = 'rejected' then return; end if;
  if v_order.status <> 'placed' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_order.status::text;
  end if;
  update public.orders set status = 'rejected', rejected_at = now(), reject_reason = left(p_reason, 200),
         rejected_by = private.current_member_id(v_order.restaurant_id)
  where id = p_order_id;
end $$;

-- 14.8 Kitchen and waiter move tickets. Compare-and-set: the caller says what
-- it believes the status is. A repeat of the same move succeeds silently, so
-- an offline outbox can replay safely.
create function api.set_ticket_status(p_ticket_id uuid, p_expected public.ticket_status, p_next public.ticket_status)
returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare
  v_t public.kitchen_tickets;
  v_roles public.member_role[];
begin
  select * into v_t from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or v_t.kind <> 'order' then
    raise exception using errcode = 'P0002', message = 'ticket_not_found';
  end if;
  v_roles := case
    when p_expected = 'new'     and p_next = 'cooking' then '{owner,manager,kitchen}'
    when p_expected = 'new'     and p_next = 'ready'   then '{owner,manager,kitchen}'   -- drinks: no cooking step
    when p_expected = 'cooking' and p_next = 'ready'   then '{owner,manager,kitchen}'
    when p_expected = 'ready'   and p_next = 'cooking' then '{owner,manager,kitchen}'   -- undo a wrong "ready"
    when p_expected = 'ready'   and p_next = 'served'  then '{owner,manager,kitchen,waiter}'
  end::public.member_role[];
  if v_roles is null then
    raise exception using errcode = 'RS422', message = 'transition_not_allowed';
  end if;
  perform private.assert_location_role(v_t.location_id, v_roles);
  if v_t.status = p_next then
    return v_t.status;
  end if;
  if v_t.status <> p_expected then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_t.status::text;
  end if;
  update public.kitchen_tickets
  set status = p_next,
      started_at = case when p_next = 'cooking' then coalesce(started_at, now()) else started_at end,
      ready_at = case when p_next = 'ready' then now() when p_next = 'cooking' then null else ready_at end,
      served_at = case when p_next = 'served' then now() else served_at end
  where id = p_ticket_id;
  return p_next;
end $$;

create function api.acknowledge_void(p_ticket_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_t public.kitchen_tickets;
begin
  select * into v_t from public.kitchen_tickets where id = p_ticket_id for update;
  if not found or v_t.kind <> 'void' then
    raise exception using errcode = 'P0002', message = 'ticket_not_found';
  end if;
  perform private.assert_location_role(v_t.location_id, '{owner,manager,kitchen}');
  update public.kitchen_tickets set acknowledged_at = coalesce(acknowledged_at, now()),
         acknowledged_by = coalesce(acknowledged_by, auth.uid())
  where id = p_ticket_id;
end $$;

-- 14.9 Waiter cancels some quantity of an order line. The original ticket is
-- not edited; the kitchen gets a void ticket to acknowledge, unless the whole
-- ticket was still untouched ('new'), in which case it is simply cancelled.
create function api.cancel_order_item(p_order_item_id uuid, p_quantity integer, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.order_items;
  v_order public.orders;
  v_ticket public.kitchen_tickets;
  v_void uuid;
begin
  select * into v_item from public.order_items where id = p_order_item_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'order_item_not_found'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  perform private.assert_location_role(v_order.location_id, '{owner,manager,waiter}');
  if p_quantity < 1 or p_quantity > v_item.quantity - v_item.cancelled_quantity then
    raise exception using errcode = 'RS422', message = 'invalid_quantity';
  end if;

  select * into v_ticket from public.kitchen_tickets
  where order_id = v_order.id and station_id = v_item.station_id and kind = 'order';
  if found and v_ticket.status = 'served' then
    -- Food already went out: this is a comp, managers only.
    perform private.assert_location_role(v_order.location_id, '{owner,manager}');
  end if;

  update public.order_items
  set cancelled_quantity = cancelled_quantity + p_quantity,
      line_total = (unit_price + modifiers_total) * (quantity - cancelled_quantity - p_quantity)
  where id = p_order_item_id;

  update public.orders o
  set subtotal = s.sum, total = s.sum, item_count = s.cnt
  from (select coalesce(sum(line_total), 0) as sum, coalesce(sum(quantity - cancelled_quantity), 0) as cnt
        from public.order_items where order_id = v_order.id) s
  where o.id = v_order.id;

  if found and v_ticket.status in ('new', 'cooking', 'ready') then
    if v_ticket.status = 'new' and not exists (
         select 1 from public.order_items oi
         where oi.order_id = v_order.id and oi.station_id = v_item.station_id
           and oi.quantity > oi.cancelled_quantity) then
      update public.kitchen_tickets set status = 'cancelled', cancelled_at = now() where id = v_ticket.id;
    else
      insert into public.kitchen_tickets (restaurant_id, location_id, order_id, station_id, kind, voids_ticket_id, number)
      values (v_order.restaurant_id, v_order.location_id, v_order.id, v_ticket.station_id, 'void', v_ticket.id, v_order.number)
      returning id into v_void;
      insert into public.kitchen_ticket_items (restaurant_id, ticket_id, order_item_id, quantity)
      values (v_order.restaurant_id, v_void, v_item.id, p_quantity);
    end if;
  end if;

  if not exists (select 1 from public.order_items where order_id = v_order.id and quantity > cancelled_quantity) then
    update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = left(p_reason, 200),
           cancelled_by = private.current_member_id(v_order.restaurant_id)
    where id = v_order.id;
  end if;

  insert into public.order_status_history (restaurant_id, order_id, entity, from_status, to_status,
                                           actor_kind, actor_user_id, reason)
  values (v_order.restaurant_id, v_order.id, 'order_item', null, 'cancelled:' || p_quantity,
          'member', auth.uid(), left(p_reason, 200));
end $$;

-- 14.10 Close the table: one bill, manual payment(s), session closed.
create function api.settle_table_session(p_table_session_id uuid, p_payments jsonb, p_idempotency_key uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.table_sessions;
  v_bill uuid;
  v_total integer;
  v_paid integer;
  v_date date;
begin
  select * into v_session from public.table_sessions where id = p_table_session_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'table_session_not_found'; end if;
  perform private.assert_location_role(v_session.location_id, '{owner,manager,waiter,cashier}');

  select id into v_bill from public.bills
  where restaurant_id = v_session.restaurant_id and idempotency_key = p_idempotency_key;
  if found then return v_bill; end if;                       -- replay
  if v_session.status <> 'open' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_session.status::text;
  end if;
  if exists (select 1 from public.orders where table_session_id = p_table_session_id and status = 'placed') then
    raise exception using errcode = 'RS422', message = 'unaccepted_orders';
  end if;

  select coalesce(sum(oi.line_total), 0) into v_total
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.table_session_id = p_table_session_id and o.status = 'accepted';

  select coalesce(sum((p ->> 'amount')::integer), 0) into v_paid from jsonb_array_elements(p_payments) p;
  if v_paid <> v_total then
    raise exception using errcode = 'RS422', message = 'payment_mismatch',
      detail = format('total=%s paid=%s', v_total, v_paid);
  end if;

  v_date := private.business_date(v_session.location_id);
  insert into public.bills (restaurant_id, location_id, table_session_id, business_date, number, status,
                            subtotal, total, idempotency_key, closed_at, closed_by)
  values (v_session.restaurant_id, v_session.location_id, v_session.id, v_date,
          private.next_number(v_session.location_id, v_date, 'bill'), 'paid', v_total, v_total,
          p_idempotency_key, now(), private.current_member_id(v_session.restaurant_id))
  returning id into v_bill;

  insert into public.bill_lines (restaurant_id, bill_id, order_item_id, quantity, amount)
  select v_session.restaurant_id, v_bill, oi.id, oi.quantity - oi.cancelled_quantity, oi.line_total
  from public.order_items oi join public.orders o on o.id = oi.order_id
  where o.table_session_id = p_table_session_id and o.status = 'accepted' and oi.quantity > oi.cancelled_quantity;

  insert into public.payments (restaurant_id, location_id, bill_id, method, amount, recorded_by, confirmed_at)
  select v_session.restaurant_id, v_session.location_id, v_bill, (p ->> 'method')::public.payment_method,
         (p ->> 'amount')::integer, auth.uid(), now()
  from jsonb_array_elements(p_payments) p
  where (p ->> 'amount')::integer > 0;

  update public.orders set paid_at = now() where table_session_id = p_table_session_id and status = 'accepted';
  update public.table_sessions set status = 'closed', closed_at = now(),
         closed_by = private.current_member_id(v_session.restaurant_id)
  where id = p_table_session_id;
  update public.guest_sessions set revoked_at = now() where table_session_id = p_table_session_id and revoked_at is null;
  return v_bill;
end $$;

-- -----------------------------------------------------------------------------
-- 15. Triggers: derived status, history, realtime, notifications
-- -----------------------------------------------------------------------------

-- An order's kitchen status is its slowest live ticket.
create function private.sync_order_kitchen_status() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_rank integer;
begin
  if new.kind <> 'order' then return null; end if;
  select min(case t.status when 'new' then 0 when 'cooking' then 1 when 'ready' then 2 when 'served' then 3 end)
  into v_rank
  from public.kitchen_tickets t
  where t.order_id = new.order_id and t.kind = 'order' and t.status <> 'cancelled';
  if v_rank is null then return null; end if;
  update public.orders
  set kitchen_status = (array['pending', 'cooking', 'ready', 'served'])[v_rank + 1]::public.kitchen_status,
      ready_at = case when v_rank >= 2 then coalesce(ready_at, now()) else null end,
      served_at = case when v_rank = 3 then coalesce(served_at, now()) else null end
  where id = new.order_id
    and kitchen_status is distinct from (array['pending', 'cooking', 'ready', 'served'])[v_rank + 1]::public.kitchen_status;
  return null;
end $$;
create trigger kitchen_tickets_sync_order after insert or update of status on public.kitchen_tickets
  for each row execute function private.sync_order_kitchen_status();

create function private.log_status_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor public.actor_kind;
begin
  v_actor := case when auth.uid() is null then 'system'
                  when coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then 'guest'
                  else 'member' end;
  if tg_table_name = 'orders' then
    insert into public.order_status_history (restaurant_id, order_id, entity, from_status, to_status, actor_kind, actor_user_id)
    values (new.restaurant_id, new.id, 'order',
            case when tg_op = 'UPDATE' then old.status::text end, new.status::text, v_actor, auth.uid());
  else
    insert into public.order_status_history (restaurant_id, order_id, ticket_id, entity, from_status, to_status, actor_kind, actor_user_id)
    values (new.restaurant_id, new.order_id, new.id, 'ticket',
            case when tg_op = 'UPDATE' then old.status::text end, new.status::text, v_actor, auth.uid());
  end if;
  return null;
end $$;
create trigger orders_history_ins after insert on public.orders
  for each row execute function private.log_status_change();
create trigger orders_history_upd after update of status on public.orders
  for each row when (old.status is distinct from new.status) execute function private.log_status_change();
create trigger tickets_history_upd after update of status on public.kitchen_tickets
  for each row when (old.status is distinct from new.status) execute function private.log_status_change();

-- Realtime: small "something changed" messages on private channels.
--   loc:<location_id>      all staff screens of a location
--   guest:<guest_session>  one guest's phone
create function private.broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'orders' then
    perform realtime.send(jsonb_build_object('id', new.id, 'table_id', new.table_id, 'number', new.number,
                            'status', new.status, 'kitchen_status', new.kitchen_status, 'paid', new.paid_at is not null),
                          'order', 'loc:' || new.location_id, true);
    if new.guest_session_id is not null then
      perform realtime.send(jsonb_build_object('id', new.id, 'number', new.number,
                              'display_status', public.order_display_status(new)),
                            'order', 'guest:' || new.guest_session_id, true);
    end if;
  elsif tg_table_name = 'kitchen_tickets' then
    perform realtime.send(jsonb_build_object('id', new.id, 'order_id', new.order_id, 'station_id', new.station_id,
                            'kind', new.kind, 'status', new.status, 'acknowledged', new.acknowledged_at is not null),
                          'ticket', 'loc:' || new.location_id, true);
  elsif tg_table_name = 'service_requests' then
    perform realtime.send(jsonb_build_object('id', new.id, 'table_id', new.table_id, 'kind', new.kind, 'status', new.status),
                          'service_request', 'loc:' || new.location_id, true);
    if new.guest_session_id is not null then
      perform realtime.send(jsonb_build_object('id', new.id, 'kind', new.kind, 'status', new.status),
                            'service_request', 'guest:' || new.guest_session_id, true);
    end if;
  elsif tg_table_name = 'table_sessions' then
    perform realtime.send(jsonb_build_object('id', new.id, 'table_id', new.table_id, 'status', new.status),
                          'table', 'loc:' || new.location_id, true);
  end if;
  return null;
end $$;
create trigger orders_broadcast after insert or update of status, kitchen_status, paid_at on public.orders
  for each row execute function private.broadcast_change();
create trigger kitchen_tickets_broadcast after insert or update of status, acknowledged_at on public.kitchen_tickets
  for each row execute function private.broadcast_change();
create trigger service_requests_broadcast after insert or update of status on public.service_requests
  for each row execute function private.broadcast_change();
create trigger table_sessions_broadcast after insert or update of status on public.table_sessions
  for each row execute function private.broadcast_change();

-- Telegram: one queued message per channel for every new order. Called by
-- place_order_core. A worker sends them (pg_net call on insert plus a pg_cron
-- retry sweep); see realtime.md.
create function private.enqueue_order_notification(p_order_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
  select o.restaurant_id, c.id, 'order.placed', 'order.placed:' || o.id,
         jsonb_build_object('order_id', o.id, 'location_id', o.location_id, 'table_id', o.table_id,
                            'number', o.number, 'source', o.source, 'total', o.total, 'status', o.status)
  from public.orders o
  join public.notification_channels c on c.restaurant_id = o.restaurant_id
  where o.id = p_order_id and c.is_active
    and (c.location_id is null or c.location_id = o.location_id)
    and 'order.placed' = any (c.events)
  on conflict (channel_id, dedupe_key) do nothing
$$;

-- -----------------------------------------------------------------------------
-- 16. Realtime and Storage access
-- -----------------------------------------------------------------------------
create policy staff_receive_location on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'loc:%'
    and split_part((select realtime.topic()), ':', 2) in
        (select x::text from private.my_location_ids() x)
  );

create policy guest_receive_own on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'guest:%'
    and split_part((select realtime.topic()), ':', 2) in
        (select x::text from private.my_guest_session_ids() x)
  );
-- No INSERT policy: clients cannot broadcast. Only the database sends.

insert into storage.buckets (id, name, public) values
  ('menu-images', 'menu-images', true),     -- dish photos, logos: public read
  ('menu-imports', 'menu-imports', false)   -- paper-menu photos: private
on conflict (id) do nothing;

create policy menu_files_write on storage.objects for all to authenticated
  using (bucket_id in ('menu-images', 'menu-imports')
         and (storage.foldername(name))[1] in (select x::text from private.my_restaurant_ids('{owner,manager}') x))
  with check (bucket_id in ('menu-images', 'menu-imports')
         and (storage.foldername(name))[1] in (select x::text from private.my_restaurant_ids('{owner,manager}') x));

-- -----------------------------------------------------------------------------
-- 17. Function privileges
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema private, api, public from public, anon, authenticated;
grant execute on function private.is_real_user() to authenticated;
grant execute on function private.my_restaurant_ids(public.member_role[]) to authenticated;
grant execute on function private.my_location_ids(public.member_role[]) to authenticated;
grant execute on function private.my_guest_session_ids() to authenticated;
grant execute on function private.is_platform_admin() to authenticated;
grant execute on function public.order_display_status(public.orders) to authenticated, service_role;
grant execute on function api.public_menu(text, text) to anon, authenticated;
grant execute on function api.create_restaurant(text, text, text, text) to authenticated;
grant execute on function api.publish_menu(uuid) to authenticated;
grant execute on function api.accept_order(uuid) to authenticated;
grant execute on function api.reject_order(uuid, text) to authenticated;
grant execute on function api.set_ticket_status(uuid, public.ticket_status, public.ticket_status) to authenticated;
grant execute on function api.acknowledge_void(uuid) to authenticated;
grant execute on function api.cancel_order_item(uuid, integer, text) to authenticated;
grant execute on function api.settle_table_session(uuid, jsonb, uuid) to authenticated;
grant execute on function api.place_waiter_order(uuid, uuid, jsonb, text, public.app_locale) to authenticated;
-- Guest flows: our server only.
grant execute on function private.join_table(uuid, uuid, integer, public.app_locale) to service_role;
grant execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text) to service_role;
