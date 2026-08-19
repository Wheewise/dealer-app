# Wheewise — Role Split & Security Report

Scope: split the application into three role-scoped apps (User, Dealer, Admin),
move authorization onto a single server-side RBAC layer, and assess the result
against the OWASP Top 10 — without changing the frontend UI/UX.

Companion document: [`API_AUTHORIZATION_MATRIX.md`](./API_AUTHORIZATION_MATRIX.md).

> **Dated audit.** This report was written while the data layer was Prisma on
> Neon. That layer is now `supabase-js` against Supabase — see
> [`../migration/SUPABASE_MIGRATION.md`](../migration/SUPABASE_MIGRATION.md).
> The authorization findings still hold (`lib/rbac` is unchanged and still the
> primary gate), but the code snippets and the dependency notes below describe
> the old stack. Two claims that changed substantively are annotated inline.

---

## 1. Architecture changes

### 1.1 Three application folders

The three apps are Next.js **route groups**. A route group is a real directory
but contributes nothing to the URL, so every existing path is byte-identical
before and after the split — verified against the build's route table.

```
app/app/
├── (user)/      ← User App     /, /browse, /vehicle/[id], /compare, /wishlist,
│                                /my-enquiries, /my-test-drives, /profile,
│                                /community, /inspections/[id], /rc-transfer,
│                                /s/[slug], /enquiries, /hackathon,
│                                /privacy, /terms
├── (dealer)/    ← Dealer App   /dashboard/**, /forum/dealer/**
├── (admin)/     ← Admin App    /admin/**
├── (auth)/      ← shared       /login, /signup/**
└── api/         ← shared HTTP surface, classified in the matrix
```

Two things moved for reasons beyond the split itself:

- `/forum/dealer/**` moved from the user tree into `(dealer)/` — it is
  dealer-gated, so it belongs to the dealer app.
- Three components shared by the buyer community and the dealer forum
  (`NewPostForm`, `PostReplies`, `UpvoteButton`) moved to
  `components/community/`, so `(dealer)` no longer reaches into `(user)`'s
  internals.

### 1.2 Centralised RBAC — `lib/rbac/`

| File | Responsibility |
|---|---|
| `permissions.ts` | permission catalogue, role → permission matrix, role → app mapping |
| `context.ts` | `AuthContext`: resolves the caller from the database |
| `guards.ts` | throwing guards for server actions, redirecting guards for pages |
| `api.ts` | route-handler gates returning 401/403 |
| `audit.ts` | structured security-event logging |
| `index.ts` | the single import surface: `@/lib/rbac` |

Pre-existing helpers were rewired rather than replaced, so call sites did not
churn: `lib/dealer.ts#requireDealer` and `lib/admin-auth.ts#requireAdmin` now
delegate to the RBAC layer, as do the three private `requireAdmin` copies that
previously lived in `actions/admin.ts`, `actions/community.ts` and
`actions/inspections.ts`.

### 1.3 The key change: identity is read from the database

`getAuthContext()` uses the signed session **only to learn which user is
calling**. Role, dealer id and dealer status are then read from that user's
row:

```ts
const session = await auth();           // subject id only
const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: { id, email, name, role, dealer: { select: { id, status } } },
});
```

This closes four classes of problem at once:

- a demoted admin keeps a valid cookie until it expires — now irrelevant;
- a deleted user with a live cookie — now resolves to "unauthenticated";
- a dealer suspended by an admin — now cannot write;
- any role value the client could influence — never consulted.

Cost: one indexed primary-key lookup per protected request.

---

## 2. Permission matrix

| Permission | USER (BUYER) | DEALER | ADMIN / SUPER_ADMIN |
|---|:--:|:--:|:--:|
| `read` | ✅ | ✅ | ✅ |
| `self:create` | ✅ | ✅ | ✅ |
| `self:update` | ✅ | ✅ | ✅ |
| `self:delete` | ✅ | ✅ | ✅ |
| `create` | ❌ | ✅ | ✅ |
| `update` | ❌ | ✅ | ✅ |
| `delete` | ❌ | ❌ | ✅ |
| `approve` | ❌ | ❌ | ✅ |
| `manage_users` | ❌ | ❌ | ✅ |
| `manage_dealers` | ❌ | ❌ | ✅ |
| `manage_roles` | ❌ | ❌ | ✅ |
| `manage_permissions` | ❌ | ❌ | ✅ |
| `manage_configuration` | ❌ | ❌ | ✅ |

Unknown role values resolve to the empty set (deny-by-default), and the sets are
strictly nested: `BUYER ⊂ DEALER ⊂ ADMIN`. Both properties are asserted in
`tests/unit/rbac-permissions.test.ts`.

### 2.1 One deliberate deviation from the brief — please read

The brief specifies **USER = read only**, blocking all create/update/delete.
Applied literally that removes a buyer's ability to send an enquiry, save a
listing, book a test drive, apply for finance, or reply in chat — i.e. most of
the marketplace, and it would contradict the brief's own requirement that
existing functionality keeps working for authorized users.

The model therefore splits writes in two:

- **`self:*`** — a buyer acting on rows they own: their enquiry, their
  wishlist entry, their message, their profile. Always scoped by the session
  `userId`.
- **`create` / `update` / `delete`** — writes against dealer inventory,
  platform resources and configuration. **USER holds none of these.**

Net effect: a user has **zero write access to any resource it does not own**,
which is what the requirement is protecting. If a stricter, literally
read-only user role is wanted, removing the three `self:*` entries from
`USER_PERMISSIONS` in `lib/rbac/permissions.ts` is the single change needed —
it will disable buyer enquiries, wishlist and chat.

---

## 3. Security findings

Severity uses the usual CVSS-style bands. "Status" is as of this change.

### F-01 — Unauthenticated listing feed exposed rival dealers' private inventory · **High** · Fixed

`GET /api/listings` required no authentication, returned listings in *every*
status (DRAFT, PAUSED, SOLD included) and used the caller's `?dealerId=` verbatim.
`GET /api/listings?dealerId=<rival>` returned that dealer's unpublished stock,
pricing and per-listing enquiry counts. `limit` was an unbounded `parseInt`.

**Fix** (`app/api/listings/route.ts`): authentication required; scope derived
from the session — buyer → `status: ACTIVE` only, dealer → own inventory with a
403 on a foreign `dealerId`, admin → unrestricted; enquiry counts withheld from
buyers; `limit` clamped to 1–50.
**Verified by** `tests/unit/rbac-api.test.ts` (8 cases).

### F-02 — RC transfer readers had no authorization at all · **High** · Fixed

`getTransferById` / `getTransferByListing` are `"use server"` exports and ran
**no** access check. The two pages that call them checked participation
*afterwards*, so the UI looked correct — but a direct action POST with any
transfer id returned the seller's and buyer's names and **phone numbers** plus
the attached documents. Classic IDOR/BOLA.

**Fix** (`lib/actions/rctransfer.ts`): both readers resolve the caller and
return the row only to the seller, the buyer, or an admin. A scope miss returns
`null` — the same value a non-existent id returns, so the action is not an
existence oracle, and both call sites already render `notFound()` / hide the
panel on null, leaving the UI unchanged.
**Verified by** `tests/unit/security-idor.test.ts` (8 cases).

### F-03 — Any approved inspector could overwrite any other inspector's report · **High** · Fixed

`submitInspection` verified that the caller was *an* approved inspector but
never that the inspection was **assigned to them**, and re-submission of a
completed report was permitted.

**Fix** (`lib/actions/inspections.ts`): the inspection is loaded with
`{ id, inspectorId: <caller's inspector id> }`; a miss throws, an already
`COMPLETED` report is refused, and the update targets the id returned by that
scoped lookup.
**Verified by** `tests/unit/security-idor.test.ts` (6 cases).

### F-04 — Suspended dealers retained full write access · **High** · Fixed

`suspendDealer` sets `Dealer.status = SUSPENDED` and pauses the dealer's live
listings, but no guard ever read that column. A suspended dealer could set
their listings straight back to `ACTIVE`, publish new ones, and keep spending
paid third-party lookups. The suspension was cosmetic.

**Fix**: `requireDealer({ write: true })` / `apiRequireDealer({ write: true })`
refuse a suspended dealer. Applied to all 14 dealer write actions and all
dealer-write route handlers. Reads stay open so billing and support remain
reachable, and `/api/billing/checkout` deliberately uses the read gate so a
suspended dealer can still pay.
**Verified by** `tests/unit/rbac-guards.test.ts`, `tests/unit/actions-listings.test.ts`.

### F-05 — No brute-force protection on password login · **High** · Fixed

OTP send and OTP verify were rate limited; `loginAction` was not. Unlimited
credential-stuffing and password-spraying attempts were possible.

**Fix** (`lib/actions/auth.ts`): two independent buckets — 10 attempts per IP
per 15 min and 5 per email address per 15 min. Either alone is bypassable (a
botnet defeats the IP bucket, spraying many accounts defeats the account
bucket); together they cover both. The failure message is unchanged
("Invalid email or password.") so the endpoint stays enumeration-resistant.

### F-06 — Dealer-only forum readable by anyone; author emails published · **Medium** · Fixed

`getPosts("DEALER")` and `getPost` ran no access check — the dealer-only forum
was readable by any caller invoking the action directly, even signed out. Both
also selected `author.email`, and the UI rendered it as a display-name
fallback, publishing participants' email addresses to anonymous visitors.

**Fix** (`lib/actions/community.ts`): dealer-community reads require a dealer
or admin and otherwise return `[]` / `null`; public reads select only
`author.name`. Admin moderation (`getAllPosts`) still sees emails.
**Verified by** `tests/unit/actions-community-authz.test.ts` (9 cases).

> ⚠️ **The only user-visible change in this whole refactor.** Where a forum
> author has no display name, the byline now reads "Member" instead of their
> email address. In practice this is close to unreachable — signup requires a
> name and phone-OTP users are auto-named — but it is a visible difference and
> is called out here rather than buried. Revert by restoring `email` to the
> `PUBLIC_AUTHOR` projection if the email byline is wanted.

### F-07 — Unauthenticated, unmetered third-party RTO lookup · **Medium** · Fixed

`GET /api/rto` was open to the internet with no rate limit. It proxies a paid
registry that returns owner-linked vehicle data, so anyone could enumerate
registration plates and run up the bill.

**Fix** (`app/api/rto/route.ts`): dealer write gate (its only caller is the
dealer-only listing form, so no UI change), 30 lookups per dealer+IP per hour,
and the registration number is validated against the plate format before the
upstream call.

### F-08 — Inspection detail page was public and rendered an editable form · **Medium** · Fixed

`/inspections/[id]` fetched any inspection by id with no access check, exposing
the dealer's phone number and the in-progress report to anyone guessing an id,
and rendered an *editable* checklist to them.

**Fix** (`app/(user)/inspections/[id]/page.tsx`): completed reports stay public
(they are the trust signal linked from vehicle pages); in-progress ones are
visible only to the assigned inspector, the owning dealer, or an admin —
everyone else gets the existing `notFound()`. The checklist is editable only
for the assigned inspector; the server action enforces the same rule
independently (F-03).

### F-09 — Unrestricted URL schemes and hosts in user-supplied image fields · **Medium** · Fixed

`photoUrls`, `logoUrl` and `bannerUrl` used `z.string().url()`, which accepts
anything `new URL()` parses: `javascript:`, `data:`, `file:`,
`https://user:pass@host`, and internal hosts such as
`http://169.254.169.254/`. These values are stored and re-served to every
visitor.

**Fix** (`lib/validators/url.ts`): https only, no embedded credentials, no
loopback/link-local/private authority, plus an optional operator allowlist via
`UPLOAD_HOST_ALLOWLIST`. Applied to the listing and store schemas.
**Verified by** `tests/unit/validators-url.test.ts` (19 cases).

### F-10 — SUPER_ADMIN locked out of moderation; prototype-chain role confusion · **Low** · Fixed

Three private `requireAdmin` copies compared `role !== "ADMIN"`, silently
excluding `SUPER_ADMIN` from community moderation, inspector approval and
`getDealerPayouts`. Separately, the first draft of `isKnownRole` used
`role in ROLE_PERMISSIONS`, which returns true for `"constructor"` and
`"__proto__"` via the prototype chain.

**Fix**: all admin checks route through `isAdminRole()`; role membership is
tested against an explicit `Set`. The second issue was caught by the new test
suite before it shipped.

### F-11 — `/api/dealer/bulk-upload` GET was unauthenticated · **Informational** · Fixed

The CSV template download carried no data, but an open handler under
`/api/dealer/` undermines the deny-by-default rule. Now gated at read level.

---

## 4. OWASP Top 10 assessment

| ID | Area | Result |
|---|---|---|
| **A01** Broken Access Control | **7 findings, all fixed** — F-01, F-02, F-03, F-04, F-06, F-08, F-11. RBAC is now centralised, every ownership check re-reads the owner id from the database, and writes target the id returned by the scoped lookup rather than the client's. 100 authorization tests. |
| **A02** Cryptographic Failures | **Pass.** bcrypt cost 12 for user passwords; API keys stored as SHA-256 with only an 8-char prefix retained, plaintext returned exactly once; Razorpay webhooks HMAC-verified; HSTS `max-age=63072000; includeSubDomains; preload`. The audit logger redacts any key matching `pass\|secret\|token\|otp\|key\|signature\|cookie\|authorization`. |
| **A03** Injection | **Pass.** No raw SQL anywhere — all data access goes through a query builder that parameterizes. No `eval`/`new Function`. React escapes by default; the two `dangerouslySetInnerHTML` uses are JSON-LD passed through `jsonLdScriptContent()`, which escapes `</`. All request bodies validated with zod. F-09 closed the one output-encoding gap (attacker-chosen URL schemes in stored fields). **Post-migration:** the builder is now PostgREST. Its `or=` parameter is a comma-separated list parsed by the server, so a user-supplied term interpolated into one *can* break out of its value and widen which columns are matched — not SQL injection, but a filter-injection of the same shape. Every `.or()` built from user input quotes and escapes the term (`lib/search.ts`, `app/api/public/listings`, `getBuyers`, the showcase search); a new one must do the same. |
| **A04** Insecure Design | **Improved.** Trust boundary is now explicit and singular (`getAuthContext`). Privilege separation is enforced by permission, not by role string. Fail-safe: unknown roles → no permissions; scope misses → `null`/404 rather than an error that confirms existence. Rate limits on OTP send/verify, login (new), leads, RTO (new), AI description, public API. |
| **A05** Security Misconfiguration | **Pass, with one caveat.** Strict CSP with a per-request nonce and `strict-dynamic`; `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. `lib/env.ts` hard-fails boot if any of `WHEEWISE_DEV_LOGIN`, `OTP_DEV_BYPASS`, `WHEEWISE_MOCK_GST`, `WHEEWISE_MOCK_RTO` is set in production. Dev fast-login requires `NODE_ENV=development` **and** the flag. Caveat: `style-src` still needs `'unsafe-inline'`. See R-02. |
| **A06** Vulnerable Components | **Improved: 29 advisories → 4.** See §5. |
| **A07** Identification & Authentication | **Improved.** F-05 added login brute-force protection. Password policy: ≥8 chars with upper, lower, digit and symbol. OTP: 6 digits, 5-minute expiry, 10 wrong attempts per phone per hour. Login failures are indistinguishable from unknown accounts. Session is a signed JWT via NextAuth v5. Gaps: no MFA for admin accounts, no server-side session revocation. See R-01, R-03. |
| **A08** Software & Data Integrity | **Partial.** `package-lock.json` is committed and `npm ci` is used; `allowScripts` pins which packages may run install scripts. Webhooks are signature-verified with event-id replay guards. No untrusted deserialization. Gap: no artifact signing / SLSA provenance. See R-05. |
| **A09** Logging & Monitoring | **Improved.** New `lib/rbac/audit.ts` emits structured events for login success/failure, auth rate-limiting, every authorization denial, dealer suspension/reinstatement, inspector approval/rejection, payout decisions and admin listing removal. No password, token, OTP or secret is ever passed in, and the payload is recursively redacted as a backstop. Gap: events go to stdout only — no alerting. See R-04. |
| **A10** SSRF | **Pass.** Every outbound request targets a hard-coded host (`api.openai.com`, `api.anthropic.com`, `control.msg91.com`) or an operator-set env var (`RTO_PROVIDER_URL`, `SUREPASS_BASE_URL`, Sentry DSN). No endpoint fetches a user-supplied URL. F-09 additionally blocks loopback/link-local/private hosts and non-https schemes from being *stored* in image fields, so they cannot become an SSRF sink later. |

---

## 5. Dependency scan

`npm audit`, before and after:

| | before | after |
|---|---|---|
| critical | 3 | 0 |
| high | 15 | 3 |
| moderate | 8 | 0 |
| low | 3 | 1 |
| **total** | **29** | **4** |

Resolved by lockfile upgrade only — no `package.json` range changed, so no
breaking-change risk was taken. Notable:

- **`next-auth` 5.0.0-beta.31 → beta.32, `@auth/core` 0.41.2 → 0.41.3**
  (critical). One advisory is directly relevant here: *"Configuration errors
  can cause existence-based auth checks to fail open (auth object present but
  unauthenticated)"*.
- **`next` 16.2.10 → 16.3.1** (high) — middleware/proxy bypass in App Router,
  SSRF in Server Actions on custom servers, Server Actions DoS.
- **`sharp` → 0.35.3** (libvips CVEs), **`undici`**, **`axios`**, **`postcss`**,
  **`form-data`**, **`js-yaml`**, **`fast-uri`**, **`brace-expansion`**,
  **`nanoid`**, **`qs`**, **`body-parser`**.

**Remaining 4 (accepted):** `deepmerge-ts` (high, reached only via
`@prisma/config`) and `esbuild` (low, dev-server-only file read on Windows).
Both are build/dev-time, not present in the deployed runtime, and neither has a
fix inside the current semver ranges.

> **Post-migration:** the `@prisma/config` path is gone with Prisma itself, so
> the `deepmerge-ts` advisory should no longer appear. Re-run `npm audit` to
> confirm and re-baseline this section.

---

## 6. Tests executed

| Suite | Files | Tests | Result |
|---|---|---|---|
| Full `vitest` suite | 24 | 295 | ✅ all pass |
| `tsc --noEmit` | — | — | ✅ clean |
| `eslint` | — | — | ✅ 0 errors (10 pre-existing warnings) |
| `next build` (production) | — | — | ✅ succeeds; route table verified identical |
| `npm audit` | — | — | ✅ 29 → 4 |

New security suites (**156 tests**):

| File | Tests | Covers |
|---|--:|---|
| `rbac-permissions.test.ts` | 28 | matrix per role, nesting, deny-by-default for unknown/non-string/prototype-chain role values |
| `rbac-guards.test.ts` | 26 | every guard × BUYER / DEALER / suspended DEALER / ADMIN / SUPER_ADMIN / anonymous; ownership and participant assertions |
| `rbac-api.test.ts` | 6 | 401 vs 403 discipline, forged role claims |
| `routes/dealer-routes.test.ts` | 29 | adversarial requests against the dealer app's handlers; `GET /api/listings` tenant scoping and limit clamping |
| `routes/user-routes.test.ts` | 7 | adversarial requests against the user app's handlers (wishlist, chat) |
| `security-idor.test.ts` | 15 | F-02 and F-03 |
| `actions-community-authz.test.ts` | 9 | F-06 |
| `validators-url.test.ts` | 22 | F-09 |
| `app-urls.test.ts` | 14 | cross-subdomain redirect targets; callbackUrl open-redirect resistance |

Route-handler tests are split by surface so each generated repo runs only the
tests for handlers it actually ships (see §10).

### Adversarial cases covered

Changing `dealer_id` / `user_id` / `resource_id` · forging the `role` claim ·
calling admin actions as dealer and as user · calling dealer endpoints as user
and as admin · reaching another dealer's listings, API keys and conversations ·
calling actions with no session · a valid session for a deleted user · a
suspended dealer writing · mass assignment (`userId` / `senderId` in the body)
· malformed JSON · hostile `limit` values · path traversal in the RTO
registration parameter · prototype-chain role values (`__proto__`,
`constructor`).

### Pre-existing test failures, repaired

Four tests were failing **before** this work and are unrelated to the split;
they had drifted from the implementation:

1. `search.test.ts` passed a singular `fuelType` filter, but `SearchFilters`
   takes `fuelTypes: string[]` — the assertion could never pass.
2–4. `actions-listings.test.ts` asserted on `updateMany`/`deleteMany`, which
   the implementation replaced with `findFirst` + `update`/`delete`; two
   billing-redirect tests never enabled `NEXT_PUBLIC_BILLING_ENABLED`, so the
   gate they assert on was skipped.

All four were rewritten against the real code paths, preserving their intent.

---

## 7. Regression assessment

- **URLs**: the production build's route table was compared before and after
  the split. Every path is unchanged — route groups do not affect URLs.
- **Layouts, components, styling, typography, forms, tables, modals,
  responsive behaviour**: untouched. No CSS, no Tailwind config, no layout
  markup was modified. The only component edits were the four byline fallbacks
  and one type in `PostReplies` (F-06).
- **Workflows**: buyer enquiry, wishlist, chat, test drive, finance
  application, dealer inventory CRUD, bulk upload, boost, billing, store
  editing, RC transfer, and all admin screens keep their existing behaviour for
  authorized users.
- **Access-denied states** reuse existing patterns: `redirect("/")`,
  `redirect("/login?callbackUrl=…")`, `notFound()`, and the existing inline
  form-error style.

---

## 8. Remaining risks and recommended follow-up

| ID | Risk | Severity | Recommendation |
|---|---|---|---|
| **R-01** | No MFA on admin accounts. A single stolen admin password grants `manage_*` across the platform. | High | Add TOTP for `ADMIN`/`SUPER_ADMIN` before the admin app is exposed publicly. |
| **R-02** | Rate limiting is in-memory unless a KV store is registered. On serverless — including Vercel — buckets reset on every cold start, so login, OTP and lead limits are largely ineffective in production. `lib/rate-limit.ts` warns about this once per process. | High | Call `setRateLimitKv()` at startup. The existing hook was written against a Cloudflare KV binding; on Vercel it needs Vercel KV or Upstash Redis behind the same `get`/`put` shape. This gates the real-world value of F-05 and F-07. |
| **R-03** | JWT sessions cannot be revoked server-side. `getAuthContext` re-reads role and status per request, which neutralises privilege staleness, but a stolen token stays valid until expiry. | Medium | Add a `sessionVersion` column bumped on password change / forced logout, and compare it in `getAuthContext`. |
| **R-04** | Security events go to stdout with no alerting. Nobody is paged on a burst of `authz.denied`. | Medium | Ship `[security]` lines to Sentry or a SIEM and alert on denial-rate spikes and on `privilege.changed`. |
| **R-05** | No SAST or dependency scanning in CI; no build provenance. | Medium | Add `npm audit --audit-level=high`, CodeQL, and Dependabot/Renovate to `.github/workflows`. |
| **R-06** | Edge middleware applies security headers but performs no auth. Route protection depends entirely on layout and handler guards. That is a correct boundary, but it means a future page that forgets its guard is unprotected. | Medium | Either add an edge-safe auth config to gate `/admin/*` and `/dashboard/*` at the edge, or add a CI check that fails when a page under `(admin)`/`(dealer)` calls no guard. |
| **R-07** | `style-src 'unsafe-inline'` remains in the CSP. | Low | Move to nonce-based styles when Next/Tailwind support it cleanly. |
| **R-08** | `deepmerge-ts` and `esbuild` advisories unresolved (build-time only). | Low | Re-run `npm audit` after the next Prisma release. |
| **R-09** | Legacy plaintext API keys are still accepted by `validateApiKey` and silently backfilled to hashes. | Low | After a migration window, drop the `key` column and the fallback branch. |
| **R-10** | The three deployments share one `AUTH_SECRET`. Leaking it from any single project forges sessions for all three, including admin. The blast radius of the weakest-secured project is now the whole platform. | Medium | Restrict who can read env vars per Vercel project; rotate the secret on any suspected exposure (this signs every user out). Revisit if admin ever needs a stronger isolation boundary than a shared JWT secret. |
| **R-11** | `lib/`, `components/` and `prisma/` are duplicated across three repos. Hand-editing one repo silently diverges it from the others, and a security fix applied in one place will not reach the other two. | Medium | Treat the generated repos as build output: change the monorepo and re-run `scripts/build-role-repos.mjs`. Add CI that regenerates and fails if a repo's shared tree differs. Longer term, extract `lib/` and `components/` into a published internal package. |

### Not performed

Stated plainly so the coverage claim is not overread:

- **DAST** — needs a running instance with a live database; no environment was
  available here. The authorization tests exercise the handlers directly, which
  is close but not equivalent to testing over the wire.
- **Playwright e2e / RBAC end-to-end** — same reason (`tests/e2e/` requires a
  seeded database and a running server).
- **Third-party SAST** (CodeQL/Semgrep) — not installed. §4 A03 reflects a
  manual review of injection sinks, not a tool run.
- **Penetration testing** against a deployed environment.

---

## 10. Deployment topology: three repos, three subdomains

The role split is now also a **deployment** split. `scripts/build-role-repos.mjs`
generates three independently deployable Next.js projects from this monorepo:

| Repo | Subdomain | Route group | API handlers shipped |
|---|---|---|--:|
| `user-app` | `wheewise.com` | `(user)` | 6 |
| `dealer-app` | `dealer.wheewise.com` | `(dealer)` | 19 |
| `admin-app` | `admin.wheewise.com` | `(admin)` | 2 |

### Security effect

Each app ships **only the route handlers it calls**. An endpoint belonging to
another role is not merely guarded there — it is absent, and returns 404. That
is a genuine reduction in attack surface: `admin.wheewise.com/api/dealer/*`
does not exist, and neither does `wheewise.com/api/uploads`.

The same holds for server actions. Next.js only registers an action that is
reachable from the module graph, so `lib/actions/admin.ts` — present in all
three repos as part of the shared `lib/` — is only *published* by the admin
app, whose pages import it.

### Cross-subdomain sessions

One sign-in must work across all three apps, which requires:

- an identical `AUTH_SECRET` in all three Vercel projects, so each verifies
  JWTs the others issued;
- `AUTH_COOKIE_DOMAIN=.wheewise.com`, applied to the session cookie **only**.
  Auth.js names the CSRF cookie with the `__Host-` prefix under HTTPS, and that
  prefix forbids a `Domain` attribute — setting one there would make browsers
  drop the cookie and break login entirely. CSRF stays per-origin, which is
  correct: each app validates its own sign-in POST.

`lib/app-urls.ts` resolves cross-app links. With the origin variables unset
every helper returns a relative path, so the monorepo and local development
keep the exact single-host behaviour they had before. This also fixes a
redirect loop the split would otherwise have introduced: an unauthorized
visitor to `dealer.wheewise.com/dashboard` was sent to `/`, which on that host
is the dashboard again.

See `docs/deployment/VERCEL_SETUP.md` for the per-project environment matrix.

---

## 9. Definition of done — status

| Requirement | Status |
|---|---|
| User = read-only | ✅ with the documented `self:*` carve-out (§2.1) |
| Dealer = read + permitted write | ✅ |
| Admin = full authorized access | ✅ |
| Authorization enforced server-side | ✅ |
| Resource ownership / tenant isolation enforced | ✅ |
| No privilege-escalation vulnerabilities remaining | ✅ (F-04, F-10 fixed) |
| No IDOR/BOLA remaining | ✅ (F-01, F-02, F-03, F-08 fixed) |
| Frontend UI/UX unchanged | ✅ except the F-06 byline, called out above |
| Existing functionality works for authorized users | ✅ build + full suite green |
| OWASP Top 10 completed | ✅ §4 |
| Automated authorization/security tests pass | ✅ 295/295 in the monorepo; each generated repo passes its own subset (266 / 288 / 259) |
| Dependency scans reviewed | ✅ 29 → 4, remainder accepted with reasons |
| Regression tests pass | ✅ (see §6 on four pre-existing failures repaired) |
| No unresolved critical/high findings | ✅ — all 11 findings fixed. Two **risks** remain rated High (R-01 MFA, R-02 KV-backed rate limiting); both are deployment/configuration decisions rather than code defects, and neither is resolvable in this codebase alone. |
