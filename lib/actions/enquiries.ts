"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { scoreLead } from "@/lib/lead-priority";
import { sendLeadNotification } from "@/lib/email";
import { dispatchNotification } from "@/lib/notifications";
import { appUrl } from "@/lib/json-ld";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Every logged-in-buyer enquiry gets both an Enquiry row (feeds the dealer's
// Leads/CRM inbox — status, priority, WhatsApp/call actions) and a
// Conversation + first Message (the actual back-and-forth chat thread, keyed
// by the existing @@unique([listingId, buyerId]) constraint). Anonymous leads
// from /api/leads have no buyerId and therefore no conversation — dealers
// fall back to WhatsApp/phone for those, same as before this feature.
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

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { dealer: { include: { user: true } } },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return { ok: false, error: "This listing is not available." };
  }
  if (listing.dealer.userId === session.user.id) {
    return { ok: false, error: "You can't enquire about your own listing." };
  }

  const buyer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, phone: true },
  });

  const priority = scoreLead({
    hasMessage: true,
    messageLength: trimmed.length,
    hasEmail: Boolean(buyer?.email),
    isAuthenticated: true,
    phoneLooksValid: (buyer?.phone?.length ?? 0) >= 10,
  });

  const enquiry = await prisma.enquiry.create({
    data: {
      listingId: listing.id,
      dealerId: listing.dealerId,
      buyerId: session.user.id,
      buyerName: buyer?.name ?? "Buyer",
      buyerPhone: buyer?.phone ?? "",
      buyerEmail: buyer?.email ?? null,
      message: trimmed,
      source: "FORM",
      priority,
    },
  });

  await prisma.listing.update({
    where: { id: listing.id },
    data: { enquiryCount: { increment: 1 } },
  });

  let conversation = await prisma.conversation.findUnique({
    where: { listingId_buyerId: { listingId, buyerId: session.user.id } },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { listingId, buyerId: session.user.id, dealerId: listing.dealerId },
    });
  }

  await prisma.message.create({
    data: { conversationId: conversation.id, senderId: session.user.id, body: trimmed },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  const vehicle = `${listing.year} ${listing.make} ${listing.model}`;
  const dashboardUrl = appUrl(`/dashboard/leads/${enquiry.id}`);

  if (listing.dealer.user.email) {
    await sendLeadNotification({
      to: listing.dealer.user.email,
      dealerName: listing.dealer.businessName,
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
    toPhone: listing.dealer.phone,
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

  const enquiry = await prisma.enquiry.findFirst({
    where: { id: enquiryId, dealerId: dealer.id },
  });
  if (!enquiry) return { ok: false, error: "Enquiry not found." };
  if (!enquiry.buyerId) {
    return {
      ok: false,
      error: "This buyer didn't create an account — use WhatsApp or phone instead.",
    };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { listingId_buyerId: { listingId: enquiry.listingId, buyerId: enquiry.buyerId } },
  });
  if (!conversation) return { ok: false, error: "No conversation found for this enquiry." };

  await prisma.message.create({
    data: { conversationId: conversation.id, senderId: dealer.userId, body: trimmed },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  await prisma.enquiry.update({
    where: { id: enquiry.id },
    data: { status: "REPLIED", isRead: true, isContacted: true },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${enquiry.id}`);
  revalidatePath("/my-enquiries");
  revalidatePath(`/my-enquiries/${enquiry.id}`);
  return { ok: true };
}

export async function closeEnquiry(enquiryId: string): Promise<ActionResult> {
  const { dealer } = await requireDealer({ write: true });
  const enquiry = await prisma.enquiry.findFirst({
    where: { id: enquiryId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!enquiry) return { ok: false, error: "Enquiry not found." };

  await prisma.enquiry.update({
    where: { id: enquiry.id },
    data: { status: "CLOSED", isRead: true },
  });
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

  const enquiry = await prisma.enquiry.findFirst({
    where: { id: enquiryId, buyerId: session.user.id },
  });
  if (!enquiry) return { ok: false, error: "Enquiry not found." };

  const conversation = await prisma.conversation.findUnique({
    where: { listingId_buyerId: { listingId: enquiry.listingId, buyerId: session.user.id } },
  });
  if (!conversation) return { ok: false, error: "No conversation found for this enquiry." };

  await prisma.message.create({
    data: { conversationId: conversation.id, senderId: session.user.id, body: trimmed },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });
  await prisma.enquiry.update({
    where: { id: enquiry.id },
    data: { status: "OPEN", isRead: false },
  });

  revalidatePath("/dashboard/leads");
  revalidatePath(`/dashboard/leads/${enquiry.id}`);
  revalidatePath("/my-enquiries");
  revalidatePath(`/my-enquiries/${enquiry.id}`);
  return { ok: true };
}

export async function getEnquiriesForDealer() {
  const { dealer } = await requireDealer();
  return prisma.enquiry.findMany({
    where: { dealerId: dealer.id },
    include: {
      listing: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          photos: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
      buyer: { select: { id: true, name: true } },
    },
    orderBy: [{ isRead: "asc" }, { updatedAt: "desc" }],
  });
}

export async function getEnquiriesForBuyer() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return prisma.enquiry.findMany({
    where: { buyerId: session.user.id },
    include: {
      listing: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          photos: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
      dealer: { select: { businessName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
