import Link from "next/link";
import { notFound } from "next/navigation";
import { requireDealer } from "@/lib/dealer";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
import { formatINR } from "@/lib/format";
import { whatsappLink } from "@/lib/whatsapp";
import { ReplyForm } from "./ReplyForm";
import { CloseButton } from "./CloseButton";

type Params = Promise<{ id: string }>;

const STATUS_LABEL: Record<string, string> = {
  OPEN: "New",
  REPLIED: "Replied",
  CLOSED: "Closed",
};

export default async function LeadDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const { dealer } = await requireDealer();

  // The dealerId filter is the ownership check.
  const row = unwrapMaybe(
    await db
      .from("Enquiry")
      .select(
        `*, listing:Listing(
           id, make, model, year, askingPrice,
           photos:ListingPhoto(url, sortOrder)
         )`,
      )
      .eq("id", id)
      .eq("dealerId", dealer.id)
      .maybeSingle(),
    "lead detail",
  );
  if (!row) notFound();

  // PostgREST cannot limit an embed per parent row.
  const enquiry = {
    ...row,
    listing: {
      ...row.listing,
      photos: [...row.listing.photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1),
    },
  };

  if (!enquiry.isRead) {
    unwrap(
      await db.from("Enquiry").update({ isRead: true }).eq("id", enquiry.id).select("id"),
      "lead detail: mark read",
    );
  }

  const conversation = enquiry.buyerId
    ? unwrapMaybe(
        await db
          .from("Conversation")
          .select("id")
          .eq("listingId", enquiry.listingId)
          .eq("buyerId", enquiry.buyerId)
          .maybeSingle(),
        "lead detail: conversation",
      )
    : null;

  const messages = conversation
    ? unwrap(
        await db
          .from("Message")
          .select("*")
          .eq("conversationId", conversation.id)
          .order("createdAt", { ascending: true }),
        "lead detail: messages",
      )
    : [];

  const unreadIds = messages
    .filter((m) => m.senderId !== dealer.userId && !m.readAt)
    .map((m) => m.id);
  if (unreadIds.length > 0) {
    // One statement for the whole batch.
    unwrap(
      await db
        .from("Message")
        .update({ readAt: new Date().toISOString() })
        .in("id", unreadIds)
        .select("id"),
      "lead detail: mark messages read",
    );
  }

  const vehicle = `${enquiry.listing.year} ${enquiry.listing.make} ${enquiry.listing.model}`;
  const waLink = whatsappLink(
    enquiry.buyerPhone,
    `Hi ${enquiry.buyerName}, this is ${dealer.businessName} regarding the ${vehicle}.`,
  );

  return (
    <div className="space-y-4">
      <Link href="/dashboard/leads" className="text-sm text-zinc-500 hover:underline">
        ← Back to leads
      </Link>

      <div className="border-border-default bg-background flex items-center gap-4 rounded-lg border p-5">
        {enquiry.listing.photos[0] ? (
          <img
            src={enquiry.listing.photos[0].url}
            alt={vehicle}
            className="h-16 w-24 rounded-md object-cover"
          />
        ) : (
          <div className="bg-surface-muted h-16 w-24 rounded-md" />
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/inventory/${enquiry.listing.id}/edit`}
            className="font-semibold hover:underline"
          >
            {vehicle}
          </Link>
          <div className="text-sm text-zinc-500">
            {formatINR(Number(enquiry.listing.askingPrice))}
          </div>
        </div>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 uppercase">
          {STATUS_LABEL[enquiry.status] ?? enquiry.status}
        </span>
      </div>

      <div className="border-border-default bg-background rounded-lg border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">{enquiry.buyerName}</div>
            <div className="text-sm text-zinc-500">
              {enquiry.buyerPhone}
              {enquiry.buyerEmail ? ` · ${enquiry.buyerEmail}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener"
                className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                WhatsApp
              </a>
            ) : null}
            <a
              href={`tel:${enquiry.buyerPhone}`}
              className="border-border-default hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-semibold"
            >
              Call
            </a>
            <CloseButton enquiryId={enquiry.id} disabled={enquiry.status === "CLOSED"} />
          </div>
        </div>
      </div>

      <div className="border-border-default bg-background overflow-hidden rounded-lg border">
        <div className="border-border-default border-b px-5 py-3 text-sm font-semibold">
          Conversation
        </div>

        {conversation ? (
          <>
            <div className="max-h-[50vh] space-y-3 overflow-y-auto p-5">
              {messages.map((m) => {
                const fromBuyer = m.senderId === enquiry.buyerId;
                return (
                  <div key={m.id} className={`flex ${fromBuyer ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        fromBuyer
                          ? "bg-surface-muted text-foreground"
                          : "bg-brand-red text-white"
                      }`}
                    >
                      <p>{m.body}</p>
                      <p
                        className={`mt-0.5 text-right text-[10px] ${
                          fromBuyer ? "text-zinc-400" : "text-red-100"
                        }`}
                      >
                        {m.createdAt.toLocaleString()}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
            <ReplyForm enquiryId={enquiry.id} />
          </>
        ) : (
          <div className="p-5 text-sm text-zinc-500">
            This buyer submitted the enquiry without an account, so there&apos;s no chat
            thread. Use WhatsApp or Call above to respond.
          </div>
        )}
      </div>
    </div>
  );
}
