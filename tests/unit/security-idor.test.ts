import { describe, it, expect, vi, beforeEach } from "vitest";

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

import { auth } from "../../lib/auth";
import * as dbModule from "../../lib/db";
import type { DbMock, RecordedCall } from "../helpers/supabase-mock";
import { getTransferById, getTransferByListing } from "../../lib/actions/rctransfer";
import { submitInspection } from "../../lib/actions/inspections";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

function signIn(
  row: { id: string; role: string; dealer?: { id: string; status: "ACTIVE" } } | null,
) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: row.role } } : null);
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

/** Seller + buyer PII, exactly what must not leak to a third party. */
const TRANSFER = {
  id: "rct_1",
  sellerId: "u_seller",
  buyerId: "u_buyer",
  documents: [],
  seller: { id: "u_seller", name: "Seller", phone: "9990000001" },
  buyer: { id: "u_buyer", name: "Buyer", phone: "9990000002" },
  listing: { id: "l_1", make: "Honda", model: "City", year: 2020 },
};

function inspectionWrites(): RecordedCall[] {
  return dbMock.calls.filter(
    (c) => c.table === "Inspection" && c.operation === "update",
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
  dbMock.on("RCTransfer", { data: TRANSFER });
});

/**
 * `"use server"` exports are HTTP endpoints. Before this fix, both readers
 * below ran no authorization at all: the page checked participation *after*
 * calling them, so a direct action invocation with any transfer id returned
 * both parties' names and phone numbers.
 */
describe("RC transfer readers — IDOR", () => {
  it.each([
    ["getTransferById", () => getTransferById("rct_1")],
    ["getTransferByListing", () => getTransferByListing("l_1")],
  ])("%s refuses an unauthenticated caller", async (_name, call) => {
    signIn(null);
    await expect(call()).resolves.toBeNull();
  });

  it.each([
    ["getTransferById", () => getTransferById("rct_1")],
    ["getTransferByListing", () => getTransferByListing("l_1")],
  ])("%s refuses a signed-in stranger", async (_name, call) => {
    signIn({ id: "u_stranger", role: "BUYER" });
    await expect(call()).resolves.toBeNull();
  });

  it("refuses an unrelated dealer", async () => {
    signIn({
      id: "u_other_dealer",
      role: "DEALER",
      dealer: { id: "dealer_Z", status: "ACTIVE" },
    });
    await expect(getTransferById("rct_1")).resolves.toBeNull();
  });

  it("returns the row to the seller", async () => {
    signIn({ id: "u_seller", role: "DEALER", dealer: { id: "d1", status: "ACTIVE" } });
    await expect(getTransferById("rct_1")).resolves.toMatchObject({ id: "rct_1" });
  });

  it("returns the row to the buyer", async () => {
    signIn({ id: "u_buyer", role: "BUYER" });
    await expect(getTransferByListing("l_1")).resolves.toMatchObject({ id: "rct_1" });
  });

  it("returns the row to an admin", async () => {
    signIn({ id: "u_admin", role: "ADMIN" });
    await expect(getTransferById("rct_1")).resolves.toMatchObject({ id: "rct_1" });
  });

  it("returns null for a missing transfer, same shape as a denial", async () => {
    signIn({ id: "u_seller", role: "BUYER" });
    dbMock.on("RCTransfer", { data: null });
    await expect(getTransferById("nope")).resolves.toBeNull();
  });

  // RCTransfer has two foreign keys into User; an unqualified `User(...)`
  // embed is ambiguous and PostgREST rejects the whole request, so the
  // constraint names are load-bearing rather than stylistic.
  it("disambiguates the seller and buyer embeds by constraint name", async () => {
    signIn({ id: "u_seller", role: "BUYER" });
    await getTransferById("rct_1");
    const projection = dbMock.callFor("RCTransfer")?.select ?? "";
    expect(projection).toContain("seller:User!RCTransfer_sellerId_fkey");
    expect(projection).toContain("buyer:User!RCTransfer_buyerId_fkey");
  });
});

/**
 * `submitInspection` previously checked only that the caller was *an*
 * approved inspector, never that the inspection was assigned to them — so any
 * approved inspector could overwrite any other inspector's report and score.
 */
describe("submitInspection — cross-inspector BOLA", () => {
  beforeEach(() => {
    dbMock.on("Inspector", { data: { id: "insp_A", status: "APPROVED" } });
    dbMock.on("Inspection", { data: { id: "inspection_1", status: "SCHEDULED" } });
  });

  it("refuses an inspection that is not assigned to the caller", async () => {
    dbMock.on("Inspection", { data: null });
    await expect(submitInspection("inspection_other", [], "notes")).rejects.toThrow(
      /not found/i,
    );
    expect(inspectionWrites()).toHaveLength(0);
  });

  it("scopes the assignment lookup to the caller's inspector id", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    await submitInspection("inspection_1", [], "notes");
    const lookup = dbMock.calls.find(
      (c) => c.table === "Inspection" && c.operation === "select",
    );
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "inspection_1"] },
        { method: "eq", args: ["inspectorId", "insp_A"] },
      ]),
    );
  });

  it("refuses a caller who is not an approved inspector", async () => {
    signIn({ id: "u_buyer", role: "BUYER" });
    dbMock.on("Inspector", { data: { id: "insp_B", status: "PENDING" } });
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /approved inspector/i,
    );
    expect(inspectionWrites()).toHaveLength(0);
  });

  it("refuses an unauthenticated caller", async () => {
    signIn(null);
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /unauthorized/i,
    );
  });

  it("refuses to overwrite an already-submitted report", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    dbMock.on("Inspection", { data: { id: "inspection_1", status: "COMPLETED" } });
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /already submitted/i,
    );
    expect(inspectionWrites()).toHaveLength(0);
  });

  // The inspectorId filter is repeated on the UPDATE, so the ownership check
  // is enforced by the statement that mutates, not only by the one that read.
  it("carries the inspector scope onto the write itself", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    await submitInspection("inspection_1", [], "notes");
    expect(inspectionWrites()[0].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["id", "inspection_1"] },
        { method: "eq", args: ["inspectorId", "insp_A"] },
      ]),
    );
  });
});
