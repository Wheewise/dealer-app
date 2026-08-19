# Neon → Supabase migration runbook

Target architecture: Supabase Postgres, **RLS as the primary authorization
gate**, Supabase Auth (email/password + Google) with Resend as the SMTP
sender, and `supabase-js` replacing Prisma as the data layer.

This is a large change to a system holding live accounts, so it is split into
stages that deploy independently. Each stage has its own rollback. **Do not
collapse them** — if the data move, the authorization model and the auth
provider all change in one deploy, a failure is not attributable to any of
them.

| Stage | Change | Reversible by | Status |
|---|---|---|---|
| 1 | Data: Neon → Supabase | restore the Neon dump | schema applied; **data not yet imported** |
| 2 | RLS foundation + policies applied | drop policies | **APPLIED 2026-08-20** |
| 3 | Data layer: `supabase-js` replaces Prisma | previous deployment | **DONE** — see below |
| 4 | Auth: import users into `auth.users`, enable Google + Resend SMTP | keep NextAuth path live | runbook below |
| 5 | RLS becomes the live gate (request-path clients stop using the service key) | previous deployment | not yet built |
| 6 | Retire NextAuth tables and `lib/rbac` | — | after stage 5 soaks |

## Stage 3 — the data layer (done)

Prisma, `@prisma/adapter-neon`, `@neondatabase/serverless` and
`@auth/prisma-adapter` are gone. What replaced them:

| Was | Is |
|---|---|
| `prisma/schema.prisma` | `supabase/schema.sql` — tables, indexes, FKs, RPCs, RLS, all idempotent |
| generated Prisma client | `types/supabase.ts`, hand-maintained alongside the SQL |
| `prisma` singleton in `lib/db.ts` | `db`, a service-role `supabase-js` client, plus `unwrap` / `unwrapMaybe` / `count` / `embeddedCount` |
| `DATABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `PrismaAdapter(prisma)` on NextAuth | no adapter — sessions are JWTs and the only provider is Credentials, which never consults one |
| `prisma/seed.ts` | `supabase/seed.ts` |

Four things PostgREST cannot express moved into the database as functions:
`record_listing_view`, `increment_enquiry_count`, `unread_message_counts`,
`distinct_listing_cities`, and the four `dealer_*` analytics aggregates. The
counter RPCs are a correctness win rather than a workaround — the old
read-modify-write on `viewCount` could lose updates under concurrency.

Two behavioural notes:

- **Timestamps are ISO-8601 strings, not `Date` objects.** PostgREST is JSON.
  The columns are `timestamptz` so the strings carry their offset; parse at
  the display site.
- **Still no interactive transactions.** PostgREST has none, so the
  sequential-write-plus-compensating-delete pattern in `signupDealer` and
  `createListing` stays exactly as it was under the Neon HTTP adapter.

`db` uses the **service role**, which bypasses RLS — the same position Prisma
held. Authorization still lives in `lib/rbac`. Stage 5 is what moves the
request path onto the caller's own JWT so the policies become load-bearing.

---

## Stage 1 — Move the data

> **The schema is already on Supabase.** Project `rqhhxhzaqcurpjipffua`
> (Postgres 17.6.1, ap-southeast-1) had all three migrations applied on
> 2026-08-20 via `supabase db push`, against an empty database. That changes
> this stage: the schema is now **migration-managed**, so the Neon import must
> be **data-only**. A full schema+data restore would collide with the tables
> that already exist and would desynchronise the migration history.

```bash
# 1. Dump DATA ONLY from Neon — the schema already exists on Supabase and is
#    owned by the migration history.
pg_dump "$NEON_DATABASE_URL" --no-owner --no-acl --data-only   --format=custom --schema=public --file=wheewise-data.dump

# 2. Restore. --disable-triggers stops the auth-sync and column-guard triggers
#    from firing on bulk historical rows; it needs an elevated role, so use the
#    DIRECT connection, not the pooler.
pg_restore --no-owner --no-acl --data-only --disable-triggers   --dbname "$SUPABASE_DIRECT_URL" wheewise-data.dump

# 3. Verify row counts match Neon, table by table.
psql "$SUPABASE_DIRECT_URL" -c "select relname, n_live_tup from pg_stat_user_tables where schemaname='public' order by relname;"
```

> Restore order matters: `--data-only` does not reorder for foreign keys. A
> whole-database dump is emitted in dependency order and restores cleanly, but
> if you restore selected tables you must respect the FK graph
> (User → Dealer → Listing → everything else).

If you ever need the *original* full-restore path — a fresh project where the
schema should come from the dump rather than from migrations — mark the
baseline as applied instead of running it:

```bash
npx supabase migration repair --status applied 20260820000100
```

Then point the app at Supabase. The app talks to PostgREST over HTTPS, so
there is no connection string and no pooler to size — only the three keys in
`.env.example`. The direct connection is still needed for the CLI helpers
(`db:push`, `rls:verify`), which is what `SUPABASE_DIRECT_URL` is for.

**Rollback:** stage 1 is only reversible while Neon still holds the data.
Keep it running, and keep writing to it, until this stage has soaked — see
"Dual-write window" below.

### Dual-write window

Because real accounts are live, plan a read-only window rather than a
best-effort sync:

1. Announce a short maintenance window.
2. Set the app read-only (or accept the enquiry backlog).
3. Final `pg_dump`/`pg_restore` to capture writes since the trial run.
4. Cut the deployment over to the Supabase keys.
5. Keep Neon **untouched** for at least a week as the rollback target.

---

## Stage 2 — Apply RLS

Via the CLI (preferred — it records what has been applied):

```bash
npx supabase login                                   # you must run this
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Or directly with psql:

```bash
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260820000200_rls_foundation.sql
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20260820000300_rls_policies.sql
psql "$SUPABASE_DIRECT_URL" -v ON_ERROR_STOP=1 -f supabase/tests/0003_rls_verify.sql
```

On the **live-data** path the baseline migration must be marked as already
applied first, because the schema arrives with the `pg_restore` rather than
from the migration:

```bash
npx supabase migration repair --status applied 20260820000100
```

The third file is a verification harness: it seeds five personas, asserts the
policy matrix from each one's perspective, prints a PASS/FAIL line per check,
and rolls back. **It must pass before stage 4.** Run it against a Supabase
branch first.

Applying RLS does not yet change application behaviour, because Prisma
connects with a role that bypasses it. That is deliberate: stage 2 is
provably correct in isolation before anything depends on it.

### What the policies encode

`20260820000300_rls_policies.sql` is the permission matrix. In summary:

| Actor | Reads | Writes |
|---|---|---|
| anon | ACTIVE listings, storefronts, buyer forum, completed inspections, public projections of user/dealer | enquiries (pinned to the listing's real dealer), listing views |
| buyer | the above + own profile, wishlist, enquiries, test drives, conversations, loan applications | only rows they own |
| dealer | the above + own inventory in every status, own leads, keys, payouts, subscription, dealer forum | own inventory and records, **only while ACTIVE** |
| admin | everything | everything |
| `service_role` | bypasses RLS entirely | webhooks, migrations, background jobs |

Three things RLS alone cannot express are handled by triggers, because a
policy grants or denies whole *rows* and cannot protect a *column*:

- `User.role` — otherwise "update your own profile" includes "make yourself
  an admin".
- `Dealer.status` — otherwise a suspended dealer un-suspends themselves.
- `Dealer.gstVerified` — otherwise a dealer awards themselves the trust badge.

**Rollback:** `drop policy` per table, or `alter table … disable row level
security`. The helper schema and `authId` column are additive and can stay.

---

## Stage 4 — Auth

### 4.1 Import existing users

Supabase Auth stores bcrypt hashes, and the app already uses bcrypt at cost
12 — so existing passwords carry over and **nobody is forced to reset**.

```sql
-- Run with the service role. Phone-only users have no email and no usable
-- password; they are handled separately (see below).
insert into auth.users
  (id, instance_id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
select
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated',
  lower(u."email"),
  u."passwordHash",                    -- bcrypt, accepted as-is
  coalesce(u."emailVerified", u."createdAt"),
  u."createdAt", now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('name', u."name")
from public."User" u
where u."email" is not null
  and u."passwordHash" is not null
  and u."passwordHash" <> ''
  and u."authId" is null;
```

The `on_auth_user_created` trigger from the foundation migration matches each new `auth.users`
row to the existing profile **by email** and sets `authId`, rather than
creating a duplicate. Verify none were missed:

```sql
select count(*) from public."User" where "authId" is null and "email" is not null;
```

> **Role is never taken from sign-up metadata.** The trigger always writes
> `BUYER`. Existing roles are already in `public."User"` and are read from
> there — `raw_user_meta_data` is writable by the user through the Auth API,
> so honouring a role from it would let anyone register as an admin.

**Phone-only users** (OTP sign-ups) have no email and an empty
`passwordHash`. Either migrate them to Supabase phone auth (requires an SMS
provider configured in Supabase, separate from the existing MSG91 path), or
leave the custom OTP flow in place — it now runs on Upstash and works
correctly across instances. Decide before stage 4; the simpler option is to
keep the custom flow initially.

### 4.2 Google sign-in

Supabase dashboard → Authentication → Providers → Google. You need an OAuth
client from Google Cloud Console with these authorized redirect URIs:

```
https://<project-ref>.supabase.co/auth/v1/callback
```

Then add each app's own callback to **Redirect URLs** in Supabase:

```
https://wheewise.com/auth/callback
https://dealer.wheewise.com/auth/callback
https://admin.wheewise.com/auth/callback
```

All three subdomains must be listed, or sign-in succeeds and then bounces.

> Google returns a verified email. If that email already matches a
> password account, Supabase links them only when "Confirm email" is on —
> otherwise you get two accounts for one person. Turn it on before enabling
> Google.

### 4.3 Resend as the SMTP sender

Supabase dashboard → Project Settings → Authentication → SMTP Settings:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` (implicit TLS) or `587` (STARTTLS) |
| Username | `resend` |
| Password | your Resend API key |
| Sender email | an address on a domain verified in Resend |
| Sender name | `Wheewise` |

This covers the auth emails Supabase sends: confirmation, password reset,
magic link, email-change. Verify the sending domain in Resend (SPF + DKIM)
first, or everything lands in spam.

Raise the auth rate limits from the default 4 emails/hour once the domain is
verified, or password resets will silently throttle.

Note this is **separate** from `lib/email.ts`, which uses the Resend HTTP API
for lead notifications. Both can share one Resend account; they are different
transports.

### 4.4 Cross-subdomain sessions

Supabase stores its session in a cookie. For one sign-in to cover all three
subdomains, set the cookie domain to `.wheewise.com` in the server client's
`cookieOptions` — the same constraint that `AUTH_COOKIE_DOMAIN` handles for
NextAuth today.

---

## Stage 5 — RLS becomes the live gate (not yet built)

Stage 3 moved the data layer; this stage moves the *authorization* layer. It
replaces:

- `db` (service role) on the request path → `userDb(accessToken)`, already
  exported from `lib/db.ts`, carrying the caller's JWT so policies apply;
- `lib/auth.ts` (NextAuth) → `@supabase/ssr` server/browser clients, plus
  `middleware.ts` session refresh, which Supabase SSR requires;
- `lib/rbac/*` → retired, with the guards' job moving into policies.

New screens are also needed, since Supabase Auth owns these flows:
`/auth/callback`, `/forgot-password`, `/reset-password`, `/verify-email`.

### The one thing to get right

A `supabase-js` client built with the **service key bypasses RLS**, and
nothing fails loudly when one is used for a user request — every policy in
`schema.sql` silently stops applying. That is exactly the position the app is
in today, deliberately, with `lib/rbac` holding the line instead.

Rules for stage 5:

- Request-path code uses the **anon key plus the caller's access token**.
- The **service key** appears only in webhooks, migrations and background
  jobs, and never in a module reachable from a page or action.
- Add a test that asserts a service-role client is not importable from the
  request path.

Until then, treat every missing `.eq()` on an owner column as a live
authorization bug: with the service role there is no second line.

---

## Rollback summary

| Stage | Rollback |
|---|---|
| 1 | Restore from the Neon dump. Keep Neon alive one week minimum. |
| 2 | `drop policy` / `disable row level security`. `authId` and `app.*` are additive and harmless. |
| 3 | Redeploy the previous build. The schema is a superset of the Prisma one — defaults, `updatedAt` triggers and the RPCs are additive — so an older build still runs against it. |
| 4 | NextAuth keeps working off `public."User"."passwordHash"`, which the import does not modify. Delete the `auth.users` rows to undo. |
| 5 | Redeploy the previous build. Note this is the point of no easy return: once clients hold Supabase sessions, reverting logs everyone out. |

---

## Open risks

| Risk | Note |
|---|---|
| The SQL in `supabase/` **parses but has never been executed.** `npm run sql:check` validates every statement against PostgreSQL's own grammar (via `libpg-query`), so syntax is confirmed — but that check treats a `$$ … $$` plpgsql body as an opaque string, and proves nothing semantic. `supabase/tests/0003_rls_verify.sql` is the real test and needs a live database. Run it on a branch first. |
| RLS as the sole gate means a missing policy is an outage, and a too-broad policy is a breach, with no application-layer backstop. The verification harness is the only regression test for that boundary — extend it whenever a policy changes. |
| Policy predicates call helper functions per row. They are `STABLE` and wrapped as `(select …)` so Postgres evaluates them once per statement, but watch query plans on `Listing` and `Enquiry`, the two largest tables. |
| Phone-OTP users cannot be imported with a password. Decide their path before stage 4. |
| `service_role` bypasses everything. Its key is now the single highest-value secret in the system. |
| `types/supabase.ts` is hand-maintained against `schema.sql`. A column added to one and not the other type-checks fine and fails at runtime. `npm run db:types` regenerates it from a linked project and is the check worth running after any schema change. |
| Embedded selects resolve through the `Relationships` entries in `types/supabase.ts`, keyed by **constraint name**. Renaming a foreign key in `schema.sql` without updating them turns every embed through it into a `SelectQueryError`. |
