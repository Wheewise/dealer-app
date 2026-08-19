import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth + prisma BEFORE importing the action under test.
vi.mock("../../lib/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("../../lib/db", () => ({
  prisma: {
    listing: { findUnique: vi.fn() },
    loanApplication: { create: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyForLoan } from "../../lib/actions/finance";
import { auth } from "../../lib/auth";
import { prisma } from "../../lib/db";

const baseInput = {
  listingId: "list_123",
  amount: 500_000,
  tenureMonths: 60,
  nbfc: "HDFC_BANK" as const,
  applicantName: "Test Buyer",
  applicantPhone: "+919876543210",
  applicantPan: "ABCDE1234F",
};

// The Prisma + NextAuth types are intentionally loose at the seam — tests use
// just the subset of fields the action reads. Avoid wrestling the full types.
type AnyMock = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as AnyMock;
const findUniqueMock = prisma.listing.findUnique as unknown as AnyMock;

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({ user: { id: "user_1", role: "BUYER" } });
  findUniqueMock.mockResolvedValue({
    id: "list_123",
    status: "ACTIVE",
    askingPrice: 600_000,
    dealerId: "d1",
  });
});

describe("applyForLoan", () => {
  it("creates a loan application on valid input", async () => {
    const res = await applyForLoan(baseInput);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.emi).toBeGreaterThan(0);
    expect(prisma.loanApplication.create).toHaveBeenCalledOnce();
  });

  it("rejects when caller is not authenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await applyForLoan(baseInput);
    expect(res.ok).toBe(false);
    expect(prisma.loanApplication.create).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    const res = await applyForLoan({ ...baseInput, amount: -1 });
    expect(res.ok).toBe(false);
    expect(prisma.loanApplication.create).not.toHaveBeenCalled();
  });

  it("rejects amount above 50M cap", async () => {
    const res = await applyForLoan({ ...baseInput, amount: 50_000_001 });
    expect(res.ok).toBe(false);
  });

  it("rejects tenure outside [6, 84] months", async () => {
    expect((await applyForLoan({ ...baseInput, tenureMonths: 5 })).ok).toBe(false);
    expect((await applyForLoan({ ...baseInput, tenureMonths: 85 })).ok).toBe(false);
    expect((await applyForLoan({ ...baseInput, tenureMonths: 1_000_000 })).ok).toBe(
      false,
    );
  });

  it("rejects malformed PAN", async () => {
    const res = await applyForLoan({ ...baseInput, applicantPan: "NOT-A-PAN" });
    expect(res.ok).toBe(false);
  });

  it("accepts missing PAN (optional)", async () => {
    const { applicantPan: _omit, ...rest } = baseInput;
    void _omit;
    const res = await applyForLoan(rest);
    expect(res.ok).toBe(true);
  });

  it("rejects amount above 2× listing price (sanity cap)", async () => {
    const res = await applyForLoan({ ...baseInput, amount: 1_500_000 });
    expect(res.ok).toBe(false);
  });

  it("rejects when listing is SOLD", async () => {
    findUniqueMock.mockResolvedValue({
      id: "list_123",
      status: "SOLD",
      askingPrice: 600_000,
      dealerId: "d1",
    });
    const res = await applyForLoan(baseInput);
    expect(res.ok).toBe(false);
  });

  it("rejects when listing does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);
    const res = await applyForLoan(baseInput);
    expect(res.ok).toBe(false);
  });
});
