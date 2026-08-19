# Vercel Setup — three projects, three subdomains

| Repo | Vercel project | Domain |
|---|---|---|
| `Wheewise/user-app` | `wheewise-user` | `wheewise.com` (+ `www`) |
| `Wheewise/dealer-app` | `wheewise-dealer` | `dealer.wheewise.com` |
| `Wheewise/admin-app` | `wheewise-admin` | `admin.wheewise.com` |

All three run against **one database** and **one `AUTH_SECRET`**. That is what
lets a dealer sign in on any of the three and be recognised by the others.

---

## 1. Create each project

For each repo, in the Vercel dashboard: **Add New → Project → Import Git
Repository**.

| Setting | Value |
|---|---|
| Framework preset | Next.js (auto-detected) |
| Root directory | `./` — the repo root *is* the app |
| Build command | leave as-is; `vercel.json` sets `npx prisma generate && next build` |
| Install command | `npm install` (from `vercel.json`) |
| Node version | 22.x — `package.json` requires `>=22` |

`npx prisma generate` must stay in the build command. Vercel caches
`node_modules`, and a cached install skips Prisma's postinstall, which leaves
the generated client stale.

Do **not** deploy before setting the environment variables below — the first
build will succeed but the running app will fail to authenticate.

---

## 2. Environment variables

Set these for **Production**, **Preview** and **Development** unless noted.

### 2.1 Required in all three projects

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | your Neon pooled connection string | Identical in all three |
| `AUTH_SECRET` | `openssl rand -base64 32` | **Generate once, paste the same value into all three.** Different values mean each app rejects the others' sessions |
| `AUTH_TRUST_HOST` | `true` | Required behind Vercel's proxy |
| `AUTH_COOKIE_DOMAIN` | `.wheewise.com` | Leading dot. Scopes the session cookie to the parent domain so one sign-in covers all three subdomains |
| `NEXT_PUBLIC_USER_APP_URL` | `https://wheewise.com` | |
| `NEXT_PUBLIC_DEALER_APP_URL` | `https://dealer.wheewise.com` | |
| `NEXT_PUBLIC_ADMIN_APP_URL` | `https://admin.wheewise.com` | |

### 2.2 Per-project

| Variable | user | dealer | admin |
|---|:--:|:--:|:--:|
| `AUTH_URL` | `https://wheewise.com` | `https://dealer.wheewise.com` | `https://admin.wheewise.com` |
| `NEXT_PUBLIC_APP_URL` | `https://wheewise.com` | `https://dealer.wheewise.com` | `https://admin.wheewise.com` |

### 2.3 Feature keys — only where the feature lives

Each app ships only the route handlers it calls, so a key is only needed where
the corresponding endpoint exists.

| Variable | user | dealer | admin | Used by |
|---|:--:|:--:|:--:|---|
| `RESEND_API_KEY`, `RESEND_FROM` | ✅ | — | — | lead notification emails from `/api/leads` |
| `MSG91_AUTH_KEY` *(or `TWILIO_*`)* | ✅ | ○ | ○ | `/api/auth/send-otp`; required wherever phone login is offered |
| `BLOB_READ_WRITE_TOKEN` | — | ✅ | — | `/api/uploads` (vehicle photos) |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | — | ✅ | — | subscriptions, boosts |
| `RAZORPAY_WEBHOOK_SECRET` | — | ✅ | — | `/api/billing/webhook`, `/api/webhooks/razorpay` |
| `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY` | — | ✅ | — | checkout |
| `NEXT_PUBLIC_BILLING_ENABLED` | ✅ | ✅ | — | pricing section; dealer paywall gate |
| `SUREPASS_TOKEN` *(or `RTO_PROVIDER_TOKEN`)* | — | ✅ | — | `/api/rto` |
| `GST_PROVIDER_TOKEN` | — | ✅ | — | `/api/gst/verify` |
| `OPENAI_API_KEY` *or* `ANTHROPIC_API_KEY` | — | ✅ | — | `/api/ai/generate-description` |
| `UPLOAD_HOST_ALLOWLIST` | — | ✅ | — | pins stored image URLs to hosts you control |
| `SENTRY_DSN` | ○ | ○ | ○ | optional, all three |

✅ required · ○ optional · — not used

### 2.4 Never set in production

`lib/env.ts` refuses to boot if any of these is set while `NODE_ENV=production`:

```
WHEEWISE_DEV_LOGIN   OTP_DEV_BYPASS   WHEEWISE_MOCK_GST   WHEEWISE_MOCK_RTO
```

That guard exists because these flags have leaked through CI to staging before.
Leave them unset on Vercel.

---

## 3. Domains

1. Add `wheewise.com` and `www.wheewise.com` to the **user** project.
2. Add `dealer.wheewise.com` to the **dealer** project.
3. Add `admin.wheewise.com` to the **admin** project.
4. Point DNS at Vercel as prompted (apex `A`/`ALIAS`, subdomains `CNAME`).

`AUTH_COOKIE_DOMAIN=.wheewise.com` only works if all three are genuinely
subdomains of one registrable domain. If the admin console lives on a separate
domain instead, cross-app single sign-on will not work and each app needs its
own login.

---

## 4. Razorpay webhooks

Both webhook handlers ship with the **dealer** app only. Point Razorpay at:

```
https://dealer.wheewise.com/api/webhooks/razorpay
https://dealer.wheewise.com/api/billing/webhook
```

Both verify the HMAC signature and guard against replay by event id, so they
need no allowlisting — but they do need `RAZORPAY_WEBHOOK_SECRET` to match the
secret configured in the Razorpay dashboard.

---

## 5. Known caveat: rate limiting on Vercel

`lib/rate-limit.ts` falls back to an **in-process** bucket when no KV store is
registered. On Vercel's serverless runtime each cold start gets a fresh
process, so login throttling, OTP caps and lead-form limits are substantially
weaker than they look. The module logs a warning once per process in
production.

The existing `setRateLimitKv()` hook takes any store with `get`/`put`, so
wiring Vercel KV or Upstash Redis to it is a small change — but it is a change,
because the current implementation was written against a Cloudflare KV binding.
Until then, treat the brute-force protection added in the security review as
partial. This is risk **R-02** in `docs/security/SECURITY_REPORT.md`.

---

## 6. Deploy order

1. Create all three projects and set env vars — but **do not** attach domains yet.
2. Deploy the **user** app; confirm `/` and `/browse` render.
3. Deploy **dealer**; confirm `/` redirects to `/dashboard` and that signing in
   as a dealer lands on the dashboard.
4. Deploy **admin**; confirm `/` redirects to `/admin`.
5. Attach the domains.
6. Verify cross-app sign-on: sign in at `wheewise.com/login` as a dealer — you
   should be redirected to `dealer.wheewise.com/dashboard` and already
   authenticated there.

### Post-deploy checks

| Check | Expected |
|---|---|
| Sign in as BUYER, open `dealer.wheewise.com/dashboard` | redirected to `wheewise.com` |
| Sign in as BUYER, open `admin.wheewise.com/admin` | redirected to `wheewise.com` |
| Sign in as DEALER, open `admin.wheewise.com/admin` | redirected to `wheewise.com` |
| `curl https://admin.wheewise.com/api/listings` | 404 — the admin app does not ship that handler |
| `curl https://wheewise.com/api/dealer/api-keys -X DELETE` | 404 — not shipped with the user app |
| `curl https://wheewise.com/api/listings` | 401 — shipped, but requires a session |
| `https://admin.wheewise.com/robots.txt` | `Disallow: /` |

---

## 7. Optional cleanup

`package.json` still carries the Cloudflare deployment path
(`@opennextjs/cloudflare`, `wrangler`, the `cf:*` scripts) inherited from the
monorepo. It is harmless on Vercel — nothing imports it at build time — but
removing it from the three generated repos would cut install time. Do it in the
monorepo and regenerate, not by hand in each repo.
