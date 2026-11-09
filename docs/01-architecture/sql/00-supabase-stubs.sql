-- Minimal stand-ins for the Supabase objects our schema touches, so the draft
-- schema and smoke test run on a plain Postgres 15+ for validation.
-- NEVER run this file against a real Supabase project: there these objects
-- already exist and are managed by Supabase.

-- Supabase installs extensions into the `extensions` schema.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

-- auth -----------------------------------------------------------------------
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

-- realtime -------------------------------------------------------------------
create schema if not exists realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table if not exists realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  extension text not null default 'broadcast',
  event text,
  payload jsonb,
  private boolean not null default true,
  inserted_at timestamptz not null default now()
);
alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to authenticated;

-- In Supabase this returns the topic the client is joining.
create or replace function realtime.topic() returns text
language sql stable as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;

create or replace function realtime.send(
  payload jsonb, event text, topic text, private boolean default true
) returns void
language sql security definer set search_path = '' as $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values (topic, 'broadcast', event, payload, private);
$$;

-- storage --------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- vault ----------------------------------------------------------------------
-- Stand-in for Supabase Vault (no encryption here). Only postgres and
-- SECURITY DEFINER functions owned by it can read secrets.
create schema if not exists vault;
revoke all on schema vault from public;

create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text not null default '',
  secret text not null,
  created_at timestamptz not null default now()
);

create or replace view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, created_at from vault.secrets;

create or replace function vault.create_secret(
  new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null
) returns uuid
language sql security definer set search_path = '' as $$
  insert into vault.secrets (secret, name, description) values (new_secret, new_name, new_description) returning id
$$;

-- auth sessions, so revoking a device can be tested ----------------------------
create table if not exists auth.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  not_after timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists auth.refresh_tokens (
  id bigint generated always as identity primary key,
  user_id varchar(255),
  token varchar(255),
  revoked boolean,
  session_id uuid,
  created_at timestamptz not null default now()
);
