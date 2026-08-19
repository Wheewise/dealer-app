import { redirect } from "next/navigation";
import { userAppHome } from "@/lib/app-urls";
import { logAuthzDenied } from "./audit";
import { getAuthContext, type AuthContext } from "./context";
import type { Permission } from "./permissions";

/**
 * Guards for server actions and server components.
 *
 * Server actions are *public HTTP endpoints* — Next.js exposes each one at a
 * generated id that anyone can POST to. They therefore need the same guards a
 * route handler needs; "the button is hidden" is not one of them.
 *
 * Failure modes differ by caller:
 *   - server actions  → throw (`require*` family). Never redirect: a thrown
 *                       error is what the action-result contract expects.
 *   - pages/layouts   → redirect (`guard*` family), so the user lands on an
 *                       existing screen rather than an error boundary.
 */

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** Authenticated caller, or throw. */
export async function requireAuthContext(): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    logAuthzDenied({ reason: "unauthenticated" });
    throw new AuthenticationError();
  }
  return ctx;
}

/** Authenticated caller holding `permission`, or throw. */
export async function requirePermission(
  permission: Permission,
  resource?: string,
): Promise<AuthContext> {
  const ctx = await requireAuthContext();
  if (!ctx.permissions.has(permission)) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      resource: resource ?? null,
      action: permission,
      reason: "missing_permission",
    });
    throw new AuthorizationError();
  }
  return ctx;
}

/**
 * Admin-only entry point. Optionally narrows to a specific `manage_*`
 * permission so individual admin capabilities stay separable.
 */
export async function requireAdminContext(
  permission: Permission = "manage_configuration",
  resource?: string,
): Promise<AuthContext> {
  const ctx = await requireAuthContext();
  if (!ctx.isAdmin || !ctx.permissions.has(permission)) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      resource: resource ?? null,
      action: permission,
      reason: "not_admin",
    });
    throw new AuthorizationError();
  }
  return ctx;
}

export type DealerContext = AuthContext & { dealerId: string };

/**
 * Dealer-scoped entry point.
 *
 * `write: true` additionally rejects suspended dealers — suspension pauses a
 * dealer's listings, so letting them keep writing (and re-activating those
 * listings) would undo the suspension. Reads stay open so a suspended dealer
 * can still reach billing/support screens.
 */
export async function requireDealerContext({
  write = false,
}: { write?: boolean } = {}): Promise<DealerContext> {
  const ctx = await requireAuthContext();

  if (ctx.role !== "DEALER" || !ctx.dealerId) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      action: write ? "dealer_write" : "dealer_read",
      reason: "not_a_dealer",
    });
    throw new AuthorizationError();
  }

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
    if (ctx.dealerStatus === "SUSPENDED") {
      logAuthzDenied({
        userId: ctx.userId,
        role: ctx.role,
        action: "dealer_write",
        reason: "dealer_suspended",
      });
      throw new AuthorizationError("Your dealer account is suspended.");
    }
  }

  return ctx as DealerContext;
}

/**
 * Row-level check: the resource belongs to this dealer, or the caller is an
 * admin. Call this *after* loading the row, using the owner id read from the
 * database — never the id the client sent.
 */
export function assertDealerOwnership(
  ctx: AuthContext,
  resourceDealerId: string | null | undefined,
  resource: string,
): void {
  if (ctx.isAdmin) return;
  if (resourceDealerId && ctx.dealerId && resourceDealerId === ctx.dealerId) return;
  logAuthzDenied({
    userId: ctx.userId,
    role: ctx.role,
    resource,
    action: "owner_check",
    reason: "cross_dealer_access",
  });
  throw new AuthorizationError();
}

/** Row-level check against a user-owned resource (enquiry, wishlist, profile). */
export function assertUserOwnership(
  ctx: AuthContext,
  resourceUserId: string | null | undefined,
  resource: string,
): void {
  if (ctx.isAdmin) return;
  if (resourceUserId && resourceUserId === ctx.userId) return;
  logAuthzDenied({
    userId: ctx.userId,
    role: ctx.role,
    resource,
    action: "owner_check",
    reason: "cross_user_access",
  });
  throw new AuthorizationError();
}

/**
 * Row-level check where several parties are legitimately involved (an RC
 * transfer has a seller and a buyer; a conversation has a buyer and a dealer).
 */
export function assertParticipant(
  ctx: AuthContext,
  participantUserIds: Array<string | null | undefined>,
  resource: string,
): void {
  if (ctx.isAdmin) return;
  if (participantUserIds.some((id) => id && id === ctx.userId)) return;
  logAuthzDenied({
    userId: ctx.userId,
    role: ctx.role,
    resource,
    action: "participant_check",
    reason: "not_a_participant",
  });
  throw new AuthorizationError();
}

// ---------------------------------------------------------------------------
// Page / layout guards — redirect instead of throwing.
// ---------------------------------------------------------------------------

/** Page guard: signed-in user, else the existing login screen. */
export async function guardAuthenticated(callbackPath?: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    redirect(
      callbackPath
        ? `/login?callbackUrl=${encodeURIComponent(callbackPath)}`
        : "/login",
    );
  }
  return ctx;
}

/**
 * Page guard: admin, else the existing home page (no admin surface leaked).
 *
 * The redirect target is the *user* app's home. On the admin subdomain a bare
 * `redirect("/")` would bounce back into the admin app's own root and loop.
 */
export async function guardAdminPage(
  permission: Permission = "manage_configuration",
): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) redirect("/login");
  if (!ctx.isAdmin || !ctx.permissions.has(permission)) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      action: permission,
      reason: "not_admin",
    });
    redirect(userAppHome());
  }
  return ctx;
}
