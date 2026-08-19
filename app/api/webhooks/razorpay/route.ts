import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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

    // Replay protection: insert Payment row keyed by webhook event id.
    // Razorpay event ids are unique per delivery; a replay hits P2002 and we
    // ack the webhook silently without re-processing.
    if (event.id) {
      try {
        await prisma.payment.create({
          data: {
            razorpayEventId: event.id,
            kind: "WEBHOOK",
            amount: 0,
            status: "SUCCEEDED",
            notes: { event: event.event },
          },
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          return NextResponse.json({ received: true, replayed: true });
        }
        throw err;
      }
    }

    // updateMany runs as a multi-statement transaction, which the
    // Cloudflare Workers Neon HTTP adapter can't do (see lib/db.ts) — find
    // the row by its unique razorpaySubId, then update it directly.
    if (event.event === "subscription.charged" && event.payload.subscription) {
      const sub = event.payload.subscription.entity;
      const existing = await prisma.subscription.findUnique({
        where: { razorpaySubId: sub.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: {
            status: "ACTIVE",
            ...(sub.current_end
              ? { currentPeriodEnd: new Date(sub.current_end * 1000) }
              : {}),
          },
        });
      }
    } else if (event.event === "subscription.cancelled" && event.payload.subscription) {
      const existing = await prisma.subscription.findUnique({
        where: { razorpaySubId: event.payload.subscription.entity.id },
        select: { id: true },
      });
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
