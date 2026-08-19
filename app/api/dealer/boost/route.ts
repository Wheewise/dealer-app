import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { db, unwrapMaybe } from "@/lib/db";
import { razorpay, BOOST_PLANS } from "@/lib/razorpay";

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  if (!razorpay) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const dealer = { id: gate.ctx.dealerId };

  let listingId: string;
  let duration: string;
  try {
    const body = await req.json();
    listingId = body.listingId;
    duration = body.duration;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const plan = BOOST_PLANS[duration as keyof typeof BOOST_PLANS];
  if (!plan) {
    return NextResponse.json(
      { error: "Invalid duration. Use 7, 14, or 30." },
      { status: 400 },
    );
  }

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("id")
      .eq("id", listingId)
      .eq("dealerId", dealer.id!)
      .maybeSingle(),
    "POST /api/dealer/boost",
  );
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  const order = await razorpay.orders.create({
    amount: plan.amount,
    currency: "INR",
    receipt: `boost_${listing.id}_${Date.now()}`,
    notes: {
      kind: "boost",
      listingId: listing.id,
      dealerId: dealer.id,
      duration,
    },
  });

  return NextResponse.json({
    orderId: order.id,
    amount: plan.amount,
    plan: plan.label,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}
