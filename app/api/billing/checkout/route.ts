import { NextResponse } from "next/server";
import { z } from "zod";
import { apiRequireDealer } from "@/lib/rbac";
import { db, unwrap } from "@/lib/db";
import { razorpay, PLAN_IDS, type RazorpayPlanTier } from "@/lib/razorpay";

const bodySchema = z.object({ plan: z.enum(["MONTHLY", "YEARLY"]) });

export async function POST(req: Request) {
  // Read-level gate on purpose: a suspended dealer must still be able to
  // settle their subscription.
  const gate = await apiRequireDealer();
  if (!gate.ok) return gate.response;
  if (!razorpay) {
    return NextResponse.json({ error: "Billing not configured" }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const dealer = { id: gate.ctx.dealerId };

  const plan = parsed.data.plan as RazorpayPlanTier;
  const planId = PLAN_IDS[plan];
  if (!planId) {
    return NextResponse.json({ error: "Plan not configured" }, { status: 503 });
  }

  const sub = await razorpay.subscriptions.create({
    plan_id: planId,
    customer_notify: 1,
    total_count: plan === "YEARLY" ? 5 : 60,
    notes: { dealerId: dealer.id, plan },
  });

  // Deliberately not one upsert: an existing subscription must keep its
  // `status` and `currentPeriodEnd`. Overwriting those would drop a paying
  // dealer back to TRIALING with a fresh 14-day window every time they
  // switched plans. Only a first-time row gets the trial defaults.
  const updated = unwrap(
    await db
      .from("Subscription")
      .update({ plan, razorpaySubId: sub.id })
      .eq("dealerId", dealer.id!)
      .select("id"),
    "billing/checkout: update subscription",
  );

  if (updated.length === 0) {
    unwrap(
      await db
        .from("Subscription")
        .insert({
          dealerId: dealer.id!,
          plan,
          status: "TRIALING",
          razorpaySubId: sub.id,
          currentPeriodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("id")
        .single(),
      "billing/checkout: create subscription",
    );
  }

  return NextResponse.json({
    subscriptionId: sub.id,
    keyId: process.env.RAZORPAY_KEY_ID,
  });
}
