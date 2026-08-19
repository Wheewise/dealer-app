-- =====================================================================
-- 0002 — Row Level Security: enable, grant, and define every policy
--
-- With RLS as the primary authorization gate, this file *is* the permission
-- matrix. Nothing outside it grants access.
--
-- Two rules govern everything below:
--   1. Deny by default. RLS is enabled AND forced on every table in `public`.
--      A table with no policy for an operation refuses that operation, so a
--      newly added table is closed until someone opens it deliberately.
--   2. Scope comes from the session. Every predicate resolves through
--      app.current_user_id() / app.current_dealer_id(), which derive from
--      auth.uid(). A client-supplied id is only ever compared against those,
--      never trusted on its own.
--
-- `service_role` has BYPASSRLS and is exempt from all of this. It is for
-- webhooks, migrations and background jobs. Its key must never reach a
-- browser.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Base privileges
--
-- Supabase's convention: grant table privileges broadly and let RLS do the
-- filtering. That is only safe because RLS is enabled and forced below on
-- every table — 0003_rls_verify.sql asserts that invariant rather than
-- trusting it.
-- ---------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Secrets that no client should read, on tables they can otherwise select.
-- RLS filters rows; only column grants filter columns.
revoke select ("passwordHash") on public."User" from anon, authenticated;
revoke select ("key", "keyHash") on public."ApiKey" from anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Enable + force RLS everywhere
--
-- FORCE matters: without it the table owner (which is what a pooled
-- application connection usually is) silently bypasses every policy, and
-- the whole model would be decorative.
-- ---------------------------------------------------------------------

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3. Public projections
--
-- Public pages show an author's display name and a dealer's shopfront
-- details. Granting anon SELECT on the underlying rows would also expose
-- email, phone and gstin — RLS cannot hide columns. These views expose the
-- safe subset instead.
--
-- They intentionally run with definer rights (the default), so they see
-- past the base tables' policies. That is safe precisely because the column
-- list is fixed here and contains nothing private.
-- ---------------------------------------------------------------------

create or replace view public.user_public as
  select u."id", u."name"
    from public."User" u;

comment on view public.user_public is
  'Display-safe projection of User. The only User data anon may read.';

create or replace view public.dealer_public as
  select d."id", d."businessName", d."city", d."phone", d."whatsapp",
         d."gstVerified", d."status", d."createdAt"
    from public."Dealer" d
   where d."status" = 'ACTIVE';

comment on view public.dealer_public is
  'Shopfront projection of Dealer. Excludes gstin and the owning userId.';

grant select on public.user_public, public.dealer_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Identity
-- ---------------------------------------------------------------------

create policy "user_select_self_or_admin" on public."User"
  for select to authenticated
  using ("id" = (select app.current_user_id()) or (select app.is_admin()));

-- The role column is additionally protected by a trigger (0001): a row-level
-- policy cannot stop a user rewriting their own role within an allowed row.
create policy "user_update_self" on public."User"
  for update to authenticated
  using ("id" = (select app.current_user_id()) or (select app.is_admin()))
  with check ("id" = (select app.current_user_id()) or (select app.is_admin()));

create policy "user_delete_admin" on public."User"
  for delete to authenticated
  using ((select app.is_admin()));

-- No INSERT policy: profile rows are created by the auth.users trigger,
-- which runs as definer. Clients cannot mint users.

-- ---------------------------------------------------------------------
-- 5. Dealers and storefronts
-- ---------------------------------------------------------------------

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

-- Store rows carry no secrets and back the public storefront.
create policy "store_select_all" on public."Store"
  for select to anon, authenticated
  using (true);

create policy "store_write_own" on public."Store"
  for all to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  with check (
    ((select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id()))
    or (select app.is_admin())
  );

-- ---------------------------------------------------------------------
-- 6. Inventory
--
-- A buyer sees ACTIVE listings only. A dealer sees every status of their
-- own. This is the rule the /api/listings BOLA fix encoded in application
-- code; it now also holds for any query that reaches the table.
-- ---------------------------------------------------------------------

create policy "listing_select_active" on public."Listing"
  for select to anon, authenticated
  using ("status" = 'ACTIVE');

create policy "listing_select_own_or_admin" on public."Listing"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "listing_insert_own" on public."Listing"
  for insert to authenticated
  with check (
    (select app.dealer_can_write()) and "dealerId" = (select app.current_dealer_id())
  );

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

-- Photos inherit their listing's visibility.
create policy "listing_photo_select" on public."ListingPhoto"
  for select to anon, authenticated
  using (exists (select 1 from public."Listing" l where l."id" = "listingId"));

create policy "listing_photo_write_own" on public."ListingPhoto"
  for all to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  ))
  with check (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and l."dealerId" = (select app.current_dealer_id())
       and (select app.dealer_can_write())
  ));

create policy "listing_360_select" on public."Listing360Photo"
  for select to anon, authenticated
  using (exists (select 1 from public."Listing" l where l."id" = "listingId"));

create policy "listing_360_write_own" on public."Listing360Photo"
  for all to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  ))
  with check (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and l."dealerId" = (select app.current_dealer_id())
       and (select app.dealer_can_write())
  ));

-- View counter: anyone may record a view, only the owning dealer may read
-- the traffic (it is commercially sensitive).
create policy "listing_view_insert_any" on public."ListingView"
  for insert to anon, authenticated
  with check (true);

create policy "listing_view_select_own" on public."ListingView"
  for select to authenticated
  using (exists (
    select 1 from public."Listing" l
     where l."id" = "listingId"
       and (l."dealerId" = (select app.current_dealer_id()) or (select app.is_admin()))
  ));

-- ---------------------------------------------------------------------
-- 7. Buyer engagement
-- ---------------------------------------------------------------------

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
         and l."dealerId" = "Enquiry"."dealerId"
    )
    and (
      "buyerId" is null
      or "buyerId" = (select app.current_user_id())
    )
  );

create policy "enquiry_update_party" on public."Enquiry"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  )
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  );

create policy "testdrive_select_party" on public."TestDrive"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  );

create policy "testdrive_insert_self" on public."TestDrive"
  for insert to authenticated
  with check (
    "buyerId" = (select app.current_user_id())
    and exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = "TestDrive"."dealerId"
    )
  );

create policy "testdrive_update_party" on public."TestDrive"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  )
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  );

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
       where l."id" = "listingId"
         and l."dealerId" = (select app.current_dealer_id())
    )
    or (select app.is_admin())
  );

create policy "loan_insert_self" on public."LoanApplication"
  for insert to authenticated
  with check ("buyerId" = (select app.current_user_id()));

-- Only the dealer selling the vehicle decides a loan's outcome.
create policy "loan_update_dealer" on public."LoanApplication"
  for update to authenticated
  using (
    exists (
      select 1 from public."Listing" l
       where l."id" = "listingId"
         and l."dealerId" = (select app.current_dealer_id())
    )
    or (select app.is_admin())
  )
  with check (
    exists (
      select 1 from public."Listing" l
       where l."id" = "listingId"
         and l."dealerId" = (select app.current_dealer_id())
    )
    or (select app.is_admin())
  );

-- ---------------------------------------------------------------------
-- 8. Messaging
-- ---------------------------------------------------------------------

create policy "conversation_select_party" on public."Conversation"
  for select to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
    or (select app.is_admin())
  );

create policy "conversation_insert_buyer" on public."Conversation"
  for insert to authenticated
  with check (
    "buyerId" = (select app.current_user_id())
    and exists (
      select 1 from public."Listing" l
       where l."id" = "listingId" and l."dealerId" = "Conversation"."dealerId"
    )
  );

create policy "conversation_update_party" on public."Conversation"
  for update to authenticated
  using (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
  )
  with check (
    "buyerId" = (select app.current_user_id())
    or "dealerId" = (select app.current_dealer_id())
  );

create policy "message_select_party" on public."Message"
  for select to authenticated
  using ((select app.in_conversation("conversationId")) or (select app.is_admin()));

-- senderId is pinned to the session, so a message cannot be attributed to
-- another participant.
create policy "message_insert_party" on public."Message"
  for insert to authenticated
  with check (
    (select app.in_conversation("conversationId"))
    and "senderId" = (select app.current_user_id())
  );

-- Update exists only to stamp readAt on the recipient's side.
create policy "message_update_party" on public."Message"
  for update to authenticated
  using ((select app.in_conversation("conversationId")))
  with check ((select app.in_conversation("conversationId")));

-- ---------------------------------------------------------------------
-- 9. RC transfer
-- ---------------------------------------------------------------------

create policy "rctransfer_select_party" on public."RCTransfer"
  for select to authenticated
  using (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin())
  );

create policy "rctransfer_insert_seller" on public."RCTransfer"
  for insert to authenticated
  with check ("sellerId" = (select app.current_user_id()));

create policy "rctransfer_update_party" on public."RCTransfer"
  for update to authenticated
  using (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin())
  )
  with check (
    "sellerId" = (select app.current_user_id())
    or "buyerId" = (select app.current_user_id())
    or (select app.is_admin())
  );

create policy "rcdocument_party" on public."RCDocument"
  for all to authenticated
  using (exists (
    select 1 from public."RCTransfer" t
     where t."id" = "transferId"
       and (t."sellerId" = (select app.current_user_id())
            or t."buyerId" = (select app.current_user_id())
            or (select app.is_admin()))
  ))
  with check (exists (
    select 1 from public."RCTransfer" t
     where t."id" = "transferId"
       and (t."sellerId" = (select app.current_user_id())
            or t."buyerId" = (select app.current_user_id()))
  ));

-- ---------------------------------------------------------------------
-- 10. Inspections
-- ---------------------------------------------------------------------

create policy "inspector_select_self_or_admin" on public."Inspector"
  for select to authenticated
  using ("userId" = (select app.current_user_id()) or (select app.is_admin()));

create policy "inspector_apply_self" on public."Inspector"
  for insert to authenticated
  with check ("userId" = (select app.current_user_id()));

-- Approval is an admin decision; an applicant must not approve themselves.
create policy "inspector_update_admin" on public."Inspector"
  for update to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

-- A completed report is a public trust signal shown on the vehicle page.
create policy "inspection_select_completed" on public."Inspection"
  for select to anon, authenticated
  using ("status" = 'COMPLETED');

create policy "inspection_select_party" on public."Inspection"
  for select to authenticated
  using (
    "dealerId" = (select app.current_dealer_id())
    or exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId" and i."userId" = (select app.current_user_id())
    )
    or (select app.is_admin())
  );

create policy "inspection_request_dealer" on public."Inspection"
  for insert to authenticated
  with check (
    "dealerId" = (select app.current_dealer_id()) and (select app.dealer_can_write())
  );

-- Only the assigned inspector may file the report — the flaw the application
-- fix closed, restated where it cannot be bypassed.
create policy "inspection_update_assigned" on public."Inspection"
  for update to authenticated
  using (
    exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId"
         and i."userId" = (select app.current_user_id())
         and i."status" = 'APPROVED'
    )
    or (select app.is_admin())
  )
  with check (
    exists (
      select 1 from public."Inspector" i
       where i."id" = "inspectorId"
         and i."userId" = (select app.current_user_id())
         and i."status" = 'APPROVED'
    )
    or (select app.is_admin())
  );

-- ---------------------------------------------------------------------
-- 11. Community
--
-- The buyer forum is public. The dealer forum is not — reading it requires
-- an active dealer account or admin.
-- ---------------------------------------------------------------------

create policy "post_select_buyer_forum" on public."Post"
  for select to anon, authenticated
  using ("community" = 'BUYER');

create policy "post_select_dealer_forum" on public."Post"
  for select to authenticated
  using (
    "community" = 'DEALER'
    and ((select app.current_dealer_id()) is not null or (select app.is_admin()))
  );

create policy "post_insert_author" on public."Post"
  for insert to authenticated
  with check (
    "authorId" = (select app.current_user_id())
    and (
      "community" = 'BUYER'
      or (select app.current_dealer_id()) is not null
    )
  );

create policy "post_update_author_or_admin" on public."Post"
  for update to authenticated
  using ("authorId" = (select app.current_user_id()) or (select app.is_admin()))
  with check ("authorId" = (select app.current_user_id()) or (select app.is_admin()));

create policy "post_delete_admin" on public."Post"
  for delete to authenticated
  using ((select app.is_admin()));

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
         and (p."community" = 'BUYER' or (select app.current_dealer_id()) is not null)
    )
  );

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
         and (p."community" = 'BUYER' or (select app.current_dealer_id()) is not null)
    )
  );

-- ---------------------------------------------------------------------
-- 12. Commercial
--
-- API keys, payouts, subscriptions and payments are dealer-private.
-- Writes that involve money are service_role only: the Razorpay webhooks
-- and the verified-payment path run there, so no client policy exists.
-- ---------------------------------------------------------------------

create policy "apikey_select_own" on public."ApiKey"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "apikey_insert_own" on public."ApiKey"
  for insert to authenticated
  with check (
    "dealerId" = (select app.current_dealer_id()) and (select app.dealer_can_write())
  );

create policy "apikey_delete_own" on public."ApiKey"
  for delete to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payout_select_own" on public."Payout"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payout_write_admin" on public."Payout"
  for all to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

create policy "subscription_select_own" on public."Subscription"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "payment_select_own" on public."Payment"
  for select to authenticated
  using ("dealerId" = (select app.current_dealer_id()) or (select app.is_admin()));

create policy "template_admin_only" on public."NotificationTemplate"
  for all to authenticated
  using ((select app.is_admin()))
  with check ((select app.is_admin()));

-- ---------------------------------------------------------------------
-- 13. Legacy NextAuth tables
--
-- Account / Session / VerificationToken belong to the NextAuth adapter and
-- are retired once Supabase Auth owns sessions. They get no policies at
-- all, so with RLS forced they are unreachable by anon and authenticated —
-- which is the desired end state. Drop them after the auth cutover.
-- ---------------------------------------------------------------------
