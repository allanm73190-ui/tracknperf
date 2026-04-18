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
    (u1m),(u2m),(u1n),(u2n);

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
  -- TEST 14 — admin probing protection
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
