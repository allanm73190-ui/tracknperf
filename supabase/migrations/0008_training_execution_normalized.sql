-- 0008_training_execution_normalized.sql
-- Normalize planned template details + executed exercise/set logs + derived metrics.

begin;

-- ---------------------------------------------------------------------------
-- 1) Session template exercises (normalized legacy template items)
-- ---------------------------------------------------------------------------
create table if not exists public.session_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_template_id uuid not null references public.session_templates(id) on delete cascade,
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
  updated_at timestamptz not null default now(),
  constraint session_template_exercises_template_position_uniq unique (session_template_id, position)
);

create index if not exists session_template_exercises_user_id_idx on public.session_template_exercises(user_id);
create index if not exists session_template_exercises_template_id_idx on public.session_template_exercises(session_template_id);
create index if not exists session_template_exercises_user_template_position_idx on public.session_template_exercises(user_id, session_template_id, position);

create trigger session_template_exercises_set_updated_at
before update on public.session_template_exercises
for each row execute function public.set_updated_at();

alter table public.session_template_exercises enable row level security;

create policy "session_template_exercises_select_own"
on public.session_template_exercises
for select
to authenticated
using (user_id = auth.uid());

create policy "session_template_exercises_insert_own"
on public.session_template_exercises
for insert
to authenticated
with check (user_id = auth.uid());

create policy "session_template_exercises_update_own"
on public.session_template_exercises
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "session_template_exercises_delete_own"
on public.session_template_exercises
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Executed exercise logs (per executed session)
-- ---------------------------------------------------------------------------
create table if not exists public.executed_session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  executed_session_id uuid not null references public.executed_sessions(id) on delete cascade,
  session_template_exercise_id uuid references public.session_template_exercises(id) on delete set null,
  position integer not null check (position >= 1),
  exercise_name_snapshot text not null,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint executed_session_exercises_session_position_uniq unique (executed_session_id, position)
);

create index if not exists executed_session_exercises_user_id_idx on public.executed_session_exercises(user_id);
create index if not exists executed_session_exercises_session_id_idx on public.executed_session_exercises(executed_session_id);
create index if not exists executed_session_exercises_template_exercise_id_idx on public.executed_session_exercises(session_template_exercise_id);

create trigger executed_session_exercises_set_updated_at
before update on public.executed_session_exercises
for each row execute function public.set_updated_at();

alter table public.executed_session_exercises enable row level security;

create policy "executed_session_exercises_select_own"
on public.executed_session_exercises
for select
to authenticated
using (user_id = auth.uid());

create policy "executed_session_exercises_insert_own"
on public.executed_session_exercises
for insert
to authenticated
with check (user_id = auth.uid());

create policy "executed_session_exercises_update_own"
on public.executed_session_exercises
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "executed_session_exercises_delete_own"
on public.executed_session_exercises
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3) Executed set logs (per executed exercise)
-- ---------------------------------------------------------------------------
create table if not exists public.executed_session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  executed_session_exercise_id uuid not null references public.executed_session_exercises(id) on delete cascade,
  set_index integer not null check (set_index >= 1),
  reps integer check (reps is null or reps >= 0),
  load_kg numeric(10,2) check (load_kg is null or load_kg >= 0),
  rpe numeric(4,2) check (rpe is null or (rpe >= 0 and rpe <= 10)),
  rir numeric(4,2),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  completed boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint executed_session_sets_exercise_set_index_uniq unique (executed_session_exercise_id, set_index)
);

create index if not exists executed_session_sets_user_id_idx on public.executed_session_sets(user_id);
create index if not exists executed_session_sets_exercise_id_idx on public.executed_session_sets(executed_session_exercise_id);

alter table public.executed_session_sets enable row level security;

create policy "executed_session_sets_select_own"
on public.executed_session_sets
for select
to authenticated
using (user_id = auth.uid());

create policy "executed_session_sets_insert_own"
on public.executed_session_sets
for insert
to authenticated
with check (user_id = auth.uid());

create policy "executed_session_sets_update_own"
on public.executed_session_sets
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "executed_session_sets_delete_own"
on public.executed_session_sets
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4) Derived metrics (one row per executed session)
-- ---------------------------------------------------------------------------
create table if not exists public.executed_session_metrics (
  executed_session_id uuid primary key references public.executed_sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  total_exercises integer not null default 0 check (total_exercises >= 0),
  total_sets integer not null default 0 check (total_sets >= 0),
  total_reps integer not null default 0 check (total_reps >= 0),
  tonnage_kg numeric(12,2) not null default 0 check (tonnage_kg >= 0),
  avg_rpe numeric(4,2) check (avg_rpe is null or (avg_rpe >= 0 and avg_rpe <= 10)),
  volume_score numeric(8,3) check (volume_score is null or volume_score >= 0),
  intensity_score numeric(8,3) check (intensity_score is null or intensity_score >= 0),
  strain_score numeric(8,3) check (strain_score is null or strain_score >= 0),
  payload jsonb not null default '{}'::jsonb,
  computed_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists executed_session_metrics_user_id_idx on public.executed_session_metrics(user_id);
create index if not exists executed_session_metrics_user_computed_idx on public.executed_session_metrics(user_id, computed_at desc);

create trigger executed_session_metrics_set_updated_at
before update on public.executed_session_metrics
for each row execute function public.set_updated_at();

alter table public.executed_session_metrics enable row level security;

create policy "executed_session_metrics_select_own"
on public.executed_session_metrics
for select
to authenticated
using (user_id = auth.uid());

create policy "executed_session_metrics_insert_own"
on public.executed_session_metrics
for insert
to authenticated
with check (user_id = auth.uid());

create policy "executed_session_metrics_update_own"
on public.executed_session_metrics
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "executed_session_metrics_delete_own"
on public.executed_session_metrics
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5) Same-user integrity constraints (composite FK pattern)
-- ---------------------------------------------------------------------------
alter table public.session_template_exercises
  add constraint session_template_exercises_user_id_id_unique unique (user_id, id);

alter table public.executed_session_exercises
  add constraint executed_session_exercises_user_id_id_unique unique (user_id, id);

alter table public.executed_session_sets
  add constraint executed_session_sets_user_id_id_unique unique (user_id, id);

alter table public.executed_session_metrics
  add constraint executed_session_metrics_user_executed_unique unique (user_id, executed_session_id);

alter table public.session_template_exercises
  add constraint session_template_exercises_template_same_user_fk
  foreign key (user_id, session_template_id) references public.session_templates(user_id, id)
  on delete cascade;

alter table public.executed_session_exercises
  add constraint executed_session_exercises_session_same_user_fk
  foreign key (user_id, executed_session_id) references public.executed_sessions(user_id, id)
  on delete cascade;

alter table public.executed_session_exercises
  add constraint executed_session_exercises_template_exercise_same_user_fk
  foreign key (user_id, session_template_exercise_id) references public.session_template_exercises(user_id, id)
  on delete set null;

alter table public.executed_session_sets
  add constraint executed_session_sets_exercise_same_user_fk
  foreign key (user_id, executed_session_exercise_id) references public.executed_session_exercises(user_id, id)
  on delete cascade;

alter table public.executed_session_metrics
  add constraint executed_session_metrics_session_same_user_fk
  foreign key (user_id, executed_session_id) references public.executed_sessions(user_id, id)
  on delete cascade;

commit;
