import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRequirePermission, type AuthContext } from "@/lib/rbac";

/**
 * A conversation is readable/writable only by its buyer or its dealer.
 * Both sides of the comparison come from the server: the conversation row
 * from the database, the identity from the session context.
 */
async function isParticipant(
  conversationId: string,
  ctx: AuthContext,
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, dealerId: true },
  });
  if (!conversation) return false;
  if (conversation.buyerId === ctx.userId) return true;
  if (ctx.role === "DEALER" && ctx.dealerId && conversation.dealerId === ctx.dealerId) {
    return true;
  }
  return false;
}

export async function GET(req: Request) {
  const gate = await apiRequirePermission("read", "messages");
  if (!gate.ok) return gate.response;

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  // 404, not 403 — telling a stranger a conversation exists is an oracle.
  if (!(await isParticipant(conversationId, gate.ctx))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      senderId: true,
      body: true,
      createdAt: true,
      readAt: true,
    },
    take: 100,
  });

  type Message = (typeof messages)[number];
  const unreadIds = messages
    .filter((m: Message) => m.senderId !== gate.ctx.userId && !m.readAt)
    .map((m: Message) => m.id);

  if (unreadIds.length > 0) {
    // updateMany runs as a multi-statement transaction, which the Cloudflare
    // Workers Neon HTTP adapter can't do (see lib/db.ts) — update each row
    // individually instead.
    const readAt = new Date();
    await Promise.all(
      unreadIds.map((id: string) =>
        prisma.message.update({ where: { id }, data: { readAt } }),
      ),
    );
  }

  return NextResponse.json(messages);
}

export async function POST(req: Request) {
  const gate = await apiRequirePermission("self:create", "messages");
  if (!gate.ok) return gate.response;

  let conversationId: string;
  let body: string;
  try {
    const json = await req.json();
    conversationId = json.conversationId;
    body = json.body;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!conversationId || !body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json(
      { error: "conversationId and body required" },
      { status: 400 },
    );
  }

  if (!(await isParticipant(conversationId, gate.ctx))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: gate.ctx.userId,
      body: body.trim(),
    },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date() },
  });

  return NextResponse.json(
    {
      id: message.id,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt,
      readAt: message.readAt,
    },
    { status: 201 },
  );
}
