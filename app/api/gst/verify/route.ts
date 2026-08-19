import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { db, unwrap } from "@/lib/db";
import { verifyGstin, isValidGstin } from "@/lib/gst";

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  let gstin: string;
  try {
    const body = await req.json();
    gstin = body.gstin;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!gstin || !isValidGstin(gstin)) {
    return NextResponse.json({ error: "Invalid GSTIN format" }, { status: 400 });
  }

  const result = await verifyGstin(gstin);
  if (!result) {
    return NextResponse.json(
      { error: "GSTIN verification provider is not configured" },
      { status: 503 },
    );
  }

  // Only mark dealer.gstVerified=true when the upstream provider is trusted.
  // Mock/stub results return trusted=false to avoid forged "verified" badges.
  //
  // This write runs with the service role, which is what lets it past
  // `guard_dealer_verification_change` — a dealer session cannot set
  // gstVerified for itself.
  unwrap(
    await db
      .from("Dealer")
      .update({
        gstin: gstin.replace(/\s/g, "").toUpperCase(),
        ...(result.trusted ? { gstVerified: true } : {}),
      })
      .eq("id", gate.ctx.dealerId!)
      .select("id"),
    "POST /api/gst/verify",
  );

  return NextResponse.json({
    verified: result.trusted,
    legalName: result.legalName,
    tradeName: result.tradeName,
    address: result.address,
  });
}
