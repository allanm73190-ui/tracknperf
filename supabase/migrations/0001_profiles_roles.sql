-- 0001_profiles_roles.sql
-- Creates user profile + roles with strict RLS and an admin bootstrap helper.

begin;

create extension if not exists pgcrypto;

-- Shared helper for updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles: 1:1 with auth.users.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "profiles_delete_own"
on public.profiles
for delete
to authenticated
using (id = auth.uid());

-- Roles: one row per user (extendable later).
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_check check (role in ('admin', 'member'))
);

create index if not exists user_roles_role_idx on public.user_roles(role);

create trigger user_roles_set_updated_at
before update on public.user_roles
for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;

-- Users can see their own role row (helps client-side feature gating).
create policy "user_roles_select_own"
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

-- Admin check function (bypasses RLS via ownership).
create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = 'admin'
  );
$$;

-- Bootstrap the first admin: if no admins exist, the caller becomes admin.
create or replace function public.bootstrap_first_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
  admin_exists boolean;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'bootstrap_first_admin must be called by an authenticated user';
  end if;

  select exists (
    select 1 from public.user_roles ur where ur.role = 'admin'
  ) into admin_exists;

  if admin_exists then
    raise exception 'an admin already exists';
  end if;

  insert into public.user_roles (user_id, role)
  values (caller, 'admin')
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

-- Allow authenticated callers to execute bootstrap.
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

commit;

