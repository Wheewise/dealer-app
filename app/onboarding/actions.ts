"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { generateUniqueSlug } from "@/lib/slug";

const schema = z.object({
  businessName: z.string().min(1),
  logoUrl: z.string().url(),
  coverPhotoUrl: z.string().optional(),
  address: z.string().min(1),
  mapLink: z
    .string()
    .optional()
    .refine((v) => !v || /^https?:\/\//.test(v), "Enter a valid map link (starting with http)"),
  bio: z.string().min(1).max(500),
});

export type OnboardingState =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]>; formError?: string };

export async function completeOnboarding(
  _prev: OnboardingState | undefined,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { businessName, logoUrl, coverPhotoUrl, address, mapLink, bio } = parsed.data;

  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase, { write: true });

  const slug = dealer.slug ?? (await generateUniqueSlug(supabase, businessName));

  const { error } = await supabase
    .from("dealers")
    .update({
      business_name: businessName,
      logo_url: logoUrl,
      cover_photo_url: coverPhotoUrl || null,
      address,
      map_link: mapLink || null,
      bio,
      slug,
      onboarded: true,
    })
    .eq("id", dealer.id);

  if (error) {
    return { ok: false, errors: {}, formError: error.message };
  }

  redirect("/dashboard");
}
