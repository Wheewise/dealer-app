import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRequireDealer } from "@/lib/rbac";

export async function GET() {
  // Returns a zero count rather than 401/403 — this drives a nav badge that
  // polls on every page, and an error there would surface as a console error
  // for signed-out visitors.
  const gate = await apiRequireDealer();
  if (!gate.ok) return NextResponse.json({ count: 0 });
  const dealerId = gate.ctx.dealerId;

  const count = await prisma.enquiry.count({
    where: { dealerId, isRead: false },
  });

  return NextResponse.json({ count });
}
