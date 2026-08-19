"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db, DbError, unwrap, unwrapMaybe } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { scoreLead } from "@/lib/lead-priority";
import { sendLeadNotification } from "@/lib/email";
import { dispatchNotification } from "@/lib/notifications";
import { appUrl } from "@/lib/json-ld";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** First photo by sortOrder — PostgREST cannot order an embed per parent row. */
function firstPhoto<T extends { sortOrder: number }>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1);
}

const LISTING_CARD = "listing:Listing(id, make, model, year, photos:ListingPhoto(id, url, sortOrder))";

/**
 * Finds the buyer's conversation on a listing, creating it if absent.
 *
 * The unique index on (listingId, buyerId) decides: two concurrent first
 * messages both read "no conversation", and the upsert makes the loser adopt
 * the winner's row instead of failing.
 */
async function ensureConversation(
  listingId: string,
  buyerId: string,
  dealerId: string,
): Promise<{ id: string }> {
  const { data, error } = await db
    .from("Conversation")
    .upsert({ listingId, buyerId, dealerId }, { onConflict: "listingId,buyerId" })
    .select("id")
    .single();
  if (error) throw new DbError(error, "ensureConversation");
  return data;
}

// Every logged-in-buyer enquiry gets both an Enquiry row (feeds the dealer's
// Leads/CRM inbox — status, priority, WhatsApp/call actions) and a
// Conversation + first Message (the actual back-and-forth chat thread, keyed
// by the unique (listingId, buyerId) index). Anonymous leads from /api/leads
// have no buyerId and therefore no conversation — dealers fall back to
// WhatsApp/phone for those, same as before this feature.
export async function createEnquiry(
  listingId: string,
  message: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "You must be logged in to send an enquiry." };
  }

  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a message for the dealer." };
  }

  const listingRow = unwrapMaybe(
    await db
      .from("Listing")
      .select("*, dealer:Dealer(*, user:User(email))")
      .eq("id", listingId)
      .maybeSingle(),
    "createEnquiry: listing",
  );
  if (!listingRow || listingRow.status !== "ACTIVE") {
    return { ok: false, error: "This listing is not available." };
  }
  const dealer = listingRow.dealer;
  const dealerUser = dealer.user;
  if (dealer.userId === session.user.id) {
    return { ok: false, error: "You can't enquire about your own listing." };
  }

  const buyer = unwrapMaybe(
    await db
      .from("User")
      .select("name, email, phone")
      .eq("id", session.user.id)
      .maybeSingle(),
    "createEnquiry: buyer",
  );

  const priority = scoreLead({
    hasMessage: true,
    messageLength: trimmed.length,
    hasEmail: Boolean(buyer?.email),
    isAuthenticated: true,
    phoneLooksValid: (buyer?.phone?.length ?? 0) >= 10,
  });

  const enquiry = unwrap(
    await db
      .from("Enquiry")
      .insert({
        listingId: listingRow.id,
        dealerId: listingRow.dealerId,
        buyerId: session.user.id,
        buyerName: buyer?.name ?? "Buyer",
        buyerPhone: buyer?.phone ?? "",
        buyerEmail: buyer?.email ?? null,
        message: trimmed,
        source: "FORM",
        priority,
      })
      .select("id")
      .single(),
    "createEnquiry",
  );

  // Read-modify-write on a counter is a lost-update race over HTTP, so the
  // increment happens in the database (see supabase/schema.sql).
  const { error: countError } = await db.rpc("increment_enquiry_count", {
    p_listing_id: listingRow.id,
  });
  if (countError) console.error("[createEnquiry] enquiryCount increment failed:", countError);

  const conversation = await ensureConversation(
    listingId,
    session.user.id,
    listingRow.dealerId,
  );

  // The Message insert trigger stamps Conversation.lastMessageAt, so the
  // chat-list ordering no longer depends on the caller remembering to.
  unwrap(
    await db
      .from("Message")
      .insert({
        conversationId: conversation.id,
        senderId: session.user.id,
        body: trimmed,
      })
      .select("id")
      .single(),
    "createEnquiry: message",
  );

  const vehicle = `${listingRow.year} ${listingRow.make} ${listingRow.model}`;
  const dashboardUrl = appUrl(`/dashboard/leads/${enquiry.id}`);

  if (dealerUser?.email) {
    await sendLeadNotification({
      to: dealerUser.email,
      dealerName: dealer.businessName,
      vehicle,
      buyerName: buyer?.name ?? "Buyer",
      buyerPhone: buyer?.phone ?? "",
      buyerEmail: buyer?.email ?? null,
      message: trimmed,
      dashboardUrl,
    }).catch((err: unknown) => {
      console.error("[createEnquiry] sendLeadNotification failed:", err);
    });
  }
  await dispatchNotification({
    toPhone: dealer.phone,
    subject: `New enquiry — ${vehicle}`,
    body: `${buyer?.name ?? "A buyer"} enquired about your ${vehicle}. View: ${dashboardUrl}`,
    type: "ENQUIRY_RECEIVED",
  }).catch((err: unknown) => {
    console.error("[createEnquiry] dispatchNotification failed:", err);
  });

  revalidatePath("/dashboard/leads");
  return { ok: true };
}

// Dealer's reply from the full-conversation view. Keeps Enquiry.status in
// sync with the underlying chat so the Leads list badge (New/Replied/Closed)
// reflects actual activity without a separate read of Message rows.
export async function replyToEnquiry(
  enquiryId: string,
  body: string,
): Promise<ActionResult> {
  const { dealer } = await requireDealer({ write: true });

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message can't be empty." };

  const enquiry = unwrapMaybe(
    await db
      .from("Enquiry")
      .select("*")
      .eq("id", enquiryId)
      .eq("dealerId", dealer.id)
      .maybeSingle(),
    "replyToEnquiry lookup",
  );
  if (!enquiry) return { ok: false, error: "Enquiry not found." };
  if (!enquiry.buyerId) {
    return {
      ok: false,
      error: "This buyer didn't create an account — use WhatsApp or phone instead.",
    };
  }

  const conversation = unwrapMaybe(
    await db
      .from("Conversation")
      .select("id")
      .eq("listingId", enquiry.listingId)
      .eq("buyerId", enquiry.buyerId)
      .maybeSingle(),
    "replyToEnquiry: conversation",
  );
  if (!conversation) return { ok: false, error: "No conversation found for this enquiry." };

  unwrap(
    await db
      .from("Message")
      .insert({ conversationId: conversation.id, senderId: dealer.userId, body: trimmed })
      .select("id")
      .single(),
    "replyToEnquiry: message",
  );
  unwrap(
    await db
      .from("Enquiry")
      .update({ status: "REPLIED", isRead: true, isContacted: true })
      .eq("id", enquiry.id)
      .select("id"),
    "replyToEnquiry: status",
  );

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${enquiry.id}`);
  revalidatePath("/my-enquiries");
  revalidatePath(`/my-enquiries/${enquiry.id}`);
  return { ok: true };
}

export async function closeEnquiry(enquiryId: string): Promise<ActionResult> {
  const { dealer } = await requireDealer({ write: true });

  const updated = unwrap(
    await db
      .from("Enquiry")
      .update({ status: "CLOSED", isRead: true })
      .eq("id", enquiryId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "closeEnquiry",
  );
  if (updated.length === 0) return { ok: false, error: "Enquiry not found." };

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${enquiryId}`);
  return { ok: true };
}

// Buyer's follow-up from /my-enquiries. Reopens the enquiry (status back to
// OPEN, isRead false) so it resurfaces for the dealer as needing attention.
export async function replyToEnquiryAsBuyer(
  enquiryId: string,
  body: string,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "You must be logged in." };

  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Message can't be empty." };

  const enquiry = unwrapMaybe(
    await db
      .from("Enquiry")
      .select("*")
      .eq("id", enquiryId)
      .eq("buyerId", session.user.id)
      .maybeSingle(),
    "replyToEnquiryAsBuyer lookup",
  );
  if (!enquiry) return { ok: false, error: "Enquiry not found." };

  const conversation = unwrapMaybe(
    await db
      .from("Conversation")
      .select("id")
      .eq("listingId", enquiry.listingId)
      .eq("buyerId", session.user.id)
      .maybeSingle(),
    "replyToEnquiryAsBuyer: conversation",
  );
  if (!conversation) return { ok: false, error: "No conversation found for this enquiry." };

  unwrap(
    await db
      .from("Message")
      .insert({
        conversationId: conversation.id,
        senderId: session.user.id,
        body: trimmed,
      })
      .select("id")
      .single(),
    "replyToEnquiryAsBuyer: message",
  );
  unwrap(
    await db
      .from("Enquiry")
      .update({ status: "OPEN", isRead: false })
      .eq("id", enquiry.id)
      .select("id"),
    "replyToEnquiryAsBuyer: status",
  );

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${enquiry.id}`);
  revalidatePath("/my-enquiries");
  revalidatePath(`/my-enquiries/${enquiry.id}`);
  return { ok: true };
}

export async function getEnquiriesForDealer() {
  const { dealer } = await requireDealer();
  const rows = unwrap(
    await db
      .from("Enquiry")
      .select(`*, ${LISTING_CARD}, buyer:User(id, name)`)
      .eq("dealerId", dealer.id)
      .order("isRead", { ascending: true })
      .order("updatedAt", { ascending: false }),
    "getEnquiriesForDealer",
  );

  return rows.map((e) => ({
    ...e,
    listing: { ...e.listing, photos: firstPhoto(e.listing.photos) },
  }));
}

export async function getEnquiriesForBuyer() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = unwrap(
    await db
      .from("Enquiry")
      .select(`*, ${LISTING_CARD}, dealer:Dealer(businessName)`)
      .eq("buyerId", session.user.id)
      .order("updatedAt", { ascending: false }),
    "getEnquiriesForBuyer",
  );

  return rows.map((e) => ({
    ...e,
    listing: { ...e.listing, photos: firstPhoto(e.listing.photos) },
  }));
}
