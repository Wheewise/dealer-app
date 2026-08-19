import { redirect } from "next/navigation";
import { db, unwrapMaybe } from "@/lib/db";
import { isBillingEnabled } from "@/lib/billing";
import { AuthorizationError, getAuthContext, logAuthzDenied } from "@/lib/rbac";
import { userAppHome } from "@/lib/app-urls";

/**
 * Dealer entry point for pages and dealer server actions.
 *
 * Identity, role and dealer id all come from `getAuthContext()`, which reads
 * them from the database rather than the JWT claim — a client cannot present
 * its own `dealerId` and widen scope.
 *
 * `write: true` additionally refuses suspended dealers. Suspension pauses a
 * dealer's live listings (see `suspendDealer`), so a suspended dealer that
 * could still write would simply re-activate them; reads stay open so they can
 * still reach billing and support.
 */
export async function requireDealer({
  allowPaywalled = false,
  write = false,
}: { allowPaywalled?: boolean; write?: boolean } = {}) {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (ctx.role !== "DEALER" || !ctx.dealerId) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      action: write ? "dealer_write" : "dealer_read",
      reason: "not_a_dealer",
    });
    // Absolute: on the dealer subdomain "/" is the dashboard itself.
    redirect(userAppHome());
  }

  // store and subscription are to-one embeds (both FKs are unique), so
  // PostgREST returns an object or null for each.
  const row = unwrapMaybe(
    await db
      .from("Dealer")
      .select("*, store:Store(*), subscription:Subscription(*)")
      .eq("id", ctx.dealerId)
      .maybeSingle(),
    "requireDealer",
  );
  if (!row) redirect("/login");

  const dealer = {
    ...row,
    store: Array.isArray(row.store) ? (row.store[0] ?? null) : row.store,
    subscription: Array.isArray(row.subscription)
      ? (row.subscription[0] ?? null)
      : row.subscription,
  };

  if (write) {
    if (!ctx.permissions.has("create") && !ctx.permissions.has("update")) {
      logAuthzDenied({
        userId: ctx.userId,
        role: ctx.role,
        action: "dealer_write",
        reason: "missing_permission",
      });
      throw new AuthorizationError();
    }
    if (dealer.status === "SUSPENDED") {
      logAuthzDenied({
        userId: ctx.userId,
        role: ctx.role,
        action: "dealer_write",
        reason: "dealer_suspended",
      });
      throw new AuthorizationError("Your dealer account is suspended.");
    }
  }

  if (!allowPaywalled && isBillingEnabled()) {
    const status = dealer.subscription?.status;
    const periodEnd = dealer.subscription?.currentPeriodEnd;

    // Redirect to billing if explicitly cancelled/past-due
    if (status === "PAST_DUE" || status === "CANCELLED") {
      redirect("/dashboard/billing");
    }

    // Also gate if trial/subscription period has lapsed (webhook may not have fired yet)
    if (
      (status === "TRIALING" || status === "ACTIVE") &&
      periodEnd &&
      new Date(periodEnd) < new Date()
    ) {
      redirect("/dashboard/billing");
    }
  }

  // `session` is kept for call-site compatibility; `ctx` is the authoritative
  // source and the one new code should use.
  return {
    ctx,
    session: { user: { id: ctx.userId, role: ctx.role, email: ctx.email } },
    dealer,
  };
}

export async function getDealerIdForUser(userId: string): Promise<string | null> {
  const dealer = unwrapMaybe(
    await db.from("Dealer").select("id").eq("userId", userId).maybeSingle(),
    "getDealerIdForUser",
  );
  return dealer?.id ?? null;
}
