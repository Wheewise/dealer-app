import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
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
  if (event.id) {
    try {
      await prisma.payment.create({
        data: {
          razorpayEventId: event.id,
          kind: "WEBHOOK",
          amount: 0,
          status: "SUCCEEDED",
          notes: { event: event.event, route: "billing/webhook" },
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return NextResponse.json({ ok: true, replayed: true });
      }
      throw err;
    }
  }

  const sub = event.payload?.subscription?.entity;
  if (!sub) return NextResponse.json({ ok: true });

  const mapped = STATUS_MAP[sub.status];
  if (!mapped) return NextResponse.json({ ok: true });

  // updateMany runs as a multi-statement transaction, which the Cloudflare
  // Workers Neon HTTP adapter can't do (see lib/db.ts) — find the row by
  // its unique razorpaySubId, then update it directly.
  const existing = await prisma.subscription.findUnique({
    where: { razorpaySubId: sub.id },
    select: { id: true },
  });
  if (existing) {
    await prisma.subscription.update({
      where: { id: existing.id },
      data: {
        status: mapped,
        ...(sub.current_end ? { currentPeriodEnd: new Date(sub.current_end * 1000) } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
