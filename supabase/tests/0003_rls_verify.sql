-- =====================================================================
-- 0003 — RLS verification harness
--
-- Run AFTER 0001 and 0002, against a Supabase branch or staging database.
-- Everything happens inside a transaction that ends in ROLLBACK, so no seed
-- row survives — but run it on a branch anyway, not on production.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f 0003_rls_verify.sql
--
-- It prints one line per check and finishes with a summary. Any FAIL means
-- the authorization boundary is not what this migration claims, because with
-- RLS as the primary gate these policies are the only thing standing between
-- one tenant's data and another's.
-- =====================================================================

begin;

create temporary table _results (
  ord      serial,
  label    text,
  passed   boolean
) on commit drop;

create or replace function pg_temp.check(ok boolean, label text)
returns void language plpgsql as $$
begin
  insert into _results(label, passed) values (label, coalesce(ok, false));
end $$;

-- Runs a query as a given auth user and reports how many rows it can see.
create or replace function pg_temp.visible_count(sql text)
returns integer language plpgsql as $$
declare n integer;
begin
  execute sql into n;
  return coalesce(n, 0);
end $$;

-- Returns true when the statement is refused (by RLS or by a guard trigger).
create or replace function pg_temp.is_denied(sql text)
returns boolean language plpgsql as $$
begin
  execute sql;
  return false;             -- statement succeeded => not denied
exception
  when insufficient_privilege or check_violation then return true;
  when others then
    -- A policy that blocks an UPDATE/DELETE yields "0 rows", not an error.
    -- Those cases are asserted by row count instead, so anything landing
    -- here is a genuine, unexpected failure.
    raise notice 'unexpected error: % (%)', sqlerrm, sqlstate;
    return false;
end $$;

-- ---------------------------------------------------------------------
-- Seed (runs as the migration role, which bypasses RLS)
-- ---------------------------------------------------------------------

do $$
declare
  buyer_auth   uuid := gen_random_uuid();
  dealer_a_auth uuid := gen_random_uuid();
  dealer_b_auth uuid := gen_random_uuid();
  susp_auth    uuid := gen_random_uuid();
  admin_auth   uuid := gen_random_uuid();
begin
  -- auth.users rows. The on_auth_user_created trigger creates the matching
  -- public."User" profile for each.
  insert into auth.users
    (id, instance_id, aud, role, email, encrypted_password,
     email_confirmed_at, created_at, updated_at,
     raw_app_meta_data, raw_user_meta_data)
  values
    (buyer_auth,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rlstest-buyer@example.test',   '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (dealer_a_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rlstest-dealera@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (dealer_b_auth, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rlstest-dealerb@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (susp_auth,     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rlstest-susp@example.test',    '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
    (admin_auth,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'rlstest-admin@example.test',   '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb);

  -- Promote roles and attach dealers. This runs privileged, so the guard
  -- triggers permit it.
  update public."User" set "role" = 'DEALER'      where "authId" in (dealer_a_auth, dealer_b_auth, susp_auth);
  update public."User" set "role" = 'SUPER_ADMIN' where "authId" = admin_auth;

  insert into public."Dealer" ("id","userId","businessName","city","phone","status","createdAt","updatedAt")
  select 'rlst_dealer_a', u."id", 'A Motors', 'Indore', '9990000001', 'ACTIVE', now(), now()
    from public."User" u where u."authId" = dealer_a_auth;
  insert into public."Dealer" ("id","userId","businessName","city","phone","status","createdAt","updatedAt")
  select 'rlst_dealer_b', u."id", 'B Motors', 'Indore', '9990000002', 'ACTIVE', now(), now()
    from public."User" u where u."authId" = dealer_b_auth;
  insert into public."Dealer" ("id","userId","businessName","city","phone","status","createdAt","updatedAt")
  select 'rlst_dealer_s', u."id", 'S Motors', 'Indore', '9990000003', 'SUSPENDED', now(), now()
    from public."User" u where u."authId" = susp_auth;

  insert into public."Listing"
    ("id","dealerId","vehicleType","make","model","year","fuelType","odometerKm",
     "askingPrice","city","status","createdAt","updatedAt")
  values
    ('rlst_l_a_active', 'rlst_dealer_a', 'CAR','Honda','City',2020,'PETROL',40000,500000,'Indore','ACTIVE', now(), now()),
    ('rlst_l_a_paused', 'rlst_dealer_a', 'CAR','Honda','Jazz',2019,'PETROL',50000,400000,'Indore','PAUSED', now(), now()),
    ('rlst_l_b_active', 'rlst_dealer_b', 'CAR','Maruti','Swift',2021,'PETROL',20000,600000,'Indore','ACTIVE', now(), now()),
    ('rlst_l_b_paused', 'rlst_dealer_b', 'CAR','Maruti','Baleno',2018,'PETROL',70000,300000,'Indore','PAUSED', now(), now());

  insert into public."SavedListing" ("id","userId","listingId","createdAt")
  select 'rlst_saved_buyer', u."id", 'rlst_l_a_active', now()
    from public."User" u where u."authId" = buyer_auth;

  insert into public."Post" ("id","title","body","authorId","community","tags","createdAt","updatedAt")
  select 'rlst_post_buyer', 'Buyer thread', 'body text here', u."id", 'BUYER', '{}', now(), now()
    from public."User" u where u."authId" = buyer_auth;
  insert into public."Post" ("id","title","body","authorId","community","tags","createdAt","updatedAt")
  select 'rlst_post_dealer', 'Dealer thread', 'body text here', u."id", 'DEALER', '{}', now(), now()
    from public."User" u where u."authId" = dealer_a_auth;

  insert into public."ApiKey" ("id","dealerId","name","keyHash","keyPrefix","createdAt")
  values ('rlst_key_a', 'rlst_dealer_a', 'A key', 'hash-a', 'wk_aaaa', now());

  -- Stash the auth ids for the assertion phase.
  create temporary table _who (who text primary key, auth_id uuid) on commit drop;
  insert into _who values
    ('buyer', buyer_auth), ('dealer_a', dealer_a_auth), ('dealer_b', dealer_b_auth),
    ('suspended', susp_auth), ('admin', admin_auth);
end $$;

-- ---------------------------------------------------------------------
-- Structural invariants
-- ---------------------------------------------------------------------

do $$
declare unprotected text[];
begin
  select array_agg(c.relname order by c.relname) into unprotected
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and (c.relrowsecurity = false or c.relforcerowsecurity = false);

  perform pg_temp.check(
    unprotected is null,
    'every public table has RLS enabled AND forced' ||
      coalesce(' — missing: ' || array_to_string(unprotected, ', '), '')
  );
end $$;

-- ---------------------------------------------------------------------
-- Assertions, per persona
-- ---------------------------------------------------------------------

do $$
declare
  a_buyer   uuid; a_dealer_a uuid; a_dealer_b uuid; a_susp uuid; a_admin uuid;
  n integer;
begin
  select auth_id into a_buyer    from _who where who = 'buyer';
  select auth_id into a_dealer_a from _who where who = 'dealer_a';
  select auth_id into a_dealer_b from _who where who = 'dealer_b';
  select auth_id into a_susp     from _who where who = 'suspended';
  select auth_id into a_admin    from _who where who = 'admin';

  -- ============ anonymous ============
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', null, true);

  select count(*) into n from public."Listing";
  perform pg_temp.check(n = 2, 'anon sees only ACTIVE listings (expected 2, got ' || n || ')');

  select count(*) into n from public."User";
  perform pg_temp.check(n = 0, 'anon cannot read the User table at all (got ' || n || ')');

  select count(*) into n from public."Post";
  perform pg_temp.check(n = 1, 'anon sees the buyer forum but not the dealer forum (got ' || n || ')');

  select count(*) into n from public."ApiKey";
  perform pg_temp.check(n = 0, 'anon cannot read API keys');

  select count(*) into n from public.dealer_public;
  perform pg_temp.check(n = 2, 'anon sees ACTIVE dealers through the public view only');

  -- ============ buyer ============
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', a_buyer, 'role', 'authenticated')::text, true);

  select count(*) into n from public."Listing";
  perform pg_temp.check(n = 2, 'buyer sees only ACTIVE listings (got ' || n || ')');

  select count(*) into n from public."User";
  perform pg_temp.check(n = 1, 'buyer sees only their own User row (got ' || n || ')');

  select count(*) into n from public."SavedListing";
  perform pg_temp.check(n = 1, 'buyer sees their own wishlist');

  select count(*) into n from public."Post" where "community" = 'DEALER';
  perform pg_temp.check(n = 0, 'buyer cannot read the dealer forum');

  select count(*) into n from public."ApiKey";
  perform pg_temp.check(n = 0, 'buyer cannot read any API key');

  perform pg_temp.check(
    pg_temp.is_denied($q$update public."User" set "role" = 'ADMIN'
                          where "authId" = current_setting('request.jwt.claims')::json->>'sub'$q$),
    'buyer cannot escalate their own role'
  );

  update public."Listing" set "askingPrice" = 1 where "id" = 'rlst_l_a_active';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'buyer cannot modify a listing (rows affected ' || n || ')');

  -- ============ dealer A ============
  perform set_config('request.jwt.claims',
    json_build_object('sub', a_dealer_a, 'role', 'authenticated')::text, true);

  select count(*) into n from public."Listing";
  perform pg_temp.check(n = 3,
    'dealer A sees own ACTIVE+PAUSED plus rivals'' ACTIVE, never rivals'' PAUSED (got ' || n || ')');

  select count(*) into n from public."Listing" where "dealerId" = 'rlst_dealer_b' and "status" <> 'ACTIVE';
  perform pg_temp.check(n = 0, 'dealer A cannot see dealer B''s unpublished inventory');

  select count(*) into n from public."ApiKey";
  perform pg_temp.check(n = 1, 'dealer A sees their own API key row');

  update public."Listing" set "askingPrice" = 111 where "id" = 'rlst_l_b_active';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'dealer A cannot modify dealer B''s listing');

  delete from public."Listing" where "id" = 'rlst_l_b_paused';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 0, 'dealer A cannot delete dealer B''s listing');

  update public."Listing" set "askingPrice" = 222 where "id" = 'rlst_l_a_active';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 1, 'dealer A CAN modify their own listing');

  perform pg_temp.check(
    pg_temp.is_denied($q$update public."Listing" set "dealerId" = 'rlst_dealer_b'
                          where "id" = 'rlst_l_a_active'$q$),
    'dealer A cannot reassign their listing to another dealer'
  );

  select count(*) into n from public."Post" where "community" = 'DEALER';
  perform pg_temp.check(n = 1, 'dealer A can read the dealer forum');

  -- ============ suspended dealer ============
  perform set_config('request.jwt.claims',
    json_build_object('sub', a_susp, 'role', 'authenticated')::text, true);

  perform pg_temp.check(
    pg_temp.is_denied($q$insert into public."Listing"
      ("id","dealerId","vehicleType","make","model","year","fuelType","odometerKm",
       "askingPrice","city","status","createdAt","updatedAt")
      values ('rlst_l_s','rlst_dealer_s','CAR','X','Y',2020,'PETROL',1,100000,'Indore','ACTIVE',now(),now())$q$),
    'suspended dealer cannot create a listing'
  );

  perform pg_temp.check(
    pg_temp.is_denied($q$update public."Dealer" set "status" = 'ACTIVE' where "id" = 'rlst_dealer_s'$q$),
    'suspended dealer cannot un-suspend themselves'
  );

  perform pg_temp.check(
    pg_temp.is_denied($q$update public."Dealer" set "gstVerified" = true where "id" = 'rlst_dealer_s'$q$),
    'dealer cannot award themselves the GST-verified badge'
  );

  -- ============ admin ============
  perform set_config('request.jwt.claims',
    json_build_object('sub', a_admin, 'role', 'authenticated')::text, true);

  select count(*) into n from public."Listing";
  perform pg_temp.check(n = 4, 'admin sees every listing regardless of status (got ' || n || ')');

  select count(*) into n from public."User";
  perform pg_temp.check(n >= 5, 'admin sees every user');

  update public."Dealer" set "status" = 'ACTIVE' where "id" = 'rlst_dealer_s';
  get diagnostics n = row_count;
  perform pg_temp.check(n = 1, 'admin CAN change dealer status');

  perform set_config('role', 'postgres', true);
end $$;

-- ---------------------------------------------------------------------
-- Report
-- ---------------------------------------------------------------------

select
  case when passed then 'PASS' else 'FAIL' end as result,
  label
from _results
order by ord;

do $$
declare failed integer;
begin
  select count(*) into failed from _results where not passed;
  if failed > 0 then
    raise exception 'RLS verification failed: % of % checks did not pass',
      failed, (select count(*) from _results);
  end if;
  raise notice 'RLS verification passed: % checks', (select count(*) from _results);
end $$;

rollback;
