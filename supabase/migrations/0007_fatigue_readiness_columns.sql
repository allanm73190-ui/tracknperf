-- 0007_fatigue_readiness_columns.sql
-- Add structured domain columns to fatigue_snapshots and readiness_snapshots.
-- Migration 0003 created these tables with a generic payload jsonb; this migration
-- adds typed columns that mirror the domain FatigueState / ReadinessState types.

begin;

-- fatigue_snapshots: add typed columns
alter table public.fatigue_snapshots
  add column if not exists score numeric(4,3) check (score >= 0 and score <= 1),
  add column if not exists dimensions jsonb not null default '{}'::jsonb,
  add column if not exists data_quality_score numeric(4,3) check (data_quality_score >= 0 and data_quality_score <= 1),
  add column if not exists algorithm_version text;

-- Compound index for "latest snapshot per user" queries
create index if not exists fatigue_snapshots_user_captured_idx
  on public.fatigue_snapshots (user_id, captured_at desc);

-- readiness_snapshots: add typed columns
alter table public.readiness_snapshots
  add column if not exists score numeric(4,3) check (score >= 0 and score <= 1),
  add column if not exists limiting_factor text check (limiting_factor in ('none', 'fatigue', 'data')),
  add column if not exists algorithm_version text;

-- Compound index for "latest snapshot per user" queries
create index if not exists readiness_snapshots_user_captured_idx
  on public.readiness_snapshots (user_id, captured_at desc);

commit;
