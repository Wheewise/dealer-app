import type { SupabaseClient } from "@supabase/supabase-js";

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "dealer"
  );
}

/**
 * Vehicle slugs don't need the lookup-and-retry dance dealer slugs do —
 * appending the (already globally unique) id's first 8 chars guarantees
 * uniqueness in one shot, no DB round trip needed.
 */
export function generateVehicleSlug(
  make: string,
  model: string,
  year: number,
  city: string,
  id: string,
): string {
  return slugify(`${make}-${model}-${year}-${city}-${id.slice(0, 8)}`);
}

/** Appends -2, -3, etc. until it finds a slug nobody else has taken. */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  businessName: string,
): Promise<string> {
  const base = slugify(businessName);
  let slug = base;
  let attempt = 1;

  while (true) {
    const { data } = await supabase.from("dealers").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
}
