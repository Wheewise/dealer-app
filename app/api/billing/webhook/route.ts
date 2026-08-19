import { NextResponse } from "next/server";
import { db, isUniqueViolation, unwrap } from "@/lib/db";
import { verifyWebhookSignature, type RazorpayWebhookEvent } from "@/lib/razorpay";

const STATUS_MAP: Record<string, "ACTIVE" | "PAST_DUE" | "CANCELLED" | "TRIALING"> = {
  active: "ACTIVE",
  authenticated: "TRIALING",
  pending: "PAST_DUE",
  halted: "PAST_DUE",
  cancelled: "CANCELLED",
  completed: "CANCELLED",
  expired: "CANCELLED",
};

export async function POST(req: Request) {
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }
  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Replay protection — see /api/webhooks/razorpay for the same pattern.
  // Payment_razorpayEventId_key is what enforces it: a redelivered event
  // violates the index (23505) and is acked without re-processing.
  if (event.id) {
    const { error } = await db.from("Payment").insert({
      razorpayEventId: event.id,
      kind: "WEBHOOK",
      amount: 0,
      status: "SUCCEEDED",
      notes: { event: event.event, route: "billing/webhook" },
    });
    if (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ ok: true, replayed: true });
      }
      throw new Error(error.message);
    }
  }

  const sub = event.payload?.subscription?.entity;
  if (!sub) return NextResponse.json({ ok: true });

  const mapped = STATUS_MAP[sub.status];
  if (!mapped) return NextResponse.json({ ok: true });

  // Filtering on the unique razorpaySubId is the whole scope: an unknown
  // subscription id matches nothing and the webhook is still acked.
  unwrap(
    await db
      .from("Subscription")
      .update({
        status: mapped,
        ...(sub.current_end
          ? { currentPeriodEnd: new Date(sub.current_end * 1000).toISOString() }
          : {}),
      })
      .eq("razorpaySubId", sub.id)
      .select("id"),
    "billing/webhook: subscription status",
  );

  return NextResponse.json({ ok: true });
}
