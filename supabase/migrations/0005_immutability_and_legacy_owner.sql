-- 0005_immutability_and_legacy_owner.sql
-- Forward-only migration addressing Task2 blockers:
-- - DB-level immutability for selected append-only tables
-- - Admin-only legacy owner backfill mechanism
-- - Remove write paths for legacy explanations to reduce split-brain

begin;

-- ---------------------------------------------------------------------------
-- 1) True immutability at DB level (triggers that raise)
-- ---------------------------------------------------------------------------

create or replace function public.raise_immutable_write()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'table "%" is immutable (no % allowed)', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

-- Enforce immutability even for privileged roles (RLS is not sufficient).
drop trigger if exists config_profiles_immutable_update on public.config_profiles;
drop trigger if exists config_profiles_immutable_delete on public.config_profiles;
create trigger config_profiles_immutable_update
before update on public.config_profiles
for each row execute function public.raise_immutable_write();
create trigger config_profiles_immutable_delete
before delete on public.config_profiles
for each row execute function public.raise_immutable_write();

drop trigger if exists algorithm_versions_immutable_update on public.algorithm_versions;
drop trigger if exists algorithm_versions_immutable_delete on public.algorithm_versions;
create trigger algorithm_versions_immutable_update
before update on public.algorithm_versions
for each row execute function public.raise_immutable_write();
create trigger algorithm_versions_immutable_delete
before delete on public.algorithm_versions
for each row execute function public.raise_immutable_write();

drop trigger if exists plan_versions_immutable_update on public.plan_versions;
drop trigger if exists plan_versions_immutable_delete on public.plan_versions;
create trigger plan_versions_immutable_update
before update on public.plan_versions
for each row execute function public.raise_immutable_write();
create trigger plan_versions_immutable_delete
before delete on public.plan_versions
for each row execute function public.raise_immutable_write();

-- Remove/destroy update/delete RLS policies on plan_versions (leave select+insert only).
do $$
declare
  p record;
begin
  for p in
    select policyname, cmd
    from pg_policies
    where schemaname = 'public'
      and tablename = 'plan_versions'
      and cmd in ('UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.plan_versions', p.policyname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Legacy owner backfill (spec decision A)
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  id boolean primary key default true,
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton_row check (id = true)
);

-- Ensure the singleton row exists (idempotent).
insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists app_settings_set_updated_at on public.app_settings;
create trigger app_settings_set_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_admin" on public.app_settings;
drop policy if exists "app_settings_insert_admin" on public.app_settings;
drop policy if exists "app_settings_update_admin" on public.app_settings;
drop policy if exists "app_settings_delete_admin" on public.app_settings;

create policy "app_settings_select_admin"
on public.app_settings
for select
to authenticated
using (public.is_admin());

create policy "app_settings_insert_admin"
on public.app_settings
for insert
to authenticated
with check (public.is_admin());

create policy "app_settings_update_admin"
on public.app_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "app_settings_delete_admin"
on public.app_settings
for delete
to authenticated
using (public.is_admin());

create or replace function public.set_owner_user(owner uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  t text;
  col_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'P0001';
  end if;

  if owner is null then
    raise exception 'owner cannot be null' using errcode = 'P0001';
  end if;

  -- Set singleton owner_user_id (create row if missing).
  insert into public.app_settings (id, owner_user_id)
  values (true, owner)
  on conflict (id) do update set owner_user_id = excluded.owner_user_id;

  -- Best-effort: legacy tables may or may not exist.
  foreach t in array array[
    'monitoring',
    'trail',
    'gym'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    select exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = t
        and c.column_name = 'user_id'
    ) into col_exists;

    if not col_exists then
      execute format('alter table public.%I add column user_id uuid', t);
    end if;

    -- Fill any nulls (including rows inserted before column existed).
    execute format('update public.%I set user_id = $1 where user_id is null', t) using owner;
  end loop;
end;
$$;

-- Privileges: do not allow PUBLIC; allow authenticated but gate via is_admin().
revoke execute on function public.set_owner_user(uuid) from public;
grant execute on function public.set_owner_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Reduce split-brain for explanations: prevent writes to legacy table
-- ---------------------------------------------------------------------------

-- Drop any write policies so the table is select-only (if any are present).
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'explanations'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  loop
    execute format('drop policy if exists %I on public.explanations', p.policyname);
  end loop;
end;
$$;

-- Add triggers to block all writes even for privileged roles.
drop trigger if exists explanations_block_insert on public.explanations;
drop trigger if exists explanations_block_update on public.explanations;
drop trigger if exists explanations_block_delete on public.explanations;
create trigger explanations_block_insert
before insert on public.explanations
for each row execute function public.raise_immutable_write();
create trigger explanations_block_update
before update on public.explanations
for each row execute function public.raise_immutable_write();
create trigger explanations_block_delete
before delete on public.explanations
for each row execute function public.raise_immutable_write();

commit;

