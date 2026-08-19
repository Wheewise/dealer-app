import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", () => ({
  prisma: {
    // getAuthContext() re-reads role + dealer scope from the database rather
    // than trusting the JWT claim, so the user row is on the guard path of
    // every dealer action.
    user: { findUnique: vi.fn() },
    dealer: { findUnique: vi.fn() },
    listing: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { setListingStatus, deleteListing } from "../../lib/actions/listings";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const userFindUnique = prisma.user.findUnique as unknown as M;
const dealerFindUnique = prisma.dealer.findUnique as unknown as M;
const listingFindFirst = prisma.listing.findFirst as unknown as M;
const listingUpdate = prisma.listing.update as unknown as M;
const listingDelete = prisma.listing.delete as unknown as M;

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

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user_A", role: "DEALER" } });
  userFindUnique.mockResolvedValue(dealerUserRow());
  dealerFindUnique.mockResolvedValue({
    id: "dealer_A",
    status: "ACTIVE",
    store: { slug: "a" },
    subscription: {
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    },
  });
  // The ownership-scoped lookup finds the row by default; individual tests
  // null it out to simulate "belongs to another dealer".
  listingFindFirst.mockResolvedValue({ id: "listing_X" });
  listingUpdate.mockResolvedValue({});
  listingDelete.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_BILLING_ENABLED;
});

describe("setListingStatus — IDOR scoping", () => {
  it("scopes the ownership lookup to (listingId AND dealerId)", async () => {
    await setListingStatus("listing_X", "SOLD");
    expect(listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing_X", dealerId: "dealer_A" },
      select: { id: true },
    });
    // The write targets the id returned by that scoped lookup, never the
    // caller-supplied id directly.
    expect(listingUpdate).toHaveBeenCalledWith({
      where: { id: "listing_X" },
      data: { status: "SOLD" },
    });
  });

  it("refuses another dealer's listing without writing", async () => {
    listingFindFirst.mockResolvedValue(null);
    await expect(setListingStatus("dealer_B_listing", "ACTIVE")).resolves.toEqual({
      ok: false,
      error: "Listing not found",
    });
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it("redirects BUYER callers off the dashboard", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "BUYER" } });
    userFindUnique.mockResolvedValue({
      id: "u",
      email: "b@example.com",
      name: "Buyer",
      role: "BUYER",
      dealer: null,
    });
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/");
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  // Role tampering: the session claims DEALER, the database says BUYER.
  // Authorization must follow the database.
  it("ignores a DEALER role claim in the session when the user row says BUYER", async () => {
    authMock.mockResolvedValue({ user: { id: "u", role: "DEALER" } });
    userFindUnique.mockResolvedValue({
      id: "u",
      email: "b@example.com",
      name: "Buyer",
      role: "BUYER",
      dealer: null,
    });
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/");
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it("refuses writes from a SUSPENDED dealer", async () => {
    userFindUnique.mockResolvedValue(dealerUserRow("SUSPENDED"));
    dealerFindUnique.mockResolvedValue({
      id: "dealer_A",
      status: "SUSPENDED",
      store: { slug: "a" },
      subscription: {
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    await expect(setListingStatus("listing_X", "ACTIVE")).rejects.toThrow(/suspended/i);
    expect(listingUpdate).not.toHaveBeenCalled();
  });

  it("treats a deleted user as signed out even with a valid session cookie", async () => {
    userFindUnique.mockResolvedValue(null);
    await expect(setListingStatus("listing_X", "SOLD")).rejects.toThrow("REDIRECT:/login");
    expect(listingUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteListing — IDOR scoping", () => {
  it("scopes the ownership lookup to (listingId AND dealerId)", async () => {
    listingFindFirst.mockResolvedValue({ id: "listing_Y" });
    await deleteListing("listing_Y");
    expect(listingFindFirst).toHaveBeenCalledWith({
      where: { id: "listing_Y", dealerId: "dealer_A" },
      select: { id: true },
    });
    expect(listingDelete).toHaveBeenCalledWith({ where: { id: "listing_Y" } });
  });

  it("refuses another dealer's listing without deleting", async () => {
    listingFindFirst.mockResolvedValue(null);
    await expect(deleteListing("dealer_B_listing")).resolves.toEqual({
      ok: false,
      error: "Listing not found",
    });
    expect(listingDelete).not.toHaveBeenCalled();
  });

  // The billing gate is behind a feature flag that is off by default, so these
  // two cases have to turn it on explicitly — without the flag `requireDealer`
  // never reaches the subscription checks.
  it("redirects callers to billing when subscription is PAST_DUE", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    dealerFindUnique.mockResolvedValue({
      id: "dealer_A",
      status: "ACTIVE",
      store: { slug: "a" },
      subscription: { status: "PAST_DUE", currentPeriodEnd: new Date() },
    });
    await expect(deleteListing("listing_Y")).rejects.toThrow(
      "REDIRECT:/dashboard/billing",
    );
    expect(listingDelete).not.toHaveBeenCalled();
  });

  it("redirects when subscription period has lapsed even with ACTIVE status", async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = "true";
    dealerFindUnique.mockResolvedValue({
      id: "dealer_A",
      status: "ACTIVE",
      store: { slug: "a" },
      subscription: {
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() - 86_400_000),
      },
    });
    await expect(deleteListing("listing_Y")).rejects.toThrow(
      "REDIRECT:/dashboard/billing",
    );
    expect(listingDelete).not.toHaveBeenCalled();
  });
});
