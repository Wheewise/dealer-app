"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
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

  // Sequential creates rather than one nested Listing->Photos/Photos360
  // write: a nested create needs an interactive transaction, which Neon's
  // HTTP-mode adapter (used in every environment now — see lib/db.ts) can't
  // provide. `createMany` also goes through that same transaction machinery
  // and fails the same way, so each photo is inserted with its own `create`.
  let listing;
  try {
    listing = await prisma.listing.create({
      data: {
        ...data,
        description: finalDescription,
        dealerId: dealer.id,
      },
    });

    for (const [i, url] of photoUrls.entries()) {
      await prisma.listingPhoto.create({ data: { listingId: listing.id, url, sortOrder: i } });
    }
    for (const p of photo360) {
      await prisma.listing360Photo.create({
        data: { listingId: listing.id, url: p.url, angle: p.angle },
      });
    }
  } catch (error) {
    console.error("[createListing] failed:", error);
    if (listing) {
      await prisma.listing.delete({ where: { id: listing.id } }).catch(() => {});
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
  const existing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id },
    select: { id: true },
  });
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
  const existingPhotos = await prisma.listingPhoto.findMany({
    where: { listingId },
    select: { id: true, url: true },
    orderBy: { sortOrder: "asc" },
  });

  const existingUrls = new Set(existingPhotos.map((p) => p.url));
  const incomingUrls = new Set(photoUrls);

  const toDelete = existingPhotos
    .filter((p) => !incomingUrls.has(p.url))
    .map((p) => p.id);
  const toAdd = photoUrls
    .map((url, i) => ({ url, sortOrder: i }))
    .filter((p) => !existingUrls.has(p.url));

  // Fetch existing 360 photos
  const existing360 = await prisma.listing360Photo.findMany({
    where: { listingId },
    select: { id: true, url: true },
  });
  const existing360Urls = new Set(existing360.map((p) => p.url));
  const incoming360Urls = new Set(photo360.map((p) => p.url));
  const toDelete360 = existing360
    .filter((p) => !incoming360Urls.has(p.url))
    .map((p) => p.id);
  const toAdd360 = photo360.filter((p) => !existing360Urls.has(p.url));

  // Sequential operations rather than $transaction([...]): Neon's HTTP-mode
  // adapter (used in every environment now — see lib/db.ts) can't run
  // interactive transactions. Same ordering as before, just not atomic.
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      ...data,
      description: finalDescription,
    },
  });

  if (toDelete.length > 0) {
    await prisma.listingPhoto.deleteMany({ where: { id: { in: toDelete } } });
  }
  for (const p of toAdd) {
    await prisma.listingPhoto.create({
      data: { listingId, url: p.url, sortOrder: p.sortOrder },
    });
  }
  for (const [index, url] of photoUrls.entries()) {
    const photoId = existingPhotos.find((p) => p.url === url)?.id;
    if (!photoId) continue;
    await prisma.listingPhoto.update({ where: { id: photoId }, data: { sortOrder: index } });
  }
  if (toDelete360.length > 0) {
    await prisma.listing360Photo.deleteMany({ where: { id: { in: toDelete360 } } });
  }
  for (const p of toAdd360) {
    await prisma.listing360Photo.create({ data: { listingId, url: p.url, angle: p.angle } });
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
  // updateMany runs as a multi-statement transaction, which the Cloudflare
  // Workers Neon HTTP adapter can't do (see lib/db.ts) — findFirst + update
  // instead, same ownership check, no transaction required.
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!listing) return { ok: false, error: "Listing not found" };

  await prisma.listing.update({ where: { id: listing.id }, data: { status } });
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
  // deleteMany runs as a multi-statement transaction, which the Cloudflare
  // Workers Neon HTTP adapter can't do (see lib/db.ts) — findFirst + delete
  // instead. ListingPhoto/Listing360Photo/Enquiry/Conversation/etc. all
  // cascade at the DB level (onDelete: Cascade in schema.prisma), so no
  // separate photo cleanup step is needed.
  const listing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!listing) return { ok: false, error: "Listing not found" };

  await prisma.listing.delete({ where: { id: listing.id } });
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
  const owned = await prisma.listing.findMany({
    where: { id: { in: listingIds }, dealerId: dealer.id },
    select: { id: true },
  });
  for (const { id } of owned) {
    await prisma.listing.update({ where: { id }, data: { status } });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}

export async function bulkDelete(listingIds: string[]): Promise<ListingMutationResult> {
  const { dealer } = await requireDealer({ write: true });
  const owned = await prisma.listing.findMany({
    where: { id: { in: listingIds }, dealerId: dealer.id },
    select: { id: true },
  });
  for (const { id } of owned) {
    await prisma.listing.delete({ where: { id } });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inventory");
  revalidatePath(`/s/${dealer.store?.slug}/showcase`);
  return { ok: true };
}
