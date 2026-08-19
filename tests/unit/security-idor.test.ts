import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    dealer: { findUnique: vi.fn() },
    rCTransfer: { findUnique: vi.fn() },
    inspector: { findUnique: vi.fn() },
    inspection: { findFirst: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";
import { getTransferById, getTransferByListing } from "../../lib/actions/rctransfer";
import { submitInspection } from "../../lib/actions/inspections";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const userFindUnique = prisma.user.findUnique as unknown as M;
const transferFindUnique = prisma.rCTransfer.findUnique as unknown as M;
const inspectorFindUnique = prisma.inspector.findUnique as unknown as M;
const inspectionFindFirst = prisma.inspection.findFirst as unknown as M;
const inspectionUpdate = prisma.inspection.update as unknown as M;

function signIn(
  row: { id: string; role: string; dealer?: { id: string; status: "ACTIVE" } } | null,
) {
  authMock.mockResolvedValue(row ? { user: { id: row.id, role: row.role } } : null);
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

beforeEach(() => {
  vi.clearAllMocks();
  transferFindUnique.mockResolvedValue(TRANSFER);
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
    transferFindUnique.mockResolvedValue(null);
    await expect(getTransferById("nope")).resolves.toBeNull();
  });
});

/**
 * `submitInspection` previously checked only that the caller was *an*
 * approved inspector, never that the inspection was assigned to them — so any
 * approved inspector could overwrite any other inspector's report and score.
 */
describe("submitInspection — cross-inspector BOLA", () => {
  beforeEach(() => {
    inspectorFindUnique.mockResolvedValue({ id: "insp_A", status: "APPROVED" });
    inspectionFindFirst.mockResolvedValue({ id: "inspection_1", status: "SCHEDULED" });
    inspectionUpdate.mockResolvedValue({});
  });

  it("refuses an inspection that is not assigned to the caller", async () => {
    inspectionFindFirst.mockResolvedValue(null);
    await expect(submitInspection("inspection_other", [], "notes")).rejects.toThrow(
      /not found/i,
    );
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("scopes the assignment lookup to the caller's inspector id", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    await submitInspection("inspection_1", [], "notes");
    expect(inspectionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inspection_1", inspectorId: "insp_A" },
      }),
    );
  });

  it("refuses a caller who is not an approved inspector", async () => {
    signIn({ id: "u_buyer", role: "BUYER" });
    inspectorFindUnique.mockResolvedValue({ id: "insp_B", status: "PENDING" });
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /approved inspector/i,
    );
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated caller", async () => {
    signIn(null);
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /unauthorized/i,
    );
  });

  it("refuses to overwrite an already-submitted report", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    inspectionFindFirst.mockResolvedValue({ id: "inspection_1", status: "COMPLETED" });
    await expect(submitInspection("inspection_1", [], "n")).rejects.toThrow(
      /already submitted/i,
    );
    expect(inspectionUpdate).not.toHaveBeenCalled();
  });

  it("writes against the id proven to be assigned, not the caller's argument", async () => {
    signIn({ id: "u_insp", role: "BUYER" });
    inspectionFindFirst.mockResolvedValue({ id: "inspection_1", status: "SCHEDULED" });
    await submitInspection("inspection_1", [], "notes");
    expect(inspectionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "inspection_1" } }),
    );
  });
});
