import { NextResponse } from "next/server";
import { db, isUniqueViolation, unwrap } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/razorpay";

export async function POST(req: Request) {
  try {
    const signature = req.headers.get("x-razorpay-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const bodyText = await req.text();

    if (!verifyWebhookSignature(bodyText, signature)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(bodyText) as {
      id?: string;
      event: string;
      payload: {
        subscription?: {
          entity: { id: string; current_end?: number };
        };
      };
    };

    // Replay protection: insert a Payment row keyed by the webhook event id.
    // Razorpay event ids are unique per delivery, so a redelivery violates
    // Payment_razorpayEventId_key (23505) and we ack silently without
    // re-processing.
    if (event.id) {
      const { error } = await db.from("Payment").insert({
        razorpayEventId: event.id,
        kind: "WEBHOOK",
        amount: 0,
        status: "SUCCEEDED",
        notes: { event: event.event },
      });
      if (error) {
        if (isUniqueViolation(error)) {
          return NextResponse.json({ received: true, replayed: true });
        }
        throw new Error(error.message);
      }
    }

    // Filtering on the unique razorpaySubId is the whole scope: an unknown
    // subscription id matches nothing and the webhook is still acked.
    if (event.event === "subscription.charged" && event.payload.subscription) {
      const sub = event.payload.subscription.entity;
      unwrap(
        await db
          .from("Subscription")
          .update({
            status: "ACTIVE",
            ...(sub.current_end
              ? { currentPeriodEnd: new Date(sub.current_end * 1000).toISOString() }
              : {}),
          })
          .eq("razorpaySubId", sub.id)
          .select("id"),
        "razorpay webhook: charged",
      );
    } else if (event.event === "subscription.cancelled" && event.payload.subscription) {
      unwrap(
        await db
          .from("Subscription")
          .update({ status: "CANCELLED" })
          .eq("razorpaySubId", event.payload.subscription.entity.id)
          .select("id"),
        "razorpay webhook: cancelled",
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
