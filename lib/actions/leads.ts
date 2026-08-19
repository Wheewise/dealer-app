"use server";

import { revalidatePath } from "next/cache";
import { db, unwrap } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";

export async function setLeadFlags(
  leadId: string,
  flags: { isRead?: boolean; isContacted?: boolean },
) {
  const { dealer } = await requireDealer({ write: true });
  // The dealerId filter is the ownership check: a lead belonging to another
  // dealer simply does not match, so no row is written.
  unwrap(
    await db
      .from("Enquiry")
      .update(flags)
      .eq("id", leadId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "setLeadFlags",
  );
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
}
