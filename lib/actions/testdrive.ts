"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { dispatchNotification } from "@/lib/notifications";
import { appUrl } from "@/lib/json-ld";

export type TestDriveActionResult = { ok: true } | { ok: false; error: string };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: { dealer: true },
  });
  if (!listing || listing.status !== "ACTIVE") {
    return { ok: false, error: "This listing is not available." };
  }
  if (!listing.testDriveAvailable) {
    return { ok: false, error: "This dealer isn't offering test drives for this vehicle." };
  }
  if (listing.dealer.userId === session.user.id) {
    return { ok: false, error: "You can't book a test drive on your own listing." };
  }

  await prisma.testDrive.create({
    data: {
      listingId,
      dealerId: listing.dealerId,
      buyerId: session.user.id,
      scheduledAt,
      notes: notes?.trim() || null,
    },
  });

  const vehicle = `${listing.year} ${listing.make} ${listing.model}`;
  const when = scheduledAt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  await dispatchNotification({
    toPhone: listing.dealer.phone,
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

  const testDrive = await prisma.testDrive.findFirst({
    where: { id: testDriveId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!testDrive) return { ok: false, error: "Test drive request not found." };

  await prisma.testDrive.update({ where: { id: testDrive.id }, data: { status } });

  revalidatePath("/dashboard/test-drives");
  revalidatePath("/my-test-drives");
  return { ok: true };
}

export async function getTestDrivesForDealer() {
  const { dealer } = await requireDealer();
  return prisma.testDrive.findMany({
    where: { dealerId: dealer.id },
    include: {
      listing: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          photos: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
      buyer: { select: { name: true, phone: true, email: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getTestDrivesForBuyer() {
  const session = await auth();
  if (!session?.user?.id) return [];
  return prisma.testDrive.findMany({
    where: { buyerId: session.user.id },
    include: {
      listing: {
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          photos: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
      dealer: { select: { businessName: true } },
    },
    orderBy: { scheduledAt: "asc" },
  });
}
