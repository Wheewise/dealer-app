"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { getAuthContext, logAuthzDenied, type AuthContext } from "@/lib/rbac";
import type { RCTransferStatus } from "@prisma/client";

/** Seller, buyer, or admin. The only parties allowed to see a transfer. */
function isTransferParticipant(
  ctx: AuthContext,
  transfer: { sellerId: string; buyerId: string },
): boolean {
  return (
    ctx.isAdmin || transfer.sellerId === ctx.userId || transfer.buyerId === ctx.userId
  );
}

export type RCTransferActionResult = { ok: true } | { ok: false; error: string };
export type InitiateTransferResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Status is derived from which flag is actually being set, not the target
// `step` number — reaching step 5 happens via the *previous* step's action
// (rtoApproved, moving from step 4), which must not be conflated with the
// step-5 action itself (transferComplete). Checked most-advanced-first.
function statusForUpdate(
  data: Partial<{
    sellerAgreed: boolean;
    buyerAgreed: boolean;
    docsSubmitted: boolean;
    rtoPending: boolean;
    rtoApproved: boolean;
    transferComplete: boolean;
  }>,
  current: RCTransferStatus,
): RCTransferStatus {
  if (data.transferComplete) return "COMPLETED";
  if (data.rtoApproved) return "RTO_APPROVED";
  if (data.rtoPending) return "RTO_PENDING";
  if (data.docsSubmitted) return "DOCS_PENDING";
  if (data.sellerAgreed || data.buyerAgreed) return "INITIATED";
  return current;
}

export async function initiateTransfer(data: {
  listingId: string;
  buyerId: string;
  registrationNo: string;
  saleAmount: number;
}): Promise<InitiateTransferResult> {
  const { dealer } = await requireDealer({ write: true });

  const listing = await prisma.listing.findFirst({
    where: { id: data.listingId, dealerId: dealer.id },
    include: { dealer: true },
  });
  if (!listing) return { ok: false, error: "Listing not found." };
  if (listing.status !== "SOLD") {
    return { ok: false, error: "Mark this listing as sold before starting a transfer." };
  }

  const existing = await prisma.rCTransfer.findUnique({
    where: { listingId: listing.id },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "A transfer already exists for this listing." };

  const buyer = await prisma.user.findUnique({
    where: { id: data.buyerId },
    select: { id: true },
  });
  if (!buyer) return { ok: false, error: "Buyer not found." };

  const registrationNo = data.registrationNo.trim();
  if (!registrationNo) return { ok: false, error: "Enter the vehicle's registration number." };
  if (!Number.isFinite(data.saleAmount) || data.saleAmount <= 0) {
    return { ok: false, error: "Enter a valid sale amount." };
  }

  const transfer = await prisma.rCTransfer.create({
    data: {
      listingId: listing.id,
      sellerId: listing.dealer.userId,
      buyerId: buyer.id,
      registrationNo,
      vehicleName: `${listing.year} ${listing.make} ${listing.model}`,
      saleAmount: data.saleAmount,
      status: "INITIATED",
      currentStep: 1,
    },
  });

  revalidatePath("/dashboard/transfers");
  revalidatePath(`/vehicle/${listing.id}`);
  return { ok: true, id: transfer.id };
}

export async function updateTransferStep(
  transferId: string,
  step: number,
  data: Partial<{
    sellerAgreed: boolean;
    buyerAgreed: boolean;
    docsSubmitted: boolean;
    rtoPending: boolean;
    rtoApproved: boolean;
    transferComplete: boolean;
  }>,
): Promise<RCTransferActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Login required." };

  const transfer = await prisma.rCTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) return { ok: false, error: "Transfer not found." };

  const isSeller = transfer.sellerId === session.user.id;
  const isBuyer = transfer.buyerId === session.user.id;
  if (!isSeller && !isBuyer) return { ok: false, error: "You're not part of this transfer." };

  // Steps 3-5 (RTO submission/approval/completion) are seller-managed —
  // only the dealer visits the RTO and can attest to its status. Gate on
  // the transfer's *current* step (which action is being taken), not the
  // target `step` argument — the step-2 "docs collected" action also
  // advances currentStep to 3, but that action itself is open to either
  // party.
  if (transfer.currentStep >= 3 && !isSeller) {
    return { ok: false, error: "Only the seller can update this step." };
  }

  const status = statusForUpdate(data, transfer.status);

  await prisma.rCTransfer.update({
    where: { id: transferId },
    data: { ...data, currentStep: step, status },
  });

  revalidatePath(`/rc-transfer/${transferId}`);
  revalidatePath("/dashboard/transfers");
  return { ok: true };
}

/**
 * A transfer row carries both parties' names and phone numbers, so it is
 * readable only by the seller, the buyer, or an admin.
 *
 * Returns `null` rather than throwing on a scope miss: the two call sites
 * already render `notFound()` / hide the panel for a null result, so the
 * observable behaviour is unchanged — and a uniform null makes the action
 * useless as an existence oracle for transfer ids.
 *
 * This is enforced *here*, not only in the page: `"use server"` exports are
 * reachable as HTTP endpoints, so a page-level check alone leaves the data
 * one direct POST away.
 */
export async function getTransferById(id: string) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const transfer = await prisma.rCTransfer.findUnique({
    where: { id },
    include: {
      documents: true,
      seller: { select: { id: true, name: true, phone: true } },
      buyer: { select: { id: true, name: true, phone: true } },
      listing: { select: { id: true, make: true, model: true, year: true } },
    },
  });

  if (!transfer) return null;
  if (!isTransferParticipant(ctx, transfer)) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      resource: `rc-transfer:${id}`,
      action: "read",
      reason: "not_a_participant",
    });
    return null;
  }
  return transfer;
}

/** Same scoping rules as `getTransferById`. */
export async function getTransferByListing(listingId: string) {
  const ctx = await getAuthContext();
  if (!ctx) return null;

  const transfer = await prisma.rCTransfer.findUnique({
    where: { listingId },
    include: {
      documents: true,
      seller: { select: { id: true, name: true, phone: true } },
      buyer: { select: { id: true, name: true, phone: true } },
    },
  });

  if (!transfer) return null;
  if (!isTransferParticipant(ctx, transfer)) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      resource: `rc-transfer-listing:${listingId}`,
      action: "read",
      reason: "not_a_participant",
    });
    return null;
  }
  return transfer;
}

export async function getTransfersForDealer() {
  const { dealer } = await requireDealer();
  return prisma.rCTransfer.findMany({
    where: { sellerId: dealer.userId },
    include: {
      buyer: { select: { name: true, phone: true } },
      listing: { select: { id: true, make: true, model: true, year: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// Sold listings for this dealer that don't have a transfer yet, plus the
// candidate buyers (from enquiries/test-drives on that listing) to pick
// the actual purchaser from when starting one.
export async function getSoldListingsAwaitingTransfer() {
  const { dealer } = await requireDealer();

  const listings = await prisma.listing.findMany({
    where: { dealerId: dealer.id, status: "SOLD", rcTransfer: null },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      askingPrice: true,
      enquiries: {
        where: { buyerId: { not: null } },
        select: { buyerId: true, buyerName: true, buyer: { select: { name: true, phone: true } } },
        distinct: ["buyerId"],
      },
      testDrives: {
        select: { buyerId: true, buyer: { select: { name: true, phone: true } } },
        distinct: ["buyerId"],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return listings.map((l) => {
    const candidates = new Map<string, { id: string; name: string; phone: string | null }>();
    for (const e of l.enquiries) {
      if (e.buyerId) {
        candidates.set(e.buyerId, {
          id: e.buyerId,
          name: e.buyer?.name ?? e.buyerName,
          phone: e.buyer?.phone ?? null,
        });
      }
    }
    for (const t of l.testDrives) {
      candidates.set(t.buyerId, {
        id: t.buyerId,
        name: t.buyer.name ?? "Buyer",
        phone: t.buyer.phone,
      });
    }
    return {
      id: l.id,
      make: l.make,
      model: l.model,
      year: l.year,
      askingPrice: Number(l.askingPrice),
      candidates: [...candidates.values()],
    };
  });
}
