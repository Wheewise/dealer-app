-- =====================================================================
-- 0004 — Correct app.is_privileged_session()
--
-- The original definition hard-coded a list of role NAMES:
--
--   session_user in ('postgres', 'supabase_admin')
--     or current_setting('role') = 'service_role'
--
-- That list is wrong in practice. The Supabase CLI connects as a
-- short-lived role it mints per invocation — observed as
-- `cli_login_postgres` — and then does `SET ROLE postgres`. So a migration
-- run through `supabase db push` matched none of the names and was treated
-- as an untrusted caller: any migration touching User.role or
-- Dealer.status raised, and so would the RLS verification harness.
--
-- Enumerating role names was the mistake. What actually distinguishes an
-- infrastructure session from an end-user session is already recorded in the
-- catalogue: whether the role bypasses RLS. `postgres`, `service_role` and
-- `supabase_admin` all have rolbypassrls; `anon` and `authenticated` do not.
-- Asking that question directly is both correct today and robust against
-- Supabase renaming or adding internal roles.
--
-- Effective role resolution:
--   `current_setting('role')` reflects SET ROLE and is NOT rewritten by
--   SECURITY DEFINER, so it is the honest view of who is acting. It reads
--   'none' when no SET ROLE happened, in which case session_user is the
--   effective role.
--
--   `current_user` is deliberately NOT used: inside a SECURITY DEFINER
--   function it is the function owner (postgres), which would make this
--   return true for everyone and silently disable all three guards.
-- =====================================================================

create or replace function app.is_privileged_session()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    app.is_admin()
    or exists (
      select 1
        from pg_roles
       where rolname = coalesce(
               nullif(current_setting('role', true), 'none'),
               session_user
             )
         and (rolbypassrls or rolsuper)
    );
$$;

grant execute on function app.is_privileged_session() to anon, authenticated, service_role;

comment on function app.is_privileged_session() is
  'True for infrastructure sessions (any role with BYPASSRLS/SUPERUSER) and for platform admins. Gates the User.role / Dealer.status / Dealer.gstVerified guard triggers.';

-- ---------------------------------------------------------------------
-- Self-check: prove the fix under the very session that applies it.
--
-- This migration runs through the CLI, i.e. exactly the session that was
-- previously misclassified — so if this passes, the reported bug is gone.
-- ---------------------------------------------------------------------
do $$
begin
  if not app.is_privileged_session() then
    raise exception
      'is_privileged_session() still false for role=% session_user=% — guards would block migrations',
      coalesce(nullif(current_setting('role', true), 'none'), session_user), session_user;
  end if;
end $$;
