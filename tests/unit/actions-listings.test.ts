import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { setListingStatus, deleteListing } from "../../lib/actions/listings";
import { auth } from "../../lib/auth";
import * as dbModule from "../../lib/db";
import type { DbMock, RecordedCall } from "../helpers/supabase-mock";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

/** The signed-in dealer, as the database sees them. */
function dealerUserRow(status: "ACTIVE" | "SUSPENDED" = "ACTIVE") {
  return {
    id: "user_A",
    email: "a@example.com",
    name: "Dealer A",
    role: "DEALER",
    dealer: { id: "dealer_A", status },
  };
}

function dealerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "dealer_A",
    userId: "user_A",
    status: "ACTIVE",
    store: { slug: "a" },
    subscription: {
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    },
    ...overrides,
  };
}

/** Writes against Listing — the statements whose filters carry the scoping. */
function listingWrites(operation: "update" | "delete"): RecordedCall[] {
  return dbMock.calls.filter((c) => c.table === "Listing" && c.operation === operation);
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
  authMock.mockResolvedValue({ user: { id: "user_A", role: "DEALER" } });
  // getAuthContext() re-reads role + dealer scope from the database rather
  // than trusting the JWT claim, so the User row is on the guard path of
  // every dealer action.
  dbMock.on("User", { data: dealerUserRow() });
  dbMock.on("Dealer", { data: dealerRow() });
  // The scoped write matches one row by default; individual tests return an
  // empty array to simulate "belongs to another dealer".
  dbMock.on("Listing", { data: [{ id: "listing_X" }] });
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
});

describe("setListingStatus — IDOR scoping", () => {
  // The dealerId filter rides on the UPDATE itself, so ownership is enforced
  // by the statement that writes rather than by a separate read that a later
  // refactor could drop.
  it("scopes the write to (listingId AND dealerId)", async () => {
    await setListingStatus("listing_X", "SOLD");
    const [write] = listingWrites("update");
    expect(write.payload).toEqual({ status: "SOLD" });
    expect(write.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "listing_X"] },
        { method: "eq", args: ["dealerId", "dealer_A"] },
      ]),
    );
  });

  it("refuses another dealer's listing — the write matches no row", async () => {
    dbMock.on("Listing", { data: [] });
    await expect(setListingStatus("dealer_B_listing", "ACTIVE")).resolves.toEqual({
      ok: false,
      error: "Listing not found",
    });
    // The statement runs, but its dealerId filter means it touches nothing.
    expect(listingWrites("update")[0].filters).toContainEqual({
      method: "eq",
      args: ["dealerId", "dealer_A"],
    });
  });

  it("redirects BUYER callers off the dashboard", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "BUYER" } });
    dbMock.on("User", {
      data: { id: "u", email: "b@example.com", name: "Buyer", role: "BUYER", dealer: null },
    });
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/");
    expect(listingWrites("update")).toHaveLength(0);
  });

  // Role tampering: the session claims DEALER, the database says BUYER.
  // Authorization must follow the database.
  it("ignores a DEALER role claim in the session when the user row says BUYER", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    dbMock.on("User", {
      data: { id: "u", email: "b@example.com", name: "Buyer", role: "BUYER", dealer: null },
    });
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/");
    expect(listingWrites("update")).toHaveLength(0);
  });

  it("refuses writes from a SUSPENDED dealer", async () => {
    dbMock.on("User", { data: dealerUserRow("SUSPENDED") });
    dbMock.on("Dealer", { data: dealerRow({ status: "SUSPENDED" }) });
    await expect(setListingStatus("listing_X", "ACTIVE")).rejects.toThrow(/suspended/i);
    expect(listingWrites("update")).toHaveLength(0);
  });

  it("treats a deleted user as signed out even with a valid session cookie", async () => {
    dbMock.on("User", { data: null });
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/login");
    expect(listingWrites("update")).toHaveLength(0);
  });
});

describe("deleteListing — IDOR scoping", () => {
  it("scopes the delete to (listingId AND dealerId)", async () => {
    dbMock.on("Listing", { data: [{ id: "listing_Y" }] });
    await deleteListing("listing_Y");
    expect(listingWrites("delete")[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "listing_Y"] },
        { method: "eq", args: ["dealerId", "dealer_A"] },
      ]),
    );
  });

  it("refuses another dealer's listing — the delete matches no row", async () => {
    dbMock.on("Listing", { data: [] });
    await expect(deleteListing("dealer_B_listing")).resolves.toEqual({
      ok: false,
      error: "Listing not found",
    });
  });

  // The billing gate is behind a feature flag that is off by default, so these
  // two cases have to turn it on explicitly — without the flag `requireDealer`
  // never reaches the subscription checks.
  it("redirects callers to billing when subscription is PAST_DUE", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    dbMock.on("Dealer", {
      data: dealerRow({
        subscription: { status: "PAST_DUE", currentPeriodEnd: new Date().toISOString() },
      }),
    });
    await expect(deleteListing("listing_Y")).rejects.toThrow(
      "REDIRECT:/dashboard/billing",
    );
    expect(listingWrites("delete")).toHaveLength(0);
  });

  it("redirects when subscription period has lapsed even with ACTIVE status", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    dbMock.on("Dealer", {
      data: dealerRow({
        subscription: {
          status: "ACTIVE",
          currentPeriodEnd: new Date(Date.now() - 86_400_000).toISOString(),
        },
      }),
    });
    await expect(deleteListing("listing_Y")).rejects.toThrow(
      "REDIRECT:/dashboard/billing",
    );
    expect(listingWrites("delete")).toHaveLength(0);
  });
});
