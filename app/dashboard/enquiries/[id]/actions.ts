"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { insertMessage, insertNotification } from "@wheewise/neon";

export async function sendMessage(enquiryId: string, body: string) {
  const trimmed = body.trim();
  if (!trimmed) return;
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase, { write: true });

  // "enquiries: participant read" (RLS) already scopes this dealer's read
  // access to their own enquiries — this confirms the enquiry is actually
  // theirs before writing to Neon, which has no RLS of its own.
  const { data: enquiry } = await supabase
    .from("enquiries")
    .select("buyer_id")
    .eq("id", enquiryId)
    .eq("dealer_id", dealer.id)
    .single();
  if (!enquiry) return;

  await insertMessage(enquiryId, dealer.profile_id, trimmed);
  await insertNotification(enquiry.buyer_id, "NEW_MESSAGE", "New message", trimmed, `/enquiries/${enquiryId}`);
  revalidatePath(`/dashboard/enquiries/${enquiryId}`);
}
