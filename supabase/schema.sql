-- Flight Log - Supabase schema
-- Run in the Supabase SQL editor of a fresh project. Single user; every row
-- is owned by the signed-in user and RLS restricts access to owner = auth.uid().

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- entries: one row per logbook entry (soft-deleted via deleted_at)
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  source         text not null default 'manual' check (source in ('historical','manual','import')),

  date           date not null,
  tail_number    text not null default '',
  aircraft       text not null default '',
  route_from     text not null default '',
  route_to       text not null default '',
  total_time     numeric not null default 0,
  single_engine  numeric not null default 0,
  multi_engine   numeric not null default 0,
  jet            numeric not null default 0,
  turbo_prop     numeric not null default 0,
  actual_inst    numeric not null default 0,
  sim_inst       numeric not null default 0,
  approaches     numeric not null default 0,
  night          numeric not null default 0,
  night_landings numeric not null default 0,
  day_landings   numeric not null default 0,
  cross_country  numeric not null default 0,
  pic            numeric not null default 0,
  sic            numeric not null default 0,
  c130_pic       numeric not null default 0,
  c130_total     numeric not null default 0,
  c130_sic       numeric not null default 0,
  b737_pic       numeric not null default 0,
  b737_total     numeric not null default 0,
  bae146_pic     numeric not null default 0,
  bae146_total   numeric not null default 0,
  citation       numeric not null default 0,
  over_12500     numeric not null default 0,
  p2_pic         numeric not null default 0,
  p2_sic         numeric not null default 0,
  drops          numeric not null default 0,
  notes          text not null default ''
);

create index if not exists entries_owner_date_idx on public.entries (owner, date);
create index if not exists entries_owner_live_idx on public.entries (owner) where deleted_at is null;

-- ---------------------------------------------------------------------------
-- entry_history: append-only before/after snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.entry_history (
  id          bigint generated always as identity primary key,
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_id    uuid not null,
  changed_at  timestamptz not null default now(),
  action      text not null check (action in ('create','update','delete')),
  before      jsonb,
  after       jsonb
);

create index if not exists entry_history_entry_idx on public.entry_history (entry_id, changed_at);

-- ---------------------------------------------------------------------------
-- settings: key/value per owner (signature PNG, Exhibit 30 personal fields,
-- tail->aircraft map, column preferences, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb,
  updated_at  timestamptz not null default now(),
  primary key (owner, key)
);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists entries_set_updated_at on public.entries;
create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at();

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.entries       enable row level security;
alter table public.entry_history enable row level security;
alter table public.settings      enable row level security;

drop policy if exists entries_select on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;
create policy entries_select on public.entries for select using (owner = auth.uid());
create policy entries_insert on public.entries for insert with check (owner = auth.uid());
create policy entries_update on public.entries for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy entries_delete on public.entries for delete using (owner = auth.uid());

drop policy if exists history_select on public.entry_history;
drop policy if exists history_insert on public.entry_history;
drop policy if exists history_update on public.entry_history;
drop policy if exists history_delete on public.entry_history;
create policy history_select on public.entry_history for select using (owner = auth.uid());
create policy history_insert on public.entry_history for insert with check (owner = auth.uid());
-- append-only: no update/delete policies on entry_history

drop policy if exists settings_select on public.settings;
drop policy if exists settings_insert on public.settings;
drop policy if exists settings_update on public.settings;
drop policy if exists settings_delete on public.settings;
create policy settings_select on public.settings for select using (owner = auth.uid());
create policy settings_insert on public.settings for insert with check (owner = auth.uid());
create policy settings_update on public.settings for update using (owner = auth.uid()) with check (owner = auth.uid());
create policy settings_delete on public.settings for delete using (owner = auth.uid());

-- Sign-ups are disabled via the management API (config/auth disable_signup=true) once John's user exists.
