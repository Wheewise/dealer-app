"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { dispatchNotification } from "@/lib/notifications";
import { appUrl } from "@/lib/json-ld";

export type TestDriveActionResult = { ok: true } | { ok: false; error: string };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const LISTING_CARD =
  "listing:Listing(id, make, model, year, photos:ListingPhoto(id, url, sortOrder))";

/** First photo by sortOrder — PostgREST cannot order an embed per parent row. */
function firstPhoto<T extends { sortOrder: number }>(photos: T[]): T[] {
  return [...photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1);
}

export async function requestTestDrive(
  listingId: string,
  scheduledAt: Date,
  notes?: string,
): Promise<TestDriveActionResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Login to book a test drive." };
  }

  if (Number.isNaN(scheduledAt.getTime())) {
    return { ok: false, error: "Pick a valid date and time." };
  }
  const now = Date.now();
  if (scheduledAt.getTime() < now) {
    return { ok: false, error: "Pick a time in the future." };
  }
  if (scheduledAt.getTime() > now + THIRTY_DAYS_MS) {
    return { ok: false, error: "Test drives can only be booked within the next 30 days." };
  }

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("*, dealer:Dealer(*)")
      .eq("id", listingId)
      .maybeSingle(),
    "requestTestDrive: listing",
  );
  if (!listing || listing.status !== "ACTIVE") {
    return { ok: false, error: "This listing is not available." };
  }
  if (!listing.testDriveAvailable) {
    return { ok: false, error: "This dealer isn't offering test drives for this vehicle." };
  }
  const dealer = listing.dealer;
  if (dealer.userId === session.user.id) {
    return { ok: false, error: "You can't book a test drive on your own listing." };
  }

  unwrap(
    await db
      .from("TestDrive")
      .insert({
        listingId,
        dealerId: listing.dealerId,
        buyerId: session.user.id,
        scheduledAt: scheduledAt.toISOString(),
        notes: notes?.trim() || null,
      })
      .select("id")
      .single(),
    "requestTestDrive",
  );

  const vehicle = `${listing.year} ${listing.make} ${listing.model}`;
  const when = scheduledAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  await dispatchNotification({
    toPhone: dealer.phone,
    subject: `Test drive requested — ${vehicle}`,
    body: `${session.user.name ?? "A buyer"} requested a test drive for your ${vehicle} on ${when}. View: ${appUrl("/dashboard/test-drives")}`,
    type: "TEST_DRIVE_REQUESTED",
  }).catch((err: unknown) => {
    console.error("[requestTestDrive] dispatchNotification failed:", err);
  });

  revalidatePath("/dashboard/test-drives");
  revalidatePath("/my-test-drives");
  return { ok: true };
}

export async function updateTestDriveStatus(
  testDriveId: string,
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED",
): Promise<TestDriveActionResult> {
  const { dealer } = await requireDealer({ write: true });

  const updated = unwrap(
    await db
      .from("TestDrive")
      .update({ status })
      .eq("id", testDriveId)
      .eq("dealerId", dealer.id)
      .select("id"),
    "updateTestDriveStatus",
  );
  if (updated.length === 0) return { ok: false, error: "Test drive request not found." };

  revalidatePath("/dashboard/test-drives");
  revalidatePath("/my-test-drives");
  return { ok: true };
}

export async function getTestDrivesForDealer() {
  const { dealer } = await requireDealer();
  const rows = unwrap(
    await db
      .from("TestDrive")
      .select(`*, ${LISTING_CARD}, buyer:User(name, phone, email)`)
      .eq("dealerId", dealer.id)
      .order("scheduledAt", { ascending: true }),
    "getTestDrivesForDealer",
  );

  return rows.map((t) => ({
    ...t,
    listing: { ...t.listing, photos: firstPhoto(t.listing.photos) },
  }));
}

export async function getTestDrivesForBuyer() {
  const session = await auth();
  if (!session?.user?.id) return [];

  const rows = unwrap(
    await db
      .from("TestDrive")
      .select(`*, ${LISTING_CARD}, dealer:Dealer(businessName)`)
      .eq("buyerId", session.user.id)
      .order("scheduledAt", { ascending: true }),
    "getTestDrivesForBuyer",
  );

  return rows.map((t) => ({
    ...t,
    listing: { ...t.listing, photos: firstPhoto(t.listing.photos) },
  }));
}
