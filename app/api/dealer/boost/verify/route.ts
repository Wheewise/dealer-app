import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireDealer } from "@/lib/rbac";
import { db, isUniqueViolation, unwrap, unwrapMaybe } from "@/lib/db";
import {
  razorpay,
  verifyPaymentSignature,
  BOOST_PLANS,
  type BoostDuration,
} from "@/lib/razorpay";

const bodySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;
  if (!razorpay) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 503 });
  }

  const dealer = { id: gate.ctx.dealerId };

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  if (
    !verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const order = await razorpay.orders.fetch(razorpay_order_id);
  const notes = (order.notes ?? {}) as Record<string, string>;
  if (notes.kind !== "boost" || notes.dealerId !== dealer.id) {
    return NextResponse.json(
      { error: "Order does not belong to caller" },
      { status: 403 },
    );
  }

  const plan = BOOST_PLANS[notes.duration as BoostDuration];
  if (!plan) {
    return NextResponse.json({ error: "Invalid order metadata" }, { status: 400 });
  }

  // Re-check the amount Razorpay charged against our authoritative plan table.
  // Defends against plan-table changes between order creation and verification.
  if (Number(order.amount) !== plan.amount) {
    return NextResponse.json(
      { error: "Order amount does not match current plan" },
      { status: 409 },
    );
  }
  const days = plan.days;

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("id, boostExpiresAt")
      .eq("id", notes.listingId)
      .eq("dealerId", dealer.id!)
      .maybeSingle(),
    "boost verify: listing",
  );
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Idempotency: write the Payment row first, with razorpayPaymentId unique.
  // A second verify of the same payment violates that index (23505) and we
  // return the existing result without re-extending the boost.
  const { error: paymentError } = await db.from("Payment").insert({
    razorpayOrderId: razorpay_order_id,
    razorpayPaymentId: razorpay_payment_id,
    razorpaySignature: razorpay_signature,
    kind: "BOOST",
    amount: plan.amount,
    status: "SUCCEEDED",
    dealerId: dealer.id,
    listingId: listing.id,
    notes: { duration: notes.duration, days },
  });
  if (paymentError) {
    if (isUniqueViolation(paymentError)) {
      return NextResponse.json(
        {
          ok: true,
          alreadyProcessed: true,
          expiresAt: listing.boostExpiresAt,
        },
        { status: 200 },
      );
    }
    throw new Error(paymentError.message);
  }

  // Extend an unexpired boost rather than restarting it, so a dealer who
  // tops up early does not lose the remaining days.
  const existingExpiry = listing.boostExpiresAt ? new Date(listing.boostExpiresAt) : null;
  const base = existingExpiry && existingExpiry > new Date() ? existingExpiry : new Date();
  const boostExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  unwrap(
    await db
      .from("Listing")
      .update({ isBoosted: true, boostExpiresAt: boostExpiresAt.toISOString() })
      .eq("id", listing.id)
      .select("id"),
    "boost verify: extend",
  );

  return NextResponse.json({ ok: true, expiresAt: boostExpiresAt });
}
