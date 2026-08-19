import { prisma } from "./db";
import { Prisma, FuelType, Transmission, VehicleCondition } from "@prisma/client";

const FUEL_VALUES = new Set<string>(Object.values(FuelType));
const TRANSMISSION_VALUES = new Set<string>(Object.values(Transmission));
const CONDITION_VALUES = new Set<string>(Object.values(VehicleCondition));

export type SortOption = "newest" | "price_asc" | "price_desc" | "year_desc";

export interface SearchFilters {
  q?: string;
  vehicleType?: "CAR" | "BIKE";
  make?: string;
  model?: string;
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  yearMin?: number;
  yearMax?: number;
  fuelTypes?: string[];
  conditions?: string[];
  transmission?: string;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export async function searchListings(filters: SearchFilters) {
  const {
    q,
    vehicleType,
    make,
    model,
    city,
    minPrice,
    maxPrice,
    yearMin,
    yearMax,
    fuelTypes,
    conditions,
    transmission,
    sort = "newest",
    page = 1,
    limit = 20,
  } = filters;

  const where: Prisma.ListingWhereInput = {
    status: "ACTIVE",
  };

  if (q) {
    // Basic PostgreSQL full-text search implementation using Prisma
    // We combine fields we want to search over
    where.OR = [
      { make: { contains: q, mode: "insensitive" } },
      { model: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ];
  }

  if (vehicleType) where.vehicleType = vehicleType;
  if (make) where.make = { equals: make, mode: "insensitive" };
  if (model) where.model = { equals: model, mode: "insensitive" };
  if (city) where.city = { equals: city, mode: "insensitive" };
  if (transmission && TRANSMISSION_VALUES.has(transmission)) {
    where.transmission = transmission as Transmission;
  }

  const validFuels = fuelTypes?.filter((f) => FUEL_VALUES.has(f)) as FuelType[] | undefined;
  if (validFuels && validFuels.length > 0) {
    where.fuelType = { in: validFuels };
  }

  const validConditions = conditions?.filter((c) => CONDITION_VALUES.has(c)) as
    | VehicleCondition[]
    | undefined;
  if (validConditions && validConditions.length > 0) {
    where.condition = { in: validConditions };
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    where.askingPrice = {};
    if (minPrice !== undefined) where.askingPrice.gte = minPrice;
    if (maxPrice !== undefined) where.askingPrice.lte = maxPrice;
  }

  if (yearMin !== undefined || yearMax !== undefined) {
    where.year = {};
    if (yearMin !== undefined) where.year.gte = yearMin;
    if (yearMax !== undefined) where.year.lte = yearMax;
  }

  const skip = (page - 1) * limit;

  // Boost ranking only makes sense for the default relevance-ish ordering —
  // an explicit price/year sort should be a literal sort, not boost-first.
  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    sort === "price_asc"
      ? [{ askingPrice: "asc" }]
      : sort === "price_desc"
        ? [{ askingPrice: "desc" }]
        : sort === "year_desc"
          ? [{ year: "desc" }, { createdAt: "desc" }]
          : [{ isBoosted: "desc" }, { createdAt: "desc" }];

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        photos: { take: 1, orderBy: { sortOrder: "asc" } },
        dealer: { select: { businessName: true, store: { select: { slug: true } } } },
        inspections: {
          where: { status: "COMPLETED" },
          select: { overallScore: true },
          take: 1,
        },
      },
    }),
  ]);

  return {
    data: listings,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDistinctCities(): Promise<string[]> {
  const rows = await prisma.listing.findMany({
    where: { status: "ACTIVE" },
    select: { city: true },
    distinct: ["city"],
    orderBy: { city: "asc" },
  });
  return rows.map((r) => r.city).filter(Boolean);
}
