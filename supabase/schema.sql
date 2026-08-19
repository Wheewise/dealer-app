-- =====================================================================
-- Wheewise — complete Supabase schema
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is idempotent: re-running is safe and makes no destructive change.
--
-- Replaces prisma/schema.prisma entirely. Nothing here depends on Prisma,
-- Neon, or any migration tool — this file IS the schema.
--
-- Contents
--   1.  Extensions
--   2.  Enums
--   3.  Shared helpers (id + updatedAt)
--   4.  Tables
--   5.  Indexes
--   6.  Foreign keys
--   7.  updatedAt triggers
--   8.  Auth linkage + `app` helper functions
--   9.  Privilege-escalation guard triggers
--   10. auth.users <-> public."User" sync
--   11. Public projections (views)
--   12. RPCs the application calls
--   13. Grants
--   14. Row Level Security: enable, force, policies
--
-- Timestamps are `timestamptz`. Prisma emitted `timestamp(3)` (no zone),
-- which PostgREST serialises without an offset — JavaScript then parses it
-- as local time. With Prisma gone the JSON boundary is the only boundary,
-- so the columns carry their zone.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;


-- ---------------------------------------------------------------------
-- 2. Enums
--
-- `create type` has no IF NOT EXISTS, so each is guarded. Adding a value
-- later is `alter type ... add value`, not an edit here.
-- ---------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'Role') then
    create type "Role" as enum ('BUYER', 'DEALER', 'ADMIN', 'SUPER_ADMIN');
  end if;
  if not exists (select 1 from pg_type where typname = 'DealerStatus') then
    create type "DealerStatus" as enum ('ACTIVE', 'SUSPENDED');
  end if;
  if not exists (select 1 from pg_type where typname = 'VehicleType') then
    create type "VehicleType" as enum ('CAR', 'BIKE');
  end if;
  if not exists (select 1 from pg_type where typname = 'VehicleCondition') then
    create type "VehicleCondition" as enum ('A', 'B', 'C');
  end if;
  if not exists (select 1 from pg_type where typname = 'FuelType') then
    create type "FuelType" as enum ('PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID');
  end if;
  if not exists (select 1 from pg_type where typname = 'Transmission') then
    create type "Transmission" as enum ('MANUAL', 'AUTOMATIC', 'AMT', 'CVT');
  end if;
  if not exists (select 1 from pg_type where typname = 'ListingStatus') then
    create type "ListingStatus" as enum ('ACTIVE', 'PAUSED', 'SOLD');
  end if;
  if not exists (select 1 from pg_type where typname = 'EnquirySource') then
    create type "EnquirySource" as enum ('FORM', 'WHATSAPP', 'CALL');
  end if;
  if not exists (select 1 from pg_type where typname = 'EnquiryStatus') then
    create type "EnquiryStatus" as enum ('OPEN', 'REPLIED', 'CLOSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'TestDriveStatus') then
    create type "TestDriveStatus" as enum ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'RCTransferStatus') then
    create type "RCTransferStatus" as enum ('INITIATED', 'DOCS_PENDING', 'RTO_PENDING', 'RTO_APPROVED', 'COMPLETED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'PayoutStatus') then
    create type "PayoutStatus" as enum ('PENDING', 'APPROVED', 'REJECTED', 'PAID');
  end if;
  if not exists (select 1 from pg_type where typname = 'InspectorStatus') then
    create type "InspectorStatus" as enum ('PENDING', 'APPROVED', 'REJECTED');
  end if;
  if not exists (select 1 from pg_type where typname = 'InspectionStatus') then
    create type "InspectionStatus" as enum ('REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'Community') then
    create type "Community" as enum ('BUYER', 'DEALER');
  end if;
  if not exists (select 1 from pg_type where typname = 'NBFC') then
    create type "NBFC" as enum ('BAJAJ_FINSERV', 'HDFC_BANK', 'ICICI_BANK', 'MAHINDRA_FINANCE',
                                'KOTAK_MAHINDRA', 'CHOLAMANDALAM', 'SHRIRAM_FINANCE',
                                'SUNDARAM_FINANCE', 'TATA_CAPITAL', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'LoanStatus') then
    create type "LoanStatus" as enum ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'DISBURSED');
  end if;
  if not exists (select 1 from pg_type where typname = 'TemplateType') then
    create type "TemplateType" as enum ('EMAIL', 'SMS');
  end if;
  if not exists (select 1 from pg_type where typname = 'PlanTier') then
    create type "PlanTier" as enum ('FREE_TRIAL', 'MONTHLY', 'YEARLY');
  end if;
  if not exists (select 1 from pg_type where typname = 'SubStatus') then
    create type "SubStatus" as enum ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'PaymentKind') then
    create type "PaymentKind" as enum ('BOOST', 'SUBSCRIPTION', 'WEBHOOK');
  end if;
  if not exists (select 1 from pg_type where typname = 'PaymentStatus') then
    create type "PaymentStatus" as enum ('SUCCEEDED', 'FAILED', 'REFUNDED');
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 3. Shared helpers
--
-- Prisma generated `id` (cuid) and maintained `updatedAt` in the client.
-- Both are now the database's job, so any writer — the app, the SQL
-- editor, a webhook — gets the same behaviour.
--
-- Ids stay TEXT so existing cuid rows remain valid; new rows get a uuid.
-- ---------------------------------------------------------------------

create schema if not exists app;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new."updatedAt" = now();
  return new;
end $$;

comment on function app.set_updated_at() is
  'BEFORE UPDATE trigger replacing Prisma''s @updatedAt.';


-- ---------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------

create table if not exists public."User" (
  "id"            text primary key default gen_random_uuid()::text,
  -- Nullable: phone-OTP users have no email. A unique index over a
  -- nullable column still permits many NULLs.
  "email"         text,
  "phone"         text,
  -- Nullable: phone-OTP users have no password.
  "passwordHash"  text,
  "name"          text,
  "district"      text,
  "state"         text,
  "role"          "Role" not null default 'BUYER',
  -- Pointer at the Supabase Auth identity. Nullable so a profile can exist
  -- before (or without) an auth.users row.
  "authId"        uuid,
  "emailVerified" timestamptz,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

-- NextAuth adapter tables. Unused while sessions are JWT + Credentials
-- (the Credentials provider never touches the adapter), but kept so adding
-- an OAuth provider is a configuration change rather than a migration.
create table if not exists public."Account" (
  "id"                text primary key default gen_random_uuid()::text,
  "userId"            text not null,
  "type"              text not null,
  "provider"          text not null,
  "providerAccountId" text not null,
  "refresh_token"     text,
  "access_token"      text,
  "expires_at"        integer,
  "token_type"        text,
  "scope"             text,
  "id_token"          text,
  "session_state"     text
);

create table if not exists public."Session" (
  "id"           text primary key default gen_random_uuid()::text,
  "sessionToken" text not null,
  "userId"       text not null,
  "expires"      timestamptz not null
);

create table if not exists public."VerificationToken" (
  "identifier" text not null,
  "token"      text not null,
  "expires"    timestamptz not null
);

create table if not exists public."Dealer" (
  "id"           text primary key default gen_random_uuid()::text,
  "userId"       text not null,
  "businessName" text not null,
  "city"         text not null,
  "phone"        text not null,
  "whatsapp"     text,
  "gstin"        text,
  "gstVerified"  boolean not null default false,
  "status"       "DealerStatus" not null default 'ACTIVE',
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);

create table if not exists public."Store" (
  "id"           text primary key default gen_random_uuid()::text,
  "dealerId"     text not null,
  "slug"         text not null,
  "logoUrl"      text,
  "bannerUrl"    text,
  "bio"          text,
  "primaryColor" text not null default '#DC2626',
  "createdAt"    timestamptz not null default now(),
  "updatedAt"    timestamptz not null default now()
);

create table if not exists public."Listing" (
  "id"                 text primary key default gen_random_uuid()::text,
  "dealerId"           text not null,
  "vehicleType"        "VehicleType" not null,
  "make"               text not null,
  "model"              text not null,
  "year"               integer not null,
  "fuelType"           "FuelType" not null,
  "transmission"       "Transmission",
  "odometerKm"         integer not null,
  "askingPrice"        numeric(12,2) not null,
  "condition"          "VehicleCondition",
  "testDriveAvailable" boolean not null default false,
  "description"        text,
  "city"               text not null,
  "status"             "ListingStatus" not null default 'ACTIVE',
  "viewCount"          integer not null default 0,
  "enquiryCount"       integer not null default 0,
  "isBoosted"          boolean not null default false,
  "boostExpiresAt"     timestamptz,
  "insuranceProvider"  text,
  "insuranceExpiry"    timestamptz,
  "createdAt"          timestamptz not null default now(),
  "updatedAt"          timestamptz not null default now()
);

create table if not exists public."ListingView" (
  "id"        text primary key default gen_random_uuid()::text,
  "listingId" text not null,
  "visitorId" text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."ListingPhoto" (
  "id"        text primary key default gen_random_uuid()::text,
  "listingId" text not null,
  "url"       text not null,
  "sortOrder" integer not null default 0
);

create table if not exists public."Listing360Photo" (
  "id"        text primary key default gen_random_uuid()::text,
  "listingId" text not null,
  "url"       text not null,
  "angle"     integer not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."Enquiry" (
  "id"          text primary key default gen_random_uuid()::text,
  "listingId"   text not null,
  "dealerId"    text not null,
  "buyerId"     text,
  "buyerName"   text not null,
  "buyerPhone"  text not null,
  "buyerEmail"  text,
  "message"     text,
  "source"      "EnquirySource" not null default 'FORM',
  "priority"    integer not null default 0,
  "isRead"      boolean not null default false,
  "isContacted" boolean not null default false,
  "status"      "EnquiryStatus" not null default 'OPEN',
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create table if not exists public."TestDrive" (
  "id"          text primary key default gen_random_uuid()::text,
  "listingId"   text not null,
  -- References Dealer.id (not User.id), matching Enquiry / Conversation /
  -- Inspection.
  "dealerId"    text not null,
  "buyerId"     text not null,
  "scheduledAt" timestamptz not null,
  "status"      "TestDriveStatus" not null default 'PENDING',
  "notes"       text,
  "createdAt"   timestamptz not null default now(),
  "updatedAt"   timestamptz not null default now()
);

create table if not exists public."RCTransfer" (
  "id"               text primary key default gen_random_uuid()::text,
  "listingId"        text not null,
  -- Unlike dealerId elsewhere, both sides here are individual account
  -- holders, so these are plain Users.
  "sellerId"         text not null,
  "buyerId"          text not null,
  "registrationNo"   text not null,
  "vehicleName"      text not null,
  "saleAmount"       numeric(12,2) not null,
  "status"           "RCTransferStatus" not null default 'INITIATED',
  "currentStep"      integer not null default 1,
  "notes"            text,
  "sellerAgreed"     boolean not null default false,
  "buyerAgreed"      boolean not null default false,
  "docsSubmitted"    boolean not null default false,
  "rtoPending"       boolean not null default false,
  "rtoApproved"      boolean not null default false,
  "transferComplete" boolean not null default false,
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);

create table if not exists public."RCDocument" (
  "id"         text primary key default gen_random_uuid()::text,
  "transferId" text not null,
  "name"       text not null,
  "url"        text not null,
  "uploadedBy" text not null,
  "createdAt"  timestamptz not null default now()
);

create table if not exists public."Conversation" (
  "id"            text primary key default gen_random_uuid()::text,
  "listingId"     text not null,
  "buyerId"       text not null,
  "dealerId"      text not null,
  -- Denormalised for chat-list ordering; stamped on every Message insert by
  -- the trigger below, so the order is stable even when nothing else changes.
  "lastMessageAt" timestamptz,
  "createdAt"     timestamptz not null default now(),
  "updatedAt"     timestamptz not null default now()
);

create table if not exists public."Message" (
  "id"             text primary key default gen_random_uuid()::text,
  "conversationId" text not null,
  "senderId"       text not null,
  "body"           text not null,
  "readAt"         timestamptz,
  "createdAt"      timestamptz not null default now()
);

create table if not exists public."SavedListing" (
  "id"        text primary key default gen_random_uuid()::text,
  "userId"    text not null,
  "listingId" text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."ApiKey" (
  "id"         text primary key default gen_random_uuid()::text,
  "dealerId"   text not null,
  "name"       text not null,
  -- Legacy plaintext column, nullable for the migration window. New keys
  -- never write it; drop the column once every row has keyHash.
  "key"        text,
  -- SHA-256 hex of the plaintext key. Validation hashes the incoming key
  -- and looks up by this; the plaintext is shown to the dealer once.
  "keyHash"    text,
  -- First 8 chars of the plaintext, for the UI ("wk_abc12…").
  "keyPrefix"  text,
  "lastUsedAt" timestamptz,
  "createdAt"  timestamptz not null default now()
);

create table if not exists public."Payout" (
  "id"               text primary key default gen_random_uuid()::text,
  "dealerId"         text not null,
  "amount"           numeric(12,2) not null,
  "status"           "PayoutStatus" not null default 'PENDING',
  "razorpayPayoutId" text,
  "note"             text,
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);

create table if not exists public."Inspector" (
  "id"            text primary key default gen_random_uuid()::text,
  "userId"        text not null,
  "certification" text,
  "status"        "InspectorStatus" not null default 'PENDING',
  "createdAt"     timestamptz not null default now()
);

create table if not exists public."Inspection" (
  "id"           text primary key default gen_random_uuid()::text,
  "listingId"    text not null,
  "inspectorId"  text,
  "dealerId"     text not null,
  "status"       "InspectionStatus" not null default 'REQUESTED',
  "checklist"    jsonb,
  "overallScore" integer,
  "notes"        text,
  "reportUrl"    text,
  "createdAt"    timestamptz not null default now(),
  "completedAt"  timestamptz
);

create table if not exists public."Post" (
  "id"        text primary key default gen_random_uuid()::text,
  "title"     text not null,
  "body"      text not null,
  "authorId"  text not null,
  "community" "Community" not null default 'BUYER',
  "tags"      text[] not null default '{}',
  "isPinned"  boolean not null default false,
  "isLocked"  boolean not null default false,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."Reply" (
  "id"        text primary key default gen_random_uuid()::text,
  "postId"    text not null,
  "authorId"  text not null,
  "body"      text not null,
  "createdAt" timestamptz not null default now()
);

create table if not exists public."PostUpvote" (
  "id"     text primary key default gen_random_uuid()::text,
  "postId" text not null,
  "userId" text not null
);

create table if not exists public."LoanApplication" (
  "id"             text primary key default gen_random_uuid()::text,
  "listingId"      text not null,
  "buyerId"        text not null,
  "nbfc"           "NBFC" not null,
  "amount"         numeric(12,2) not null,
  "tenureMonths"   integer not null,
  "monthlyEmi"     numeric(12,2) not null,
  "status"         "LoanStatus" not null default 'PENDING',
  "applicantName"  text not null,
  "applicantPhone" text not null,
  "applicantPan"   text,
  "notes"          text,
  "createdAt"      timestamptz not null default now(),
  "updatedAt"      timestamptz not null default now()
);

create table if not exists public."NotificationTemplate" (
  "id"        text primary key default gen_random_uuid()::text,
  "name"      text not null,
  "subject"   text not null,
  "body"      text not null,
  "type"      "TemplateType" not null default 'EMAIL',
  "updatedAt" timestamptz not null default now()
);

create table if not exists public."Subscription" (
  "id"               text primary key default gen_random_uuid()::text,
  "dealerId"         text not null,
  "plan"             "PlanTier" not null default 'FREE_TRIAL',
  "status"           "SubStatus" not null default 'TRIALING',
  "razorpaySubId"    text,
  "currentPeriodEnd" timestamptz not null,
  "createdAt"        timestamptz not null default now(),
  "updatedAt"        timestamptz not null default now()
);

-- Payment idempotency + webhook replay protection. The unique indexes on
-- razorpayPaymentId / razorpayEventId are the mechanism: a duplicate insert
-- raises 23505, which the caller reads as "already processed".
create table if not exists public."Payment" (
  "id"                text primary key default gen_random_uuid()::text,
  "razorpayOrderId"   text,
  "razorpayPaymentId" text,
  "razorpayEventId"   text,
  "razorpaySignature" text,
  "kind"              "PaymentKind" not null,
  -- Paise (integer) — INR × 100.
  "amount"            integer not null,
  "currency"          text not null default 'INR',
  "status"            "PaymentStatus" not null default 'SUCCEEDED',
  -- Free-form context ({ dealerId, listingId, duration, … }) so payments
  -- reconcile without calling back to Razorpay.
  "notes"             jsonb,
  "dealerId"          text,
  "listingId"         text,
  "createdAt"         timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. Indexes
-- ---------------------------------------------------------------------

create unique index if not exists "User_email_key"  on public."User"("email");
create unique index if not exists "User_phone_key"  on public."User"("phone");
create unique index if not exists "User_authId_key" on public."User"("authId") where "authId" is not null;

create unique index if not exists "Account_provider_providerAccountId_key"
  on public."Account"("provider", "providerAccountId");
create index if not exists "Account_userId_idx" on public."Account"("userId");

create unique index if not exists "Session_sessionToken_key" on public."Session"("sessionToken");
create index if not exists "Session_userId_idx" on public."Session"("userId");

create unique index if not exists "VerificationToken_token_key"
  on public."VerificationToken"("token");
create unique index if not exists "VerificationToken_identifier_token_key"
  on public."VerificationToken"("identifier", "token");

create unique index if not exists "Dealer_userId_key" on public."Dealer"("userId");

create unique index if not exists "Store_dealerId_key" on public."Store"("dealerId");
create unique index if not exists "Store_slug_key"     on public."Store"("slug");

create index if not exists "Listing_city_vehicleType_status_idx"
  on public."Listing"("city", "vehicleType", "status");
create index if not exists "Listing_dealerId_status_idx"
  on public."Listing"("dealerId", "status");
create index if not exists "Listing_status_createdAt_idx"
  on public."Listing"("status", "createdAt");
create index if not exists "Listing_isBoosted_status_createdAt_idx"
  on public."Listing"("isBoosted", "status", "createdAt");
create index if not exists "Listing_boostExpiresAt_idx"  on public."Listing"("boostExpiresAt");
create index if not exists "Listing_insuranceExpiry_idx" on public."Listing"("insuranceExpiry");

create unique index if not exists "ListingView_listingId_visitorId_key"
  on public."ListingView"("listingId", "visitorId");
create index if not exists "ListingView_createdAt_idx" on public."ListingView"("createdAt");

create index if not exists "ListingPhoto_listingId_sortOrder_idx"
  on public."ListingPhoto"("listingId", "sortOrder");
create index if not exists "Listing360Photo_listingId_angle_idx"
  on public."Listing360Photo"("listingId", "angle");

create index if not exists "Enquiry_dealerId_isRead_priority_createdAt_idx"
  on public."Enquiry"("dealerId", "isRead", "priority", "createdAt");
create index if not exists "Enquiry_listingId_createdAt_idx"
  on public."Enquiry"("listingId", "createdAt");

create index if not exists "TestDrive_dealerId_status_scheduledAt_idx"
  on public."TestDrive"("dealerId", "status", "scheduledAt");
create index if not exists "TestDrive_buyerId_scheduledAt_idx"
  on public."TestDrive"("buyerId", "scheduledAt");
create index if not exists "TestDrive_listingId_idx" on public."TestDrive"("listingId");

create unique index if not exists "RCTransfer_listingId_key" on public."RCTransfer"("listingId");
create index if not exists "RCTransfer_sellerId_status_idx" on public."RCTransfer"("sellerId", "status");
create index if not exists "RCTransfer_buyerId_status_idx"  on public."RCTransfer"("buyerId", "status");
create index if not exists "RCDocument_transferId_idx"      on public."RCDocument"("transferId");

create index if not exists "Conversation_buyerId_idx"       on public."Conversation"("buyerId");
create index if not exists "Conversation_dealerId_idx"      on public."Conversation"("dealerId");
create index if not exists "Conversation_lastMessageAt_idx" on public."Conversation"("lastMessageAt");
create unique index if not exists "Conversation_listingId_buyerId_key"
  on public."Conversation"("listingId", "buyerId");

create index if not exists "Message_conversationId_createdAt_idx"
  on public."Message"("conversationId", "createdAt");
create index if not exists "Message_conversationId_readAt_idx"
  on public."Message"("conversationId", "readAt");

create index if not exists "SavedListing_userId_idx" on public."SavedListing"("userId");
create unique index if not exists "SavedListing_userId_listingId_key"
  on public."SavedListing"("userId", "listingId");

create unique index if not exists "ApiKey_key_key"     on public."ApiKey"("key");
create unique index if not exists "ApiKey_keyHash_key" on public."ApiKey"("keyHash");
create index if not exists "ApiKey_dealerId_idx"       on public."ApiKey"("dealerId");

create index if not exists "Payout_dealerId_idx" on public."Payout"("dealerId");
create index if not exists "Payout_status_idx"   on public."Payout"("status");

create unique index if not exists "Inspector_userId_key" on public."Inspector"("userId");

create index if not exists "Inspection_listingId_idx"   on public."Inspection"("listingId");
create index if not exists "Inspection_dealerId_idx"    on public."Inspection"("dealerId");
create index if not exists "Inspection_inspectorId_idx" on public."Inspection"("inspectorId");
create index if not exists "Inspection_status_idx"      on public."Inspection"("status");

create index if not exists "Post_community_isPinned_createdAt_idx"
  on public."Post"("community", "isPinned", "createdAt");
create index if not exists "Post_authorId_idx" on public."Post"("authorId");
create index if not exists "Post_tags_idx"     on public."Post" using gin ("tags");

create index if not exists "Reply_postId_createdAt_idx" on public."Reply"("postId", "createdAt");
create unique index if not exists "PostUpvote_postId_userId_key"
  on public."PostUpvote"("postId", "userId");
create index if not exists "PostUpvote_userId_idx" on public."PostUpvote"("userId");

create index if not exists "LoanApplication_listingId_idx" on public."LoanApplication"("listingId");
create index if not exists "LoanApplication_buyerId_createdAt_idx"
  on public."LoanApplication"("buyerId", "createdAt");
create index if not exists "LoanApplication_status_createdAt_idx"
  on public."LoanApplication"("status", "createdAt");
create unique index if not exists "LoanApplication_buyerId_listingId_key"
  on public."LoanApplication"("buyerId", "listingId");

create unique index if not exists "NotificationTemplate_name_key"
  on public."NotificationTemplate"("name");

create unique index if not exists "Subscription_dealerId_key"      on public."Subscription"("dealerId");
create unique index if not exists "Subscription_razorpaySubId_key" on public."Subscription"("razorpaySubId");

create unique index if not exists "Payment_razorpayPaymentId_key" on public."Payment"("razorpayPaymentId");
create unique index if not exists "Payment_razorpayEventId_key"   on public."Payment"("razorpayEventId");
create index if not exists "Payment_dealerId_createdAt_idx" on public."Payment"("dealerId", "createdAt");
create index if not exists "Payment_listingId_createdAt_idx" on public."Payment"("listingId", "createdAt");
create index if not exists "Payment_kind_createdAt_idx"     on public."Payment"("kind", "createdAt");


-- ---------------------------------------------------------------------
-- 6. Foreign keys
--
-- Named exactly as PostgREST expects for embedded selects: supabase-js
-- resolves `Listing!Listing_dealerId_fkey(...)` by constraint name, so
-- renaming one changes application queries.
-- ---------------------------------------------------------------------

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('Account',         'Account_userId_fkey',           '"userId"',        'User',       '"id"', 'cascade'),
      ('Session',         'Session_userId_fkey',           '"userId"',        'User',       '"id"', 'cascade'),
      ('User',            'User_authId_fkey',              '"authId"',        null,         null,   'set null'),
      ('Dealer',          'Dealer_userId_fkey',            '"userId"',        'User',       '"id"', 'cascade'),
      ('Store',           'Store_dealerId_fkey',           '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Listing',         'Listing_dealerId_fkey',         '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('ListingView',     'ListingView_listingId_fkey',    '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('ListingPhoto',    'ListingPhoto_listingId_fkey',   '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('Listing360Photo', 'Listing360Photo_listingId_fkey','"listingId"',     'Listing',    '"id"', 'cascade'),
      ('Enquiry',         'Enquiry_listingId_fkey',        '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('Enquiry',         'Enquiry_dealerId_fkey',         '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Enquiry',         'Enquiry_buyerId_fkey',          '"buyerId"',       'User',       '"id"', 'set null'),
      ('TestDrive',       'TestDrive_listingId_fkey',      '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('TestDrive',       'TestDrive_dealerId_fkey',       '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('TestDrive',       'TestDrive_buyerId_fkey',        '"buyerId"',       'User',       '"id"', 'cascade'),
      ('RCTransfer',      'RCTransfer_listingId_fkey',     '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('RCTransfer',      'RCTransfer_sellerId_fkey',      '"sellerId"',      'User',       '"id"', 'restrict'),
      ('RCTransfer',      'RCTransfer_buyerId_fkey',       '"buyerId"',       'User',       '"id"', 'restrict'),
      ('RCDocument',      'RCDocument_transferId_fkey',    '"transferId"',    'RCTransfer', '"id"', 'cascade'),
      ('Conversation',    'Conversation_listingId_fkey',   '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('Conversation',    'Conversation_buyerId_fkey',     '"buyerId"',       'User',       '"id"', 'cascade'),
      ('Conversation',    'Conversation_dealerId_fkey',    '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Message',         'Message_conversationId_fkey',   '"conversationId"','Conversation','"id"','cascade'),
      ('Message',         'Message_senderId_fkey',         '"senderId"',      'User',       '"id"', 'cascade'),
      ('SavedListing',    'SavedListing_userId_fkey',      '"userId"',        'User',       '"id"', 'cascade'),
      ('SavedListing',    'SavedListing_listingId_fkey',   '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('ApiKey',          'ApiKey_dealerId_fkey',          '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Payout',          'Payout_dealerId_fkey',          '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Inspector',       'Inspector_userId_fkey',         '"userId"',        'User',       '"id"', 'cascade'),
      ('Inspection',      'Inspection_listingId_fkey',     '"listingId"',     'Listing',    '"id"', 'cascade'),
      ('Inspection',      'Inspection_inspectorId_fkey',   '"inspectorId"',   'Inspector',  '"id"', 'set null'),
      ('Inspection',      'Inspection_dealerId_fkey',      '"dealerId"',      'Dealer',     '"id"', 'cascade'),
      ('Post',            'Post_authorId_fkey',            '"authorId"',      'User',       '"id"', 'cascade'),
      ('Reply',           'Reply_postId_fkey',             '"postId"',        'Post',       '"id"', 'cascade'),
      ('Reply',           'Reply_authorId_fkey',           '"authorId"',      'User',       '"id"', 'cascade'),
      ('PostUpvote',      'PostUpvote_postId_fkey',        '"postId"',        'Post',       '"id"', 'cascade'),
      ('PostUpvote',      'PostUpvote_userId_fkey',        '"userId"',        'User',       '"id"', 'cascade'),
      ('LoanApplication', 'LoanApplication_listingId_fkey','"listingId"',     'Listing',    '"id"', 'cascade'),
      ('LoanApplication', 'LoanApplication_buyerId_fkey',  '"buyerId"',       'User',       '"id"', 'cascade'),
      ('Subscription',    'Subscription_dealerId_fkey',    '"dealerId"',      'Dealer',     '"id"', 'cascade')
    ) as t(tbl, conname, cols, reftbl, refcols, ondelete)
  loop
    if exists (select 1 from pg_constraint where conname = fk.conname) then
      continue;
    end if;

    -- User.authId points into auth.users, which lives outside `public`.
    if fk.reftbl is null then
      execute format(
        'alter table public.%I add constraint %I foreign key (%s) references auth.users(id) on delete %s',
        fk.tbl, fk.conname, fk.cols, fk.ondelete);
    else
      execute format(
        'alter table public.%I add constraint %I foreign key (%s) references public.%I(%s) on delete %s on update cascade',
        fk.tbl, fk.conname, fk.cols, fk.reftbl, fk.refcols, fk.ondelete);
    end if;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 7. updatedAt triggers
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'User', 'Dealer', 'Store', 'Listing', 'Enquiry', 'TestDrive', 'RCTransfer',
    'Conversation', 'Payout', 'Post', 'LoanApplication', 'NotificationTemplate',
    'Subscription'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- Chat-list ordering. Prisma stamped lastMessageAt from the application on
-- every message insert; the trigger makes that invariant unconditional.
create or replace function app.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public."Conversation"
     set "lastMessageAt" = new."createdAt"
   where "id" = new."conversationId";
  return new;
end $$;

drop trigger if exists touch_conversation on public."Message";
create trigger touch_conversation
  after insert on public."Message"
  for each row execute function app.touch_conversation();


-- ---------------------------------------------------------------------
-- 8. Auth linkage + `app` helper functions
--
-- public."User".id is text (cuid for legacy rows), so it cannot BE
-- auth.uid(). Every User row instead carries a nullable pointer at its
-- auth.users row, and all foreign keys keep referencing the text id.
--
-- Helpers live in `app`, not `public`: PostgREST exposes `public`, so a
-- function placed there becomes a callable RPC for every client. These are
-- internal plumbing.
--
-- All of them are:
--   SECURITY DEFINER — they read public."User", which is itself behind RLS;
--                      without this every policy would recurse into that
--                      table's policy.
--   STABLE           — so Postgres evaluates them once per statement.
--   search_path      — pinned, so a caller cannot shadow `public` with a
--                      temp schema and swap the tables underneath.
-- ---------------------------------------------------------------------

grant usage on schema app to anon, authenticated, service_role;

create or replace function app.current_user_id()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select u."id" from public."User" u where u."authId" = auth.uid();
$$;

comment on function app.current_user_id() is
  'public."User".id for the caller, or NULL when unauthenticated.';

-- Role is read from the database, never from a JWT claim. A JWT is a
-- snapshot: a user demoted from ADMIN keeps a valid token until it expires.
-- It must never come from user_metadata, which the user can write through
-- the Auth API — a role stored there would be self-assignable.
create or replace function app.current_role()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select u."role"::text from public."User" u where u."authId" = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean
language sql stable security definer
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
language sql stable security definer
set search_path = public, pg_temp
as $$
  select d."id"
    from public."Dealer" d
    join public."User" u on u."id" = d."userId"
   where u."authId" = auth.uid();
$$;

-- Suspension bites at the database. Suspending a dealer pauses their live
-- listings; a suspended dealer that could still write would set them back.
create or replace function app.dealer_can_write()
returns boolean
language sql stable security definer
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

create or replace function app.in_conversation(conversation_id text)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public."Conversation" c
     where c."id" = conversation_id
       and (c."buyerId" = app.current_user_id()
            or c."dealerId" = app.current_dealer_id())
  );
$$;

-- What distinguishes an infrastructure session from an end-user session is
-- already in the catalogue: whether the role bypasses RLS. Enumerating role
-- names is fragile — the Supabase CLI connects as a per-invocation role and
-- then SET ROLEs, so a name list misclassifies migrations as untrusted.
--
-- `current_setting('role')` reflects SET ROLE and is NOT rewritten by
-- SECURITY DEFINER, so it is the honest view of who is acting; it reads
-- 'none' when no SET ROLE happened. `current_user` is deliberately unused:
-- inside a definer function it is the owner, which would make this true for
-- everyone and silently disable all three guards below.
create or replace function app.is_privileged_session()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select
    app.is_admin()
    or exists (
      select 1 from pg_roles
       where rolname = coalesce(nullif(current_setting('role', true), 'none'), session_user)
         and (rolbypassrls or rolsuper)
    );
$$;

comment on function app.is_privileged_session() is
  'True for infrastructure sessions (any role with BYPASSRLS/SUPERUSER) and for platform admins. Gates the User.role / Dealer.status / Dealer.gstVerified guard triggers.';

revoke all on function
  app.current_user_id(), app.current_role(), app.is_admin(),
  app.current_dealer_id(), app.dealer_can_write(), app.in_conversation(text),
  app.is_privileged_session()
from public;

grant execute on function
  app.current_user_id(), app.current_role(), app.is_admin(),
  app.current_dealer_id(), app.dealer_can_write(), app.in_conversation(text),
  app.is_privileged_session()
to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 9. Privilege-escalation guard triggers
--
-- RLS grants or denies whole ROWS; it cannot protect individual COLUMNS.
-- A policy letting users update their own User row therefore also lets them
-- write their own `role` — vertical escalation in one UPDATE. Column-level
-- GRANTs could express this but require enumerating every writable column,
-- so a column added later would silently become unwritable. Triggers state
-- the rule directly instead.
-- ---------------------------------------------------------------------

create or replace function app.guard_user_role_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new."role" is distinct from old."role" and not app.is_privileged_session() then
    raise exception 'Not authorised to change User.role' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_user_role_change on public."User";
create trigger guard_user_role_change
  before update on public."User"
  for each row execute function app.guard_user_role_change();

create or replace function app.guard_dealer_status_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new."status" is distinct from old."status" and not app.is_privileged_session() then
    raise exception 'Not authorised to change Dealer.status' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_dealer_status_change on public."Dealer";
create trigger guard_dealer_status_change
  before update on public."Dealer"
  for each row execute function app.guard_dealer_status_change();

-- gstVerified is set only by the verified-GSTIN flow, which runs with the
-- service role. Without this a dealer could award themselves the badge.
create or replace function app.guard_dealer_verification_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new."gstVerified" is distinct from old."gstVerified" and not app.is_privileged_session() then
    raise exception 'Not authorised to change Dealer.gstVerified' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_dealer_verification_change on public."Dealer";
create trigger guard_dealer_verification_change
  before update on public."Dealer"
  for each row execute function app.guard_dealer_verification_change();


-- ---------------------------------------------------------------------
-- 10. auth.users <-> public."User" sync
--
-- New sign-ups land in auth.users first; this creates the matching profile
-- so the helpers above resolve immediately rather than on next login.
--
-- Role always defaults to BUYER and is NOT read from sign-up metadata:
-- that payload is client-supplied, and honouring it would let anyone
-- register as an ADMIN.
-- ---------------------------------------------------------------------

create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  existing_id text;
begin
  -- An existing account being linked: match on email and adopt the row
  -- rather than creating a duplicate.
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

  insert into public."User" ("authId", "email", "name", "role", "emailVerified")
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    'BUYER',
    new.email_confirmed_at
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_auth_user();

create or replace function app.handle_auth_user_updated()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  update public."User"
     set "emailVerified" = new.email_confirmed_at,
         "email"         = new.email
   where "authId" = new.id;
  return new;
end $$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function app.handle_auth_user_updated();


-- ---------------------------------------------------------------------
-- 11. Public projections
--
-- Public pages show an author's display name and a dealer's shopfront
-- details. Granting anon SELECT on the underlying rows would also expose
-- email, phone and gstin — RLS filters rows, not columns. These views
-- expose the safe subset instead.
--
-- They run with definer rights (the default), so they see past the base
-- tables' policies. That is safe precisely because the column list is fixed
-- here and contains nothing private.
-- ---------------------------------------------------------------------

create or replace view public.user_public as
  select u."id", u."name" from public."User" u;

comment on view public.user_public is
  'Display-safe projection of User. The only User data anon may read.';

create or replace view public.dealer_public as
  select d."id", d."businessName", d."city", d."phone", d."whatsapp",
         d."gstVerified", d."status", d."createdAt"
    from public."Dealer" d
   where d."status" = 'ACTIVE';

comment on view public.dealer_public is
  'Shopfront projection of Dealer. Excludes gstin and the owning userId.';


-- ---------------------------------------------------------------------
-- 12. RPCs the application calls
--
-- These exist because PostgREST has no GROUP BY and no read-modify-write.
-- They are SECURITY INVOKER (the default) on purpose: RLS still applies to
-- the tables they read, so the same function is safe from a user session
-- and complete from the service role.
-- ---------------------------------------------------------------------

-- Records a view and bumps the counter in one statement. The unique index
-- on (listingId, visitorId) makes the insert a no-op for a repeat visitor,
-- and the counter only moves when a row was actually inserted — so this
-- cannot double-count under concurrency the way read-then-write could.
create or replace function public.record_listing_view(
  p_listing_id text,
  p_visitor_id text
) returns boolean
language plpgsql
as $$
declare
  inserted boolean := false;
begin
  insert into public."ListingView" ("listingId", "visitorId")
  values (p_listing_id, p_visitor_id)
  on conflict ("listingId", "visitorId") do nothing;

  get diagnostics inserted = row_count;

  if inserted then
    update public."Listing"
       set "viewCount" = "viewCount" + 1
     where "id" = p_listing_id;
  end if;

  return inserted;
end $$;

create or replace function public.increment_enquiry_count(p_listing_id text)
returns void
language sql
as $$
  update public."Listing"
     set "enquiryCount" = "enquiryCount" + 1
   where "id" = p_listing_id;
$$;

-- Unread counts per conversation for one reader. Replaces a groupBy that
-- would otherwise mean pulling every unread message into the app.
create or replace function public.unread_message_counts(
  p_conversation_ids text[],
  p_user_id text
) returns table ("conversationId" text, "count" bigint)
language sql stable
as $$
  select m."conversationId", count(*)::bigint
    from public."Message" m
   where m."conversationId" = any(p_conversation_ids)
     and m."senderId" <> p_user_id
     and m."readAt" is null
   group by m."conversationId";
$$;

create or replace function public.distinct_listing_cities()
returns table ("city" text)
language sql stable
as $$
  select distinct l."city"
    from public."Listing" l
   where l."status" = 'ACTIVE' and l."city" <> ''
   order by 1;
$$;

-- Dealer analytics. Each returns one json document so the dashboard makes
-- a single round trip instead of the fourteen Promise.all queries the
-- Prisma version issued.

create or replace function public.dealer_overview_metrics(
  p_dealer_id text,
  p_days integer
) returns json
language sql stable
as $$
  with bounds as (
    select now() - make_interval(days => p_days)     as cur_from,
           now() - make_interval(days => p_days * 2) as prev_from
  )
  select json_build_object(
    'totalListings',  (select count(*) from public."Listing" where "dealerId" = p_dealer_id),
    'activeListings', (select count(*) from public."Listing" where "dealerId" = p_dealer_id and "status" = 'ACTIVE'),
    'soldListings',   (select count(*) from public."Listing" where "dealerId" = p_dealer_id and "status" = 'SOLD'),
    'pausedListings', (select count(*) from public."Listing" where "dealerId" = p_dealer_id and "status" = 'PAUSED'),
    'newCur',   (select count(*) from public."Listing", bounds where "dealerId" = p_dealer_id and "createdAt" >= cur_from),
    'newPrev',  (select count(*) from public."Listing", bounds where "dealerId" = p_dealer_id and "createdAt" >= prev_from and "createdAt" < cur_from),
    'leadsCur', (select count(*) from public."Enquiry", bounds where "dealerId" = p_dealer_id and "createdAt" >= cur_from),
    'leadsPrev',(select count(*) from public."Enquiry", bounds where "dealerId" = p_dealer_id and "createdAt" >= prev_from and "createdAt" < cur_from),
    'viewsCur', (select count(*) from public."ListingView" v join public."Listing" l on l."id" = v."listingId", bounds
                  where l."dealerId" = p_dealer_id and v."createdAt" >= cur_from),
    'viewsPrev',(select count(*) from public."ListingView" v join public."Listing" l on l."id" = v."listingId", bounds
                  where l."dealerId" = p_dealer_id and v."createdAt" >= prev_from and v."createdAt" < cur_from),
    'uvCur',    (select count(distinct v."visitorId") from public."ListingView" v join public."Listing" l on l."id" = v."listingId", bounds
                  where l."dealerId" = p_dealer_id and v."createdAt" >= cur_from),
    'uvPrev',   (select count(distinct v."visitorId") from public."ListingView" v join public."Listing" l on l."id" = v."listingId", bounds
                  where l."dealerId" = p_dealer_id and v."createdAt" >= prev_from and v."createdAt" < cur_from),
    'wlCur',    (select count(*) from public."SavedListing" s join public."Listing" l on l."id" = s."listingId", bounds
                  where l."dealerId" = p_dealer_id and s."createdAt" >= cur_from),
    'wlPrev',   (select count(*) from public."SavedListing" s join public."Listing" l on l."id" = s."listingId", bounds
                  where l."dealerId" = p_dealer_id and s."createdAt" >= prev_from and s."createdAt" < cur_from)
  );
$$;

create or replace function public.dealer_inventory_breakdown(p_dealer_id text)
returns json
language sql stable
as $$
  select json_build_object(
    'byStatus', coalesce((
      select json_agg(json_build_object('label', "status", 'count', c) order by c desc)
        from (select "status", count(*) c from public."Listing"
               where "dealerId" = p_dealer_id group by "status") s), '[]'::json),
    'byVehicleType', coalesce((
      select json_agg(json_build_object('label', "vehicleType", 'count', c) order by c desc)
        from (select "vehicleType", count(*) c from public."Listing"
               where "dealerId" = p_dealer_id group by "vehicleType") s), '[]'::json),
    'byFuelType', coalesce((
      select json_agg(json_build_object('label', "fuelType", 'count', c) order by c desc)
        from (select "fuelType", count(*) c from public."Listing"
               where "dealerId" = p_dealer_id group by "fuelType") s), '[]'::json),
    'byMake', coalesce((
      select json_agg(json_build_object('label', "make", 'count', c) order by c desc)
        from (select "make", count(*) c from public."Listing"
               where "dealerId" = p_dealer_id group by "make"
               order by c desc limit 8) s), '[]'::json)
  );
$$;

create or replace function public.dealer_lead_analytics(
  p_dealer_id text,
  p_days integer
) returns json
language sql stable
as $$
  with since as (select now() - make_interval(days => p_days) as t)
  select json_build_object(
    'bySource', coalesce((
      select json_agg(json_build_object('source', "source", 'count', c) order by c desc)
        from (select "source", count(*) c from public."Enquiry", since
               where "dealerId" = p_dealer_id and "createdAt" >= since.t
               group by "source") s), '[]'::json),
    'contacted', (select count(*) from public."Enquiry", since
                   where "dealerId" = p_dealer_id and "createdAt" >= since.t and "isContacted"),
    'unread',    (select count(*) from public."Enquiry", since
                   where "dealerId" = p_dealer_id and "createdAt" >= since.t and not "isRead"),
    'hot',       (select count(*) from public."Enquiry", since
                   where "dealerId" = p_dealer_id and "createdAt" >= since.t and "priority" >= 50),
    'total',     (select count(*) from public."Enquiry", since
                   where "dealerId" = p_dealer_id and "createdAt" >= since.t)
  );
$$;

-- One row per day for the whole window, zero-filled — generate_series is
-- why the gaps are present, which the application otherwise had to invent.
create or replace function public.dealer_traffic_series(
  p_dealer_id text,
  p_days integer
) returns json
language sql stable
as $$
  with days as (
    select (current_date - offs)::date as d
      from generate_series(0, greatest(p_days - 1, 0)) as offs
  ),
  v as (
    select (vw."createdAt" at time zone 'UTC')::date as d, count(*) c
      from public."ListingView" vw
      join public."Listing" l on l."id" = vw."listingId"
     where l."dealerId" = p_dealer_id
       and vw."createdAt" >= now() - make_interval(days => p_days)
     group by 1
  ),
  e as (
    select (en."createdAt" at time zone 'UTC')::date as d, count(*) c
      from public."Enquiry" en
     where en."dealerId" = p_dealer_id
       and en."createdAt" >= now() - make_interval(days => p_days)
     group by 1
  )
  select coalesce(json_agg(json_build_object(
           'date',  to_char(days.d, 'YYYY-MM-DD'),
           'views', coalesce(v.c, 0),
           'leads', coalesce(e.c, 0)
         ) order by days.d), '[]'::json)
    from days
    left join v on v.d = days.d
    left join e on e.d = days.d;
$$;


-- ---------------------------------------------------------------------
-- 13. Grants
--
-- Supabase's convention: grant table privileges broadly and let RLS do the
-- filtering. That is only safe because RLS is enabled AND forced below on
-- every table.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant select on public.user_public, public.dealer_public to anon, authenticated;

grant execute on function
  public.record_listing_view(text, text),
  public.increment_enquiry_count(text),
  public.unread_message_counts(text[], text),
  public.distinct_listing_cities(),
  public.dealer_overview_metrics(text, integer),
  public.dealer_inventory_breakdown(text),
  public.dealer_lead_analytics(text, integer),
  public.dealer_traffic_series(text, integer)
to anon, authenticated, service_role;

-- Secrets that no client should read on tables they can otherwise select.
-- RLS filters rows; only column grants filter columns.
revoke select ("passwordHash") on public."User" from anon, authenticated;
revoke select ("key", "keyHash") on public."ApiKey" from anon, authenticated;


-- ---------------------------------------------------------------------
-- 14. Row Level Security
--
-- Two rules govern everything below:
--   1. Deny by default. RLS is enabled AND FORCED on every table in
--      `public`, so a table with no policy for an operation refuses it and
--      a newly added table is closed until someone opens it deliberately.
--      FORCE matters: without it the table owner silently bypasses every
--      policy and the whole model is decorative.
--   2. Scope comes from the session. Every predicate resolves through
--      app.current_user_id() / app.current_dealer_id(), which derive from
--      auth.uid(). A client-supplied id is only ever compared against
--      those, never trusted on its own.
--
-- `service_role` has BYPASSRLS and is exempt from all of it. It is for
-- webhooks, migrations and background jobs; its key must never reach a
-- browser.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Re-running this file must not fail on policies that already exist.
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- --- Identity ---------------------------------------------------------

create policy "user_select_self_or_admin" on public."User"
  for select to authenticated
  using ("id" = (select app.current_user_id()) or (select app.is_admin()));

-- `role` is additionally protected by a trigger: a row-level policy cannot
-- stop a user rewriting their own role within an allowed row.
create policy "user_update_self" on public."User"
  for update to authenticated
  using ("id" = (select app.current_user_id()) or (select app.is_admin()))
  with check ("id" = (select app.current_user_id()) or (select app.is_admin()));

create policy "user_delete_admin" on public."User"
  for delete to authenticated
  using ((select app.is_admin()));

-- No INSERT policy: profile rows come from the auth.users trigger, which
-- runs as definer. Clients cannot mint users.

-- --- Dealers and storefronts -----------------------------------------

create policy "dealer_select_own_or_admin" on public."Dealer"
  for select to authenticated
  using ("id" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "dealer_update_own" on public."Dealer"
  for update to authenticated
  using ("id" = (select app.current_dealer_id()) or (select app.is_admin()))
  with check ("id" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "dealer_delete_admin" on public."Dealer"
  for delete to authenticated
  using ((select app.is_admin()));

create policy "store_select_all" on public."Store"
  for select to anon, authenticated using (true);

create policy "store_write_own" on public."Store"
  for all to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  with check (
    ((select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin())
  );

-- --- Inventory --------------------------------------------------------
--
-- A buyer sees ACTIVE listings only; a dealer sees every status of their
-- own. This is the rule the /api/listings BOLA fix encoded in application
-- code — it now holds for any query that reaches the table.

create policy "listing_select_active" on public."Listing"
  for select to anon, authenticated using ("status" = 'ACTIVE');

create policy "listing_select_own_or_admin" on public."Listing"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "listing_insert_own" on public."Listing"
  for insert to authenticated
  with check ((select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id()));

create policy "listing_update_own" on public."Listing"
  for update to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  -- WITH CHECK on the post-image prevents moving a row to another dealer.
  with check (
    ((select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin())
  );

create policy "listing_delete_own" on public."Listing"
  for delete to authenticated
  using (
    ((select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin())
  );

create policy "listing_photo_select" on public."ListingPhoto"
  for select to anon, authenticated
  using (exists (select 1 from public."Listing" l where l."id" = "listingId"));

create policy "listing_photo_write_own" on public."ListingPhoto"
  for all to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))))
  with check (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and l."dealerId" = (select app.current_dealer_id())
       and (select app.dealer_can_write())));

create policy "listing_360_select" on public."Listing360Photo"
  for select to anon, authenticated
  using (exists (select 1 from public."Listing" l where l."id" = "listingId"));

create policy "listing_360_write_own" on public."Listing360Photo"
  for all to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))))
  with check (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and l."dealerId" = (select app.current_dealer_id())
       and (select app.dealer_can_write())));

-- Anyone may record a view; only the owning dealer may read the traffic,
-- which is commercially sensitive.
create policy "listing_view_insert_any" on public."ListingView"
  for insert to anon, authenticated with check (true);

create policy "listing_view_select_own" on public."ListingView"
  for select to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))));

-- --- Buyer engagement -------------------------------------------------

create policy "enquiry_select_party" on public."Enquiry"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  );

-- The public enquiry form posts without a session, so anon may insert. The
-- WITH CHECK pins dealerId to the listing's real owner: without it a caller
-- could file enquiries into any dealer's inbox, and a buyerId could be
-- forged onto someone else's account.
create policy "enquiry_insert_public" on public."Enquiry"
  for insert to anon, authenticated
  with check (
    exists (
      select 1 from public."Listing" l
       where l."id" = "listingId"
         and l."status" = 'ACTIVE'
         and l."dealerId" = "Enquiry"."dealerId")
    and ("buyerId" is null or "buyerId" = (select app.current_user_id()))
  );

create policy "enquiry_update_party" on public."Enquiry"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()))
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()));

create policy "testdrive_select_party" on public."TestDrive"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()));

create policy "testdrive_insert_self" on public."TestDrive"
  for insert to authenticated
  with check (
    "buyerId" = (select app.current_user_id())
    and exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = "TestDrive"."dealerId"));

create policy "testdrive_update_party" on public."TestDrive"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()))
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()));

create policy "saved_listing_own" on public."SavedListing"
  for all to authenticated
  using ("userId" = (select app.current_user_id()))
  with check ("userId" = (select app.current_user_id()));

create policy "loan_select_party" on public."LoanApplication"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin()));

create policy "loan_insert_self" on public."LoanApplication"
  for insert to authenticated
  with check ("buyerId" = (select app.current_user_id()));

-- Only the dealer selling the vehicle decides a loan's outcome.
create policy "loan_update_dealer" on public."LoanApplication"
  for update to authenticated
  using (
    exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin()))
  with check (
    exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin()));

-- --- Messaging --------------------------------------------------------

create policy "conversation_select_party" on public."Conversation"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin()));

create policy "conversation_insert_buyer" on public."Conversation"
  for insert to authenticated
  with check (
    "buyerId" = (select app.current_user_id())
    and exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = "Conversation"."dealerId"));

create policy "conversation_update_party" on public."Conversation"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id()))
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id()));

create policy "message_select_party" on public."Message"
  for select to authenticated
  using ((select app.in_conversation("conversationId")) or (select app.is_admin()));

-- senderId is pinned to the session, so a message cannot be attributed to
-- another participant.
create policy "message_insert_party" on public."Message"
  for insert to authenticated
  with check (
    (select app.in_conversation("conversationId"))
    and "senderId" = (select app.current_user_id()));

-- Update exists only to stamp readAt on the recipient's side.
create policy "message_update_party" on public."Message"
  for update to authenticated
  using ((select app.in_conversation("conversationId")))
  with check ((select app.in_conversation("conversationId")));

-- --- RC transfer ------------------------------------------------------

create policy "rctransfer_select_party" on public."RCTransfer"
  for select to authenticated
  using (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin()));

create policy "rctransfer_insert_seller" on public."RCTransfer"
  for insert to authenticated
  with check ("sellerId" = (select app.current_user_id()));

create policy "rctransfer_update_party" on public."RCTransfer"
  for update to authenticated
  using (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin()))
  with check (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin()));

create policy "rcdocument_party" on public."RCDocument"
  for all to authenticated
  using (exists (
    select 1 from public."RCTransfer" t
     where t."id" = "transferId"
       and (t."sellerId" = (select app.current_user_id())
            or t."buyerId" = (select app.current_user_id())
            or (select app.is_admin()))))
  with check (exists (
    select 1 from public."RCTransfer" t
     where t."id" = "transferId"
       and (t."sellerId" = (select app.current_user_id())
            or t."buyerId" = (select app.current_user_id()))));

-- --- Inspections ------------------------------------------------------

create policy "inspector_select_self_or_admin" on public."Inspector"
  for select to authenticated
  using ("userId" = (select app.current_user_id()) or (select app.is_admin()));

create policy "inspector_apply_self" on public."Inspector"
  for insert to authenticated
  with check ("userId" = (select app.current_user_id()));

-- Approval is an admin decision; an applicant must not approve themselves.
create policy "inspector_update_admin" on public."Inspector"
  for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- A completed report is a public trust signal on the vehicle page.
create policy "inspection_select_completed" on public."Inspection"
  for select to anon, authenticated using ("status" = 'COMPLETED');

create policy "inspection_select_party" on public."Inspection"
  for select to authenticated
  using (
    "dealerId" = (select app.current_dealer_id())
    or exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId" and i."userId" = (select app.current_user_id()))
    or (select app.is_admin()));

create policy "inspection_request_dealer" on public."Inspection"
  for insert to authenticated
  with check ("dealerId" = (select app.current_dealer_id()) and (select app.dealer_can_write()));

-- Only the assigned inspector may file the report.
create policy "inspection_update_assigned" on public."Inspection"
  for update to authenticated
  using (
    exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId"
         and i."userId" = (select app.current_user_id())
         and i."status" = 'APPROVED')
    or (select app.is_admin()))
  with check (
    exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId"
         and i."userId" = (select app.current_user_id())
         and i."status" = 'APPROVED')
    or (select app.is_admin()));

-- --- Community --------------------------------------------------------
--
-- The buyer forum is public. The dealer forum is not — reading it requires
-- an active dealer account or admin.

create policy "post_select_buyer_forum" on public."Post"
  for select to anon, authenticated using ("community" = 'BUYER');

create policy "post_select_dealer_forum" on public."Post"
  for select to authenticated
  using ("community" = 'DEALER'
         and ((select app.current_dealer_id()) is not null or (select app.is_admin())));

create policy "post_insert_author" on public."Post"
  for insert to authenticated
  with check (
    "authorId" = (select app.current_user_id())
    and ("community" = 'BUYER' or (select app.current_dealer_id()) is not null));

create policy "post_update_author_or_admin" on public."Post"
  for update to authenticated
  using ("authorId" = (select app.current_user_id()) or (select app.is_admin()))
  with check ("authorId" = (select app.current_user_id()) or (select app.is_admin()));

create policy "post_delete_admin" on public."Post"
  for delete to authenticated using ((select app.is_admin()));

create policy "reply_select_visible_post" on public."Reply"
  for select to anon, authenticated
  using (exists (select 1 from public."Post" p where p."id" = "postId"));

create policy "reply_insert_author" on public."Reply"
  for insert to authenticated
  with check (
    "authorId" = (select app.current_user_id())
    and exists (
      select 1 from public."Post" p
       where p."id" = "postId"
         and p."isLocked" = false
         and (p."community" = 'BUYER' or (select app.current_dealer_id()) is not null)));

create policy "reply_delete_author_or_admin" on public."Reply"
  for delete to authenticated
  using ("authorId" = (select app.current_user_id()) or (select app.is_admin()));

create policy "upvote_select_visible_post" on public."PostUpvote"
  for select to anon, authenticated
  using (exists (select 1 from public."Post" p where p."id" = "postId"));

create policy "upvote_own" on public."PostUpvote"
  for all to authenticated
  using ("userId" = (select app.current_user_id()))
  with check (
    "userId" = (select app.current_user_id())
    and exists (
      select 1 from public."Post" p
       where p."id" = "postId"
         and (p."community" = 'BUYER' or (select app.current_dealer_id()) is not null)));

-- --- Commercial -------------------------------------------------------
--
-- API keys, payouts, subscriptions and payments are dealer-private. Writes
-- that involve money are service_role only: the Razorpay webhooks and the
-- verified-payment path run there, so no client policy exists.

create policy "apikey_select_own" on public."ApiKey"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "apikey_insert_own" on public."ApiKey"
  for insert to authenticated
  with check ("dealerId" = (select app.current_dealer_id()) and (select app.dealer_can_write()));

create policy "apikey_delete_own" on public."ApiKey"
  for delete to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payout_select_own" on public."Payout"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payout_write_admin" on public."Payout"
  for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy "subscription_select_own" on public."Subscription"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payment_select_own" on public."Payment"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "template_admin_only" on public."NotificationTemplate"
  for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- Account / Session / VerificationToken deliberately get no policies. With
-- RLS forced they are unreachable by anon and authenticated, which is the
-- desired state: only the server (service_role) touches them, and only if
-- an OAuth provider is ever added.
