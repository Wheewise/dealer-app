import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Adversarial coverage for the route handlers that ship with the **dealer**
 * app. Every request below is one a hostile client can send directly,
 * bypassing the UI: no session, the wrong role, a forged role claim, or
 * another tenant's resource id.
 *
 * Kept separate from the user-app handlers so each generated repo only runs
 * the tests for routes it actually contains (see scripts/build-role-repos.mjs).
 */

vi.mock("../../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../../lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    apiKey: { findFirst: vi.fn(), delete: vi.fn(), create: vi.fn() },
    enquiry: { count: vi.fn() },
    listing: { findMany: vi.fn() },
  },
}));
vi.mock("../../../lib/rto", () => ({ fetchRto: vi.fn() }));
vi.mock("../../../lib/ai-description", () => ({
  generateDescription: vi.fn(),
  ensureDescription: vi.fn(),
}));

import { auth } from "../../../lib/auth";
import { prisma } from "../../../lib/db";
import { fetchRto } from "../../../lib/rto";

import { GET as rtoGET } from "../../../app/api/rto/route";
import { DELETE as apiKeyDELETE } from "../../../app/api/dealer/api-keys/route";
import { GET as unreadGET } from "../../../app/api/dealer/leads/unread-count/route";
import { POST as aiPOST } from "../../../app/api/ai/generate-description/route";
import { GET as listingsGET } from "../../../app/api/listings/route";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const userFindUnique = prisma.user.findUnique as unknown as M;
const apiKeyFindFirst = prisma.apiKey.findFirst as unknown as M;
const apiKeyDelete = prisma.apiKey.delete as unknown as M;
const enquiryCount = prisma.enquiry.count as unknown as M;
const listingFindMany = prisma.listing.findMany as unknown as M;

type Row = {
  id: string;
  role: string;
  dealer?: { id: string; status: "ACTIVE" | "SUSPENDED" };
};

function signIn(row: Row | null, claimedRole = row?.role) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: claimedRole } } : null);
  userFindUnique.mockResolvedValue(
    row
      ? {
          id: row.id,
          email: `${row.id}@example.com`,
          name: row.id,
          role: row.role,
          dealer: row.dealer ?? null,
        }
      : null,
  );
}

const ANON = null;
const BUYER: Row = { id: "u_buyer", role: "BUYER" };
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
const ADMIN: Row = { id: "u_admin", role: "ADMIN" };

const jsonReq = (url: string, body: unknown, method = "POST") =>
  new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  enquiryCount.mockResolvedValue(7);
  listingFindMany.mockResolvedValue([]);
  (fetchRto as unknown as M).mockResolvedValue({ regNumber: "MH12AB1234" });
});

describe("dealer-only endpoints reject users and anonymous callers", () => {
  const cases: Array<[string, () => Promise<Response>]> = [
    ["GET /api/rto", () => rtoGET(new Request("https://x.test/api/rto?reg=MH12AB1234"))],
    [
      "DELETE /api/dealer/api-keys",
      () =>
        apiKeyDELETE(
          new Request("https://x.test/api/dealer/api-keys?id=k1", { method: "DELETE" }),
        ),
    ],
    [
      "POST /api/ai/generate-description",
      () =>
        aiPOST(
          jsonReq("https://x.test/api/ai/generate-description", {
            make: "Honda",
            model: "City",
            year: 2020,
            askingPrice: 500000,
          }),
        ),
    ],
  ];

  it.each(cases)("%s returns 401 when signed out", async (_name, call) => {
    signIn(ANON);
    expect((await call()).status).toBe(401);
  });

  it.each(cases)("%s returns 403 for a BUYER", async (_name, call) => {
    signIn(BUYER);
    expect((await call()).status).toBe(403);
  });

  it.each(cases)("%s returns 403 for an ADMIN (not a dealer)", async (_name, call) => {
    signIn(ADMIN);
    expect((await call()).status).toBe(403);
  });

  it.each(cases)(
    "%s returns 403 for a BUYER presenting a forged DEALER claim",
    async (_name, call) => {
      signIn(BUYER, "DEALER");
      expect((await call()).status).toBe(403);
    },
  );

  it.each(cases)("%s returns 403 for a SUSPENDED dealer", async (_name, call) => {
    signIn(SUSPENDED);
    expect((await call()).status).toBe(403);
  });
});

describe("GET /api/rto — input validation", () => {
  it("rejects a malformed registration number without calling the provider", async () => {
    signIn(DEALER_A);
    const res = await rtoGET(
      new Request("https://x.test/api/rto?reg=" + encodeURIComponent("../../etc/passwd")),
    );
    expect(res.status).toBe(400);
    expect(fetchRto).not.toHaveBeenCalled();
  });

  it("accepts a well-formed one from a dealer", async () => {
    signIn(DEALER_A);
    const res = await rtoGET(new Request("https://x.test/api/rto?reg=MH12AB1234"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/dealer/api-keys — cross-tenant key deletion", () => {
  it("refuses a key belonging to another dealer", async () => {
    signIn(DEALER_A);
    // The ownership-scoped lookup finds nothing, because the key is dealer B's.
    apiKeyFindFirst.mockResolvedValue(null);
    const res = await apiKeyDELETE(
      new Request("https://x.test/api/dealer/api-keys?id=dealer_B_key", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(404);
    expect(apiKeyDelete).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the caller's own dealer id", async () => {
    signIn(DEALER_A);
    apiKeyFindFirst.mockResolvedValue({ id: "k1", dealerId: "dealer_A" });
    apiKeyDelete.mockResolvedValue({});
    await apiKeyDELETE(
      new Request("https://x.test/api/dealer/api-keys?id=k1", { method: "DELETE" }),
    );
    expect(apiKeyFindFirst).toHaveBeenCalledWith({
      where: { id: "k1", dealerId: "dealer_A" },
    });
    expect(apiKeyDelete).toHaveBeenCalledWith({ where: { id: "k1" } });
  });
});

describe("GET /api/dealer/leads/unread-count", () => {
  it("reveals nothing to buyers", async () => {
    signIn(BUYER);
    const res = await unreadGET();
    expect(await res.json()).toEqual({ count: 0 });
    expect(enquiryCount).not.toHaveBeenCalled();
  });

  it("counts only the caller's own dealer enquiries", async () => {
    signIn(DEALER_A);
    const res = await unreadGET();
    expect(await res.json()).toEqual({ count: 7 });
    expect(enquiryCount).toHaveBeenCalledWith({
      where: { dealerId: "dealer_A", isRead: false },
    });
  });
});

/**
 * GET /api/listings was the clearest instance of BOLA in the codebase: no
 * authentication, every listing status returned, and an attacker-supplied
 * `dealerId` used verbatim as the filter.
 */
describe("GET /api/listings — tenant scoping", () => {
  function whereArg() {
    return listingFindMany.mock.calls[0][0].where;
  }

  it("rejects anonymous callers", async () => {
    signIn(ANON);
    const res = await listingsGET(new Request("https://x.test/api/listings"));
    expect(res.status).toBe(401);
    expect(listingFindMany).not.toHaveBeenCalled();
  });

  it("limits buyers to ACTIVE listings", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(whereArg()).toEqual({ status: "ACTIVE" });
  });

  it("does not expose enquiry counts to buyers", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(listingFindMany.mock.calls[0][0].include._count).toBeUndefined();
  });

  it("pins a dealer to their own inventory, ignoring the query string", async () => {
    signIn(DEALER_A);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(whereArg()).toEqual({ dealerId: "dealer_A" });
  });

  it("refuses a dealer asking for a rival dealer's inventory", async () => {
    signIn(DEALER_A);
    const res = await listingsGET(
      new Request("https://x.test/api/listings?dealerId=dealer_B"),
    );
    expect(res.status).toBe(403);
    expect(listingFindMany).not.toHaveBeenCalled();
  });

  it("lets a dealer pass their own id explicitly", async () => {
    signIn(DEALER_A);
    const res = await listingsGET(
      new Request("https://x.test/api/listings?dealerId=dealer_A"),
    );
    expect(res.status).toBe(200);
    expect(whereArg()).toEqual({ dealerId: "dealer_A" });
  });

  it("lets admins filter across dealers", async () => {
    signIn(ADMIN);
    await listingsGET(new Request("https://x.test/api/listings?dealerId=dealer_B"));
    expect(whereArg()).toEqual({ dealerId: "dealer_B" });
  });

  it("clamps a hostile limit instead of honouring it", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings?limit=100000"));
    expect(listingFindMany.mock.calls[0][0].take).toBe(51);

    listingFindMany.mockClear();
    await listingsGET(new Request("https://x.test/api/listings?limit=-5"));
    expect(listingFindMany.mock.calls[0][0].take).toBe(2);

    listingFindMany.mockClear();
    await listingsGET(new Request("https://x.test/api/listings?limit=abc"));
    expect(listingFindMany.mock.calls[0][0].take).toBe(21);
  });
});
