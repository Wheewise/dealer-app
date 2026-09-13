import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { getMessages } from "@wheewise/neon";
import { ChatHeader } from "./ChatHeader";
import { MessageForm } from "./MessageForm";

export default async function DealerEnquiryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase);

  // RLS restricts this to the dealer's own enquiries — a mismatched dealer
  // gets an empty result, so this reads as a plain 404 either way.
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("*, vehicles(make, model, year), profiles(name)")
    .eq("id", id)
    .eq("dealer_id", dealer.id)
    .single();
  if (!enquiry) notFound();

  const messages = await getMessages(id);
  const vehicle = enquiry.vehicles as unknown as { make: string; model: string; year: number };
  const buyer = enquiry.profiles as unknown as { name: string };

  return (
    <div className="mx-auto flex h-[calc(100vh-73px)] max-w-2xl flex-col">
      <ChatHeader buyerName={buyer.name} vehicleLabel={`Re: ${vehicle.make} ${vehicle.model}`} />
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
              m.sender_id === dealer.profile_id
                ? "ml-auto bg-brand text-white"
                : "bg-surface-muted text-foreground"
            }`}
          >
            {m.body}
          </div>
        ))}
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-500">No messages yet.</p>
        ) : null}
      </div>
      <MessageForm enquiryId={id} />
    </div>
  );
}
