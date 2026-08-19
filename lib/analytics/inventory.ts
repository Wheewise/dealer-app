import { db, DbError, unwrap } from "@/lib/db";
import type { InventoryDistribution, TopListing } from "./types";

export interface InventoryAnalytics {
  byStatus: InventoryDistribution[];
  byVehicleType: InventoryDistribution[];
  byFuelType: InventoryDistribution[];
  byMake: InventoryDistribution[];
  topListings: TopListing[];
  avgDaysListed: number;
}

/** Shape of `dealer_inventory_breakdown()` in supabase/schema.sql. */
interface Breakdown {
  byStatus: InventoryDistribution[];
  byVehicleType: InventoryDistribution[];
  byFuelType: InventoryDistribution[];
  byMake: InventoryDistribution[];
}

export async function getInventoryAnalytics(
  dealerId: string,
): Promise<InventoryAnalytics> {
  const [breakdownResult, listings] = await Promise.all([
    // Four GROUP BYs, which PostgREST cannot express.
    db.rpc("dealer_inventory_breakdown", { p_dealer_id: dealerId }),
    db
      .from("Listing")
      .select("id, make, model, year, status, viewCount, enquiryCount, createdAt")
      .eq("dealerId", dealerId)
      .order("viewCount", { ascending: false })
      .limit(20)
      .then((r) => unwrap(r, "getInventoryAnalytics listings")),
  ]);

  if (breakdownResult.error) {
    throw new DbError(breakdownResult.error, "getInventoryAnalytics breakdown");
  }
  const breakdown = breakdownResult.data as unknown as Breakdown;

  const now = Date.now();

  const topListings: TopListing[] = listings.map((l) => {
    const daysListed = Math.floor((now - new Date(l.createdAt).getTime()) / 86_400_000);
    return {
      id: l.id,
      make: l.make,
      model: l.model,
      year: l.year,
      status: l.status,
      views: l.viewCount,
      leads: l.enquiryCount,
      daysListed,
      convRate: l.viewCount > 0 ? +((l.enquiryCount / l.viewCount) * 100).toFixed(1) : 0,
    };
  });

  const active = listings.filter((l) => l.status === "ACTIVE");
  const avgDaysListed =
    active.length > 0
      ? Math.round(
          active.reduce(
            (s, l) =>
              s + Math.floor((now - new Date(l.createdAt).getTime()) / 86_400_000),
            0,
          ) / active.length,
        )
      : 0;

  return {
    byStatus: breakdown.byStatus,
    byVehicleType: breakdown.byVehicleType,
    byFuelType: breakdown.byFuelType,
    byMake: breakdown.byMake,
    topListings,
    avgDaysListed,
  };
}
