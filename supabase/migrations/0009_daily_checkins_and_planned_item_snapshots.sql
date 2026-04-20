-- 0009_daily_checkins_and_planned_item_snapshots.sql
-- Add daily wellness check-ins and immutable planned session item snapshots.

begin;

-- ---------------------------------------------------------------------------
-- 1) Daily check-ins (wellness input for engine + UI)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  checkin_date date not null,
  pain_score numeric(4,2) check (pain_score is null or (pain_score >= 0 and pain_score <= 10)),
  fatigue_score numeric(4,2) check (fatigue_score is null or (fatigue_score >= 0 and fatigue_score <= 10)),
  readiness_score numeric(4,2) check (readiness_score is null or (readiness_score >= 0 and readiness_score <= 10)),
  sleep_hours numeric(4,2) check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  sleep_quality_score numeric(4,2) check (sleep_quality_score is null or (sleep_quality_score >= 0 and sleep_quality_score <= 10)),
  soreness_score numeric(4,2) check (soreness_score is null or (soreness_score >= 0 and soreness_score <= 10)),
  stress_score numeric(4,2) check (stress_score is null or (stress_score >= 0 and stress_score <= 10)),
  mood_score numeric(4,2) check (mood_score is null or (mood_score >= 0 and mood_score <= 10)),
  available_time_today_min integer check (available_time_today_min is null or available_time_today_min >= 0),
  degraded_mode_days integer check (degraded_mode_days is null or degraded_mode_days >= 0),
  hrv_below_baseline_days integer check (hrv_below_baseline_days is null or hrv_below_baseline_days >= 0),
  rhr_delta_bpm numeric(8,2),
  pain_red_flag boolean not null default false,
  illness_flag boolean not null default false,
  neurological_symptoms_flag boolean not null default false,
  limp_flag boolean not null default false,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_checkins_user_date_unique unique (user_id, checkin_date)
);

create index if not exists daily_checkins_user_id_idx on public.daily_checkins(user_id);
create index if not exists daily_checkins_user_date_idx on public.daily_checkins(user_id, checkin_date desc);

create trigger daily_checkins_set_updated_at
before update on public.daily_checkins
for each row execute function public.set_updated_at();

alter table public.daily_checkins enable row level security;

create policy "daily_checkins_select_own"
on public.daily_checkins
for select
to authenticated
using (user_id = auth.uid());

create policy "daily_checkins_insert_own"
on public.daily_checkins
for insert
to authenticated
with check (user_id = auth.uid());

create policy "daily_checkins_update_own"
on public.daily_checkins
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "daily_checkins_delete_own"
on public.daily_checkins
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Immutable planned session item snapshot
-- ---------------------------------------------------------------------------
create table if not exists public.planned_session_items_snapshot (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  planned_session_id uuid not null references public.planned_sessions(id) on delete cascade,
  session_template_exercise_id uuid references public.session_template_exercises(id) on delete set null,
  position integer not null check (position >= 1),
  exercise_name text not null,
  series_raw text,
  reps_raw text,
  load_raw text,
  tempo_raw text,
  rest_raw text,
  rir_raw text,
  coach_notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint planned_session_items_snapshot_session_position_uniq unique (planned_session_id, position)
);

create index if not exists planned_session_items_snapshot_user_id_idx
  on public.planned_session_items_snapshot(user_id);
create index if not exists planned_session_items_snapshot_planned_session_id_idx
  on public.planned_session_items_snapshot(planned_session_id);
create index if not exists planned_session_items_snapshot_template_exercise_id_idx
  on public.planned_session_items_snapshot(session_template_exercise_id);

alter table public.planned_session_items_snapshot enable row level security;

-- Snapshot rows are immutable once created: only select + insert policies are defined.
create policy "planned_session_items_snapshot_select_own"
on public.planned_session_items_snapshot
for select
to authenticated
using (user_id = auth.uid());

create policy "planned_session_items_snapshot_insert_own"
on public.planned_session_items_snapshot
for insert
to authenticated
with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Same-user integrity constraints for snapshot table
-- ---------------------------------------------------------------------------
alter table public.planned_session_items_snapshot
  add constraint planned_session_items_snapshot_user_id_id_unique unique (user_id, id);

alter table public.planned_session_items_snapshot
  add constraint planned_session_items_snapshot_planned_session_same_user_fk
  foreign key (user_id, planned_session_id)
  references public.planned_sessions(user_id, id)
  on delete cascade;

alter table public.planned_session_items_snapshot
  add constraint planned_session_items_snapshot_template_exercise_same_user_fk
  foreign key (user_id, session_template_exercise_id)
  references public.session_template_exercises(user_id, id)
  on delete set null;

commit;
