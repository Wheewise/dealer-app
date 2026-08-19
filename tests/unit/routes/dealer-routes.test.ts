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
vi.mock("../../../lib/db", async () => {
  const { makeDbModule } = await import("../../helpers/supabase-mock");
  return makeDbModule();
});
vi.mock("../../../lib/rto", () => ({ fetchRto: vi.fn() }));
vi.mock("../../../lib/ai-description", () => ({
  generateDescription: vi.fn(),
  ensureDescription: vi.fn(),
}));

import { auth } from "../../../lib/auth";
import * as dbModule from "../../../lib/db";
import type { DbMock, Operation, RecordedCall } from "../../helpers/supabase-mock";
import { fetchRto } from "../../../lib/rto";

import { GET as rtoGET } from "../../../app/api/rto/route";
import { DELETE as apiKeyDELETE } from "../../../app/api/dealer/api-keys/route";
import { GET as unreadGET } from "../../../app/api/dealer/leads/unread-count/route";
import { POST as aiPOST } from "../../../app/api/ai/generate-description/route";
import { GET as listingsGET } from "../../../app/api/listings/route";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

function callsTo(table: string, operation: Operation): RecordedCall[] {
  return dbMock.calls.filter((c) => c.table === table && c.operation === operation);
}

type Row = {
  id: string;
  role: string;
  dealer?: { id: string; status: "ACTIVE" | "SUSPENDED" };
};

function signIn(row: Row | null, claimedRole = row?.role) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: claimedRole } } : null);
  dbMock.on("User", {
    data: row
      ? {
          id: row.id,
          email: `${row.id}@example.com`,
          name: row.id,
          role: row.role,
          dealer: row.dealer ?? null,
        }
      : null,
  });
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
  dbMock.reset();
  dbMock.on("Enquiry", { count: 7 });
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
    // The dealerId filter rides on the DELETE, so another dealer's key simply
    // matches no row and nothing is removed.
    dbMock.on("ApiKey", { data: [] });
    const res = await apiKeyDELETE(
      new Request("https://x.test/api/dealer/api-keys?id=dealer_B_key", {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("scopes the delete to the caller's own dealer id", async () => {
    signIn(DEALER_A);
    dbMock.on("ApiKey", { data: [{ id: "k1" }] });
    await apiKeyDELETE(
      new Request("https://x.test/api/dealer/api-keys?id=k1", { method: "DELETE" }),
    );
    expect(callsTo("ApiKey", "delete")[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "k1"] },
        { method: "eq", args: ["dealerId", "dealer_A"] },
      ]),
    );
  });
});

describe("GET /api/dealer/leads/unread-count", () => {
  it("reveals nothing to buyers", async () => {
    signIn(BUYER);
    const res = await unreadGET();
    expect(await res.json()).toEqual({ count: 0 });
    expect(callsTo("Enquiry", "select")).toHaveLength(0);
  });

  it("counts only the caller's own dealer enquiries", async () => {
    signIn(DEALER_A);
    const res = await unreadGET();
    expect(await res.json()).toEqual({ count: 7 });
    expect(callsTo("Enquiry", "select")[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["dealerId", "dealer_A"] },
        { method: "eq", args: ["isRead", false] },
      ]),
    );
  });

  // head: true means PostgREST returns the count header and no rows, so a
  // dealer's lead volume never travels just to be counted.
  it("asks for a count without transferring rows", async () => {
    signIn(DEALER_A);
    await unreadGET();
    expect(callsTo("Enquiry", "select")[0].selectOptions).toEqual({
      count: "exact",
      head: true,
    });
  });
});

/**
 * GET /api/listings was the clearest instance of BOLA in the codebase: no
 * authentication, every listing status returned, and an attacker-supplied
 * `dealerId` used verbatim as the filter.
 */
describe("GET /api/listings — tenant scoping", () => {
  function listingQuery(): RecordedCall {
    const call = callsTo("Listing", "select")[0];
    if (!call) throw new Error("no Listing query was issued");
    return call;
  }

  function filters() {
    return listingQuery().filters;
  }

  it("rejects anonymous callers", async () => {
    signIn(ANON);
    const res = await listingsGET(new Request("https://x.test/api/listings"));
    expect(res.status).toBe(401);
    expect(callsTo("Listing", "select")).toHaveLength(0);
  });

  it("limits buyers to ACTIVE listings", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(filters()).toContainEqual({ method: "eq", args: ["status", "ACTIVE"] });
  });

  it("does not expose enquiry counts to buyers", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(listingQuery().select).not.toContain("Enquiry(count)");
  });

  it("pins a dealer to their own inventory, ignoring the query string", async () => {
    signIn(DEALER_A);
    await listingsGET(new Request("https://x.test/api/listings"));
    expect(filters()).toContainEqual({ method: "eq", args: ["dealerId", "dealer_A"] });
    expect(filters()).not.toContainEqual({ method: "eq", args: ["status", "ACTIVE"] });
  });

  it("refuses a dealer asking for a rival dealer's inventory", async () => {
    signIn(DEALER_A);
    const res = await listingsGET(
      new Request("https://x.test/api/listings?dealerId=dealer_B"),
    );
    expect(res.status).toBe(403);
    expect(callsTo("Listing", "select")).toHaveLength(0);
  });

  it("lets a dealer pass their own id explicitly", async () => {
    signIn(DEALER_A);
    const res = await listingsGET(
      new Request("https://x.test/api/listings?dealerId=dealer_A"),
    );
    expect(res.status).toBe(200);
    expect(filters()).toContainEqual({ method: "eq", args: ["dealerId", "dealer_A"] });
  });

  it("lets admins filter across dealers", async () => {
    signIn(ADMIN);
    await listingsGET(new Request("https://x.test/api/listings?dealerId=dealer_B"));
    expect(filters()).toContainEqual({ method: "eq", args: ["dealerId", "dealer_B"] });
  });

  it("clamps a hostile limit instead of honouring it", async () => {
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings?limit=100000"));
    expect(listingQuery().limit).toBe(51);

    dbMock.reset();
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings?limit=-5"));
    expect(listingQuery().limit).toBe(2);

    dbMock.reset();
    signIn(BUYER);
    await listingsGET(new Request("https://x.test/api/listings?limit=abc"));
    expect(listingQuery().limit).toBe(21);
  });

  // A cursor is an opaque base64 of the sort key, so a malformed one restarts
  // from the first page rather than 500ing.
  it("ignores a malformed cursor", async () => {
    signIn(BUYER);
    const res = await listingsGET(
      new Request("https://x.test/api/listings?cursor=not-a-cursor"),
    );
    expect(res.status).toBe(200);
    expect(filters().some((f) => f.method === "or")).toBe(false);
  });
});
