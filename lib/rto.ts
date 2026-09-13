export type RtoVehicle = {
  regNumber: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  vehicleClass: string | null;
  color: string | null;
  bodyType: string | null;
  seatingCapacity: number | null;
  unladenWeightKg: number | null;
  cubicCapacityCc: number | null;
  horsepowerBhp: number | null;
  wheelbaseMm: number | null;
  mfgMonth: number | null;
  cylinders: number | null;
  emissionNorms: string | null;
};

/**
 * TODO: no RTO/Vahan lookup provider has been chosen yet (see
 * PROJECT_MEMORY.md open items — needs the same kind of research pass done
 * for the GST provider). Wire the real upstream call here once one is
 * picked; the RtoLookup UI and the listing form are already built against
 * this function's shape, so swapping the implementation is the only change
 * needed.
 */
export async function fetchRto(regNumber: string): Promise<RtoVehicle | null> {
  const cleaned = regNumber.replace(/[\s-]/g, "").toUpperCase();
  if (!/^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/.test(cleaned)) return null;

  const providerUrl = process.env.RTO_PROVIDER_URL;
  if (!providerUrl) return null;

  const res = await fetch(`${providerUrl}?reg=${encodeURIComponent(cleaned)}`, {
    headers: { Authorization: `Bearer ${process.env.RTO_PROVIDER_TOKEN}` },
  });
  if (!res.ok) return null;

  const data = await res.json();
  return {
    regNumber: cleaned,
    make: data.make,
    model: data.model,
    year: data.year,
    fuelType: data.fuel_type,
    vehicleClass: data.vehicle_class ?? null,
    color: data.color ?? null,
    bodyType: data.body_type ?? null,
    seatingCapacity: data.seating_capacity ?? null,
    unladenWeightKg: data.unladen_weight_kg ?? null,
    cubicCapacityCc: data.cubic_capacity_cc ?? null,
    horsepowerBhp: data.horsepower_bhp ?? null,
    wheelbaseMm: data.wheelbase_mm ?? null,
    mfgMonth: data.mfg_month ?? null,
    cylinders: data.cylinders ?? null,
    emissionNorms: data.emission_norms ?? null,
  };
}
