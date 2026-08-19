# API & Server-Action Authorization Matrix

Authoritative classification of every server-reachable entry point in the app.
Anything not listed here is, by policy, **deny-by-default**: a new handler that
calls no guard from `@/lib/rbac` is a defect.

Two kinds of entry point exist, and both are public HTTP surfaces:

- **Route handlers** — `app/api/**/route.ts`.
- **Server actions** — every `export async function` in a `"use server"` file.
  Next.js publishes each one at a generated endpoint id. A page-level check
  does **not** protect the action it calls; the action must guard itself.

Guard vocabulary (all from `lib/rbac/`):

| Guard | Used by | On failure |
|---|---|---|
| `apiRequireAuth()` | route handlers | 401 |
| `apiRequirePermission(p)` | route handlers | 401 / 403 |
| `apiRequireDealer({write})` | route handlers | 401 / 403 |
| `apiRequireAdmin(p)` | route handlers | 401 / 403 |
| `requireAuthContext()` / `requirePermission(p)` | server actions | throws |
| `requireDealerContext({write})` / `requireDealer({write})` | server actions, pages | throws / redirects |
| `requireAdminContext(p)` | server actions | throws |
| `guardAdminPage(p)` | layouts/pages | redirect |

`write: true` additionally refuses a **suspended** dealer.

---

## 1. Route handlers

| Endpoint | Method | Role | Permission | Resource scope | Ownership check | AuthN | AuthZ |
|---|---|---|---|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | any | — | own session | n/a | no | n/a |
| `/api/auth/send-otp` | POST | anonymous | — | phone number | n/a | no | rate limit: 3/IP/15m, 5/phone/1h |
| `/api/leads` | POST | anonymous | — | one ACTIVE listing | listing must be ACTIVE | no | rate limit: 5/IP/1h |
| `/api/listings` | GET | any authenticated | `read` | buyer → ACTIVE only; dealer → own; admin → all | `dealerId` from session, not query | **yes** | **yes** |
| `/api/wishlist` | GET | any authenticated | `read` | own saved listings | `userId` from session | yes | yes |
| `/api/wishlist` | POST | any authenticated | `self:create` | own saved listings | `userId` from session | yes | yes |
| `/api/wishlist` | DELETE | any authenticated | `self:delete` | own saved listings | `userId` from session | yes | yes |
| `/api/chat/conversations` | GET | any authenticated | `read` | own threads (as buyer or as dealer) | both ids from session | yes | yes |
| `/api/chat/conversations` | POST | any authenticated | `self:create` | one listing | cannot message own listing | yes | yes |
| `/api/chat/messages` | GET | any authenticated | `read` | one conversation | participant check → 404 | yes | yes |
| `/api/chat/messages` | POST | any authenticated | `self:create` | one conversation | participant check → 404; `senderId` from session | yes | yes |
| `/api/rto` | GET | DEALER | `create`/`update` | third-party registry | write gate (blocks suspended) | **yes** | **yes** |
| `/api/uploads` | POST | DEALER | `create`/`update` | own blob prefix | key derived from session `userId` | yes | yes |
| `/api/gst/verify` | POST | DEALER | `create`/`update` | own dealer row | update keyed by session `dealerId` | yes | yes |
| `/api/ai/generate-description` | POST | DEALER | `create`/`update` | none (LLM call) | rate limit keyed per dealer + IP | yes | yes |
| `/api/dealer/api-keys` | POST | DEALER | `create`/`update` | own dealer | `dealerId` from session | yes | yes |
| `/api/dealer/api-keys` | DELETE | DEALER | `create`/`update` | own key | scoped `findFirst` then delete by found id | yes | yes |
| `/api/dealer/boost` | POST | DEALER | `create`/`update` | own listing | listing scoped by `dealerId` | yes | yes |
| `/api/dealer/boost/verify` | POST | DEALER | `create`/`update` | own order + listing | Razorpay signature + order `notes.dealerId` + amount re-check | yes | yes |
| `/api/dealer/bulk-upload` | POST | DEALER | `create`/`update` | own inventory | rows written with session `dealerId` | yes | yes |
| `/api/dealer/bulk-upload` | GET | DEALER | `read` | static CSV template | n/a | **yes** | **yes** |
| `/api/dealer/leads/unread-count` | GET | DEALER | `read` | own enquiries | count scoped by session `dealerId`; others get `{count:0}` | yes | yes |
| `/api/billing/checkout` | POST | DEALER | `read` | own subscription | `dealerId` from session; suspended dealers allowed (must be able to pay) | yes | yes |
| `/api/public/listings` | GET | API-key holder | — | ACTIVE listings | SHA-256 key → `dealerId` | key | yes |
| `/api/public/dealer` | GET | API-key holder | — | own dealer profile | `dealerId` derived from the key | key | yes |
| `/api/billing/webhook` | POST | Razorpay | — | subscription rows | HMAC signature + event-id replay guard | HMAC | n/a |
| `/api/webhooks/razorpay` | POST | Razorpay | — | subscription rows | HMAC signature + event-id replay guard | HMAC | n/a |

### Intentionally public

Three endpoints accept anonymous traffic by design. Each is listed above with
its compensating control:

- `/api/auth/*` — sign-in itself.
- `/api/auth/send-otp` — phone login; dual rate limits.
- `/api/leads` — the buyer enquiry form on public listing pages; rate limited,
  writes only an `Enquiry` scoped to the listing's own dealer.

---

## 2. Server actions

### Admin (`lib/actions/admin.ts`)

| Action | Permission | Notes |
|---|---|---|
| `getAdminStats` | `read` | aggregate counts only |
| `getDealers` | `manage_dealers` | |
| `getBuyers` | `manage_users` | |
| `getDealerSubscriptions` | `manage_dealers` | |
| `getPendingModeration` | `manage_configuration` | |
| `suspendDealer` | `manage_dealers` | logs `privilege.changed` |
| `removeListingByAdmin` | `delete` | logs `admin.action` |
| `getPayouts` | `manage_configuration` | |
| `updatePayoutStatus` | `approve` | logs `admin.action` |
| `getDealerPayouts` | `read` + ownership | admin → any dealer; otherwise the requested `dealerId` **must equal** the session's own |

### Dealer-scoped

All use `requireDealer()` for reads and `requireDealer({ write: true })` for
writes, and every row lookup is scoped by the session-derived `dealerId`.

| File | Write actions | Read actions |
|---|---|---|
| `listings.ts` | `createListing`, `updateListing`, `setListingStatus`, `markAsSold`*, `deleteListing`, `bulkSetStatus`, `bulkDelete` | — |
| `enquiries.ts` | `replyToEnquiry`, `closeEnquiry` | `getEnquiriesForDealer` |
| `testdrive.ts` | `updateTestDriveStatus` | `getTestDrivesForDealer` |
| `finance.ts` | `updateLoanStatus`, `updateListingInsurance` | `getDealerLoanApplications` |
| `leads.ts` | `setLeadFlags` | — |
| `store.ts` | `updateStore` | — |
| `rctransfer.ts` | `initiateTransfer` | `getTransfersForDealer`, `getSoldListingsAwaitingTransfer` |

\* `markAsSold` delegates to `setListingStatus` and inherits its guard.

### User / self-scoped

| Action | Rule |
|---|---|
| `createEnquiry`, `requestTestDrive`, `applyForLoan`, `applyInspector` | authenticated; row written with the session `userId` |
| `replyToEnquiryAsBuyer` | enquiry looked up with `buyerId = session userId` |
| `getEnquiriesForBuyer`, `getTestDrivesForBuyer`, `getLoanApplications` | filtered by session `userId` |
| `updateProfile` | updates the session user's own row only |
| `createPost`, `createReply`, `upvotePost` | authenticated; `DEALER` community additionally requires the DEALER role |

### Multi-party / conditional

| Action | Rule |
|---|---|
| `getTransferById`, `getTransferByListing` | seller, buyer, or admin — otherwise `null` |
| `updateTransferStep` | seller or buyer; steps ≥ 3 are seller-only |
| `getPosts("DEALER")`, `getPost(dealer thread)` | dealer or admin — otherwise `[]` / `null` |
| `getPosts("BUYER")`, `getPost(buyer thread)` | public; author email is **not** selected |
| `getInspectorInspection`, `submitInspection` | approved inspector **and** the inspection assigned to them; completed reports cannot be re-submitted |
| `getListingInspection` | public, `COMPLETED` inspections only |

---

## 3. Values that are never trusted from the client

`getAuthContext()` is the only source of caller identity. It reads the signed
session for a subject id, then loads that user's row and takes **role**,
**dealerId** and **dealer status** from the database.

Consequently these inputs cannot widen scope anywhere in the app:

| Client-supplied value | How it is handled |
|---|---|
| `role` in the JWT/session | ignored for authorization; the DB row decides |
| `dealer_id` / `dealerId` in body or query | either rejected (403) or checked for equality against the session's own |
| `user_id` / `userId` in a body | ignored; writes are stamped from the session |
| `tenant_id` | not a concept in this schema; dealer is the tenant boundary |
| `resource_id` (listing, key, enquiry, transfer, inspection) | used only inside an ownership-scoped `findFirst`/`findUnique`; the write then targets the **id returned by that lookup** |
| `X-Forwarded-For` | only for rate-limit keys, rightmost hop, behind `CF-Connecting-IP` |
| `Authorization` / `x-api-key` | hashed and matched against `ApiKey.keyHash`; resolves to one `dealerId` |
| Razorpay webhook bodies | HMAC-verified before parsing; replay-guarded by event id |
