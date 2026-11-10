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

-- Supabase grants everything in public to the API roles by default, so a
-- migration that forgets its revokes would leave a table open to anon. The
-- harness does the same so tests/sql/rls_coverage.sql catches that.
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;

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
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
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

-- PostgREST's login role, so the migration exposing the api schema runs here too.
do $$ begin
  create role authenticator nologin noinherit;
exception when duplicate_object then null; end $$;

-- pg_net ----------------------------------------------------------------------
-- Stand-in for pg_net (not installed on the harness). Requests are only
-- recorded in net._stub_requests; tests write the answers into
-- net._http_response themselves, as pg_net's worker would after commit.
-- Same signature and response columns as pg_net on Supabase.
create schema if not exists net;
revoke all on schema net from public;

create table if not exists net._stub_requests (
  id bigint generated always as identity primary key,
  method text not null,
  url text not null,
  headers jsonb,
  body jsonb,
  timeout_milliseconds integer,
  created timestamptz not null default now()
);

create table if not exists net._http_response (
  id bigint,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz not null default now()
);

create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
) returns bigint
language sql security definer set search_path = '' as $$
  insert into net._stub_requests (method, url, headers, body, timeout_milliseconds)
  values ('POST', url, headers, body, timeout_milliseconds) returning id
$$;

-- pg_cron ---------------------------------------------------------------------
-- Stand-in for pg_cron: schedules are recorded, nothing runs by itself.
create schema if not exists cron;
revoke all on schema cron from public;

create table if not exists cron.job (
  jobid bigint generated always as identity primary key,
  jobname text unique,
  schedule text not null,
  command text not null,
  active boolean not null default true
);

create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint
language sql security definer set search_path = '' as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid
$$;

create or replace function cron.unschedule(job_name text) returns boolean
language sql security definer set search_path = '' as $$
  with d as (delete from cron.job where jobname = job_name returning 1) select exists (select 1 from d)
$$;
