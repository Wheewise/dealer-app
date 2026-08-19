import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { prisma } from "@/lib/db";
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
  await prisma.dealer.update({
    where: { id: gate.ctx.dealerId },
    data: {
      gstin: gstin.replace(/\s/g, "").toUpperCase(),
      ...(result.trusted ? { gstVerified: true } : {}),
    },
  });

  return NextResponse.json({
    verified: result.trusted,
    legalName: result.legalName,
    tradeName: result.tradeName,
    address: result.address,
  });
}
