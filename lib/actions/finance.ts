"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { NBFC } from "@prisma/client";

const NBFC_VALUES = Object.values(NBFC) as [NBFC, ...NBFC[]];

// PAN format: 5 letters + 4 digits + 1 letter
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const loanInputSchema = z.object({
  listingId: z.string().min(1).max(40),
  amount: z.number().int().min(10_000).max(50_000_000),
  tenureMonths: z.number().int().min(6).max(84),
  nbfc: z.enum(NBFC_VALUES),
  applicantName: z.string().trim().min(2).max(80),
  applicantPhone: z
    .string()
    .trim()
    .min(7)
    .max(20)
    .regex(/^[+\d\s-]+$/),
  applicantPan: z
    .string()
    .trim()
    .toUpperCase()
    .regex(PAN_RE)
    .optional()
    .or(z.literal("")),
  notes: z.string().max(1000).optional(),
});

export type ApplyForLoanInput = z.input<typeof loanInputSchema>;

export async function applyForLoan(input: ApplyForLoanInput) {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const parsed = loanInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Invalid loan application",
      fields: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const listing = await prisma.listing.findUnique({
    where: { id: data.listingId },
    select: { id: true, status: true, askingPrice: true, dealerId: true },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return { ok: false as const, error: "Listing not available" };
  }

  // Don't lend more than 2× asking price — catches obvious typos / abuse.
  const maxLoanable = Math.round(Number(listing.askingPrice) * 2);
  if (data.amount > maxLoanable) {
    return {
      ok: false as const,
      error: `Loan amount exceeds the listing price`,
    };
  }

  const monthlyRate = 0.115 / 12;
  const emi =
    (data.amount * monthlyRate * Math.pow(1 + monthlyRate, data.tenureMonths)) /
    (Math.pow(1 + monthlyRate, data.tenureMonths) - 1);
  const monthlyEmi = Math.round(emi * 100) / 100;

  await prisma.loanApplication.create({
    data: {
      listingId: data.listingId,
      buyerId: session.user.id,
      nbfc: data.nbfc,
      amount: data.amount,
      tenureMonths: data.tenureMonths,
      monthlyEmi,
      applicantName: data.applicantName,
      applicantPhone: data.applicantPhone,
      applicantPan: data.applicantPan?.length ? data.applicantPan : null,
      notes: data.notes ?? null,
    },
  });

  revalidatePath(`/vehicle/${data.listingId}`);
  return { ok: true as const, emi: monthlyEmi };
}

export async function getLoanApplications(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return prisma.loanApplication.findMany({
    where: { listingId, buyerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDealerLoanApplications() {
  const { dealer } = await requireDealer();

  return prisma.loanApplication.findMany({
    where: { listing: { dealerId: dealer.id } },
    include: {
      buyer: { select: { name: true, email: true, phone: true } },
      listing: { select: { make: true, model: true, year: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateLoanStatus(
  loanId: string,
  status: "APPROVED" | "REJECTED" | "DISBURSED",
) {
  const { dealer } = await requireDealer({ write: true });

  const loan = await prisma.loanApplication.findUnique({
    where: { id: loanId },
    select: { listing: { select: { dealerId: true } } },
  });
  if (!loan || loan.listing.dealerId !== dealer.id) {
    throw new Error("Loan not found");
  }

  await prisma.loanApplication.update({
    where: { id: loanId },
    data: { status },
  });
  revalidatePath("/dashboard/loans");
}

export async function updateListingInsurance(
  listingId: string,
  provider: string,
  expiry: string,
) {
  const { dealer } = await requireDealer({ write: true });

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!listing) {
    throw new Error("Listing not found");
  }

  await prisma.listing.update({
    where: { id: listingId },
    data: { insuranceProvider: provider, insuranceExpiry: new Date(expiry) },
  });
  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
