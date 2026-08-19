/**
 * Centralised permission catalogue and role → permission matrix.
 *
 * This file is the single source of truth for "what may a role do". Nothing
 * else in the codebase should hard-code a role comparison; call the guards in
 * `lib/rbac/guards.ts` (server actions / pages) or `lib/rbac/api.ts` (route
 * handlers) instead.
 *
 * Design note — why BUYER is not literally permission-less:
 *   The brief specifies "USER = read". Taken literally that would remove a
 *   buyer's ability to send an enquiry, save a listing, book a test drive or
 *   reply in chat — i.e. the marketplace itself. We therefore split writes in
 *   two:
 *     - `self:*`  — a buyer acting on rows they themselves own (their enquiry,
 *                   their wishlist entry, their message, their profile).
 *     - `create` / `update` / `delete` — writes against *dealer-owned or
 *                   platform-owned* inventory and configuration.
 *   USER holds `read` + `self:*` only, and therefore has zero write access to
 *   any resource it does not own. That preserves existing behaviour while
 *   satisfying "block all create, update, delete, approval, configuration and
 *   administrative operations" for everything outside the user's own records.
 */

export const PERMISSIONS = [
  "read",
  "self:create",
  "self:update",
  "self:delete",
  "create",
  "update",
  "delete",
  "approve",
  "manage_users",
  "manage_dealers",
  "manage_roles",
  "manage_permissions",
  "manage_configuration",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Roles as persisted on `User.role` (mirrors the `Role` enum in the schema). */
export type AppRole = "BUYER" | "DEALER" | "ADMIN" | "SUPER_ADMIN";

/** The three role-scoped applications this codebase is split into. */
export type AppSurface = "user" | "dealer" | "admin";

const USER_PERMISSIONS: readonly Permission[] = [
  "read",
  "self:create",
  "self:update",
  "self:delete",
];

const DEALER_PERMISSIONS: readonly Permission[] = [
  ...USER_PERMISSIONS,
  "create",
  "update",
];

const ADMIN_PERMISSIONS: readonly Permission[] = [
  ...DEALER_PERMISSIONS,
  "delete",
  "approve",
  "manage_users",
  "manage_dealers",
  "manage_roles",
  "manage_permissions",
  "manage_configuration",
];

/**
 * Deny-by-default: a role absent from this map resolves to the empty set, so a
 * value newly added to the `Role` enum grants nothing until it is listed here
 * explicitly.
 */
export const ROLE_PERMISSIONS: Readonly<Record<AppRole, ReadonlySet<Permission>>> = {
  BUYER: new Set(USER_PERMISSIONS),
  DEALER: new Set(DEALER_PERMISSIONS),
  ADMIN: new Set(ADMIN_PERMISSIONS),
  SUPER_ADMIN: new Set(ADMIN_PERMISSIONS),
};

/** Which of the three applications a role signs in to. */
export const ROLE_APP: Readonly<Record<AppRole, AppSurface>> = {
  BUYER: "user",
  DEALER: "dealer",
  ADMIN: "admin",
  SUPER_ADMIN: "admin",
};

const ADMIN_ROLES: ReadonlySet<AppRole> = new Set<AppRole>(["ADMIN", "SUPER_ADMIN"]);

const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.keys(ROLE_PERMISSIONS));

/**
 * Membership is tested against an explicit Set, not with `in` or a bare
 * property read: `"constructor" in ROLE_PERMISSIONS` and `"__proto__" in ...`
 * are both true via the prototype chain, so an attacker-supplied role of
 * `"constructor"` would otherwise be treated as a known role and resolve to
 * `Object.prototype.constructor`.
 */
export function isKnownRole(role: unknown): role is AppRole {
  return typeof role === "string" && KNOWN_ROLES.has(role);
}

/** True for both ADMIN and SUPER_ADMIN. Use this instead of `=== "ADMIN"`. */
export function isAdminRole(role: unknown): boolean {
  return isKnownRole(role) && ADMIN_ROLES.has(role);
}

export function permissionsFor(role: unknown): ReadonlySet<Permission> {
  return isKnownRole(role) ? ROLE_PERMISSIONS[role] : new Set<Permission>();
}

export function appFor(role: unknown): AppSurface {
  // Unknown roles fall back to the least-privileged surface.
  return isKnownRole(role) ? ROLE_APP[role] : "user";
}

export function roleHasPermission(role: unknown, permission: Permission): boolean {
  return permissionsFor(role).has(permission);
}
