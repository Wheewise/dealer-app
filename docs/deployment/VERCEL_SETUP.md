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
| Build command | leave as-is; `vercel.json` sets `next build` |
| Install command | `npm install` (from `vercel.json`) |
| Node version | 22.x — `package.json` requires `>=22` |

There is no code-generation step: the database types in `types/supabase.ts` are
committed, so a cached `node_modules` cannot leave anything stale.

Apply `supabase/schema.sql` to the Supabase project first. Do **not** deploy
before setting the environment variables below — the first build will succeed
but the running app will fail on its first query.

---

## 2. Environment variables

Set these for **Production**, **Preview** and **Development** unless noted.

### 2.1 Required in all three projects

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Identical in all three |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API | Public by design; safe in the browser bundle |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API | **Server only.** Bypasses RLS — never prefix it `NEXT_PUBLIC_`, and rotate it if it ever reaches a client bundle |
| `AUTH_SECRET` | `openssl rand -base64 32` | **Generate once, paste the same value into all three.** Different values mean each app rejects the others' sessions |
| `AUTH_TRUST_HOST` | `true` | Required behind Vercel's proxy |
| `AUTH_COOKIE_DOMAIN` | `.wheewise.com` | Leading dot. Scopes the session cookie to the parent domain so one sign-in covers all three subdomains |
| `NEXT_PUBLIC_USER_APP_URL` | `https://wheewise.com` | |
| `NEXT_PUBLIC_DEALER_APP_URL` | `https://dealer.wheewise.com` | |
| `NEXT_PUBLIC_ADMIN_APP_URL` | `https://admin.wheewise.com` | |
| `UPSTASH_REDIS_REST_URL` | from console.upstash.com | Shared store for rate limits + OTPs — see §5 |
| `UPSTASH_REDIS_REST_TOKEN` | from console.upstash.com | Same database for all three apps |

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
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` | — | ✅ | — | `/api/uploads` — photos go to Cloudflare R2, served from its CDN (§7) |
| `BLOB_READ_WRITE_TOKEN` | — | ○ | — | deprecated Vercel Blob fallback; unused once R2 is set |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | — | ✅ | — | subscriptions, boosts |
| `RAZORPAY_WEBHOOK_SECRET` | — | ✅ | — | `/api/billing/webhook`, `/api/webhooks/razorpay` |
| `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY` | — | ✅ | — | checkout |
| `NEXT_PUBLIC_BILLING_ENABLED` | ✅ | ✅ | — | pricing section; dealer paywall gate |
| `SUREPASS_TOKEN` *(or `RTO_PROVIDER_TOKEN`)* | — | ✅ | — | `/api/rto` |
| `GST_PROVIDER_TOKEN` | — | ✅ | — | `/api/gst/verify` |
| `OPENAI_API_KEY` *or* `ANTHROPIC_API_KEY` | — | ✅ | — | `/api/ai/generate-description` |
| `UPLOAD_HOST_ALLOWLIST` | — | ✅ | — | pins stored image URLs to hosts you control — set to your R2 public host |
| `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | ✅ | ✅ | ✅ | bot protection on enquiry / OTP / login / signup (§8) |
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

## 5. Upstash Redis (required)

Rate limiting and phone OTPs both need a store shared across instances.
Without one they fall back to per-process memory, and on Vercel that means:

- login/OTP/lead throttles reset on every cold start — effectively no limiting;
- **phone login breaks entirely**, because the instance that issues a code is
  usually not the one that verifies it.

Create one Upstash Redis database (console.upstash.com) and set the same two
variables in **all three** projects:

```
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Pick a region close to your Vercel region — every throttled request costs one
round trip. One database serves all three apps; keys are namespaced (`rl:` for
rate limits, `otp:` for codes).

The client talks to Upstash over its REST API, so it works unchanged on Node,
Edge and Workers, and adds no dependency. Counting uses `INCR`, which is
atomic — the previous read-then-write design let concurrent requests overshoot
the limit, which is exactly the case a credential-stuffing attempt produces.

Behaviour if Upstash is unreachable:

| Path | Behaviour |
|---|---|
| Rate limiting | Degrades to per-instance buckets and logs `[upstash] Rate limiting fell back…` once per process. Chosen so a Redis outage cannot lock everyone out of signing in — **alert on that log line.** |
| OTP verification | Fails closed — an unavailable store must not become a way past the check. |
| OTP issuing | Raises, rather than sending an SMS carrying a code that could never be verified. |

## 7. Cloudflare R2 for photos

Listing photos are stored in R2 and served from its public hostname, so image
delivery runs on Cloudflare's CDN and never touches the app.

Setup, once:

1. Create an R2 bucket (e.g. `wheewise-photos`).
2. Give it a public hostname. A **custom domain** (`cdn.wheewise.com`) is
   preferable to the `pub-*.r2.dev` development URL — the latter is
   rate-limited and not meant for production traffic.
3. Mint an R2 API token with **Object Read & Write** scoped to that bucket.
4. Set `R2_*` on the **dealer** project only — it is the only app that ships
   `/api/uploads`.
5. Set `UPLOAD_HOST_ALLOWLIST` to the same public host, so stored image URLs
   are pinned to a host you control.

> The bucket must be publicly readable. R2 ignores per-object ACLs, so a
> private bucket accepts every upload and then 404s every read. Verify by
> opening one uploaded URL in a browser before going live.

Uploads are validated by **magic bytes**, not by the declared MIME type — a
client can claim `image/png` while sending anything. Only real JPEG, PNG and
WebP are accepted, and the stored object's extension comes from the sniffed
type rather than the supplied filename.

### Existing photos

Images already on Vercel Blob keep working: the database stores absolute URLs,
which are unaffected by the switch. Only new uploads go to R2. To move the old
objects, copy them into the bucket preserving their paths and rewrite the
`ListingPhoto.url` / `Listing360Photo.url` / `Store.logoUrl` /
`Store.bannerUrl` prefixes — do it as a one-off script, and keep the Blob store
alive until the rewrite is verified.

---

## 8. Cloudflare Turnstile

Turnstile guards the endpoints that are unauthenticated, expensive, or both:

| Form | Endpoint | Why |
|---|---|---|
| Storefront enquiry | `POST /api/leads` | unauthenticated; each accepted lead sends an email and an SMS |
| Phone login | `POST /api/auth/send-otp` | every request costs a paid SMS |
| Sign in | `loginAction` | credential stuffing |
| Sign up (buyer, dealer) | `signupBuyer` / `signupDealer` | fake-account creation |

Create a widget at **dash.cloudflare.com → Turnstile**, add all three
hostnames to it, then set both keys on **all three** projects. The site key is
public (`NEXT_PUBLIC_`); the secret key is server-only.

Notes that matter:

- **Unset keys mean no protection, silently.** The forms keep working and
  verification is skipped — deliberate, so local development needs no
  Cloudflare account, but it means a missing production variable is invisible.
  The server logs a warning at boot; watch for it.
- Verification **fails closed**. If Cloudflare is unreachable or times out,
  the request is refused rather than waved through — the opposite of the
  rate-limit fallback, because here refusing traffic is the entire point.
- Each form sends a distinct `action`, and the server checks it. Without that,
  a token minted on the cheap public enquiry form could be replayed against
  the SMS endpoint.
- The CSP in `middleware.ts` already allows `challenges.cloudflare.com` in
  `script-src`, `connect-src` and `frame-src`. Turnstile renders in an iframe,
  so all three are required.
- Supabase Auth has its own built-in Turnstile setting (Authentication →
  Attack Protection). Enable it after the stage-3 auth cutover so the hosted
  auth endpoints are covered too; the same site key works.

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
