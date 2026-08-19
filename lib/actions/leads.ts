"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";

export async function setLeadFlags(
  leadId: string,
  flags: { isRead?: boolean; isContacted?: boolean },
) {
  const { dealer } = await requireDealer({ write: true });
  // updateMany runs as a multi-statement transaction, which the Cloudflare
  // Workers Neon HTTP adapter can't do (see lib/db.ts) — findFirst + update
  // instead, same ownership check, no transaction required.
  const lead = await prisma.enquiry.findFirst({
    where: { id: leadId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!lead) return;
  await prisma.enquiry.update({ where: { id: lead.id }, data: flags });
  revalidatePath("/dashboard/leads");
  revalidatePath("/dashboard");
}
