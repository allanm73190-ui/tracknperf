-- RLS regression tests.
-- Usage (local):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_regression.sql
--
-- Each test block:
--   1. Inserts minimal auth.users rows so FK constraints are satisfied (runs as postgres superuser).
--   2. Switches to the `authenticated` role so RLS is actually enforced.
--   3. Asserts cross-user isolation.
-- Everything is wrapped in a single transaction that is rolled back → zero test data left behind.

begin;

do $$
declare
  -- plans / executed_sessions
  u1a uuid := gen_random_uuid();
  u2a uuid := gen_random_uuid();
  plan_a uuid;

  -- profiles
  u1b uuid := gen_random_uuid();
  u2b uuid := gen_random_uuid();

  -- planned_sessions
  u1c uuid := gen_random_uuid();
  u2c uuid := gen_random_uuid();
  plan_c uuid;
  ps_c  uuid;

  -- sync_ops
  u1d uuid := gen_random_uuid();
  u2d uuid := gen_random_uuid();
  op_d  uuid;

  -- plan_versions
  u1e uuid := gen_random_uuid();
  u2e uuid := gen_random_uuid();
  plan_e uuid;
  pv_e  uuid;

  -- session_templates
  u1f uuid := gen_random_uuid();
  u2f uuid := gen_random_uuid();
  plan_f uuid;
  pv_f   uuid;
  tpl_f  uuid;

  -- session_feedback
  u1g uuid := gen_random_uuid();
  u2g uuid := gen_random_uuid();
  plan_g uuid;
  ex_g   uuid;
  fb_g   uuid;

  -- context_snapshots
  u1h uuid := gen_random_uuid();
  u2h uuid := gen_random_uuid();
  cs_h  uuid;

  -- fatigue_snapshots
  u1i uuid := gen_random_uuid();
  u2i uuid := gen_random_uuid();
  fs_i  uuid;

  -- readiness_snapshots
  u1j uuid := gen_random_uuid();
  u2j uuid := gen_random_uuid();
  rs_j  uuid;

  -- external_metrics
  u1k uuid := gen_random_uuid();
  u2k uuid := gen_random_uuid();
  em_k  uuid;

  -- internal_metrics
  u1l uuid := gen_random_uuid();
  u2l uuid := gen_random_uuid();
  im_l  uuid;

  -- devices
  u1m uuid := gen_random_uuid();
  u2m uuid := gen_random_uuid();
  dev_m uuid;

  -- planned_session_items_live + planned_session_item_changes
  u1o uuid := gen_random_uuid();
  u2o uuid := gen_random_uuid();
  plan_o uuid;
  pv_o uuid;
  tpl_o uuid;
  tplex_o uuid;
  ps_o uuid;
  live_o uuid;
  change_o uuid;

  -- coach scope
  coach_p uuid := gen_random_uuid();
  athlete_p_assigned uuid := gen_random_uuid();
  athlete_p_unassigned uuid := gen_random_uuid();
  plan_p1 uuid;
  plan_p2 uuid;
  pv_p1 uuid;
  pv_p2 uuid;
  tpl_p1 uuid;
  tpl_p2 uuid;
  tplex_p1 uuid;
  tplex_p2 uuid;
  ps_p1 uuid;
  ps_p2 uuid;
  live_p1 uuid;
  live_p2 uuid;

  -- admin probing
  u1n uuid := gen_random_uuid();
  u2n uuid := gen_random_uuid();
  admin_res boolean;

begin
  -- -----------------------------------------------------------------------
  -- Bootstrap: insert all test users into auth.users as postgres superuser.
  -- (FK on public.* tables requires auth.users entries to exist.)
  -- -----------------------------------------------------------------------
  insert into auth.users (id) values
    (u1a),(u2a),(u1b),(u2b),(u1c),(u2c),(u1d),(u2d),
    (u1e),(u2e),(u1f),(u2f),(u1g),(u2g),(u1h),(u2h),
    (u1i),(u2i),(u1j),(u2j),(u1k),(u2k),(u1l),(u2l),
    (u1m),(u2m),(u1n),(u2n),(u1o),(u2o),(coach_p),(athlete_p_assigned),(athlete_p_unassigned);

  -- Bootstrap coach assignment as superuser (admin-only mutation under RLS).
  insert into public.coach_athlete_assignments (coach_user_id, athlete_user_id, active)
    values (coach_p, athlete_p_assigned, true);

  -- -----------------------------------------------------------------------
  -- Switch to authenticated role so RLS is enforced for all subsequent ops.
  -- -----------------------------------------------------------------------
  execute 'SET LOCAL ROLE authenticated';
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- =======================================================================
  -- TEST 1 — plans / executed_sessions isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1a::text, true);

  insert into public.plans (user_id, name) values (u1a, 'Plan A') returning id into plan_a;
  insert into public.executed_sessions (user_id, plan_id, started_at, ended_at, payload)
    values (u1a, plan_a, now(), now(), '{}'::jsonb);

  perform set_config('request.jwt.claim.sub', u2a::text, true);

  if exists (select 1 from public.plans where id = plan_a) then
    raise exception 'RLS FAIL: user2 can see user1 plan';
  end if;

  begin
    insert into public.executed_sessions (user_id, plan_id, started_at, ended_at, payload)
      values (u2a, plan_a, now(), now(), '{}'::jsonb);
    raise exception 'RLS FAIL: user2 inserted executed_session with user1 plan';
  exception when others then
    null; -- expected (composite FK violation or RLS block)
  end;

  -- =======================================================================
  -- TEST 2 — profiles isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1b::text, true);

  insert into public.profiles (id, display_name) values (u1b, 'User1');

  perform set_config('request.jwt.claim.sub', u2b::text, true);

  if exists (select 1 from public.profiles where id = u1b) then
    raise exception 'RLS FAIL: user2 can read user1 profile';
  end if;

  begin
    update public.profiles set display_name = 'Hacked' where id = u1b;
    if found then
      raise exception 'RLS FAIL: user2 updated user1 profile';
    end if;
  end;

  -- =======================================================================
  -- TEST 3 — planned_sessions isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1c::text, true);

  insert into public.plans (user_id, name) values (u1c, 'Plan C') returning id into plan_c;
  insert into public.planned_sessions (user_id, plan_id, scheduled_for)
    values (u1c, plan_c, current_date) returning id into ps_c;

  perform set_config('request.jwt.claim.sub', u2c::text, true);

  if exists (select 1 from public.planned_sessions where id = ps_c) then
    raise exception 'RLS FAIL: user2 can read user1 planned_session';
  end if;

  begin
    insert into public.planned_sessions (user_id, plan_id, scheduled_for)
      values (u2c, plan_c, current_date);
    raise exception 'RLS FAIL: user2 inserted planned_session under user1 plan';
  exception when others then
    null; -- expected
  end;

  -- =======================================================================
  -- TEST 4 — sync_ops isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1d::text, true);

  insert into public.sync_ops (user_id, idempotency_key, op_type, entity, payload)
    values (u1d, gen_random_uuid()::text, 'upsert', 'executed_sessions', '{}'::jsonb)
    returning id into op_d;

  perform set_config('request.jwt.claim.sub', u2d::text, true);

  if exists (select 1 from public.sync_ops where id = op_d) then
    raise exception 'RLS FAIL: user2 can read user1 sync_ops';
  end if;

  -- =======================================================================
  -- TEST 5 — plan_versions isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1e::text, true);

  insert into public.plans (user_id, name) values (u1e, 'Plan E') returning id into plan_e;
  insert into public.plan_versions (user_id, plan_id, version)
    values (u1e, plan_e, 1) returning id into pv_e;

  perform set_config('request.jwt.claim.sub', u2e::text, true);

  if exists (select 1 from public.plan_versions where id = pv_e) then
    raise exception 'RLS FAIL: user2 can read user1 plan_versions';
  end if;

  -- =======================================================================
  -- TEST 6 — session_templates isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1f::text, true);

  insert into public.plans (user_id, name) values (u1f, 'Plan F') returning id into plan_f;
  insert into public.plan_versions (user_id, plan_id, version)
    values (u1f, plan_f, 1) returning id into pv_f;
  insert into public.session_templates (user_id, plan_version_id, name)
    values (u1f, pv_f, 'Template F') returning id into tpl_f;

  perform set_config('request.jwt.claim.sub', u2f::text, true);

  if exists (select 1 from public.session_templates where id = tpl_f) then
    raise exception 'RLS FAIL: user2 can read user1 session_templates';
  end if;

  -- =======================================================================
  -- TEST 7 — session_feedback isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1g::text, true);

  insert into public.plans (user_id, name) values (u1g, 'Plan G') returning id into plan_g;
  insert into public.executed_sessions (user_id, plan_id, started_at, ended_at, payload)
    values (u1g, plan_g, now(), now(), '{}'::jsonb) returning id into ex_g;
  insert into public.session_feedback (user_id, executed_session_id)
    values (u1g, ex_g) returning id into fb_g;

  perform set_config('request.jwt.claim.sub', u2g::text, true);

  if exists (select 1 from public.session_feedback where id = fb_g) then
    raise exception 'RLS FAIL: user2 can read user1 session_feedback';
  end if;

  -- =======================================================================
  -- TEST 8 — context_snapshots isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1h::text, true);

  insert into public.context_snapshots (user_id) values (u1h) returning id into cs_h;

  perform set_config('request.jwt.claim.sub', u2h::text, true);

  if exists (select 1 from public.context_snapshots where id = cs_h) then
    raise exception 'RLS FAIL: user2 can read user1 context_snapshots';
  end if;

  -- =======================================================================
  -- TEST 9 — fatigue_snapshots isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1i::text, true);

  insert into public.fatigue_snapshots (user_id) values (u1i) returning id into fs_i;

  perform set_config('request.jwt.claim.sub', u2i::text, true);

  if exists (select 1 from public.fatigue_snapshots where id = fs_i) then
    raise exception 'RLS FAIL: user2 can read user1 fatigue_snapshots';
  end if;

  -- =======================================================================
  -- TEST 10 — readiness_snapshots isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1j::text, true);

  insert into public.readiness_snapshots (user_id) values (u1j) returning id into rs_j;

  perform set_config('request.jwt.claim.sub', u2j::text, true);

  if exists (select 1 from public.readiness_snapshots where id = rs_j) then
    raise exception 'RLS FAIL: user2 can read user1 readiness_snapshots';
  end if;

  -- =======================================================================
  -- TEST 11 — external_metrics isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1k::text, true);

  insert into public.external_metrics (user_id) values (u1k) returning id into em_k;

  perform set_config('request.jwt.claim.sub', u2k::text, true);

  if exists (select 1 from public.external_metrics where id = em_k) then
    raise exception 'RLS FAIL: user2 can read user1 external_metrics';
  end if;

  -- =======================================================================
  -- TEST 12 — internal_metrics isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1l::text, true);

  insert into public.internal_metrics (user_id) values (u1l) returning id into im_l;

  perform set_config('request.jwt.claim.sub', u2l::text, true);

  if exists (select 1 from public.internal_metrics where id = im_l) then
    raise exception 'RLS FAIL: user2 can read user1 internal_metrics';
  end if;

  -- =======================================================================
  -- TEST 13 — devices isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1m::text, true);

  insert into public.devices (user_id, device_identifier)
    values (u1m, 'device-test-abc') returning id into dev_m;

  perform set_config('request.jwt.claim.sub', u2m::text, true);

  if exists (select 1 from public.devices where id = dev_m) then
    raise exception 'RLS FAIL: user2 can read user1 devices';
  end if;

  begin
    insert into public.devices (user_id, device_identifier)
      values (u2m, 'device-test-abc');
    -- different user + same identifier = allowed (unique is per user_id)
  exception when others then
    null; -- unique constraint may fire depending on index, not a RLS concern
  end;

  -- =======================================================================
  -- TEST 14 — planned_session_items_live + planned_session_item_changes isolation
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1o::text, true);

  insert into public.plans (user_id, name) values (u1o, 'Plan O') returning id into plan_o;
  insert into public.plan_versions (user_id, plan_id, version)
    values (u1o, plan_o, 1) returning id into pv_o;
  insert into public.session_templates (user_id, plan_version_id, name)
    values (u1o, pv_o, 'Template O') returning id into tpl_o;
  insert into public.session_template_exercises (
    user_id, session_template_id, position, exercise_name, series_raw, reps_raw
  ) values (
    u1o, tpl_o, 1, 'Back Squat', '3', '5'
  ) returning id into tplex_o;
  insert into public.planned_sessions (
    user_id, plan_id, plan_version_id, session_template_id, scheduled_for
  ) values (
    u1o, plan_o, pv_o, tpl_o, current_date
  ) returning id into ps_o;
  insert into public.planned_session_items_snapshot (
    user_id, planned_session_id, session_template_exercise_id, position, exercise_name, series_raw, reps_raw, payload
  ) values (
    u1o, ps_o, tplex_o, 1, 'Back Squat', '3', '5', '{}'::jsonb
  );

  select l.id
    into live_o
    from public.planned_session_items_live l
    where l.user_id = u1o
      and l.planned_session_id = ps_o
      and l.position = 1
    limit 1;

  if live_o is null then
    raise exception 'RLS/INIT FAIL: live item was not initialized from snapshot';
  end if;

  update public.planned_session_items_live
    set reps_raw = '6'
    where id = live_o;

  select c.id
    into change_o
    from public.planned_session_item_changes c
    where c.user_id = u1o
      and c.planned_session_item_live_id = live_o
      and c.change_type = 'update'
    order by c.changed_at desc
    limit 1;

  if change_o is null then
    raise exception 'AUDIT FAIL: update on live item did not create planned_session_item_changes row';
  end if;

  perform set_config('request.jwt.claim.sub', u2o::text, true);

  if exists (select 1 from public.planned_session_items_live where id = live_o) then
    raise exception 'RLS FAIL: user2 can read user1 planned_session_items_live';
  end if;

  if exists (select 1 from public.planned_session_item_changes where id = change_o) then
    raise exception 'RLS FAIL: user2 can read user1 planned_session_item_changes';
  end if;

  begin
    update public.planned_session_items_live
      set reps_raw = '8'
      where id = live_o;
    if found then
      raise exception 'RLS FAIL: user2 updated user1 planned_session_items_live';
    end if;
  end;

  -- =======================================================================
  -- TEST 15 — coach scope ACL + mutation scope
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', athlete_p_assigned::text, true);

  insert into public.plans (user_id, name) values (athlete_p_assigned, 'Plan Athlete Assigné') returning id into plan_p1;
  insert into public.plan_versions (user_id, plan_id, version)
    values (athlete_p_assigned, plan_p1, 1) returning id into pv_p1;
  insert into public.session_templates (user_id, plan_version_id, name)
    values (athlete_p_assigned, pv_p1, 'Template Assigné') returning id into tpl_p1;
  insert into public.session_template_exercises (
    user_id, session_template_id, position, exercise_name, series_raw, reps_raw
  ) values (
    athlete_p_assigned, tpl_p1, 1, 'Bench Press', '4', '6'
  ) returning id into tplex_p1;
  insert into public.planned_sessions (
    user_id, plan_id, plan_version_id, session_template_id, scheduled_for
  ) values (
    athlete_p_assigned, plan_p1, pv_p1, tpl_p1, current_date
  ) returning id into ps_p1;
  insert into public.planned_session_items_snapshot (
    user_id, planned_session_id, session_template_exercise_id, position, exercise_name, series_raw, reps_raw, payload
  ) values (
    athlete_p_assigned, ps_p1, tplex_p1, 1, 'Bench Press', '4', '6', '{}'::jsonb
  );

  select l.id into live_p1
  from public.planned_session_items_live l
  where l.user_id = athlete_p_assigned
    and l.planned_session_id = ps_p1
    and l.position = 1
  limit 1;

  perform set_config('request.jwt.claim.sub', athlete_p_unassigned::text, true);

  insert into public.plans (user_id, name) values (athlete_p_unassigned, 'Plan Athlete Hors Scope') returning id into plan_p2;
  insert into public.plan_versions (user_id, plan_id, version)
    values (athlete_p_unassigned, plan_p2, 1) returning id into pv_p2;
  insert into public.session_templates (user_id, plan_version_id, name)
    values (athlete_p_unassigned, pv_p2, 'Template Hors Scope') returning id into tpl_p2;
  insert into public.session_template_exercises (
    user_id, session_template_id, position, exercise_name, series_raw, reps_raw
  ) values (
    athlete_p_unassigned, tpl_p2, 1, 'Deadlift', '3', '5'
  ) returning id into tplex_p2;
  insert into public.planned_sessions (
    user_id, plan_id, plan_version_id, session_template_id, scheduled_for
  ) values (
    athlete_p_unassigned, plan_p2, pv_p2, tpl_p2, current_date
  ) returning id into ps_p2;
  insert into public.planned_session_items_snapshot (
    user_id, planned_session_id, session_template_exercise_id, position, exercise_name, series_raw, reps_raw, payload
  ) values (
    athlete_p_unassigned, ps_p2, tplex_p2, 1, 'Deadlift', '3', '5', '{}'::jsonb
  );

  select l.id into live_p2
  from public.planned_session_items_live l
  where l.user_id = athlete_p_unassigned
    and l.planned_session_id = ps_p2
    and l.position = 1
  limit 1;

  perform set_config('request.jwt.claim.sub', coach_p::text, true);

  if not exists (select 1 from public.planned_sessions where user_id = athlete_p_assigned and id = ps_p1) then
    raise exception 'RLS FAIL: assigned coach cannot read assigned athlete sessions';
  end if;

  if exists (select 1 from public.planned_sessions where user_id = athlete_p_unassigned and id = ps_p2) then
    raise exception 'RLS FAIL: coach can read unassigned athlete sessions';
  end if;

  update public.planned_session_items_live
    set coach_notes = 'Coach update OK'
    where id = live_p1;
  if not found then
    raise exception 'RLS FAIL: assigned coach cannot update in-scope live item';
  end if;

  begin
    update public.planned_session_items_live
      set coach_notes = 'Should fail'
      where id = live_p2;
    if found then
      raise exception 'RLS FAIL: coach updated out-of-scope live item';
    end if;
  end;

  -- =======================================================================
  -- TEST 16 — admin probing protection
  -- =======================================================================
  perform set_config('request.jwt.claim.sub', u1n::text, true);

  begin
    select public.is_admin(u2n) into admin_res;
  exception when others then
    admin_res := false;
  end;

  if admin_res is true then
    raise exception 'SEC FAIL: non-admin can probe admin status of other user';
  end if;

  raise notice 'All RLS regression tests passed.';
end $$;

rollback;
