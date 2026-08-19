import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { getAuthContext, permittedDealerIds } from "../../lib/rbac/context";
import {
  AuthenticationError,
  AuthorizationError,
  assertDealerOwnership,
  assertParticipant,
  assertUserOwnership,
  guardAdminPage,
  requireAdminContext,
  requireAuthContext,
  requireDealerContext,
  requirePermission,
} from "../../lib/rbac/guards";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const userFindUnique = prisma.user.findUnique as unknown as M;

type Row = {
  id: string;
  role: string;
  dealer: { id: string; status: "ACTIVE" | "SUSPENDED" } | null;
};

/**
 * `claimedRole` is what the session token asserts; `row` is what the database
 * says. Keeping them separable is the whole point — the tests below drive them
 * apart to prove the database wins.
 */
function signIn(row: Row | null, claimedRole = row?.role) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: claimedRole } } : null);
  userFindUnique.mockResolvedValue(
    row ? { ...row, email: `${row.id}@example.com`, name: row.id } : null,
  );
}

const BUYER: Row = { id: "u_buyer", role: "BUYER", dealer: null };
const DEALER_A: Row = {
  id: "u_dealer_a",
  role: "DEALER",
  dealer: { id: "dealer_A", status: "ACTIVE" },
};
const DEALER_B: Row = {
  id: "u_dealer_b",
  role: "DEALER",
  dealer: { id: "dealer_B", status: "ACTIVE" },
};
const SUSPENDED: Row = {
  id: "u_dealer_s",
  role: "DEALER",
  dealer: { id: "dealer_S", status: "SUSPENDED" },
};
const ADMIN: Row = { id: "u_admin", role: "ADMIN", dealer: null };
const SUPER_ADMIN: Row = { id: "u_super", role: "SUPER_ADMIN", dealer: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAuthContext — identity is derived, never supplied", () => {
  it("returns null when there is no session", async () => {
    signIn(null);
    expect(await getAuthContext()).toBeNull();
  });

  it("returns null when the session names a user that no longer exists", async () => {
    authMock.mockResolvedValue({ user: { id: "ghost", role: "ADMIN" } });
    userFindUnique.mockResolvedValue(null);
    expect(await getAuthContext()).toBeNull();
  });

  it("takes the role from the database, not from the session claim", async () => {
    signIn(BUYER, "SUPER_ADMIN"); // tampered / stale claim
    const ctx = await getAuthContext();
    expect(ctx?.role).toBe("BUYER");
    expect(ctx?.isAdmin).toBe(false);
    expect(ctx?.permissions.has("manage_users")).toBe(false);
  });

  it("derives dealerId from the user row", async () => {
    signIn(DEALER_A);
    const ctx = await getAuthContext();
    expect(ctx?.dealerId).toBe("dealer_A");
    expect(userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u_dealer_a" } }),
    );
  });
});

describe("permittedDealerIds — server-derived tenant scope", () => {
  it("is unrestricted (null) for admins", async () => {
    signIn(ADMIN);
    expect(permittedDealerIds(await getAuthContext())).toBeNull();
  });

  it("is exactly the caller's own dealer for a dealer", async () => {
    signIn(DEALER_A);
    expect(permittedDealerIds(await getAuthContext())).toEqual(["dealer_A"]);
  });

  it("is empty for buyers, suspended dealers and anonymous callers", async () => {
    signIn(BUYER);
    expect(permittedDealerIds(await getAuthContext())).toEqual([]);
    signIn(SUSPENDED);
    expect(permittedDealerIds(await getAuthContext())).toEqual([]);
    expect(permittedDealerIds(null)).toEqual([]);
  });
});

describe("USER role — read-only outside its own records", () => {
  beforeEach(() => signIn(BUYER));

  it("passes the read gate", async () => {
    await expect(requirePermission("read")).resolves.toMatchObject({ role: "BUYER" });
  });

  it.each(["create", "update", "delete"] as const)(
    "is refused the %s permission",
    async (permission) => {
      await expect(requirePermission(permission)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    },
  );

  it("cannot enter the dealer app", async () => {
    await expect(requireDealerContext()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("cannot enter the admin app", async () => {
    await expect(requireAdminContext()).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireAdminContext("manage_users")).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });

  it("is redirected away from admin pages rather than shown them", async () => {
    await expect(guardAdminPage()).rejects.toThrow("REDIRECT:/");
  });
});

describe("DEALER role — read plus scoped writes", () => {
  it("passes read and write gates", async () => {
    signIn(DEALER_A);
    await expect(requireDealerContext()).resolves.toMatchObject({
      dealerId: "dealer_A",
    });
    await expect(requireDealerContext({ write: true })).resolves.toMatchObject({
      dealerId: "dealer_A",
    });
  });

  it("cannot reach admin capabilities", async () => {
    signIn(DEALER_A);
    for (const p of ["delete", "manage_users", "manage_dealers", "manage_roles"] as const) {
      await expect(requirePermission(p)).rejects.toBeInstanceOf(AuthorizationError);
    }
    await expect(requireAdminContext()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("may still read while suspended, but may not write", async () => {
    signIn(SUSPENDED);
    await expect(requireDealerContext()).resolves.toMatchObject({
      dealerId: "dealer_S",
    });
    await expect(requireDealerContext({ write: true })).rejects.toThrow(/suspended/i);
  });
});

describe("ADMIN role", () => {
  it("passes every admin capability gate", async () => {
    signIn(ADMIN);
    for (const p of [
      "manage_users",
      "manage_dealers",
      "manage_roles",
      "manage_permissions",
      "manage_configuration",
      "delete",
      "approve",
    ] as const) {
      await expect(requireAdminContext(p)).resolves.toMatchObject({ isAdmin: true });
    }
  });

  it("admits SUPER_ADMIN to the same gates", async () => {
    signIn(SUPER_ADMIN);
    await expect(requireAdminContext("manage_dealers")).resolves.toMatchObject({
      isAdmin: true,
    });
    await expect(guardAdminPage()).resolves.toMatchObject({ role: "SUPER_ADMIN" });
  });

  it("is not a dealer, so dealer-scoped entry points still refuse it", async () => {
    signIn(ADMIN);
    await expect(requireDealerContext()).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("unauthenticated callers", () => {
  beforeEach(() => signIn(null));

  it("are refused by every throwing guard", async () => {
    await expect(requireAuthContext()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(requirePermission("read")).rejects.toBeInstanceOf(AuthenticationError);
    await expect(requireDealerContext()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(requireAdminContext()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("are sent to the login page by page guards", async () => {
    await expect(guardAdminPage()).rejects.toThrow("REDIRECT:/login");
  });
});

describe("row-level ownership assertions", () => {
  it("blocks cross-dealer access and allows own-dealer access", async () => {
    signIn(DEALER_A);
    const ctx = (await getAuthContext())!;
    expect(() => assertDealerOwnership(ctx, "dealer_A", "listing")).not.toThrow();
    expect(() => assertDealerOwnership(ctx, "dealer_B", "listing")).toThrow(
      AuthorizationError,
    );
    expect(() => assertDealerOwnership(ctx, null, "listing")).toThrow(AuthorizationError);
    expect(() => assertDealerOwnership(ctx, undefined, "listing")).toThrow(
      AuthorizationError,
    );
  });

  it("lets admins through the ownership assertions", async () => {
    signIn(ADMIN);
    const ctx = (await getAuthContext())!;
    expect(() => assertDealerOwnership(ctx, "dealer_B", "listing")).not.toThrow();
    expect(() => assertUserOwnership(ctx, "someone_else", "enquiry")).not.toThrow();
    expect(() => assertParticipant(ctx, ["x", "y"], "transfer")).not.toThrow();
  });

  it("blocks cross-user access", async () => {
    signIn(BUYER);
    const ctx = (await getAuthContext())!;
    expect(() => assertUserOwnership(ctx, "u_buyer", "enquiry")).not.toThrow();
    expect(() => assertUserOwnership(ctx, "u_other", "enquiry")).toThrow(
      AuthorizationError,
    );
  });

  it("admits either party of a two-sided resource and nobody else", async () => {
    signIn(DEALER_B);
    const ctx = (await getAuthContext())!;
    expect(() => assertParticipant(ctx, ["u_dealer_b", "u_buyer"], "transfer")).not.toThrow();
    expect(() => assertParticipant(ctx, ["u_x", "u_y"], "transfer")).toThrow(
      AuthorizationError,
    );
    expect(() => assertParticipant(ctx, [null, undefined], "transfer")).toThrow(
      AuthorizationError,
    );
  });
});
