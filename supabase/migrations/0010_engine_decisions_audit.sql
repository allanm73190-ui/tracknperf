-- 0010_engine_decisions_audit.sql
-- Explicit engine decision audit trail (one row per recommendation decision).

begin;

create table if not exists public.engine_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  recommendation_id uuid not null references public.recommendations(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  plan_version_id uuid references public.plan_versions(id) on delete set null,
  planned_session_id uuid references public.planned_sessions(id) on delete set null,
  executed_session_id uuid references public.executed_sessions(id) on delete set null,
  decision text not null,
  decision_state text,
  confidence_score numeric(6,2),
  risk_level text,
  reason_codes jsonb not null default '[]'::jsonb,
  rules_triggered jsonb not null default '[]'::jsonb,
  human_validation_required boolean not null default false,
  fallback_mode boolean not null default false,
  forbidden_action_blocked jsonb not null default '[]'::jsonb,
  algorithm_version text,
  config_version text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint engine_decisions_user_recommendation_uniq unique (user_id, recommendation_id)
);

create index if not exists engine_decisions_user_id_idx
  on public.engine_decisions(user_id);
create index if not exists engine_decisions_plan_id_idx
  on public.engine_decisions(plan_id);
create index if not exists engine_decisions_created_at_idx
  on public.engine_decisions(created_at desc);
create index if not exists engine_decisions_decision_idx
  on public.engine_decisions(decision);

alter table public.engine_decisions enable row level security;

create policy "engine_decisions_select_own"
on public.engine_decisions
for select
to authenticated
using (user_id = auth.uid());

create policy "engine_decisions_insert_own"
on public.engine_decisions
for insert
to authenticated
with check (user_id = auth.uid());

create policy "engine_decisions_update_own"
on public.engine_decisions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "engine_decisions_delete_own"
on public.engine_decisions
for delete
to authenticated
using (user_id = auth.uid());

alter table public.engine_decisions
  add constraint engine_decisions_user_id_id_unique unique (user_id, id);

alter table public.engine_decisions
  add constraint engine_decisions_recommendation_same_user_fk
  foreign key (user_id, recommendation_id)
  references public.recommendations(user_id, id)
  on delete cascade;

alter table public.engine_decisions
  add constraint engine_decisions_plan_same_user_fk
  foreign key (user_id, plan_id)
  references public.plans(user_id, id)
  on delete set null;

alter table public.engine_decisions
  add constraint engine_decisions_plan_version_same_user_fk
  foreign key (user_id, plan_version_id)
  references public.plan_versions(user_id, id)
  on delete set null;

alter table public.engine_decisions
  add constraint engine_decisions_planned_session_same_user_fk
  foreign key (user_id, planned_session_id)
  references public.planned_sessions(user_id, id)
  on delete set null;

alter table public.engine_decisions
  add constraint engine_decisions_executed_session_same_user_fk
  foreign key (user_id, executed_session_id)
  references public.executed_sessions(user_id, id)
  on delete set null;

commit;
