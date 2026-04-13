-- 0002_plans_sessions_engine.sql
-- Minimal v1 tables for plans/sessions/engine with strict RLS.

begin;

create extension if not exists pgcrypto;

-- Plans: user-owned container for sessions + outputs.
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists plans_user_id_idx on public.plans(user_id);

create trigger plans_set_updated_at
before update on public.plans
for each row execute function public.set_updated_at();

alter table public.plans enable row level security;

create policy "plans_select_own"
on public.plans
for select
to authenticated
using (user_id = auth.uid());

create policy "plans_insert_own"
on public.plans
for insert
to authenticated
with check (user_id = auth.uid());

create policy "plans_update_own"
on public.plans
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "plans_delete_own"
on public.plans
for delete
to authenticated
using (user_id = auth.uid());

-- Sessions: user-owned.
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_plan_id_idx on public.sessions(plan_id);

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

alter table public.sessions enable row level security;

create policy "sessions_select_own"
on public.sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "sessions_insert_own"
on public.sessions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "sessions_update_own"
on public.sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "sessions_delete_own"
on public.sessions
for delete
to authenticated
using (user_id = auth.uid());

-- Admin-managed configuration profiles used by the recommendation engine.
create table if not exists public.config_profiles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists config_profiles_key_idx on public.config_profiles(key);

create trigger config_profiles_set_updated_at
before update on public.config_profiles
for each row execute function public.set_updated_at();

alter table public.config_profiles enable row level security;

-- Readable by any authenticated user (for explaining / rendering recommendations).
create policy "config_profiles_select_authenticated"
on public.config_profiles
for select
to authenticated
using (auth.role() = 'authenticated');

-- Write access restricted to admins.
create policy "config_profiles_insert_admin"
on public.config_profiles
for insert
to authenticated
with check (public.is_admin());

create policy "config_profiles_update_admin"
on public.config_profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "config_profiles_delete_admin"
on public.config_profiles
for delete
to authenticated
using (public.is_admin());

-- Admin-managed algorithm versions (for provenance, reproducibility).
create table if not exists public.algorithm_versions (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists algorithm_versions_version_idx on public.algorithm_versions(version);

create trigger algorithm_versions_set_updated_at
before update on public.algorithm_versions
for each row execute function public.set_updated_at();

alter table public.algorithm_versions enable row level security;

create policy "algorithm_versions_select_authenticated"
on public.algorithm_versions
for select
to authenticated
using (auth.role() = 'authenticated');

create policy "algorithm_versions_insert_admin"
on public.algorithm_versions
for insert
to authenticated
with check (public.is_admin());

create policy "algorithm_versions_update_admin"
on public.algorithm_versions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "algorithm_versions_delete_admin"
on public.algorithm_versions
for delete
to authenticated
using (public.is_admin());

-- Recommendations: user-owned output rows.
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  algorithm_version_id uuid references public.algorithm_versions(id) on delete set null,
  config_profile_id uuid references public.config_profiles(id) on delete set null,
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recommendations_user_id_idx on public.recommendations(user_id);
create index if not exists recommendations_plan_id_idx on public.recommendations(plan_id);
create index if not exists recommendations_session_id_idx on public.recommendations(session_id);

create trigger recommendations_set_updated_at
before update on public.recommendations
for each row execute function public.set_updated_at();

alter table public.recommendations enable row level security;

create policy "recommendations_select_own"
on public.recommendations
for select
to authenticated
using (user_id = auth.uid());

create policy "recommendations_insert_own"
on public.recommendations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "recommendations_update_own"
on public.recommendations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "recommendations_delete_own"
on public.recommendations
for delete
to authenticated
using (user_id = auth.uid());

-- Explanations: user-owned (tied to a recommendation).
create table if not exists public.explanations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists explanations_user_id_idx on public.explanations(user_id);
create index if not exists explanations_recommendation_id_idx on public.explanations(recommendation_id);

create trigger explanations_set_updated_at
before update on public.explanations
for each row execute function public.set_updated_at();

alter table public.explanations enable row level security;

create policy "explanations_select_own"
on public.explanations
for select
to authenticated
using (user_id = auth.uid());

create policy "explanations_insert_own"
on public.explanations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "explanations_update_own"
on public.explanations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "explanations_delete_own"
on public.explanations
for delete
to authenticated
using (user_id = auth.uid());

commit;

