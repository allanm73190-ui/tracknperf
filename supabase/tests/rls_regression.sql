-- RLS regression tests (run locally with Supabase Postgres).
-- Usage example:
--   supabase db reset
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_regression.sql

\set ON_ERROR_STOP on

do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  plan1 uuid;
begin
  -- Ensure auth claims exist for policies.
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- User 1 context
  perform set_config('request.jwt.claim.sub', u1::text, true);

  insert into public.plans (user_id, name) values (u1, 'Plan U1') returning id into plan1;
  insert into public.executed_sessions (user_id, plan_id, started_at, ended_at, payload)
  values (u1, plan1, now(), now(), '{}'::jsonb);

  -- Switch to user 2 context
  perform set_config('request.jwt.claim.sub', u2::text, true);

  -- Should NOT see user1 plan
  if exists (select 1 from public.plans where id = plan1) then
    raise exception 'RLS FAIL: user2 can see user1 plan';
  end if;

  -- Should NOT insert executed_session referencing user1 plan (composite FK OR RLS)
  begin
    insert into public.executed_sessions (user_id, plan_id, started_at, ended_at, payload)
    values (u2, plan1, now(), now(), '{}'::jsonb);
    raise exception 'RLS FAIL: user2 inserted executed_session with user1 plan';
  exception when others then
    -- expected
  end;
end $$;

-- Profiles isolation: user2 cannot read or update user1 profile.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u1::text, true);

  insert into public.profiles (id, display_name) values (u1, 'User1');

  perform set_config('request.jwt.claim.sub', u2::text, true);

  if exists (select 1 from public.profiles where id = u1) then
    raise exception 'RLS FAIL: user2 can read user1 profile';
  end if;

  begin
    update public.profiles set display_name = 'Hacked' where id = u1;
    if found then
      raise exception 'RLS FAIL: user2 updated user1 profile';
    end if;
  exception when others then
    -- expected
  end;
end $$;

-- planned_sessions isolation: user2 cannot see or insert into user1 planned sessions.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  plan1 uuid;
  ps1 uuid;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u1::text, true);

  insert into public.plans (user_id, name) values (u1, 'Plan U1') returning id into plan1;
  insert into public.planned_sessions (user_id, plan_id, scheduled_date, name)
    values (u1, plan1, current_date, 'Session U1') returning id into ps1;

  perform set_config('request.jwt.claim.sub', u2::text, true);

  if exists (select 1 from public.planned_sessions where id = ps1) then
    raise exception 'RLS FAIL: user2 can read user1 planned_session';
  end if;

  begin
    insert into public.planned_sessions (user_id, plan_id, scheduled_date, name)
      values (u2, plan1, current_date, 'Injected');
    raise exception 'RLS FAIL: user2 inserted planned_session under user1 plan';
  exception when others then
    -- expected
  end;
end $$;

-- sync_ops isolation: user2 cannot read user1 sync operations.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  op1 uuid;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u1::text, true);

  insert into public.sync_ops (user_id, op_type, table_name, payload)
    values (u1, 'upsert', 'executed_sessions', '{}'::jsonb) returning id into op1;

  perform set_config('request.jwt.claim.sub', u2::text, true);

  if exists (select 1 from public.sync_ops where id = op1) then
    raise exception 'RLS FAIL: user2 can read user1 sync_ops';
  end if;
end $$;

-- Admin probing protection: non-admin should not be able to test other user's admin status.
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  res boolean;
begin
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', u1::text, true);

  -- Calling is_admin(u2) should be blocked/false by policy in migration 0004.
  begin
    select public.is_admin(u2) into res;
  exception when others then
    res := false;
  end;
  if res is true then
    raise exception 'SEC FAIL: non-admin can probe admin status of other user';
  end if;
end $$;
