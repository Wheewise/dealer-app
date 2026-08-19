"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { storeSchema } from "@/lib/validators/store";

export type StoreActionState =
  | { ok: false; errors: Record<string, string[]>; formError?: string }
  | { ok: true; slug: string }
  | undefined;

export async function updateStore(
  _prev: StoreActionState,
  formData: FormData,
): Promise<StoreActionState> {
  const { dealer } = await requireDealer({ write: true });
  if (!dealer.store) {
    return { ok: false, errors: {}, formError: "Store not found" };
  }

  const parsed = storeSchema.safeParse({
    slug: formData.get("slug"),
    bio: formData.get("bio") || "",
    primaryColor: formData.get("primaryColor") || "#DC2626",
    logoUrl: formData.get("logoUrl") || "",
    bannerUrl: formData.get("bannerUrl") || "",
  });
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  if (parsed.data.slug !== dealer.store.slug) {
    const taken = await prisma.store.findUnique({
      where: { slug: parsed.data.slug },
      select: { id: true },
    });
    if (taken) {
      return { ok: false, errors: { slug: ["This URL is already taken"] } };
    }
  }

  const updated = await prisma.store.update({
    where: { dealerId: dealer.id },
    data: {
      slug: parsed.data.slug,
      bio: parsed.data.bio || null,
      primaryColor: parsed.data.primaryColor,
      logoUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/store");
  revalidatePath(`/s/${dealer.store.slug}/showcase`);
  if (updated.slug !== dealer.store.slug) revalidatePath(`/s/${updated.slug}/showcase`);

  return { ok: true, slug: updated.slug };
}
