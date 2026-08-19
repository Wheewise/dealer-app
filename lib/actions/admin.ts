"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  AuthorizationError,
  logSecurityEvent,
  requireAdminContext,
  requireAuthContext,
  type Permission,
} from "@/lib/rbac";

/**
 * Throw-based admin guard for server actions. Every export below names the
 * specific capability it needs so admin powers stay separable rather than
 * collapsing into one "is admin" bit.
 */
async function requireAdmin(permission: Permission = "manage_configuration") {
  return requireAdminContext(permission, "admin-action");
}

export async function getAdminStats() {
  await requireAdmin("read");

  const [dealerCount, listingCount, leadCount, activeSubs] = await Promise.all([
    prisma.dealer.count(),
    prisma.listing.count({ where: { status: "ACTIVE" } }),
    prisma.enquiry.count(),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
  ]);

  return { dealerCount, listingCount, leadCount, activeSubs };
}

export async function getDealers() {
  await requireAdmin("manage_dealers");

  return prisma.dealer.findMany({
    include: {
      user: { select: { email: true } },
      store: { select: { slug: true } },
      subscription: { select: { plan: true, status: true } },
      _count: { select: { listings: true, enquiries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getBuyers({
  q,
  page = 1,
  pageSize = 20,
}: {
  q?: string;
  page?: number;
  pageSize?: number;
}) {
  await requireAdmin("manage_users");

  const where = q
    ? {
        role: "BUYER" as const,
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { email: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : { role: "BUYER" as const };

  const [total, buyers] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        _count: { select: { enquiries: true, savedListings: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    buyers,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDealerSubscriptions() {
  await requireAdmin("manage_dealers");

  return prisma.dealer.findMany({
    select: {
      id: true,
      businessName: true,
      city: true,
      store: { select: { slug: true } },
      subscription: {
        select: { plan: true, status: true, currentPeriodEnd: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPendingModeration() {
  await requireAdmin("manage_configuration");

  return prisma.listing.findMany({
    where: { status: "ACTIVE" },
    include: {
      dealer: { select: { businessName: true } },
      photos: { take: 1, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function suspendDealer(dealerId: string) {
  const ctx = await requireAdmin("manage_dealers");

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { id: true, status: true },
  });
  if (!dealer) return;

  const newStatus = dealer.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";

  await prisma.dealer.update({
    where: { id: dealerId },
    data: { status: newStatus },
  });

  if (newStatus === "SUSPENDED") {
    await prisma.listing.updateMany({
      where: { dealerId, status: "ACTIVE" },
      data: { status: "PAUSED" },
    });
  }

  logSecurityEvent({
    type: "privilege.changed",
    outcome: "allow",
    userId: ctx.userId,
    role: ctx.role,
    resource: `dealer:${dealerId}`,
    action: newStatus === "SUSPENDED" ? "suspend_dealer" : "reinstate_dealer",
  });

  revalidatePath("/admin");
}

export async function removeListingByAdmin(listingId: string) {
  const ctx = await requireAdmin("delete");

  await prisma.listing.update({
    where: { id: listingId },
    data: { status: "PAUSED" },
  });

  logSecurityEvent({
    type: "admin.action",
    outcome: "allow",
    userId: ctx.userId,
    role: ctx.role,
    resource: `listing:${listingId}`,
    action: "remove_listing",
  });

  revalidatePath("/admin");
}

// --- Payouts ---

export async function getPayouts() {
  await requireAdmin("manage_configuration");

  return prisma.payout.findMany({
    include: {
      dealer: { select: { businessName: true, phone: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updatePayoutStatus(
  payoutId: string,
  status: "APPROVED" | "REJECTED" | "PAID",
) {
  const ctx = await requireAdmin("approve");

  await prisma.payout.update({
    where: { id: payoutId },
    data: { status },
  });

  logSecurityEvent({
    type: "admin.action",
    outcome: "allow",
    userId: ctx.userId,
    role: ctx.role,
    resource: `payout:${payoutId}`,
    action: `payout_${status.toLowerCase()}`,
  });

  revalidatePath("/admin/payouts");
}

export async function getDealerPayouts(dealerId: string) {
  const ctx = await requireAuthContext();

  // Admins (both ADMIN and SUPER_ADMIN) see any dealer's payouts. Everyone
  // else may only ask for the dealer they themselves are — the `dealerId`
  // argument is checked against the id derived from the session, never used
  // as the scope on its own.
  if (!ctx.isAdmin && (!ctx.dealerId || ctx.dealerId !== dealerId)) {
    throw new AuthorizationError();
  }

  return prisma.payout.findMany({
    where: { dealerId },
    orderBy: { createdAt: "desc" },
  });
}
