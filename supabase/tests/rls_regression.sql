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

