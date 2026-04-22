-- 0012_coach_acl_occ_conflicts_notifications.sql
-- Stories covered:
-- - TNP-120 ACL coach -> athletes
-- - TNP-110 authority matrix (coach vs athlete)
-- - TNP-130 sync idempotence hardening (session_feedback/context_snapshots)
-- - TNP-140 OCC foundations + sync_conflicts table
-- - TNP-190 in-app notifications foundations

begin;

-- ---------------------------------------------------------------------------
-- 1) Roles: allow explicit coach/athlete role values
-- ---------------------------------------------------------------------------
alter table public.user_roles
  drop constraint if exists user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'member', 'coach', 'athlete'));

-- ---------------------------------------------------------------------------
-- 2) Coach assignments table
-- ---------------------------------------------------------------------------
create table if not exists public.coach_athlete_assignments (
  id uuid primary key default gen_random_uuid(),
  coach_user_id uuid not null references auth.users(id) on delete cascade,
  athlete_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_athlete_assignments_distinct_users check (coach_user_id <> athlete_user_id),
  constraint coach_athlete_assignments_unique_pair unique (coach_user_id, athlete_user_id)
);

create index if not exists coach_athlete_assignments_coach_idx
  on public.coach_athlete_assignments(coach_user_id);
create index if not exists coach_athlete_assignments_athlete_idx
  on public.coach_athlete_assignments(athlete_user_id);
create index if not exists coach_athlete_assignments_active_idx
  on public.coach_athlete_assignments(active);

drop trigger if exists coach_athlete_assignments_set_updated_at on public.coach_athlete_assignments;
create trigger coach_athlete_assignments_set_updated_at
before update on public.coach_athlete_assignments
for each row execute function public.set_updated_at();

alter table public.coach_athlete_assignments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_athlete_assignments'
      and policyname = 'coach_athlete_assignments_select_scope'
  ) then
    execute $sql$
      create policy "coach_athlete_assignments_select_scope"
      on public.coach_athlete_assignments
      for select
      to authenticated
      using (
        coach_user_id = auth.uid()
        or athlete_user_id = auth.uid()
        or public.is_admin()
      )
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_athlete_assignments'
      and policyname = 'coach_athlete_assignments_insert_admin'
  ) then
    execute $sql$
      create policy "coach_athlete_assignments_insert_admin"
      on public.coach_athlete_assignments
      for insert
      to authenticated
      with check (public.is_admin())
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_athlete_assignments'
      and policyname = 'coach_athlete_assignments_update_admin'
  ) then
    execute $sql$
      create policy "coach_athlete_assignments_update_admin"
      on public.coach_athlete_assignments
      for update
      to authenticated
      using (public.is_admin())
      with check (public.is_admin())
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'coach_athlete_assignments'
      and policyname = 'coach_athlete_assignments_delete_admin'
  ) then
    execute $sql$
      create policy "coach_athlete_assignments_delete_admin"
      on public.coach_athlete_assignments
      for delete
      to authenticated
      using (public.is_admin())
    $sql$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) ACL helper functions
-- ---------------------------------------------------------------------------
create or replace function public.is_coach(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = 'coach'
  );
$$;

create or replace function public.is_assigned_coach(
  coach_id uuid,
  athlete_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.coach_athlete_assignments ca
    where ca.coach_user_id = coach_id
      and ca.athlete_user_id = athlete_id
      and ca.active = true
  );
$$;

create or replace function public.can_access_athlete(target_athlete_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    case
      when auth.uid() is null then false
      when target_athlete_id is null then false
      when auth.uid() = target_athlete_id then true
      when public.is_admin(auth.uid()) then true
      when public.is_assigned_coach(auth.uid(), target_athlete_id) then true
      else false
    end;
$$;

revoke execute on function public.is_coach(uuid) from public;
revoke execute on function public.is_assigned_coach(uuid, uuid) from public;
revoke execute on function public.can_access_athlete(uuid) from public;
grant execute on function public.is_coach(uuid) to authenticated;
grant execute on function public.is_assigned_coach(uuid, uuid) to authenticated;
grant execute on function public.can_access_athlete(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Read-scope RLS for coach on athlete rows
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  policy_name text;
begin
  -- Profiles (id column, not user_id)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_coach_scope'
  ) then
    execute $sql$
      create policy "profiles_select_coach_scope"
      on public.profiles
      for select
      to authenticated
      using (public.can_access_athlete(id))
    $sql$;
  end if;

  foreach t in array array[
    'plans',
    'plan_versions',
    'session_templates',
    'planned_sessions',
    'planned_session_items_snapshot',
    'planned_session_items_live',
    'planned_session_item_changes',
    'executed_sessions',
    'executed_session_exercises',
    'executed_session_sets',
    'executed_session_metrics',
    'session_feedback',
    'daily_checkins',
    'context_snapshots',
    'recommendations',
    'recommendation_explanations',
    'engine_decisions',
    'notifications',
    'sync_conflicts'
  ]
  loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    policy_name := t || '_select_coach_scope';
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = policy_name
    ) then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.can_access_athlete(user_id))',
        policy_name,
        t
      );
    end if;
  end loop;
end $$;

-- Coach can edit mutable live items for assigned athletes (scope still guarded by trigger below).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'planned_session_items_live'
      and policyname = 'planned_session_items_live_insert_coach_scope'
  ) then
    execute $sql$
      create policy "planned_session_items_live_insert_coach_scope"
      on public.planned_session_items_live
      for insert
      to authenticated
      with check (public.is_assigned_coach(auth.uid(), user_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'planned_session_items_live'
      and policyname = 'planned_session_items_live_update_coach_scope'
  ) then
    execute $sql$
      create policy "planned_session_items_live_update_coach_scope"
      on public.planned_session_items_live
      for update
      to authenticated
      using (public.is_assigned_coach(auth.uid(), user_id))
      with check (public.is_assigned_coach(auth.uid(), user_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'planned_session_items_live'
      and policyname = 'planned_session_items_live_delete_coach_scope'
  ) then
    execute $sql$
      create policy "planned_session_items_live_delete_coach_scope"
      on public.planned_session_items_live
      for delete
      to authenticated
      using (public.is_assigned_coach(auth.uid(), user_id))
    $sql$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) OCC + authority fields on planned live items
-- ---------------------------------------------------------------------------
alter table public.planned_session_items_live
  add column if not exists version integer not null default 1 check (version >= 1);

alter table public.planned_session_items_live
  add column if not exists last_modified_by uuid references auth.users(id) on delete set null;

update public.planned_session_items_live
set last_modified_by = user_id
where last_modified_by is null;

create index if not exists planned_session_items_live_version_idx
  on public.planned_session_items_live(version);

-- ---------------------------------------------------------------------------
-- 6) Authority matrix: coach edits only non-realized items
-- ---------------------------------------------------------------------------
create or replace function public.is_live_item_realized(p_live_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.executed_session_exercises ese
    join public.executed_sessions es
      on es.id = ese.executed_session_id
    where ese.planned_session_item_live_id = p_live_item_id
  )
  or exists (
    select 1
    from public.planned_session_items_live l
    join public.executed_sessions es
      on es.planned_session_id = l.planned_session_id
     and es.user_id = l.user_id
    join public.executed_session_exercises ese
      on ese.executed_session_id = es.id
     and ese.session_template_exercise_id = l.session_template_exercise_id
    where l.id = p_live_item_id
      and l.session_template_exercise_id is not null
  );
$$;

revoke execute on function public.is_live_item_realized(uuid) from public;
grant execute on function public.is_live_item_realized(uuid) to authenticated;

create or replace function public.enforce_planned_live_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  actor uuid := auth.uid();
  owner_id uuid;
  planned_id uuid;
begin
  if tg_op = 'INSERT' then
    owner_id := new.user_id;
    planned_id := new.planned_session_id;
  else
    owner_id := old.user_id;
    planned_id := old.planned_session_id;
  end if;

  -- Allow system-level operations (migrations/triggers without auth context).
  if actor is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if actor = owner_id or public.is_admin(actor) then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if public.is_assigned_coach(actor, owner_id) then
    if tg_op = 'INSERT' then
      if not exists (
        select 1
        from public.planned_sessions ps
        where ps.id = planned_id
          and ps.user_id = owner_id
      ) then
        raise exception 'FORBIDDEN_SCOPE'
          using errcode = '42501';
      end if;
      return new;
    end if;

    if public.is_live_item_realized(old.id) then
      raise exception 'ITEM_REALIZED_LOCKED'
        using errcode = '42501';
    end if;

    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'FORBIDDEN_SCOPE'
    using errcode = '42501';
end;
$$;

drop trigger if exists a_planned_session_items_live_enforce_authority on public.planned_session_items_live;
create trigger a_planned_session_items_live_enforce_authority
before insert or update or delete on public.planned_session_items_live
for each row execute function public.enforce_planned_live_authority();

create or replace function public.bump_planned_live_version()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' then
    new.version := coalesce(new.version, 1);
    if new.last_modified_by is null then
      new.last_modified_by := coalesce(auth.uid(), new.user_id);
    end if;
    return new;
  end if;

  if (to_jsonb(new) - 'updated_at' - 'version' - 'last_modified_by')
      is distinct from
     (to_jsonb(old) - 'updated_at' - 'version' - 'last_modified_by') then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;

  new.last_modified_by := coalesce(auth.uid(), old.last_modified_by, old.user_id);
  return new;
end;
$$;

drop trigger if exists z_planned_session_items_live_bump_version on public.planned_session_items_live;
create trigger z_planned_session_items_live_bump_version
before insert or update on public.planned_session_items_live
for each row execute function public.bump_planned_live_version();

-- ---------------------------------------------------------------------------
-- 7) Sync conflicts table (OCC conflict registry)
-- ---------------------------------------------------------------------------
create table if not exists public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity text not null,
  entity_id uuid,
  field text,
  local_value jsonb,
  server_value jsonb,
  local_version integer,
  server_version integer,
  status text not null default 'pending'
    check (status in ('pending', 'resolved_auto', 'resolved_user')),
  resolution text
    check (resolution in ('local', 'server')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_conflicts_user_id_idx
  on public.sync_conflicts(user_id);
create index if not exists sync_conflicts_entity_idx
  on public.sync_conflicts(entity, entity_id);
create index if not exists sync_conflicts_status_idx
  on public.sync_conflicts(status);
create index if not exists sync_conflicts_created_at_idx
  on public.sync_conflicts(created_at desc);

alter table public.sync_conflicts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_conflicts'
      and policyname = 'sync_conflicts_select_scope'
  ) then
    execute $sql$
      create policy "sync_conflicts_select_scope"
      on public.sync_conflicts
      for select
      to authenticated
      using (public.can_access_athlete(user_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_conflicts'
      and policyname = 'sync_conflicts_insert_scope'
  ) then
    execute $sql$
      create policy "sync_conflicts_insert_scope"
      on public.sync_conflicts
      for insert
      to authenticated
      with check (public.can_access_athlete(user_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_conflicts'
      and policyname = 'sync_conflicts_update_scope'
  ) then
    execute $sql$
      create policy "sync_conflicts_update_scope"
      on public.sync_conflicts
      for update
      to authenticated
      using (public.can_access_athlete(user_id))
      with check (public.can_access_athlete(user_id))
    $sql$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8) Idempotence hardening for sync entities
-- ---------------------------------------------------------------------------
-- session_feedback: keep only latest row per (user, executed_session), then enforce uniqueness.
delete from public.session_feedback sf
using public.session_feedback newer
where sf.user_id = newer.user_id
  and sf.executed_session_id = newer.executed_session_id
  and (
    sf.created_at < newer.created_at
    or (sf.created_at = newer.created_at and sf.id < newer.id)
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_feedback_user_executed_unique'
      and conrelid = 'public.session_feedback'::regclass
  ) then
    execute 'alter table public.session_feedback add constraint session_feedback_user_executed_unique unique (user_id, executed_session_id)';
  end if;
end $$;

alter table public.context_snapshots
  add column if not exists idempotency_key text;

create unique index if not exists context_snapshots_user_idempotency_uniq
  on public.context_snapshots(user_id, idempotency_key);

-- ---------------------------------------------------------------------------
-- 9) In-app notifications foundations
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('overload', 'session', 'sync', 'coach')),
  title text not null,
  message text not null,
  dedupe_key text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_user_dedupe_uniq
  on public.notifications(user_id, dedupe_key);
create index if not exists notifications_user_created_idx
  on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_read_idx
  on public.notifications(user_id, read_at);

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_select_own'
  ) then
    execute $sql$
      create policy "notifications_select_own"
      on public.notifications
      for select
      to authenticated
      using (user_id = auth.uid())
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_insert_own_or_scope'
  ) then
    execute $sql$
      create policy "notifications_insert_own_or_scope"
      on public.notifications
      for insert
      to authenticated
      with check (public.can_access_athlete(user_id))
    $sql$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    execute $sql$
      create policy "notifications_update_own"
      on public.notifications
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid())
    $sql$;
  end if;
end $$;

create or replace function public.emit_coach_change_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.changed_by is null or new.changed_by = new.user_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = new.changed_by
      and ur.role = 'coach'
  ) then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    category,
    title,
    message,
    dedupe_key,
    payload
  )
  values (
    new.user_id,
    'coach',
    'Modification coach',
    'Votre séance planifiée a été ajustée par votre coach.',
    'coach-change:' || new.id::text,
    jsonb_build_object(
      'planned_session_id', new.planned_session_id,
      'live_item_id', new.planned_session_item_live_id,
      'change_id', new.id,
      'change_type', new.change_type,
      'changed_by', new.changed_by
    )
  )
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists planned_session_item_changes_emit_notification on public.planned_session_item_changes;
create trigger planned_session_item_changes_emit_notification
after insert on public.planned_session_item_changes
for each row execute function public.emit_coach_change_notification();

create or replace function public.emit_overload_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(new.risk_level, '') not in ('orange', 'red') then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    category,
    title,
    message,
    dedupe_key,
    payload
  )
  values (
    new.user_id,
    'overload',
    case when new.risk_level = 'red' then 'Alerte surcharge' else 'Surcharge à surveiller' end,
    case when new.risk_level = 'red'
      then 'Des signaux de surcharge critiques ont été détectés.'
      else 'Des signaux de surcharge ont été détectés. Ajustez la séance.'
    end,
    'overload:' || coalesce(new.recommendation_id::text, new.id::text),
    jsonb_build_object(
      'recommendation_id', new.recommendation_id,
      'decision', new.decision,
      'risk_level', new.risk_level,
      'reason_codes', new.reason_codes
    )
  )
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists engine_decisions_emit_overload_notification on public.engine_decisions;
create trigger engine_decisions_emit_overload_notification
after insert on public.engine_decisions
for each row execute function public.emit_overload_notification();

create or replace function public.emit_today_session_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.scheduled_for <> current_date then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    category,
    title,
    message,
    dedupe_key,
    payload
  )
  values (
    new.user_id,
    'session',
    'Séance planifiée aujourd’hui',
    'Une séance planifiée est disponible dans votre écran Today.',
    'session:' || new.id::text,
    jsonb_build_object(
      'planned_session_id', new.id,
      'scheduled_for', new.scheduled_for
    )
  )
  on conflict (user_id, dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists planned_sessions_emit_today_session_notification on public.planned_sessions;
create trigger planned_sessions_emit_today_session_notification
after insert on public.planned_sessions
for each row execute function public.emit_today_session_notification();

commit;
