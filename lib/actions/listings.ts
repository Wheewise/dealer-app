"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { listingSchema } from "@/lib/validators/listing";

export type ListingActionState =
  | { ok: false; errors: Record<string, string[]>; formError?: string }
  | { ok: true }
  | undefined;

function parseFromForm(formData: FormData) {
  const photoUrls = formData.getAll("photoUrls").map(String).filter(Boolean);
  const photo360Raw = formData.getAll("photo360Urls").map(String).filter(Boolean);
  const photo360 = photo360Raw
    .map((s) => {
      try {
        const { url, angle } = JSON.parse(s) as { url: string; angle: number };
        if (typeof url === "string" && typeof angle === "number") return { url, angle };
      } catch {
        // ignore malformed
      }
      return null;
    })
    .filter(Boolean) as { url: string; angle: number }[];

  const transmissionRaw = formData.get("transmission");
  const conditionRaw = formData.get("condition");
  return {
    parsed: listingSchema.safeParse({
      vehicleType: formData.get("vehicleType"),
      make: formData.get("make"),
      model: formData.get("model"),
      year: formData.get("year"),
      fuelType: formData.get("fuelType"),
      transmission: transmissionRaw ? transmissionRaw : undefined,
      odometerKm: formData.get("odometerKm"),
      askingPrice: formData.get("askingPrice"),
      condition: conditionRaw ? conditionRaw : undefined,
      testDriveAvailable: formData.get("testDriveAvailable") ? "true" : undefined,
      description: formData.get("description"),
      city: formData.get("city"),
      photoUrls,
    }),
    photo360,
  };
}

export async function createListing(
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const { dealer } = await requireDealer({ write: true });
  const { parsed, photo360 } = parseFromForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { photoUrls, ...data } = parsed.data;
  const { ensureDescription } = await import("@/lib/ai-description");
  const finalDescription = await ensureDescription(data.description, {
    vehicleType: data.vehicleType,
    make: data.make,
    model: data.model,
    year: data.year,
    fuelType: data.fuelType,
    transmission: data.transmission,
    odometerKm: data.odometerKm,
    askingPrice: data.askingPrice,
    city: data.city,
  });

  // Listing first, then its photos. PostgREST has no interactive transaction,
  // so this is three statements rather than one nested write; deleting the
  // listing is the compensating action, and photos cascade with it.
  let listing: { id: string } | undefined;
  try {
    listing = unwrap(
      await db
        .from("Listing")
        .insert({ ...data, description: finalDescription, dealerId: dealer.id })
        .select("id")
        .single(),
      "createListing",
    );

    if (photoUrls.length > 0) {
      unwrap(
        await db
          .from("ListingPhoto")
          .insert(photoUrls.map((url, i) => ({ listingId: listing!.id, url, sortOrder: i })))
          .select("id"),
        "createListing photos",
      );
    }
    if (photo360.length > 0) {
      unwrap(
        await db
          .from("Listing360Photo")
          .insert(photo360.map((p) => ({ listingId: listing!.id, url: p.url, angle: p.angle })))
          .select("id"),
        "createListing 360 photos",
      );
    }
  } catch (error) {
    console.error("[createListing] failed:", error);
    if (listing) {
      await db.from("Listing").delete().eq("id", listing.id);
    }
    return {
      ok: false,
      errors: {},
      formError: "Could not save listing. Please try again.",
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  redirect(`/dashboard/inventory/${listing.id}/edit?created=1`);
}

export async function updateListing(
  listingId: string,
  _prev: ListingActionState,
  formData: FormData,
): Promise<ListingActionState> {
  const { dealer } = await requireDealer({ write: true });
  // The dealerId filter is the ownership check — it is what stops one dealer
  // editing another's inventory, and it must stay on every query here.
  const existing = unwrapMaybe(
    await db
      .from("Listing")
      .select("id")
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .maybeSingle(),
    "updateListing lookup",
  );
  if (!existing) return { ok: false, errors: {}, formError: "Listing not found" };

  const { parsed, photo360 } = parseFromForm(formData);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { photoUrls, ...data } = parsed.data;
  const { ensureDescription } = await import("@/lib/ai-description");
  const finalDescription = await ensureDescription(data.description, {
    vehicleType: data.vehicleType,
    make: data.make,
    model: data.model,
    year: data.year,
    fuelType: data.fuelType,
    transmission: data.transmission,
    odometerKm: data.odometerKm,
    askingPrice: data.askingPrice,
    city: data.city,
  });

  // Fetch existing photos to diff against — only delete/create what changed
  const existingPhotos = unwrap(
    await db
      .from("ListingPhoto")
      .select("id, url")
      .eq("listingId", listingId)
      .order("sortOrder", { ascending: true }),
    "updateListing photos",
  );

  const existingUrls = new Set(existingPhotos.map((p) => p.url));
  const incomingUrls = new Set(photoUrls);

  const toDelete = existingPhotos
    .filter((p) => !incomingUrls.has(p.url))
    .map((p) => p.id);
  const toAdd = photoUrls
    .map((url, i) => ({ url, sortOrder: i }))
    .filter((p) => !existingUrls.has(p.url));

  // Fetch existing 360 photos
  const existing360 = unwrap(
    await db.from("Listing360Photo").select("id, url").eq("listingId", listingId),
    "updateListing 360 photos",
  );
  const existing360Urls = new Set(existing360.map((p) => p.url));
  const incoming360Urls = new Set(photo360.map((p) => p.url));
  const toDelete360 = existing360
    .filter((p) => !incoming360Urls.has(p.url))
    .map((p) => p.id);
  const toAdd360 = photo360.filter((p) => !existing360Urls.has(p.url));

  // Sequential statements: PostgREST offers no interactive transaction, so
  // the ordering below is the same as before but not atomic. Deletes and
  // inserts are batched, which the previous per-row loops could not be.
  unwrap(
    await db
      .from("Listing")
      .update({ ...data, description: finalDescription })
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "updateListing",
  );

  if (toDelete.length > 0) {
    unwrap(
      await db.from("ListingPhoto").delete().in("id", toDelete).select("id"),
      "updateListing delete photos",
    );
  }
  if (toAdd.length > 0) {
    unwrap(
      await db
        .from("ListingPhoto")
        .insert(toAdd.map((p) => ({ listingId, url: p.url, sortOrder: p.sortOrder })))
        .select("id"),
      "updateListing add photos",
    );
  }
  // Re-sequence the photos that survived, so the dealer's ordering sticks.
  for (const [index, url] of photoUrls.entries()) {
    const photoId = existingPhotos.find((p) => p.url === url)?.id;
    if (!photoId) continue;
    unwrap(
      await db
        .from("ListingPhoto")
        .update({ sortOrder: index })
        .eq("id", photoId)
        .select("id"),
      "updateListing reorder photos",
    );
  }
  if (toDelete360.length > 0) {
    unwrap(
      await db.from("Listing360Photo").delete().in("id", toDelete360).select("id"),
      "updateListing delete 360 photos",
    );
  }
  if (toAdd360.length > 0) {
    unwrap(
      await db
        .from("Listing360Photo")
        .insert(toAdd360.map((p) => ({ listingId, url: p.url, angle: p.angle })))
        .select("id"),
      "updateListing add 360 photos",
    );
  }

  // Log orphaned photo count for future cleanup job
  if (toDelete.length > 0) {
    console.info(
      `[listing-update] ${toDelete.length} orphaned photo(s) for listing ${listingId} — queue R2 cleanup`,
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/inventory/${listingId}/edit`);
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  revalidatePath(`/vehicle/${listingId}`);
  redirect("/dashboard/inventory?updated=1");
}

export type ListingMutationResult = { ok: true } | { ok: false; error: string };

export async function setListingStatus(
  listingId: string,
  status: "ACTIVE" | "SOLD" | "PAUSED",
): Promise<ListingMutationResult> {
  const { dealer } = await requireDealer({ write: true });
  // The update carries the dealerId filter too, so ownership is enforced by
  // the statement that writes rather than only by the one that read.
  const updated = unwrap(
    await db
      .from("Listing")
      .update({ status })
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "setListingStatus",
  );
  if (updated.length === 0) return { ok: false, error: "Listing not found" };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/dashboard/inventory/${listingId}/edit`);
  revalidatePath(`/vehicle/${listingId}`);
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}

// Convenience alias matching the buyer-facing action name used by the
// inventory row/bulk-action UI — thin wrapper over setListingStatus so
// there's one code path for the status transition.
export async function markAsSold(listingId: string): Promise<ListingMutationResult> {
  return setListingStatus(listingId, "SOLD");
}

export async function deleteListing(listingId: string): Promise<ListingMutationResult> {
  const { dealer } = await requireDealer({ write: true });
  // ListingPhoto / Listing360Photo / Enquiry / Conversation and the rest all
  // cascade at the database level (see supabase/schema.sql), so there is no
  // separate cleanup step. The dealerId filter is the ownership check.
  const deleted = unwrap(
    await db
      .from("Listing")
      .delete()
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "deleteListing",
  );
  if (deleted.length === 0) return { ok: false, error: "Listing not found" };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}

export async function bulkSetStatus(
  listingIds: string[],
  status: "ACTIVE" | "SOLD" | "PAUSED",
): Promise<ListingMutationResult> {
  const { dealer } = await requireDealer({ write: true });
  // One statement for the whole selection. The dealerId filter means ids the
  // caller does not own simply do not match, rather than being rejected.
  unwrap(
    await db
      .from("Listing")
      .update({ status })
      .in("id", listingIds)
      .eq("dealerId", dealer.id)
      .select("id"),
    "bulkSetStatus",
  );
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}

export async function bulkDelete(listingIds: string[]): Promise<ListingMutationResult> {
  const { dealer } = await requireDealer({ write: true });
  unwrap(
    await db
      .from("Listing")
      .delete()
      .in("id", listingIds)
      .eq("dealerId", dealer.id)
      .select("id"),
    "bulkDelete",
  );
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}
