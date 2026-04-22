-- 0011_planned_session_items_live_and_audit.sql
-- Coach live-edit foundation:
-- - mutable live items derived from immutable snapshots
-- - append-only audit trail for every live mutation
-- - explicit relation between executed exercises and live planned items

begin;

-- ---------------------------------------------------------------------------
-- 1) Mutable live planned-session items
-- ---------------------------------------------------------------------------
create table if not exists public.planned_session_items_live (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  planned_session_id uuid not null references public.planned_sessions(id) on delete cascade,
  planned_session_item_snapshot_id uuid references public.planned_session_items_snapshot(id) on delete set null,
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
  updated_at timestamptz not null default now(),
  constraint planned_session_items_live_session_position_uniq unique (planned_session_id, position),
  constraint planned_session_items_live_snapshot_uniq unique (planned_session_item_snapshot_id)
);

create index if not exists planned_session_items_live_user_id_idx
  on public.planned_session_items_live(user_id);
create index if not exists planned_session_items_live_planned_session_id_idx
  on public.planned_session_items_live(planned_session_id);
create index if not exists planned_session_items_live_template_exercise_id_idx
  on public.planned_session_items_live(session_template_exercise_id);
create index if not exists planned_session_items_live_user_planned_session_position_idx
  on public.planned_session_items_live(user_id, planned_session_id, position);

drop trigger if exists planned_session_items_live_set_updated_at on public.planned_session_items_live;
create trigger planned_session_items_live_set_updated_at
before update on public.planned_session_items_live
for each row execute function public.set_updated_at();

alter table public.planned_session_items_live enable row level security;

create policy "planned_session_items_live_select_own"
on public.planned_session_items_live
for select
to authenticated
using (user_id = auth.uid());

create policy "planned_session_items_live_insert_own"
on public.planned_session_items_live
for insert
to authenticated
with check (user_id = auth.uid());

create policy "planned_session_items_live_update_own"
on public.planned_session_items_live
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "planned_session_items_live_delete_own"
on public.planned_session_items_live
for delete
to authenticated
using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Append-only audit log for live item changes
-- ---------------------------------------------------------------------------
create table if not exists public.planned_session_item_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_session_item_live_id uuid not null references public.planned_session_items_live(id) on delete cascade,
  planned_session_id uuid not null references public.planned_sessions(id) on delete cascade,
  change_type text not null check (change_type in ('insert', 'update', 'delete')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  before_state jsonb,
  after_state jsonb,
  fields_changed jsonb not null default '[]'::jsonb,
  source text not null default 'application',
  reason text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists planned_session_item_changes_user_id_idx
  on public.planned_session_item_changes(user_id);
create index if not exists planned_session_item_changes_live_item_id_idx
  on public.planned_session_item_changes(planned_session_item_live_id);
create index if not exists planned_session_item_changes_planned_session_id_idx
  on public.planned_session_item_changes(planned_session_id);
create index if not exists planned_session_item_changes_changed_at_idx
  on public.planned_session_item_changes(changed_at desc);

alter table public.planned_session_item_changes enable row level security;

create policy "planned_session_item_changes_select_own"
on public.planned_session_item_changes
for select
to authenticated
using (user_id = auth.uid());

-- Audit rows are append-only: block update/delete at DB level.
drop trigger if exists planned_session_item_changes_block_update on public.planned_session_item_changes;
drop trigger if exists planned_session_item_changes_block_delete on public.planned_session_item_changes;
create trigger planned_session_item_changes_block_update
before update on public.planned_session_item_changes
for each row execute function public.raise_immutable_write();
create trigger planned_session_item_changes_block_delete
before delete on public.planned_session_item_changes
for each row execute function public.raise_immutable_write();

-- ---------------------------------------------------------------------------
-- 3) Same-user integrity constraints
-- ---------------------------------------------------------------------------
alter table public.planned_session_items_live
  add constraint planned_session_items_live_user_id_id_unique unique (user_id, id);

alter table public.planned_session_item_changes
  add constraint planned_session_item_changes_user_id_id_unique unique (user_id, id);

alter table public.planned_session_items_live
  add constraint planned_session_items_live_planned_session_same_user_fk
  foreign key (user_id, planned_session_id)
  references public.planned_sessions(user_id, id)
  on delete cascade;

alter table public.planned_session_items_live
  add constraint planned_session_items_live_snapshot_same_user_fk
  foreign key (user_id, planned_session_item_snapshot_id)
  references public.planned_session_items_snapshot(user_id, id)
  on delete set null;

alter table public.planned_session_items_live
  add constraint planned_session_items_live_template_exercise_same_user_fk
  foreign key (user_id, session_template_exercise_id)
  references public.session_template_exercises(user_id, id)
  on delete set null;

alter table public.planned_session_item_changes
  add constraint planned_session_item_changes_live_item_same_user_fk
  foreign key (user_id, planned_session_item_live_id)
  references public.planned_session_items_live(user_id, id)
  on delete cascade;

alter table public.planned_session_item_changes
  add constraint planned_session_item_changes_planned_session_same_user_fk
  foreign key (user_id, planned_session_id)
  references public.planned_sessions(user_id, id)
  on delete cascade;

-- ---------------------------------------------------------------------------
-- 4) Snapshot -> live initialization
-- ---------------------------------------------------------------------------
create or replace function public.ensure_live_item_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.planned_session_items_live (
    user_id,
    planned_session_id,
    planned_session_item_snapshot_id,
    session_template_exercise_id,
    position,
    exercise_name,
    series_raw,
    reps_raw,
    load_raw,
    tempo_raw,
    rest_raw,
    rir_raw,
    coach_notes,
    payload
  )
  values (
    new.user_id,
    new.planned_session_id,
    new.id,
    new.session_template_exercise_id,
    new.position,
    new.exercise_name,
    new.series_raw,
    new.reps_raw,
    new.load_raw,
    new.tempo_raw,
    new.rest_raw,
    new.rir_raw,
    new.coach_notes,
    coalesce(new.payload, '{}'::jsonb)
  )
  on conflict (planned_session_item_snapshot_id) do nothing;

  return new;
end;
$$;

drop trigger if exists planned_session_items_snapshot_to_live
  on public.planned_session_items_snapshot;
create trigger planned_session_items_snapshot_to_live
after insert on public.planned_session_items_snapshot
for each row execute function public.ensure_live_item_from_snapshot();

-- Backfill live items for existing snapshots.
insert into public.planned_session_items_live (
  user_id,
  planned_session_id,
  planned_session_item_snapshot_id,
  session_template_exercise_id,
  position,
  exercise_name,
  series_raw,
  reps_raw,
  load_raw,
  tempo_raw,
  rest_raw,
  rir_raw,
  coach_notes,
  payload
)
select
  s.user_id,
  s.planned_session_id,
  s.id,
  s.session_template_exercise_id,
  s.position,
  s.exercise_name,
  s.series_raw,
  s.reps_raw,
  s.load_raw,
  s.tempo_raw,
  s.rest_raw,
  s.rir_raw,
  s.coach_notes,
  coalesce(s.payload, '{}'::jsonb)
from public.planned_session_items_snapshot s
left join public.planned_session_items_live l
  on l.planned_session_item_snapshot_id = s.id
where l.id is null;

-- ---------------------------------------------------------------------------
-- 5) Auto-audit live item mutations
-- ---------------------------------------------------------------------------
create or replace function public.capture_planned_session_item_live_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  before_row jsonb;
  after_row jsonb;
  changed_keys jsonb := '[]'::jsonb;
  actor uuid := auth.uid();
  source_value text := coalesce(nullif(current_setting('request.jwt.claim.source', true), ''), 'application');
  reason_value text := nullif(current_setting('request.jwt.claim.reason', true), '');
begin
  if tg_op = 'INSERT' then
    after_row := to_jsonb(new) - 'created_at' - 'updated_at';
    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into changed_keys
      from jsonb_object_keys(after_row) as t(k);

    insert into public.planned_session_item_changes (
      user_id,
      planned_session_item_live_id,
      planned_session_id,
      change_type,
      changed_by,
      changed_at,
      before_state,
      after_state,
      fields_changed,
      source,
      reason,
      payload
    )
    values (
      new.user_id,
      new.id,
      new.planned_session_id,
      'insert',
      actor,
      now(),
      null,
      after_row,
      changed_keys,
      source_value,
      reason_value,
      jsonb_build_object('trigger', tg_name)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' then
    before_row := to_jsonb(old) - 'created_at' - 'updated_at';
    after_row := to_jsonb(new) - 'created_at' - 'updated_at';

    select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
      into changed_keys
      from (
        select key as k from jsonb_each(before_row)
        union
        select key as k from jsonb_each(after_row)
      ) keys
      where (before_row -> keys.k) is distinct from (after_row -> keys.k);

    if changed_keys = '[]'::jsonb then
      return new;
    end if;

    insert into public.planned_session_item_changes (
      user_id,
      planned_session_item_live_id,
      planned_session_id,
      change_type,
      changed_by,
      changed_at,
      before_state,
      after_state,
      fields_changed,
      source,
      reason,
      payload
    )
    values (
      new.user_id,
      new.id,
      new.planned_session_id,
      'update',
      actor,
      now(),
      before_row,
      after_row,
      changed_keys,
      source_value,
      reason_value,
      jsonb_build_object('trigger', tg_name)
    );
    return new;
  end if;

  before_row := to_jsonb(old) - 'created_at' - 'updated_at';
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb)
    into changed_keys
    from jsonb_object_keys(before_row) as t(k);

  insert into public.planned_session_item_changes (
    user_id,
    planned_session_item_live_id,
    planned_session_id,
    change_type,
    changed_by,
    changed_at,
      before_state,
      after_state,
    fields_changed,
    source,
    reason,
    payload
  )
  values (
    old.user_id,
    old.id,
    old.planned_session_id,
    'delete',
    actor,
    now(),
    before_row,
    null,
    changed_keys,
    source_value,
    reason_value,
    jsonb_build_object('trigger', tg_name)
  );
  return old;
end;
$$;

drop trigger if exists planned_session_items_live_audit_change
  on public.planned_session_items_live;
create trigger planned_session_items_live_audit_change
after insert or update or delete on public.planned_session_items_live
for each row execute function public.capture_planned_session_item_live_change();

-- ---------------------------------------------------------------------------
-- 6) Explicit execution linkage
-- ---------------------------------------------------------------------------
alter table public.executed_session_exercises
  add column if not exists planned_session_item_live_id uuid references public.planned_session_items_live(id) on delete set null;

create index if not exists executed_session_exercises_planned_item_live_id_idx
  on public.executed_session_exercises(planned_session_item_live_id);

alter table public.executed_session_exercises
  add constraint executed_session_exercises_live_item_same_user_fk
  foreign key (user_id, planned_session_item_live_id)
  references public.planned_session_items_live(user_id, id)
  on delete set null;

create or replace function public.bind_and_validate_executed_session_live_item()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  exec_planned_session_id uuid;
  live_planned_session_id uuid;
  inferred_live_item_id uuid;
begin
  select es.planned_session_id
    into exec_planned_session_id
    from public.executed_sessions es
    where es.id = new.executed_session_id
      and es.user_id = new.user_id;

  if new.planned_session_item_live_id is null
     and new.session_template_exercise_id is not null
     and exec_planned_session_id is not null then
    select l.id
      into inferred_live_item_id
      from public.planned_session_items_live l
      where l.user_id = new.user_id
        and l.planned_session_id = exec_planned_session_id
        and l.session_template_exercise_id = new.session_template_exercise_id
      limit 1;

    if inferred_live_item_id is not null then
      new.planned_session_item_live_id := inferred_live_item_id;
    end if;
  end if;

  if new.planned_session_item_live_id is null then
    return new;
  end if;

  if exec_planned_session_id is null then
    raise exception 'executed_session % must reference planned_session to bind planned_session_item_live_id', new.executed_session_id
      using errcode = '23514';
  end if;

  select l.planned_session_id
    into live_planned_session_id
    from public.planned_session_items_live l
    where l.id = new.planned_session_item_live_id
      and l.user_id = new.user_id;

  if live_planned_session_id is null then
    raise exception 'planned_session_item_live_id % is not accessible for this user', new.planned_session_item_live_id
      using errcode = '23514';
  end if;

  if live_planned_session_id <> exec_planned_session_id then
    raise exception 'planned_session_item_live_id must belong to the same planned_session as executed_session'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists executed_session_exercises_bind_live_item
  on public.executed_session_exercises;
create trigger executed_session_exercises_bind_live_item
before insert or update of executed_session_id, session_template_exercise_id, planned_session_item_live_id, user_id
on public.executed_session_exercises
for each row execute function public.bind_and_validate_executed_session_live_item();

commit;
