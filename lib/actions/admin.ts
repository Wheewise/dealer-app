"use server";

import { revalidatePath } from "next/cache";
import {
  count,
  db,
  embeddedCount,
  unwrap,
  unwrapMaybe,
  withFilters,
  type FilterChain,
} from "@/lib/db";
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
    count(db.from("Dealer").select("id", { count: "exact", head: true })),
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE"),
    ),
    count(db.from("Enquiry").select("id", { count: "exact", head: true })),
    count(
      db
        .from("Subscription")
        .select("id", { count: "exact", head: true })
        .eq("status", "ACTIVE"),
    ),
  ]);

  return { dealerCount, listingCount, leadCount, activeSubs };
}

export async function getDealers() {
  await requireAdmin("manage_dealers");

  const rows = unwrap(
    await db
      .from("Dealer")
      .select(
        `*,
         user:User(email),
         store:Store(slug),
         subscription:Subscription(plan, status),
         listings:Listing(count),
         enquiries:Enquiry(count)`,
      )
      .order("createdAt", { ascending: false }),
    "getDealers",
  );

  // `_count` is kept as the shape the admin pages already render.
  return rows.map((d) => ({
    ...d,
    _count: {
      listings: embeddedCount(d.listings),
      enquiries: embeddedCount(d.enquiries),
    },
  }));
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

  // `q` reaches PostgREST inside an `or=` list, where a comma or parenthesis
  // would otherwise terminate the value and change which columns are matched.
  const term = q ? `"${q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : null;

  const predicate = (query: FilterChain): FilterChain => {
    const scoped = query.eq("role", "BUYER");
    return term ? scoped.or(`name.ilike.%${term}%,email.ilike.%${term}%`) : scoped;
  };

  const from = (page - 1) * pageSize;

  const [total, rows] = await Promise.all([
    count(
      withFilters(db.from("User").select("id", { count: "exact", head: true }), predicate),
    ),
    withFilters(
      db
        .from("User")
        .select(
          "id, name, email, createdAt, enquiries:Enquiry(count), savedListings:SavedListing(count)",
        ),
      predicate,
    )
      .order("createdAt", { ascending: false })
      .range(from, from + pageSize - 1)
      .then((r) => unwrap(r, "getBuyers")),
  ]);

  const buyers = rows.map((b) => ({
    ...b,
    _count: {
      enquiries: embeddedCount(b.enquiries),
      savedListings: embeddedCount(b.savedListings),
    },
  }));

  return {
    buyers,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getDealerSubscriptions() {
  await requireAdmin("manage_dealers");

  const rows = unwrap(
    await db
      .from("Dealer")
      .select(
        `id, businessName, city,
         store:Store(slug),
         subscription:Subscription(plan, status, currentPeriodEnd)`,
      )
      .order("createdAt", { ascending: false }),
    "getDealerSubscriptions",
  );

  return rows;
}

export async function getPendingModeration() {
  await requireAdmin("manage_configuration");

  const rows = unwrap(
    await db
      .from("Listing")
      .select("*, dealer:Dealer(businessName), photos:ListingPhoto(id, url, sortOrder)")
      .eq("status", "ACTIVE")
      .order("createdAt", { ascending: false })
      .limit(50),
    "getPendingModeration",
  );

  // PostgREST cannot order or limit an embed per parent row, so the "first
  // photo" narrowing happens here.
  return rows.map((l) => ({
    ...l,
    photos: [...l.photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1),
  }));
}

export async function suspendDealer(dealerId: string) {
  const ctx = await requireAdmin("manage_dealers");

  const dealer = unwrapMaybe(
    await db.from("Dealer").select("id, status").eq("id", dealerId).maybeSingle(),
    "suspendDealer lookup",
  );
  if (!dealer) return;

  const newStatus = dealer.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";

  unwrap(
    await db.from("Dealer").update({ status: newStatus }).eq("id", dealerId).select("id"),
    "suspendDealer",
  );

  // Pausing live inventory is what makes suspension visible to buyers. The
  // dealer cannot undo it: `guard_dealer_status_change` refuses a status
  // write from a non-privileged session.
  if (newStatus === "SUSPENDED") {
    unwrap(
      await db
        .from("Listing")
        .update({ status: "PAUSED" })
        .eq("dealerId", dealerId)
        .eq("status", "ACTIVE")
        .select("id"),
      "suspendDealer: pause listings",
    );
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

  unwrap(
    await db.from("Listing").update({ status: "PAUSED" }).eq("id", listingId).select("id"),
    "removeListingByAdmin",
  );

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

  const rows = unwrap(
    await db
      .from("Payout")
      .select("*, dealer:Dealer(businessName, phone)")
      .order("createdAt", { ascending: false }),
    "getPayouts",
  );

  return rows;
}

export async function updatePayoutStatus(
  payoutId: string,
  status: "APPROVED" | "REJECTED" | "PAID",
) {
  const ctx = await requireAdmin("approve");

  unwrap(
    await db.from("Payout").update({ status }).eq("id", payoutId).select("id"),
    "updatePayoutStatus",
  );

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

  return unwrap(
    await db
      .from("Payout")
      .select("*")
      .eq("dealerId", dealerId)
      .order("createdAt", { ascending: false }),
    "getDealerPayouts",
  );
}
