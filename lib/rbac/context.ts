import { auth } from "@/lib/auth";
import { db, unwrapMaybe } from "@/lib/db";
import {
  appFor,
  isAdminRole,
  permissionsFor,
  type AppRole,
  type AppSurface,
  type Permission,
} from "./permissions";

/**
 * The authenticated caller, resolved entirely server-side.
 *
 * Everything on this object is derived from the database row for the subject
 * named in the signed session — never from request headers, request bodies,
 * query strings, cookies other than the session, or `localStorage`. In
 * particular `dealerId` is looked up from `Dealer.userId`, so a client that
 * supplies its own `dealerId` cannot widen its scope.
 */
export type AuthContext = {
  userId: string;
  /** Present for display only (admin header). Never used for authorization. */
  email: string | null;
  name: string | null;
  /** Authoritative role read from the database, not from the JWT claim. */
  role: AppRole;
  app: AppSurface;
  permissions: ReadonlySet<Permission>;
  /** The dealer this user *is*, or null. The only trusted dealer scope. */
  dealerId: string | null;
  dealerStatus: "ACTIVE" | "SUSPENDED" | null;
  isAdmin: boolean;
};

/**
 * Resolves the caller, or null when unauthenticated / unknown.
 *
 * Why re-read the role from the database rather than trusting `token.role`:
 * the JWT is signed by us, so the claim has integrity, but it is a *snapshot*.
 * A user demoted from ADMIN, deleted, or whose dealer account was suspended
 * keeps a valid cookie until it expires. Re-reading costs one indexed query
 * and closes that window, and it means a tampered or hand-crafted claim can
 * never grant more than the row itself allows.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  // Dealer is a to-one embed (Dealer.userId is unique), so PostgREST returns
  // an object or null rather than an array.
  const user = unwrapMaybe(
    await db
      .from("User")
      .select("id, email, name, role, dealer:Dealer(id, status)")
      .eq("id", userId)
      .maybeSingle(),
    "authContext",
  );
  // User deleted since the token was issued — treat as unauthenticated.
  if (!user) return null;

  const role = user.role as AppRole;
  const dealer = Array.isArray(user.dealer) ? user.dealer[0] : user.dealer;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
    app: appFor(role),
    permissions: permissionsFor(role),
    dealerId: dealer?.id ?? null,
    dealerStatus: dealer?.status ?? null,
    isAdmin: isAdminRole(role),
  };
}

export function hasPermission(ctx: AuthContext | null, permission: Permission): boolean {
  return Boolean(ctx?.permissions.has(permission));
}

/**
 * The set of dealer ids this caller may act on.
 *
 * - admin  → `null`, meaning "unrestricted" (callers must handle null).
 * - dealer → exactly their own id.
 * - anyone else → empty array, which callers must translate into a filter that
 *   matches nothing.
 */
export function permittedDealerIds(ctx: AuthContext | null): string[] | null {
  if (!ctx) return [];
  if (ctx.isAdmin) return null;
  if (ctx.role === "DEALER" && ctx.dealerId && ctx.dealerStatus !== "SUSPENDED") {
    return [ctx.dealerId];
  }
  return [];
}
