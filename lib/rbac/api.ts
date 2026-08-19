import { NextResponse } from "next/server";
import { logAuthzDenied } from "./audit";
import { getAuthContext, type AuthContext } from "./context";
import type { Permission } from "./permissions";

/**
 * Route-handler guards.
 *
 * These return a `NextResponse` on denial rather than throwing, so handlers
 * stay a straight line:
 *
 *   const gate = await apiRequirePermission(req, "create");
 *   if (!gate.ok) return gate.response;
 *   const ctx = gate.ctx;
 *
 * Deny-by-default is the rule for anything new: a handler that does not call
 * one of these is only acceptable if it is on the explicit public list in
 * `docs/security/API_AUTHORIZATION_MATRIX.md`.
 */

export type ApiGate =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

/**
 * Uniform denial bodies. They intentionally carry no detail about *why*:
 * distinguishing "no such row" from "not yours" is an enumeration oracle, so
 * ownership failures on a specific resource should prefer `notFound()` below.
 */
function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export function apiNotFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Any authenticated caller. */
export async function apiRequireAuth(): Promise<ApiGate> {
  const ctx = await getAuthContext();
  if (!ctx) {
    logAuthzDenied({ reason: "unauthenticated" });
    return { ok: false, response: unauthorized() };
  }
  return { ok: true, ctx };
}

/** Authenticated caller holding `permission`. */
export async function apiRequirePermission(
  permission: Permission,
  resource?: string,
): Promise<ApiGate> {
  const gate = await apiRequireAuth();
  if (!gate.ok) return gate;
  if (!gate.ctx.permissions.has(permission)) {
    logAuthzDenied({
      userId: gate.ctx.userId,
      role: gate.ctx.role,
      resource: resource ?? null,
      action: permission,
      reason: "missing_permission",
    });
    return { ok: false, response: forbidden() };
  }
  return gate;
}

export type DealerApiGate =
  | { ok: true; ctx: AuthContext & { dealerId: string } }
  | { ok: false; response: NextResponse };

/**
 * Dealer-scoped route. `write: true` also rejects suspended dealers, matching
 * `requireDealerContext` in guards.ts.
 */
export async function apiRequireDealer({
  write = false,
}: { write?: boolean } = {}): Promise<DealerApiGate> {
  const gate = await apiRequireAuth();
  if (!gate.ok) return gate;
  const ctx = gate.ctx;

  if (ctx.role !== "DEALER" || !ctx.dealerId) {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      action: write ? "dealer_write" : "dealer_read",
      reason: "not_a_dealer",
    });
    return { ok: false, response: forbidden() };
  }

  if (write && ctx.dealerStatus === "SUSPENDED") {
    logAuthzDenied({
      userId: ctx.userId,
      role: ctx.role,
      action: "dealer_write",
      reason: "dealer_suspended",
    });
    return { ok: false, response: forbidden() };
  }

  return { ok: true, ctx: ctx as AuthContext & { dealerId: string } };
}

/** Admin-scoped route. */
export async function apiRequireAdmin(
  permission: Permission = "manage_configuration",
  resource?: string,
): Promise<ApiGate> {
  const gate = await apiRequireAuth();
  if (!gate.ok) return gate;
  if (!gate.ctx.isAdmin || !gate.ctx.permissions.has(permission)) {
    logAuthzDenied({
      userId: gate.ctx.userId,
      role: gate.ctx.role,
      resource: resource ?? null,
      action: permission,
      reason: "not_admin",
    });
    return { ok: false, response: forbidden() };
  }
  return gate;
}
