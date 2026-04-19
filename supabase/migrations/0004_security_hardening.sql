-- 0004_security_hardening.sql
-- Security hardening for SECURITY DEFINER routines and admin safety rails.
-- Forward-only: updates function definitions + privileges, adds guard triggers.

begin;

-- ---------------------------------------------------------------------------
-- 1) Harden SECURITY DEFINER search_path
-- ---------------------------------------------------------------------------

create or replace function public.is_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  /*
    Safe semantics:
    - Callers can check themselves (default).
    - Callers can check other users only if caller is already admin.
    - Non-admin callers asking about others always get FALSE.
  */
  select
    case
      when auth.uid() is null then false
      when target_user_id is null then false
      when target_user_id = auth.uid() then
        exists (
          select 1
          from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role = 'admin'
        )
      else
        exists (
          select 1
          from public.user_roles caller_ur
          where caller_ur.user_id = auth.uid()
            and caller_ur.role = 'admin'
        )
        and exists (
          select 1
          from public.user_roles target_ur
          where target_ur.user_id = target_user_id
            and target_ur.role = 'admin'
        )
    end;
$$;

create or replace function public.bootstrap_first_admin()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  caller uuid;
  admin_exists boolean;
begin
  caller := auth.uid();
  if caller is null then
    raise exception 'bootstrap_first_admin must be called by an authenticated user';
  end if;

  -- Concurrency safety: only one bootstrap attempt can win per transaction.
  perform pg_advisory_xact_lock(hashtext('public.bootstrap_first_admin'));

  select exists (
    select 1 from public.user_roles ur where ur.role = 'admin'
  ) into admin_exists;

  -- Idempotent: if any admin already exists, do nothing.
  if admin_exists then
    return;
  end if;

  insert into public.user_roles (user_id, role)
  values (caller, 'admin')
  on conflict (user_id) do update set role = excluded.role;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Privilege tightening: revoke EXECUTE from PUBLIC, grant explicitly
-- ---------------------------------------------------------------------------

revoke execute on function public.is_admin(uuid) from public;
revoke execute on function public.bootstrap_first_admin() from public;

-- Product decision: keep these callable by authenticated users.
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Guardrail: prevent deletion (or demotion) of the last admin
-- ---------------------------------------------------------------------------

create or replace function public.ensure_admin_exists()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if not exists (select 1 from public.user_roles ur where ur.role = 'admin') then
    raise exception 'cannot remove the last admin';
  end if;
  return null;
end;
$$;

drop trigger if exists user_roles_ensure_admin_exists on public.user_roles;

create constraint trigger user_roles_ensure_admin_exists
after delete or update of role on public.user_roles
deferrable initially immediate
for each statement execute function public.ensure_admin_exists();

-- ---------------------------------------------------------------------------
-- 4) Optional hardening: disallow arbitrary object creation in public schema
-- ---------------------------------------------------------------------------

revoke create on schema public from public;

commit;

