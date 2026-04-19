-- Sync ops outcome ledger hardening:
-- - allow Edge Function to mark applied atomically
-- - store a minimal per-op result (e.g. created ids) so retries are safe

alter table public.sync_ops
  add column if not exists result jsonb;

-- Allow the authenticated user to update only their own sync_ops row.
-- This is required for marking applied_at / result from the Edge Function using the user's JWT.
do $$
begin
  -- Drop if it exists to keep re-runs deterministic
  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'sync_ops'
      and policyname = 'sync_ops_update_own'
  ) then
    execute 'drop policy "sync_ops_update_own" on public.sync_ops';
  end if;
end $$;

create policy "sync_ops_update_own"
on public.sync_ops
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

