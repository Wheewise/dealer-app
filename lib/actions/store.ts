"use server";

import { revalidatePath } from "next/cache";
import { db, isUniqueViolation, unwrapMaybe } from "@/lib/db";
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
    const taken = unwrapMaybe(
      await db.from("Store").select("id").eq("slug", parsed.data.slug).maybeSingle(),
      "updateStore: slug check",
    );
    if (taken) {
      return { ok: false, errors: { slug: ["This URL is already taken"] } };
    }
  }

  // Store_slug_key is the real arbiter — the read above can lose a race with
  // another dealer claiming the same URL between the check and the write.
  const { data: updated, error } = await db
    .from("Store")
    .update({
      slug: parsed.data.slug,
      bio: parsed.data.bio || null,
      primaryColor: parsed.data.primaryColor,
      logoUrl: parsed.data.logoUrl || null,
      bannerUrl: parsed.data.bannerUrl || null,
    })
    .eq("dealerId", dealer.id)
    .select("slug")
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, errors: { slug: ["This URL is already taken"] } };
    }
    return { ok: false, errors: {}, formError: "Could not save your storefront." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/store");
  revalidatePath(`/s/${dealer.store.slug}/showcase`);
  if (updated.slug !== dealer.store.slug) revalidatePath(`/s/${updated.slug}/showcase`);

  return { ok: true, slug: updated.slug };
}
