import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { apiRequireDealer } from "@/lib/rbac";
import { prisma } from "@/lib/db";
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

  const listing = await prisma.listing.findFirst({
    where: { id: notes.listingId, dealerId: dealer.id },
    select: { id: true, boostExpiresAt: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  // Idempotency: write the Payment row first with razorpay_payment_id unique.
  // A second verify of the same payment hits P2002 and we return the existing
  // result without re-extending the boost.
  try {
    await prisma.payment.create({
      data: {
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        kind: "BOOST",
        amount: plan.amount,
        status: "SUCCEEDED",
        dealerId: dealer.id,
        listingId: listing.id,
        notes: { duration: notes.duration, days },
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        {
          ok: true,
          alreadyProcessed: true,
          expiresAt: listing.boostExpiresAt,
        },
        { status: 200 },
      );
    }
    throw err;
  }

  const base =
    listing.boostExpiresAt && listing.boostExpiresAt > new Date()
      ? listing.boostExpiresAt
      : new Date();
  const boostExpiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  await prisma.listing.update({
    where: { id: listing.id },
    data: { isBoosted: true, boostExpiresAt },
  });

  return NextResponse.json({ ok: true, expiresAt: boostExpiresAt });
}
