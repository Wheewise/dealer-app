import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLE_APP,
  appFor,
  isAdminRole,
  isKnownRole,
  permissionsFor,
  roleHasPermission,
  type Permission,
} from "../../lib/rbac/permissions";

/**
 * The permission matrix is the contract the whole authorization layer rests
 * on, so it is asserted directly rather than only through the guards.
 */

const WRITE_ON_OTHERS: Permission[] = ["create", "update", "delete"];
const ADMIN_ONLY: Permission[] = [
  "delete",
  "approve",
  "manage_users",
  "manage_dealers",
  "manage_roles",
  "manage_permissions",
  "manage_configuration",
];

describe("permission matrix — USER (BUYER)", () => {
  it("can read", () => {
    expect(roleHasPermission("BUYER", "read")).toBe(true);
  });

  it("cannot create, update or delete anything it does not own", () => {
    for (const p of WRITE_ON_OTHERS) {
      expect(roleHasPermission("BUYER", p)).toBe(false);
    }
  });

  it("holds no administrative permission", () => {
    for (const p of ADMIN_ONLY) {
      expect(roleHasPermission("BUYER", p)).toBe(false);
    }
  });

  it("keeps only self-scoped writes (own enquiry, wishlist, message, profile)", () => {
    expect(roleHasPermission("BUYER", "self:create")).toBe(true);
    expect(roleHasPermission("BUYER", "self:update")).toBe(true);
    expect(roleHasPermission("BUYER", "self:delete")).toBe(true);
  });

  it("belongs to the user app", () => {
    expect(appFor("BUYER")).toBe("user");
  });
});

describe("permission matrix — DEALER", () => {
  it("can read, create and update", () => {
    expect(roleHasPermission("DEALER", "read")).toBe(true);
    expect(roleHasPermission("DEALER", "create")).toBe(true);
    expect(roleHasPermission("DEALER", "update")).toBe(true);
  });

  it("cannot delete platform resources or administer anything", () => {
    for (const p of ADMIN_ONLY) {
      expect(roleHasPermission("DEALER", p)).toBe(false);
    }
  });

  it("belongs to the dealer app and is not an admin", () => {
    expect(appFor("DEALER")).toBe("dealer");
    expect(isAdminRole("DEALER")).toBe(false);
  });
});

describe("permission matrix — ADMIN / SUPER_ADMIN", () => {
  it("holds every declared permission", () => {
    for (const p of PERMISSIONS) {
      expect(roleHasPermission("ADMIN", p)).toBe(true);
      expect(roleHasPermission("SUPER_ADMIN", p)).toBe(true);
    }
  });

  it("treats SUPER_ADMIN as an admin — the old `role === \"ADMIN\"` checks did not", () => {
    expect(isAdminRole("ADMIN")).toBe(true);
    expect(isAdminRole("SUPER_ADMIN")).toBe(true);
    expect(ROLE_APP.SUPER_ADMIN).toBe("admin");
  });

  it("grants ADMIN and SUPER_ADMIN identical sets", () => {
    expect([...ROLE_PERMISSIONS.ADMIN].sort()).toEqual(
      [...ROLE_PERMISSIONS.SUPER_ADMIN].sort(),
    );
  });
});

describe("privilege ordering", () => {
  it("is strictly increasing: BUYER ⊂ DEALER ⊂ ADMIN", () => {
    const buyer = ROLE_PERMISSIONS.BUYER;
    const dealer = ROLE_PERMISSIONS.DEALER;
    const admin = ROLE_PERMISSIONS.ADMIN;

    for (const p of buyer) expect(dealer.has(p)).toBe(true);
    for (const p of dealer) expect(admin.has(p)).toBe(true);
    expect(dealer.size).toBeGreaterThan(buyer.size);
    expect(admin.size).toBeGreaterThan(dealer.size);
  });
});

describe("deny by default", () => {
  it.each([
    "SUPERUSER",
    "admin",
    "ADMIN ",
    "root",
    "",
    "__proto__",
    "constructor",
  ])("grants nothing for an unrecognised role value %j", (role) => {
    expect(isKnownRole(role)).toBe(false);
    expect(permissionsFor(role).size).toBe(0);
    expect(isAdminRole(role)).toBe(false);
  });

  it.each([null, undefined, 0, 1, true, {}, [], { role: "ADMIN" }])(
    "grants nothing for a non-string role %j",
    (role) => {
      expect(permissionsFor(role).size).toBe(0);
      expect(isAdminRole(role)).toBe(false);
    },
  );

  it("falls back to the least-privileged app surface for unknown roles", () => {
    expect(appFor("WHATEVER")).toBe("user");
  });
});
