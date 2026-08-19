# dealer-app

Dealer console — inventory, leads, test drives, billing, storefront.

Deployed to **https://dealer.wheewise.com**.

## This repo is generated

It is produced from the Wheewise monorepo by `scripts/build-role-repos.mjs`.
`lib/`, `components/`, `prisma/`, `tests/` and the build configuration are
**byte-identical** across `user-app`, `dealer-app` and `admin-app`; only
`app/` differs. Change shared code in the monorepo and regenerate, rather than
editing it here — otherwise the three repos drift apart.

What is unique to this repo:

- `app/(dealer)/` — this role's pages
- `app/api/` — only the 19 route handlers this app actually calls
- `app/robots.ts` — disallow all

## Local development

```bash
npm install
cp .env.example .env      # then fill in the values below
npx prisma generate
npm run dev
```

## Environment variables

All three apps share **one database** and **one `AUTH_SECRET`**. A session
issued by any of them must verify in the other two.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Same Neon/Postgres instance for all three apps |
| `AUTH_SECRET` | yes | **Identical** across all three projects |
| `AUTH_URL` | yes | `https://dealer.wheewise.com` |
| `AUTH_TRUST_HOST` | yes | `true` on Vercel |
| `AUTH_COOKIE_DOMAIN` | yes | `.wheewise.com` — shares the session across subdomains |
| `NEXT_PUBLIC_APP_URL` | yes | `https://dealer.wheewise.com` |
| `NEXT_PUBLIC_USER_APP_URL` | yes | `https://wheewise.com` |
| `NEXT_PUBLIC_DEALER_APP_URL` | yes | `https://dealer.wheewise.com` |
| `NEXT_PUBLIC_ADMIN_APP_URL` | yes | `https://admin.wheewise.com` |

Feature-specific keys (`BLOB_READ_WRITE_TOKEN`, `RAZORPAY_*`, `RESEND_*`,
`SUREPASS_TOKEN`, …) are listed in `.env.example`; see
`docs/deployment/VERCEL_SETUP.md` for which app needs which.

## Security

Authorization is centralised in `lib/rbac/` and enforced server-side on every
request. See `docs/security/SECURITY_REPORT.md` and
`docs/security/API_AUTHORIZATION_MATRIX.md`.

```bash
npm test          # unit suite + the authorization/security tests for this app
npm run typecheck
npm run lint
```
