import { prisma } from "@/lib/db";
import type { InventoryDistribution, TopListing } from "./types";

export interface InventoryAnalytics {
  byStatus: InventoryDistribution[];
  byVehicleType: InventoryDistribution[];
  byFuelType: InventoryDistribution[];
  byMake: InventoryDistribution[];
  topListings: TopListing[];
  avgDaysListed: number;
}

export async function getInventoryAnalytics(
  dealerId: string,
): Promise<InventoryAnalytics> {
  const [byStatus, byVehicleType, byFuelType, byMake, listings] = await Promise.all([
    prisma.listing.groupBy({
      by: ["status"],
      where: { dealerId },
      _count: { status: true },
    }),
    prisma.listing.groupBy({
      by: ["vehicleType"],
      where: { dealerId },
      _count: { vehicleType: true },
    }),
    prisma.listing.groupBy({
      by: ["fuelType"],
      where: { dealerId },
      _count: { fuelType: true },
    }),
    prisma.listing.groupBy({
      by: ["make"],
      where: { dealerId },
      _count: { make: true },
      orderBy: { _count: { make: "desc" } },
      take: 8,
    }),
    prisma.listing.findMany({
      where: { dealerId },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        status: true,
        viewCount: true,
        enquiryCount: true,
        createdAt: true,
      },
      orderBy: { viewCount: "desc" },
      take: 20,
    }),
  ]);

  const now = Date.now();

  const topListings: TopListing[] = listings.map((l) => {
    const daysListed = Math.floor((now - l.createdAt.getTime()) / 86_400_000);
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
            (s, l) => s + Math.floor((now - l.createdAt.getTime()) / 86_400_000),
            0,
          ) / active.length,
        )
      : 0;

  return {
    byStatus:      byStatus.map((b) => ({ label: b.status,      count: b._count.status })),
    byVehicleType: byVehicleType.map((b) => ({ label: b.vehicleType, count: b._count.vehicleType })),
    byFuelType:    byFuelType.map((b) => ({ label: b.fuelType,   count: b._count.fuelType })),
    byMake:        byMake.map((b) => ({ label: b.make,           count: b._count.make })),
    topListings,
    avgDaysListed,
  };
}
