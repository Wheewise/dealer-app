"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db, unwrap, unwrapMaybe } from "@/lib/db";
import type { CheckCategory } from "@/lib/inspection-checklist";
import { computeChecklistStats } from "@/lib/inspection-checklist";
import { logSecurityEvent, requireAdminContext, type Permission } from "@/lib/rbac";

// --- Inspector ---

export async function applyInspector(certification: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const existing = unwrapMaybe(
    await db.from("Inspector").select("id").eq("userId", session.user.id).maybeSingle(),
    "applyInspector lookup",
  );
  if (existing) return { ok: true };

  unwrap(
    await db
      .from("Inspector")
      .insert({ userId: session.user.id, certification })
      .select("id")
      .single(),
    "applyInspector",
  );

  return { ok: true };
}

export async function approveInspector(inspectorId: string) {
  const ctx = await requireAdmin("approve");
  unwrap(
    await db
      .from("Inspector")
      .update({ status: "APPROVED" })
      .eq("id", inspectorId)
      .select("id"),
    "approveInspector",
  );
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
  unwrap(
    await db
      .from("Inspector")
      .update({ status: "REJECTED" })
      .eq("id", inspectorId)
      .select("id"),
    "rejectInspector",
  );
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
  const rows = unwrap(
    await db
      .from("Inspector")
      .select("*, user:User(email, name)")
      .order("createdAt", { ascending: false }),
    "getInspectors",
  );
  return rows;
}

// --- Inspections ---

export async function requestInspection(listingId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dealer = unwrapMaybe(
    await db.from("Dealer").select("id").eq("userId", session.user.id).maybeSingle(),
    "requestInspection: dealer",
  );
  if (!dealer) throw new Error("Not a dealer");

  const listing = unwrapMaybe(
    await db
      .from("Listing")
      .select("id")
      .eq("id", listingId)
      .eq("dealerId", dealer.id)
      .maybeSingle(),
    "requestInspection: listing",
  );
  if (!listing) throw new Error("Listing not found");

  const existing = unwrap(
    await db
      .from("Inspection")
      .select("id")
      .eq("listingId", listingId)
      .neq("status", "CANCELLED")
      .limit(1),
    "requestInspection: existing",
  );
  if (existing.length > 0) throw new Error("Inspection already in progress");

  unwrap(
    await db
      .from("Inspection")
      .insert({ listingId, dealerId: dealer.id })
      .select("id")
      .single(),
    "requestInspection",
  );

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}

export async function assignInspector(inspectionId: string, inspectorId: string) {
  await requireAdmin("update");

  unwrap(
    await db
      .from("Inspection")
      .update({ inspectorId, status: "SCHEDULED" })
      .eq("id", inspectionId)
      .select("id"),
    "assignInspector",
  );

  revalidatePath("/admin/inspections");
}

export async function getInspections() {
  await requireAdmin("read");
  const rows = unwrap(
    await db
      .from("Inspection")
      .select(
        `*,
         listing:Listing(make, model, year),
         dealer:Dealer(businessName),
         inspector:Inspector(id, user:User(name, email))`,
      )
      .order("createdAt", { ascending: false }),
    "getInspections",
  );

  return rows;
}

export async function getInspectorInspection(inspectionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const inspector = unwrapMaybe(
    await db
      .from("Inspector")
      .select("id, status")
      .eq("userId", session.user.id)
      .maybeSingle(),
    "getInspectorInspection: inspector",
  );
  if (!inspector || inspector.status !== "APPROVED")
    throw new Error("Not an approved inspector");

  const row = unwrapMaybe(
    await db
      .from("Inspection")
      .select(
        `*,
         listing:Listing(make, model, year, odometerKm, city),
         dealer:Dealer(businessName, phone)`,
      )
      .eq("id", inspectionId)
      .eq("inspectorId", inspector.id)
      .maybeSingle(),
    "getInspectorInspection",
  );
  return row;
}

export async function submitInspection(
  inspectionId: string,
  checklist: CheckCategory[],
  notes: string,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const inspector = unwrapMaybe(
    await db
      .from("Inspector")
      .select("id, status")
      .eq("userId", session.user.id)
      .maybeSingle(),
    "submitInspection: inspector",
  );
  if (!inspector || inspector.status !== "APPROVED")
    throw new Error("Not an approved inspector");

  // Being an approved inspector is not enough — the inspection must be the
  // one *assigned to this inspector*. Without this, any approved inspector
  // could overwrite the report on any other inspector's job (BOLA).
  const assigned = unwrapMaybe(
    await db
      .from("Inspection")
      .select("id, status")
      .eq("id", inspectionId)
      .eq("inspectorId", inspector.id)
      .maybeSingle(),
    "submitInspection: assignment",
  );
  if (!assigned) throw new Error("Inspection not found");
  if (assigned.status === "COMPLETED") {
    throw new Error("Inspection already submitted");
  }

  const { score } = computeChecklistStats(checklist);

  // The inspectorId filter is repeated on the write, so the ownership check
  // is enforced by the statement that mutates, not only by the one that read.
  unwrap(
    await db
      .from("Inspection")
      .update({
        checklist: checklist as unknown as never,
        overallScore: score,
        notes,
        status: "COMPLETED",
        completedAt: new Date().toISOString(),
      })
      .eq("id", assigned.id)
      .eq("inspectorId", inspector.id)
      .select("id"),
    "submitInspection",
  );

  revalidatePath(`/inspections/${inspectionId}`);
  return { ok: true };
}

export async function getListingInspection(listingId: string) {
  const row = unwrapMaybe(
    await db
      .from("Inspection")
      .select("*, inspector:Inspector(id, user:User(name))")
      .eq("listingId", listingId)
      .eq("status", "COMPLETED")
      .order("completedAt", { ascending: false })
      .limit(1)
      .maybeSingle(),
    "getListingInspection",
  );
  return row;
}

// Delegates to the central RBAC guard; the old local copy excluded
// SUPER_ADMIN from inspector approval.
async function requireAdmin(permission: Permission = "manage_configuration") {
  return requireAdminContext(permission, "inspections");
}
