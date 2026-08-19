import { NextResponse } from "next/server";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
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
  const conversation = unwrapMaybe(
    await db
      .from("Conversation")
      .select("buyerId, dealerId")
      .eq("id", conversationId)
      .maybeSingle(),
    "isParticipant",
  );
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

  const messages = unwrap(
    await db
      .from("Message")
      .select("id, senderId, body, createdAt, readAt")
      .eq("conversationId", conversationId)
      .order("createdAt", { ascending: true })
      .limit(100),
    "GET /api/chat/messages",
  );

  const unreadIds = messages
    .filter((m) => m.senderId !== gate.ctx.userId && !m.readAt)
    .map((m) => m.id);

  if (unreadIds.length > 0) {
    // One statement for the whole batch.
    unwrap(
      await db
        .from("Message")
        .update({ readAt: new Date().toISOString() })
        .in("id", unreadIds)
        .select("id"),
      "mark messages read",
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

  // Conversation.lastMessageAt is stamped by the insert trigger (see
  // supabase/schema.sql), so the chat-list ordering cannot drift out of step
  // with the messages themselves.
  const message = unwrap(
    await db
      .from("Message")
      .insert({
        conversationId,
        senderId: gate.ctx.userId,
        body: body.trim(),
      })
      .select("id, senderId, body, createdAt, readAt")
      .single(),
    "POST /api/chat/messages",
  );

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
