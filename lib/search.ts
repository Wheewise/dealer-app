import { db, DbError, withFilters, type FilterChain } from "./db";
import type { FuelType, Transmission, VehicleCondition } from "@/types/supabase";

const FUEL_VALUES = new Set<string>([
  "PETROL",
  "DIESEL",
  "CNG",
  "ELECTRIC",
  "HYBRID",
] satisfies FuelType[]);
const TRANSMISSION_VALUES = new Set<string>([
  "MANUAL",
  "AUTOMATIC",
  "AMT",
  "CVT",
] satisfies Transmission[]);
const CONDITION_VALUES = new Set<string>(["A", "B", "C"] satisfies VehicleCondition[]);

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

/**
 * PostgREST's `or=` filter is a comma-separated list inside a single query
 * parameter, so a search term containing a comma, parenthesis or double quote
 * would break out of the value it belongs to and change which columns are
 * matched. Quoting the value and escaping the quote characters keeps the term
 * a single opaque literal.
 */
function orLiteral(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const LISTING_CARD_SELECT = `
  *,
  photos:ListingPhoto(id, url, sortOrder),
  dealer:Dealer(businessName, store:Store(slug)),
  inspections:Inspection(overallScore, status)
`;

/**
 * PostgREST cannot limit or order an embedded resource per parent row, so the
 * "first photo" and "one completed inspection" that Prisma expressed with
 * `take: 1` are narrowed here instead. The rows involved are small (a handful
 * of photos, at most a few inspections per listing).
 */
function shape<
  T extends {
    photos: { id: string; url: string; sortOrder: number }[];
    inspections: { overallScore: number | null; status: string }[];
  },
>(row: T) {
  return {
    ...row,
    photos: [...row.photos].sort((a, b) => a.sortOrder - b.sortOrder).slice(0, 1),
    inspections: row.inspections
      .filter((i) => i.status === "COMPLETED")
      .slice(0, 1)
      .map((i) => ({ overallScore: i.overallScore })),
  };
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

  // The count and the page must see the same predicate, so it is written once
  // and applied to both.
  const predicate = (query: FilterChain): FilterChain => {
    let out = query.eq("status", "ACTIVE");

    if (q) {
      const term = orLiteral(`%${q}%`);
      out = out.or(
        `make.ilike.${term},model.ilike.${term},description.ilike.${term},city.ilike.${term}`,
      );
    }

    if (vehicleType) out = out.eq("vehicleType", vehicleType);
    if (make) out = out.ilike("make", make);
    if (model) out = out.ilike("model", model);
    if (city) out = out.ilike("city", city);
    if (transmission && TRANSMISSION_VALUES.has(transmission)) {
      out = out.eq("transmission", transmission);
    }

    const validFuels = fuelTypes?.filter((f) => FUEL_VALUES.has(f));
    if (validFuels && validFuels.length > 0) out = out.in("fuelType", validFuels);

    const validConditions = conditions?.filter((c) => CONDITION_VALUES.has(c));
    if (validConditions && validConditions.length > 0) {
      out = out.in("condition", validConditions);
    }

    if (minPrice !== undefined) out = out.gte("askingPrice", minPrice);
    if (maxPrice !== undefined) out = out.lte("askingPrice", maxPrice);
    if (yearMin !== undefined) out = out.gte("year", yearMin);
    if (yearMax !== undefined) out = out.lte("year", yearMax);

    return out;
  };

  const from = (page - 1) * limit;

  let page$ = withFilters(db.from("Listing").select(LISTING_CARD_SELECT), predicate);

  // Boost ranking only makes sense for the default relevance-ish ordering —
  // an explicit price/year sort should be a literal sort, not boost-first.
  if (sort === "price_asc") {
    page$ = page$.order("askingPrice", { ascending: true });
  } else if (sort === "price_desc") {
    page$ = page$.order("askingPrice", { ascending: false });
  } else if (sort === "year_desc") {
    page$ = page$.order("year", { ascending: false }).order("createdAt", { ascending: false });
  } else {
    page$ = page$
      .order("isBoosted", { ascending: false })
      .order("createdAt", { ascending: false });
  }

  const [countResult, pageResult] = await Promise.all([
    withFilters(db.from("Listing").select("id", { count: "exact", head: true }), predicate),
    page$.range(from, from + limit - 1),
  ]);

  if (countResult.error) throw new DbError(countResult.error, "searchListings count");
  if (pageResult.error) throw new DbError(pageResult.error, "searchListings");

  const total = countResult.count ?? 0;

  return {
    data: (pageResult.data ?? []).map(shape),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDistinctCities(): Promise<string[]> {
  // DISTINCT has no PostgREST equivalent; `distinct_listing_cities()` in
  // supabase/schema.sql does it in the database instead of paging every
  // ACTIVE listing into the app to deduplicate one column.
  const { data, error } = await db.rpc("distinct_listing_cities");
  if (error) throw new DbError(error, "getDistinctCities");
  return (data ?? []).map((r) => r.city).filter(Boolean);
}
