import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});

import { auth } from "../../lib/auth";
import * as dbModule from "../../lib/db";
import type { DbMock } from "../helpers/supabase-mock";
import {
  apiRequireAdmin,
  apiRequireAuth,
  apiRequireDealer,
  apiRequirePermission,
} from "../../lib/rbac/api";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

type Row = {
  id: string;
  role: string;
  dealer: { id: string; status: "ACTIVE" | "SUSPENDED" } | null;
};

/**
 * `getAuthContext` re-reads the User row on every gate, so the answer is a
 * standing default rather than a one-shot queue entry.
 */
function signIn(row: Row | null, claimedRole = row?.role) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: claimedRole } } : null);
  dbMock.on("User", {
    data: row ? { ...row, email: `${row.id}@example.com`, name: row.id } : null,
  });
}

const BUYER: Row = { id: "u_buyer", role: "BUYER", dealer: null };
const DEALER_A: Row = {
  id: "u_a",
  role: "DEALER",
  dealer: { id: "dealer_A", status: "ACTIVE" },
};
const SUSPENDED: Row = {
  id: "u_s",
  role: "DEALER",
  dealer: { id: "dealer_S", status: "SUSPENDED" },
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
});

describe("API gates — status codes", () => {
  it("returns 401 with no session, not 403", async () => {
    signIn(null);
    for (const gate of [
      await apiRequireAuth(),
      await apiRequirePermission("read"),
      await apiRequireDealer(),
      await apiRequireAdmin(),
    ]) {
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.response.status).toBe(401);
    }
  });

  it("returns 403 when authenticated but under-privileged", async () => {
    signIn(BUYER);
    for (const gate of [
      await apiRequirePermission("create"),
      await apiRequireDealer(),
      await apiRequireAdmin("manage_users"),
    ]) {
      expect(gate.ok).toBe(false);
      if (!gate.ok) expect(gate.response.status).toBe(403);
    }
  });

  it("refuses an admin gate to a dealer", async () => {
    signIn(DEALER_A);
    const gate = await apiRequireAdmin("manage_dealers");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("admits a dealer to read but not write while suspended", async () => {
    signIn(SUSPENDED);
    expect((await apiRequireDealer()).ok).toBe(true);
    const write = await apiRequireDealer({ write: true });
    expect(write.ok).toBe(false);
    if (!write.ok) expect(write.response.status).toBe(403);
  });

  it("ignores a forged admin role claim when the user row says BUYER", async () => {
    signIn(BUYER, "SUPER_ADMIN");
    const gate = await apiRequireAdmin();
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("carries a server-derived dealerId through the dealer gate", async () => {
    signIn(DEALER_A);
    const gate = await apiRequireDealer({ write: true });
    expect(gate.ok).toBe(true);
    if (gate.ok) expect(gate.ctx.dealerId).toBe("dealer_A");
  });
});
