"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { CheckCategory } from "@/lib/inspection-checklist";
import { computeChecklistStats } from "@/lib/inspection-checklist";
import { logSecurityEvent, requireAdminContext, type Permission } from "@/lib/rbac";

// --- Inspector ---

export async function applyInspector(certification: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = await prisma.inspector.findUnique({
    where: { userId: session.user.id },
  });
  if (existing) return { ok: true };

  await prisma.inspector.create({
    data: { userId: session.user.id, certification },
  });

  return { ok: true };
}

export async function approveInspector(inspectorId: string) {
  const ctx = await requireAdmin("approve");
  await prisma.inspector.update({
    where: { id: inspectorId },
    data: { status: "APPROVED" },
  });
  logSecurityEvent({
    type: "privilege.changed",
    outcome: "allow",
    userId: ctx.userId,
    role: ctx.role,
    resource: `inspector:${inspectorId}`,
    action: "approveInspector",
  });
  revalidatePath("/admin/inspectors");
}

export async function rejectInspector(inspectorId: string) {
  const ctx = await requireAdmin("approve");
  await prisma.inspector.update({
    where: { id: inspectorId },
    data: { status: "REJECTED" },
  });
  logSecurityEvent({
    type: "privilege.changed",
    outcome: "allow",
    userId: ctx.userId,
    role: ctx.role,
    resource: `inspector:${inspectorId}`,
    action: "rejectInspector",
  });
  revalidatePath("/admin/inspectors");
}

export async function getInspectors() {
  await requireAdmin("read");
  return prisma.inspector.findMany({
    include: { user: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
}

// --- Inspections ---

export async function requestInspection(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dealer = await prisma.dealer.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!dealer) throw new Error("Not a dealer");

  const listing = await prisma.listing.findFirst({
    where: { id: listingId, dealerId: dealer.id },
    select: { id: true },
  });
  if (!listing) throw new Error("Listing not found");

  const existing = await prisma.inspection.findFirst({
    where: { listingId, status: { notIn: ["CANCELLED"] } },
  });
  if (existing) throw new Error("Inspection already in progress");

  await prisma.inspection.create({
    data: { listingId, dealerId: dealer.id },
  });

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}

export async function assignInspector(inspectionId: string, inspectorId: string) {
  await requireAdmin("update");

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { inspectorId, status: "SCHEDULED" },
  });

  revalidatePath("/admin/inspections");
}

export async function getInspections() {
  await requireAdmin("read");
  return prisma.inspection.findMany({
    include: {
      listing: { select: { make: true, model: true, year: true } },
      dealer: { select: { businessName: true } },
      inspector: { select: { id: true, user: { select: { name: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getInspectorInspection(inspectionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const inspector = await prisma.inspector.findUnique({
    where: { userId: session.user.id },
  });
  if (!inspector || inspector.status !== "APPROVED")
    throw new Error("Not an approved inspector");

  return prisma.inspection.findFirst({
    where: { id: inspectionId, inspectorId: inspector.id },
    include: {
      listing: {
        select: { make: true, model: true, year: true, odometerKm: true, city: true },
      },
      dealer: { select: { businessName: true, phone: true } },
    },
  });
}

export async function submitInspection(
  inspectionId: string,
  checklist: CheckCategory[],
  notes: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const inspector = await prisma.inspector.findUnique({
    where: { userId: session.user.id },
  });
  if (!inspector || inspector.status !== "APPROVED")
    throw new Error("Not an approved inspector");

  // Being an approved inspector is not enough — the inspection must be the
  // one *assigned to this inspector*. Without this, any approved inspector
  // could overwrite the report on any other inspector's job (BOLA).
  const assigned = await prisma.inspection.findFirst({
    where: { id: inspectionId, inspectorId: inspector.id },
    select: { id: true, status: true },
  });
  if (!assigned) throw new Error("Inspection not found");
  if (assigned.status === "COMPLETED") {
    throw new Error("Inspection already submitted");
  }

  const { score } = computeChecklistStats(checklist);

  await prisma.inspection.update({
    where: { id: assigned.id },
    data: {
      checklist: checklist as unknown as object,
      overallScore: score,
      notes,
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

export async function getListingInspection(listingId: string) {
  return prisma.inspection.findFirst({
    where: { listingId, status: "COMPLETED" },
    include: {
      inspector: {
        select: { id: true, user: { select: { name: true } } },
      },
    },
    orderBy: { completedAt: "desc" },
  });
}

// Delegates to the central RBAC guard; the old local copy excluded
// SUPER_ADMIN from inspector approval.
async function requireAdmin(permission: Permission = "manage_configuration") {
  return requireAdminContext(permission, "inspections");
}
