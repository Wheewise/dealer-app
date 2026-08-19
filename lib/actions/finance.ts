"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import type { NBFC } from "@/types/supabase";

const NBFC_VALUES = [
  "BAJAJ_FINSERV",
  "HDFC_BANK",
  "ICICI_BANK",
  "MAHINDRA_FINANCE",
  "KOTAK_MAHINDRA",
  "CHOLAMANDALAM",
  "SHRIRAM_FINANCE",
  "SUNDARAM_FINANCE",
  "TATA_CAPITAL",
  "OTHER",
] as const satisfies readonly NBFC[];

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

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("id, status, askingPrice, dealerId")
      .eq("id", data.listingId)
      .maybeSingle(),
    "applyForLoan: listing",
  );
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

  unwrap(
    await db
      .from("LoanApplication")
      .insert({
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
      })
      .select("id")
      .single(),
    "applyForLoan",
  );

  revalidatePath(`/vehicle/${data.listingId}`);
  return { ok: true as const, emi: monthlyEmi };
}

export async function getLoanApplications(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  return unwrap(
    await db
      .from("LoanApplication")
      .select("*")
      .eq("listingId", listingId)
      .eq("buyerId", session.user.id)
      .order("createdAt", { ascending: false }),
    "getLoanApplications",
  );
}

export async function getDealerLoanApplications() {
  const { dealer } = await requireDealer();

  // `!inner` makes the Listing embed a join rather than a left join, so the
  // dealerId filter on it actually restricts which loans come back.
  const rows = unwrap(
    await db
      .from("LoanApplication")
      .select(
        `*,
         buyer:User(name, email, phone),
         listing:Listing!inner(make, model, year, dealerId)`,
      )
      .eq("listing.dealerId", dealer.id)
      .order("createdAt", { ascending: false }),
    "getDealerLoanApplications",
  );

  return rows;
}

export async function updateLoanStatus(
  loanId: string,
  status: "APPROVED" | "REJECTED" | "DISBURSED",
) {
  const { dealer } = await requireDealer({ write: true });

  const loan = unwrapMaybe(
    await db
      .from("LoanApplication")
      .select("id, listing:Listing!inner(dealerId)")
      .eq("id", loanId)
      .eq("listing.dealerId", dealer.id)
      .maybeSingle(),
    "updateLoanStatus lookup",
  );
  if (!loan) throw new Error("Loan not found");

  unwrap(
    await db.from("LoanApplication").update({ status }).eq("id", loanId).select("id"),
    "updateLoanStatus",
  );
  revalidatePath("/dashboard/loans");
}

export async function updateListingInsurance(
  listingId: string,
  provider: string,
  expiry: string,
) {
  const { dealer } = await requireDealer({ write: true });

  const updated = unwrap(
    await db
      .from("Listing")
      .update({
        insuranceProvider: provider,
        insuranceExpiry: new Date(expiry).toISOString(),
      })
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "updateListingInsurance",
  );
  if (updated.length === 0) throw new Error("Listing not found");

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
