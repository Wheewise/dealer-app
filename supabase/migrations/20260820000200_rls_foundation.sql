-- =====================================================================
-- 0001 — RLS foundation: identity linkage, helper functions, guard triggers
--
-- Run this FIRST, against the Supabase database, after the Prisma schema
-- has been restored from Neon. It changes no existing data and adds no
-- constraint that can fail on legacy rows, so it is safe to apply while the
-- old stack is still serving traffic.
--
-- Rollback: see the matching section at the bottom of
-- docs/migration/SUPABASE_MIGRATION.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identity linkage
--
-- public."User".id is a cuid (text), not a uuid, so it cannot be auth.uid()
-- directly. Re-keying it would cascade through fifteen foreign keys on live
-- data — a rewrite of most of the database for no functional gain.
--
-- Instead every User row carries a nullable pointer at its auth.users row.
-- All existing foreign keys keep referencing the cuid and are untouched.
-- ---------------------------------------------------------------------

alter table public."User"
  add column if not exists "authId" uuid;

-- Deliberately NOT NOT-NULL: rows are backfilled in batches during the
-- migration window, and a user with no auth.users row yet simply cannot
-- authenticate (which is the correct behaviour, not an error).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'User_authId_fkey'
  ) then
    alter table public."User"
      add constraint "User_authId_fkey"
      foreign key ("authId") references auth.users(id) on delete set null;
  end if;
end $$;

create unique index if not exists "User_authId_key"
  on public."User"("authId")
  where "authId" is not null;

-- ---------------------------------------------------------------------
-- 2. Helper schema
--
-- Helpers live in `app`, not `public`. PostgREST exposes `public`, so a
-- function placed there becomes a callable RPC endpoint for every client —
-- these are internal plumbing and should not be.
-- ---------------------------------------------------------------------

create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- All helpers are:
--   SECURITY DEFINER — they read public."User", which is itself behind RLS;
--                      without this every policy would recurse into that
--                      table's own policy and deadlock the model.
--   STABLE           — lets Postgres evaluate once per statement.
--   search_path      — pinned, so a caller cannot shadow `public` with a
--                      temp schema and swap the tables out from under a
--                      definer-rights function.

create or replace function app.current_user_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u."id" from public."User" u where u."authId" = auth.uid();
$$;

comment on function app.current_user_id() is
  'public."User".id for the caller, or NULL when unauthenticated.';

-- Role is read from the database, never from a JWT claim.
--
-- Supabase can carry custom claims in app_metadata, which would be cheaper —
-- but a JWT is a snapshot. A user demoted from ADMIN keeps a valid token
-- until it expires. This mirrors the rule the application layer already
-- follows and closes that window.
--
-- It must never be read from user_metadata: that field is writable by the
-- user through the Auth API, so a role stored there is self-assignable.
create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u."role"::text from public."User" u where u."authId" = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select u."role"::text in ('ADMIN', 'SUPER_ADMIN')
       from public."User" u where u."authId" = auth.uid()),
    false
  );
$$;

create or replace function app.current_dealer_id()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select d."id"
    from public."Dealer" d
    join public."User" u on u."id" = d."userId"
   where u."authId" = auth.uid();
$$;

-- Suspension has to bite at the database now. `suspendDealer` pauses a
-- dealer's live listings; a suspended dealer that could still write would
-- simply set them back to ACTIVE.
create or replace function app.dealer_can_write()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select d."status"::text = 'ACTIVE'
       from public."Dealer" d
       join public."User" u on u."id" = d."userId"
      where u."authId" = auth.uid()),
    false
  );
$$;

-- Participation in a conversation, used by both Conversation and Message.
create or replace function app.in_conversation(conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public."Conversation" c
     where c."id" = conversation_id
       and (
         c."buyerId" = app.current_user_id()
         or c."dealerId" = app.current_dealer_id()
       )
  );
$$;

revoke all on function
  app.current_user_id(), app.current_role(), app.is_admin(),
  app.current_dealer_id(), app.dealer_can_write(), app.in_conversation(text)
from public;

grant execute on function
  app.current_user_id(), app.current_role(), app.is_admin(),
  app.current_dealer_id(), app.dealer_can_write(), app.in_conversation(text)
to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Privilege-escalation guards
--
-- RLS grants or denies whole ROWS; it cannot protect individual COLUMNS.
-- A policy that lets users update their own User row therefore also lets
-- them write their own `role` — vertical privilege escalation in one
-- UPDATE. Column-level GRANTs could express this, but they require
-- enumerating every writable column, so adding a column later silently
-- makes it unwritable. Triggers state the rule directly instead.
-- ---------------------------------------------------------------------

-- Callers permitted to change a protected column.
--
-- `session_user` is the role that actually connected, and is checked rather
-- than `current_user`: inside a SECURITY DEFINER function `current_user` is
-- the definer (postgres), so testing it would make every guard a no-op.
--
--   postgres / supabase_admin — migrations and the SQL editor
--   role = service_role       — PostgREST connects as `authenticator` and
--                               switches role, so the connected user is not
--                               distinctive; the role setting is
--   app.is_admin()            — a genuine platform administrator
create or replace function app.is_privileged_session()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select session_user in ('postgres', 'supabase_admin')
      or coalesce(current_setting('role', true), '') = 'service_role'
      or app.is_admin();
$$;

grant execute on function app.is_privileged_session() to anon, authenticated, service_role;

create or replace function app.guard_user_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new."role" is distinct from old."role" then
    if app.is_privileged_session() then
      return new;
    end if;
    raise exception 'Not authorised to change User.role'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_user_role_change on public."User";
create trigger guard_user_role_change
  before update on public."User"
  for each row execute function app.guard_user_role_change();

create or replace function app.guard_dealer_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new."status" is distinct from old."status" then
    if app.is_privileged_session() then
      return new;
    end if;
    raise exception 'Not authorised to change Dealer.status'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_dealer_status_change on public."Dealer";
create trigger guard_dealer_status_change
  before update on public."Dealer"
  for each row execute function app.guard_dealer_status_change();

-- gstVerified is set only by the verified GSTIN flow, which runs with the
-- service role. Without this a dealer could award themselves the trust badge.
create or replace function app.guard_dealer_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new."gstVerified" is distinct from old."gstVerified" then
    if app.is_privileged_session() then
      return new;
    end if;
    raise exception 'Not authorised to change Dealer.gstVerified'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_dealer_verification_change on public."Dealer";
create trigger guard_dealer_verification_change
  before update on public."Dealer"
  for each row execute function app.guard_dealer_verification_change();

-- ---------------------------------------------------------------------
-- 4. Keep auth.users and public."User" in step
--
-- New sign-ups land in auth.users first. This creates the matching profile
-- row so the helpers above resolve immediately, rather than on next login.
--
-- Role always defaults to BUYER here. It is NOT read from sign-up metadata:
-- that payload is client-supplied, and honouring it would let anyone
-- register as an ADMIN.
-- ---------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_id text;
begin
  -- An existing account being linked during the migration: match on email
  -- and adopt the row rather than creating a duplicate.
  select u."id" into existing_id
    from public."User" u
   where u."authId" is null
     and u."email" is not null
     and lower(u."email") = lower(new.email)
   limit 1;

  if existing_id is not null then
    update public."User"
       set "authId" = new.id,
           "emailVerified" = coalesce("emailVerified", new.email_confirmed_at)
     where "id" = existing_id;
    return new;
  end if;

  insert into public."User" ("id", "authId", "email", "name", "role", "emailVerified",
                             "createdAt", "updatedAt")
  values (
    -- Prisma generates cuids in the app; a uuid is a valid text id too and
    -- keeps this path independent of the application.
    gen_random_uuid()::text,
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    'BUYER',
    new.email_confirmed_at,
    now(),
    now()
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

-- Mirror email verification back to the profile table.
create or replace function app.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public."User"
     set "emailVerified" = new.email_confirmed_at,
         "email"         = new.email,
         "updatedAt"     = now()
   where "authId" = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function app.handle_auth_user_updated();
