import { NextResponse } from "next/server";
import { db, DbError, unwrap, unwrapMaybe } from "@/lib/db";
import { apiRequirePermission } from "@/lib/rbac";

export async function GET() {
  const gate = await apiRequirePermission("read", "conversations");
  if (!gate.ok) return gate.response;

  // Both scopes come from the authenticated context — a client cannot ask
  // for another buyer's or another dealer's thread list.
  const userId = gate.ctx.userId;
  const myDealerId = gate.ctx.role === "DEALER" ? gate.ctx.dealerId : null;

  const scope = myDealerId
    ? `buyerId.eq.${userId},dealerId.eq.${myDealerId}`
    : `buyerId.eq.${userId}`;

  const conversations = unwrap(
    await db
      .from("Conversation")
      .select(
        `*,
         listing:Listing(id, year, make, model, photos:ListingPhoto(id, url, sortOrder)),
         buyer:User(id, name),
         dealer:Dealer(id, businessName),
         messages:Message(id, body, createdAt)`,
      )
      .or(scope)
      // lastMessageAt is the authoritative chat-list order; fall back to
      // updatedAt for conversations that have no messages yet.
      .order("lastMessageAt", { ascending: false, nullsFirst: false })
      .order("updatedAt", { ascending: false }),
    "GET /api/chat/conversations",
  );

  // GROUP BY has no PostgREST equivalent, so the per-thread unread tally is a
  // single RPC rather than pulling every unread message back to count them.
  const ids = conversations.map((c) => c.id);
  const unreadMap = new Map<string, number>();
  if (ids.length > 0) {
    const { data, error } = await db.rpc("unread_message_counts", {
      p_conversation_ids: ids,
      p_user_id: userId,
    });
    if (error) throw new DbError(error, "unread_message_counts");
    for (const row of data ?? []) unreadMap.set(row.conversationId, Number(row.count));
  }

  const result = conversations.map((c) => {
    // PostgREST cannot order or limit an embed per parent row, so the cover
    // photo and the latest message are picked here. ISO-8601 sorts correctly
    // as text.
    const photo = [...c.listing.photos].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const lastMessage = [...c.messages].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0];

    return {
      id: c.id,
      listing: {
        id: c.listing.id,
        title: `${c.listing.year} ${c.listing.make} ${c.listing.model}`,
        photo: photo?.url ?? null,
      },
      otherParty:
        userId === c.buyerId
          ? { name: c.dealer.businessName, id: c.dealer.id }
          : { name: c.buyer.name ?? "Buyer", id: c.buyer.id },
      lastMessage: lastMessage?.body?.slice(0, 100) ?? null,
      unread: unreadMap.get(c.id) ?? 0,
      updatedAt: c.lastMessageAt ?? c.updatedAt,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const gate = await apiRequirePermission("self:create", "conversations");
  if (!gate.ok) return gate.response;

  let listingId: string;
  try {
    const body = await req.json();
    listingId = body.listingId;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!listingId) {
    return NextResponse.json({ error: "listingId required" }, { status: 400 });
  }

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("dealerId, dealer:Dealer(userId)")
      .eq("id", listingId)
      .maybeSingle(),
    "POST /api/chat/conversations: listing",
  );
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }

  if (listing.dealer.userId === gate.ctx.userId) {
    return NextResponse.json(
      { error: "Cannot message your own listing" },
      { status: 400 },
    );
  }

  const existing = unwrapMaybe(
    await db
      .from("Conversation")
      .select("id")
      .eq("listingId", listingId)
      .eq("buyerId", gate.ctx.userId)
      .maybeSingle(),
    "POST /api/chat/conversations: existing",
  );
  if (existing) {
    return NextResponse.json({ id: existing.id });
  }

  // Upsert rather than insert: two taps on "message dealer" both read "no
  // conversation", and the unique index on (listingId, buyerId) decides.
  const conversation = unwrap(
    await db
      .from("Conversation")
      .upsert(
        { listingId, buyerId: gate.ctx.userId, dealerId: listing.dealerId },
        { onConflict: "listingId,buyerId" },
      )
      .select("id")
      .single(),
    "POST /api/chat/conversations",
  );

  return NextResponse.json({ id: conversation.id }, { status: 201 });
}
