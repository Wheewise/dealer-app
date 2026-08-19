import { NextResponse } from "next/server";
import { count, db } from "@/lib/db";
import { apiRequireDealer } from "@/lib/rbac";

export async function GET() {
  // Returns a zero count rather than 401/403 — this drives a nav badge that
  // polls on every page, and an error there would surface as a console error
  // for signed-out visitors.
  const gate = await apiRequireDealer();
  if (!gate.ok) return NextResponse.json({ count: 0 });
  const dealerId = gate.ctx.dealerId;
  if (!dealerId) return NextResponse.json({ count: 0 });

  // head: true asks PostgREST for the count header only, so no rows travel.
  const unread = await count(
    db
      .from("Enquiry")
      .select("id", { count: "exact", head: true })
      .eq("dealerId", dealerId)
      .eq("isRead", false),
  );

  return NextResponse.json({ count: unread });
}
