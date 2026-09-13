"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { generateVehicleSlug } from "@/lib/slug";

// Optional numeric fields come from the RC via RTO auto-fill (or manual
// entry) — a dealer may not always have every spec on hand, so only the
// fields the marketplace actually needs to function (identity, price,
// photos) are required.
const optionalInt = z
  .string()
  .optional()
  .transform((v) => (v ? parseInt(v, 10) : null));
const optionalNumeric = z
  .string()
  .optional()
  .transform((v) => (v ? parseFloat(v) : null));
const optionalText = z
  .string()
  .optional()
  .transform((v) => v?.trim() || null);

// A dealer pasting spec fields in from an RC photo (or its extracted text)
// easily brings along a stray leading/trailing tab or space — trim() on
// every free-text field so that never ends up baked into stored data or,
// worse, the slug (a leading tab silently became a leading "-" in a slug
// once, from data entered exactly this way).
const schema = z.object({
  category: z.enum(["CAR", "BIKE", "COMMERCIAL"]),
  regNumber: z.string().trim().optional(),
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: z.coerce.number().min(1980).max(new Date().getFullYear() + 1),
  fuelType: z.enum(["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"]),
  transmission: optionalText,
  vehicleClass: optionalText,
  color: optionalText,
  bodyType: optionalText,
  cubicCapacityCc: optionalNumeric,
  horsepowerBhp: optionalNumeric,
  cylinders: optionalInt,
  emissionNorms: optionalText,
  mfgMonth: optionalInt,
  odometerKm: z.coerce.number().min(0),
  seatingCapacity: optionalInt,
  unladenWeightKg: optionalInt,
  wheelbaseMm: optionalInt,
  askingPrice: z.coerce.number().min(1000),
  city: z.string().trim().min(1),
  description: z.string().trim().min(1),
  photoUrls: z.string().transform((s) => (s ? JSON.parse(s) : [])),
});

export type ListingState =
  | { ok: true }
  | { ok: false; errors: Record<string, string[]>; formError?: string };

export async function createListing(
  _prev: ListingState | undefined,
  formData: FormData,
): Promise<ListingState> {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase, { write: true });

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;
  if (d.photoUrls.length === 0) {
    return { ok: false, errors: { photoUrls: ["At least one photo is required."] } };
  }

  const id = crypto.randomUUID();
  const slug = generateVehicleSlug(d.make, d.model, d.year, d.city, id);

  const { error } = await supabase.from("vehicles").insert({
    id,
    slug,
    dealer_id: dealer.id,
    category: d.category,
    reg_number: d.regNumber || null,
    make: d.make,
    model: d.model,
    year: d.year,
    fuel_type: d.fuelType,
    transmission: d.transmission,
    vehicle_class: d.vehicleClass,
    color: d.color,
    body_type: d.bodyType,
    cubic_capacity_cc: d.cubicCapacityCc,
    horsepower_bhp: d.horsepowerBhp,
    cylinders: d.cylinders,
    emission_norms: d.emissionNorms,
    mfg_month: d.mfgMonth,
    odometer_km: d.odometerKm,
    seating_capacity: d.seatingCapacity,
    unladen_weight_kg: d.unladenWeightKg,
    wheelbase_mm: d.wheelbaseMm,
    asking_price: d.askingPrice,
    city: d.city,
    description: d.description,
    photo_urls: d.photoUrls,
    status: "ACTIVE",
  });
  if (error) {
    return { ok: false, errors: {}, formError: error.message };
  }

  redirect("/dashboard");
}
