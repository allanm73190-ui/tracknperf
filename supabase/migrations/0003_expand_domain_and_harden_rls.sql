-- 0003_expand_domain_and_harden_rls.sql
-- Expand v1 domain schema toward approved spec and harden RLS/ownership/immutability.
-- Forward-only: preserves existing tables created in 0001/0002.

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1) Fix admin bootstrap semantics: concurrency-safe + idempotent no-op
-- ---------------------------------------------------------------------------
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

  -- Concurrency safety: only one bootstrap attempt can win per transaction.
  perform pg_advisory_xact_lock(hashtext('public.bootstrap_first_admin'));

  select exists (
    select 1 from public.user_roles ur where ur.role = 'admin'
  ) into admin_exists;

  -- Idempotent: if any admin already exists, do nothing.
  if admin_exists then
    return;
  end if;

  insert into public.user_roles (user_id, role)
  values (caller, 'admin')
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

grant execute on function public.bootstrap_first_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Enforce immutability intent for admin-managed append-only tables
--    config_profiles and algorithm_versions: allow select to authenticated,
--    allow insert to admin, and NO update/delete policies.
-- ---------------------------------------------------------------------------
drop policy if exists "config_profiles_update_admin" on public.config_profiles;
drop policy if exists "config_profiles_delete_admin" on public.config_profiles;
drop policy if exists "algorithm_versions_update_admin" on public.algorithm_versions;
drop policy if exists "algorithm_versions_delete_admin" on public.algorithm_versions;

-- ---------------------------------------------------------------------------
-- 3) Add missing core tables per spec (minimum viable complete)
-- ---------------------------------------------------------------------------

-- Plan versions freeze config+algo selection for reproducibility.
create table if not exists public.plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  version integer not null,
  config_profile_id uuid references public.config_profiles(id) on delete restrict,
  algorithm_version_id uuid references public.algorithm_versions(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint plan_versions_unique_version_per_plan unique (plan_id, version)
);

create index if not exists plan_versions_user_id_idx on public.plan_versions(user_id);
create index if not exists plan_versions_plan_id_idx on public.plan_versions(plan_id);

alter table public.plan_versions enable row level security;

create policy "plan_versions_select_own"
on public.plan_versions
for select
to authenticated
using (user_id = auth.uid());

create policy "plan_versions_insert_own"
on public.plan_versions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "plan_versions_update_own"
on public.plan_versions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "plan_versions_delete_own"
on public.plan_versions
for delete
to authenticated
using (user_id = auth.uid());

-- Session templates define reusable sessions (per plan version).
create table if not exists public.session_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_version_id uuid not null references public.plan_versions(id) on delete cascade,
  name text not null,
  template jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists session_templates_user_id_idx on public.session_templates(user_id);
create index if not exists session_templates_plan_version_id_idx on public.session_templates(plan_version_id);

create trigger session_templates_set_updated_at
before update on public.session_templates
for each row execute function public.set_updated_at();

alter table public.session_templates enable row level security;

create policy "session_templates_select_own"
on public.session_templates
for select
to authenticated
using (user_id = auth.uid());

create policy "session_templates_insert_own"
on public.session_templates
for insert
to authenticated
with check (user_id = auth.uid());

create policy "session_templates_update_own"
on public.session_templates
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "session_templates_delete_own"
on public.session_templates
for delete
to authenticated
using (user_id = auth.uid());

-- Planned sessions are scheduled instances derived from templates.
create table if not exists public.planned_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid not null references public.plans(id) on delete cascade,
  plan_version_id uuid references public.plan_versions(id) on delete set null,
  session_template_id uuid references public.session_templates(id) on delete set null,
  scheduled_for date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planned_sessions_user_id_idx on public.planned_sessions(user_id);
create index if not exists planned_sessions_plan_id_idx on public.planned_sessions(plan_id);
create index if not exists planned_sessions_scheduled_for_idx on public.planned_sessions(scheduled_for);

create trigger planned_sessions_set_updated_at
before update on public.planned_sessions
for each row execute function public.set_updated_at();

alter table public.planned_sessions enable row level security;

create policy "planned_sessions_select_own"
on public.planned_sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "planned_sessions_insert_own"
on public.planned_sessions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "planned_sessions_update_own"
on public.planned_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "planned_sessions_delete_own"
on public.planned_sessions
for delete
to authenticated
using (user_id = auth.uid());

-- Executed sessions: replaces/extends legacy public.sessions (kept as-is).
create table if not exists public.executed_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  planned_session_id uuid references public.planned_sessions(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executed_sessions_user_id_idx on public.executed_sessions(user_id);
create index if not exists executed_sessions_plan_id_idx on public.executed_sessions(plan_id);
create index if not exists executed_sessions_started_at_idx on public.executed_sessions(started_at);

create trigger executed_sessions_set_updated_at
before update on public.executed_sessions
for each row execute function public.set_updated_at();

alter table public.executed_sessions enable row level security;

create policy "executed_sessions_select_own"
on public.executed_sessions
for select
to authenticated
using (user_id = auth.uid());

create policy "executed_sessions_insert_own"
on public.executed_sessions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "executed_sessions_update_own"
on public.executed_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "executed_sessions_delete_own"
on public.executed_sessions
for delete
to authenticated
using (user_id = auth.uid());

-- Feedback attached to an executed session.
create table if not exists public.session_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  executed_session_id uuid not null references public.executed_sessions(id) on delete cascade,
  rating integer,
  soreness integer,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists session_feedback_user_id_idx on public.session_feedback(user_id);
create index if not exists session_feedback_executed_session_id_idx on public.session_feedback(executed_session_id);

alter table public.session_feedback enable row level security;

create policy "session_feedback_select_own"
on public.session_feedback
for select
to authenticated
using (user_id = auth.uid());

create policy "session_feedback_insert_own"
on public.session_feedback
for insert
to authenticated
with check (user_id = auth.uid());

create policy "session_feedback_update_own"
on public.session_feedback
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "session_feedback_delete_own"
on public.session_feedback
for delete
to authenticated
using (user_id = auth.uid());

-- Context snapshots capture model inputs for explainability/debug/audit.
create table if not exists public.context_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  plan_version_id uuid references public.plan_versions(id) on delete set null,
  executed_session_id uuid references public.executed_sessions(id) on delete set null,
  recommendation_id uuid references public.recommendations(id) on delete set null,
  captured_at timestamptz not null default now(),
  input_quality jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists context_snapshots_user_id_idx on public.context_snapshots(user_id);
create index if not exists context_snapshots_captured_at_idx on public.context_snapshots(captured_at);

alter table public.context_snapshots enable row level security;

create policy "context_snapshots_select_own"
on public.context_snapshots
for select
to authenticated
using (user_id = auth.uid());

create policy "context_snapshots_insert_own"
on public.context_snapshots
for insert
to authenticated
with check (user_id = auth.uid());

create policy "context_snapshots_update_own"
on public.context_snapshots
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "context_snapshots_delete_own"
on public.context_snapshots
for delete
to authenticated
using (user_id = auth.uid());

-- External and internal metrics: time series snapshots for audit/debug.
create table if not exists public.external_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_snapshot_id uuid references public.context_snapshots(id) on delete set null,
  captured_at timestamptz not null default now(),
  source text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists external_metrics_user_id_idx on public.external_metrics(user_id);
create index if not exists external_metrics_captured_at_idx on public.external_metrics(captured_at);

alter table public.external_metrics enable row level security;

create policy "external_metrics_select_own"
on public.external_metrics
for select
to authenticated
using (user_id = auth.uid());

create policy "external_metrics_insert_own"
on public.external_metrics
for insert
to authenticated
with check (user_id = auth.uid());

create policy "external_metrics_update_own"
on public.external_metrics
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "external_metrics_delete_own"
on public.external_metrics
for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.internal_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_snapshot_id uuid references public.context_snapshots(id) on delete set null,
  captured_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists internal_metrics_user_id_idx on public.internal_metrics(user_id);
create index if not exists internal_metrics_captured_at_idx on public.internal_metrics(captured_at);

alter table public.internal_metrics enable row level security;

create policy "internal_metrics_select_own"
on public.internal_metrics
for select
to authenticated
using (user_id = auth.uid());

create policy "internal_metrics_insert_own"
on public.internal_metrics
for insert
to authenticated
with check (user_id = auth.uid());

create policy "internal_metrics_update_own"
on public.internal_metrics
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "internal_metrics_delete_own"
on public.internal_metrics
for delete
to authenticated
using (user_id = auth.uid());

-- Fatigue & readiness snapshots (minimum viable persistence for debug/audit).
create table if not exists public.fatigue_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_snapshot_id uuid references public.context_snapshots(id) on delete set null,
  captured_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fatigue_snapshots_user_id_idx on public.fatigue_snapshots(user_id);
create index if not exists fatigue_snapshots_captured_at_idx on public.fatigue_snapshots(captured_at);

alter table public.fatigue_snapshots enable row level security;

create policy "fatigue_snapshots_select_own"
on public.fatigue_snapshots
for select
to authenticated
using (user_id = auth.uid());

create policy "fatigue_snapshots_insert_own"
on public.fatigue_snapshots
for insert
to authenticated
with check (user_id = auth.uid());

create policy "fatigue_snapshots_update_own"
on public.fatigue_snapshots
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "fatigue_snapshots_delete_own"
on public.fatigue_snapshots
for delete
to authenticated
using (user_id = auth.uid());

create table if not exists public.readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  context_snapshot_id uuid references public.context_snapshots(id) on delete set null,
  captured_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists readiness_snapshots_user_id_idx on public.readiness_snapshots(user_id);
create index if not exists readiness_snapshots_captured_at_idx on public.readiness_snapshots(captured_at);

alter table public.readiness_snapshots enable row level security;

create policy "readiness_snapshots_select_own"
on public.readiness_snapshots
for select
to authenticated
using (user_id = auth.uid());

create policy "readiness_snapshots_insert_own"
on public.readiness_snapshots
for insert
to authenticated
with check (user_id = auth.uid());

create policy "readiness_snapshots_update_own"
on public.readiness_snapshots
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "readiness_snapshots_delete_own"
on public.readiness_snapshots
for delete
to authenticated
using (user_id = auth.uid());

-- Recommendation explanations: replace public.explanations (keep legacy table but stop using it).
create table if not exists public.recommendation_explanations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists recommendation_explanations_user_reco_uniq
  on public.recommendation_explanations(user_id, recommendation_id);

create index if not exists recommendation_explanations_user_id_idx on public.recommendation_explanations(user_id);
create index if not exists recommendation_explanations_recommendation_id_idx on public.recommendation_explanations(recommendation_id);

alter table public.recommendation_explanations enable row level security;

create policy "recommendation_explanations_select_own"
on public.recommendation_explanations
for select
to authenticated
using (user_id = auth.uid());

create policy "recommendation_explanations_insert_own"
on public.recommendation_explanations
for insert
to authenticated
with check (user_id = auth.uid());

create policy "recommendation_explanations_update_own"
on public.recommendation_explanations
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "recommendation_explanations_delete_own"
on public.recommendation_explanations
for delete
to authenticated
using (user_id = auth.uid());

-- Backfill from legacy explanations if present (best-effort, idempotent).
insert into public.recommendation_explanations (user_id, recommendation_id, content, created_at)
select e.user_id, e.recommendation_id, e.content, e.created_at
from public.explanations e
on conflict (user_id, recommendation_id) do nothing;

-- Devices: supports multi-device sync.
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_identifier text not null,
  platform text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index if not exists devices_user_identifier_uniq on public.devices(user_id, device_identifier);
create index if not exists devices_user_id_idx on public.devices(user_id);

alter table public.devices enable row level security;

create policy "devices_select_own"
on public.devices
for select
to authenticated
using (user_id = auth.uid());

create policy "devices_insert_own"
on public.devices
for insert
to authenticated
with check (user_id = auth.uid());

create policy "devices_update_own"
on public.devices
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "devices_delete_own"
on public.devices
for delete
to authenticated
using (user_id = auth.uid());

-- Sync idempotency primitive: per-user idempotency_key uniqueness.
create table if not exists public.sync_ops (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  idempotency_key text not null,
  op_type text not null,
  entity text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz
);

create unique index if not exists sync_ops_user_idempotency_uniq on public.sync_ops(user_id, idempotency_key);
create index if not exists sync_ops_user_id_idx on public.sync_ops(user_id);
create index if not exists sync_ops_created_at_idx on public.sync_ops(created_at);

alter table public.sync_ops enable row level security;

create policy "sync_ops_select_own"
on public.sync_ops
for select
to authenticated
using (user_id = auth.uid());

create policy "sync_ops_insert_own"
on public.sync_ops
for insert
to authenticated
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Cross-entity ownership integrity via composite FKs (user_id, id)
-- ---------------------------------------------------------------------------

-- Make referenced pairs unique so we can enforce "same user" at the DB layer.
alter table public.plans
  add constraint plans_user_id_id_unique unique (user_id, id);

alter table public.sessions
  add constraint sessions_user_id_id_unique unique (user_id, id);

alter table public.recommendations
  add constraint recommendations_user_id_id_unique unique (user_id, id);

alter table public.plan_versions
  add constraint plan_versions_user_id_id_unique unique (user_id, id);

alter table public.session_templates
  add constraint session_templates_user_id_id_unique unique (user_id, id);

alter table public.planned_sessions
  add constraint planned_sessions_user_id_id_unique unique (user_id, id);

alter table public.executed_sessions
  add constraint executed_sessions_user_id_id_unique unique (user_id, id);

alter table public.context_snapshots
  add constraint context_snapshots_user_id_id_unique unique (user_id, id);

alter table public.devices
  add constraint devices_user_id_id_unique unique (user_id, id);

-- Enforce ownership coherence for recommendations -> plans/sessions.
alter table public.recommendations
  add constraint recommendations_plan_same_user_fk
  foreign key (user_id, plan_id) references public.plans(user_id, id)
  on delete cascade;

alter table public.recommendations
  add constraint recommendations_session_same_user_fk
  foreign key (user_id, session_id) references public.sessions(user_id, id)
  on delete set null;

-- Enforce ownership coherence for legacy explanations table (keep but harden).
alter table public.explanations
  add constraint explanations_reco_same_user_fk
  foreign key (user_id, recommendation_id) references public.recommendations(user_id, id)
  on delete cascade;

-- Enforce ownership coherence for new recommendation_explanations.
alter table public.recommendation_explanations
  add constraint recommendation_explanations_reco_same_user_fk
  foreign key (user_id, recommendation_id) references public.recommendations(user_id, id)
  on delete cascade;

-- Enforce ownership coherence for plan_versions and downstream objects.
alter table public.plan_versions
  add constraint plan_versions_plan_same_user_fk
  foreign key (user_id, plan_id) references public.plans(user_id, id)
  on delete cascade;

alter table public.session_templates
  add constraint session_templates_plan_version_same_user_fk
  foreign key (user_id, plan_version_id) references public.plan_versions(user_id, id)
  on delete cascade;

alter table public.planned_sessions
  add constraint planned_sessions_plan_same_user_fk
  foreign key (user_id, plan_id) references public.plans(user_id, id)
  on delete cascade;

alter table public.planned_sessions
  add constraint planned_sessions_plan_version_same_user_fk
  foreign key (user_id, plan_version_id) references public.plan_versions(user_id, id)
  on delete set null;

alter table public.planned_sessions
  add constraint planned_sessions_template_same_user_fk
  foreign key (user_id, session_template_id) references public.session_templates(user_id, id)
  on delete set null;

alter table public.executed_sessions
  add constraint executed_sessions_plan_same_user_fk
  foreign key (user_id, plan_id) references public.plans(user_id, id)
  on delete set null;

alter table public.executed_sessions
  add constraint executed_sessions_planned_same_user_fk
  foreign key (user_id, planned_session_id) references public.planned_sessions(user_id, id)
  on delete set null;

alter table public.executed_sessions
  add constraint executed_sessions_reco_same_user_fk
  foreign key (user_id, recommendation_id) references public.recommendations(user_id, id)
  on delete set null;

alter table public.session_feedback
  add constraint session_feedback_executed_same_user_fk
  foreign key (user_id, executed_session_id) references public.executed_sessions(user_id, id)
  on delete cascade;

alter table public.context_snapshots
  add constraint context_snapshots_plan_same_user_fk
  foreign key (user_id, plan_id) references public.plans(user_id, id)
  on delete set null;

alter table public.context_snapshots
  add constraint context_snapshots_plan_version_same_user_fk
  foreign key (user_id, plan_version_id) references public.plan_versions(user_id, id)
  on delete set null;

alter table public.context_snapshots
  add constraint context_snapshots_executed_same_user_fk
  foreign key (user_id, executed_session_id) references public.executed_sessions(user_id, id)
  on delete set null;

alter table public.context_snapshots
  add constraint context_snapshots_reco_same_user_fk
  foreign key (user_id, recommendation_id) references public.recommendations(user_id, id)
  on delete set null;

alter table public.external_metrics
  add constraint external_metrics_context_same_user_fk
  foreign key (user_id, context_snapshot_id) references public.context_snapshots(user_id, id)
  on delete set null;

alter table public.internal_metrics
  add constraint internal_metrics_context_same_user_fk
  foreign key (user_id, context_snapshot_id) references public.context_snapshots(user_id, id)
  on delete set null;

alter table public.fatigue_snapshots
  add constraint fatigue_snapshots_context_same_user_fk
  foreign key (user_id, context_snapshot_id) references public.context_snapshots(user_id, id)
  on delete set null;

alter table public.readiness_snapshots
  add constraint readiness_snapshots_context_same_user_fk
  foreign key (user_id, context_snapshot_id) references public.context_snapshots(user_id, id)
  on delete set null;

alter table public.sync_ops
  add constraint sync_ops_device_same_user_fk
  foreign key (user_id, device_id) references public.devices(user_id, id)
  on delete set null;

commit;

