import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/db", () => ({
  prisma: {
    listing: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { searchListings } from "../../lib/search";
import { prisma } from "../../lib/db";

type Mock = ReturnType<typeof vi.fn>;
const count = prisma.listing.count as unknown as Mock;
const findMany = prisma.listing.findMany as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  count.mockResolvedValue(0);
  findMany.mockResolvedValue([]);
});

function getWhere() {
  return findMany.mock.calls[0][0].where;
}
function getOrderBy() {
  return findMany.mock.calls[0][0].orderBy;
}

describe("searchListings — filter composition", () => {
  it("always filters status=ACTIVE", async () => {
    await searchListings({});
    expect(getWhere().status).toBe("ACTIVE");
  });

  it("composes a text-search OR across make/model/description/city when q is set", async () => {
    await searchListings({ q: "swift" });
    const w = getWhere();
    expect(w.OR).toHaveLength(4);
    for (const clause of w.OR) {
      const field = Object.values(clause)[0] as { contains: string; mode: string };
      expect(field.contains).toBe("swift");
      expect(field.mode).toBe("insensitive");
    }
  });

  it("applies vehicleType, make, model, city as case-insensitive exact matches", async () => {
    await searchListings({
      vehicleType: "BIKE",
      make: "Royal Enfield",
      model: "Classic 350",
      city: "Indore",
    });
    const w = getWhere();
    expect(w.vehicleType).toBe("BIKE");
    expect(w.make).toEqual({ equals: "Royal Enfield", mode: "insensitive" });
    expect(w.model).toEqual({ equals: "Classic 350", mode: "insensitive" });
    expect(w.city).toEqual({ equals: "Indore", mode: "insensitive" });
  });

  // The filter is `fuelTypes: string[]` (multi-select in /browse), not a
  // singular `fuelType`. This test previously passed the singular key, which
  // SearchFilters ignores, so it asserted against a filter that was never
  // applied and failed regardless of the implementation.
  it("only accepts fuelType values that match the Prisma enum (ignores garbage)", async () => {
    await searchListings({ fuelTypes: ["PETROL"] });
    expect(getWhere().fuelType).toEqual({ in: ["PETROL"] });

    findMany.mockClear();
    await searchListings({ fuelTypes: ["totally-fake"] });
    expect(getWhere().fuelType).toBeUndefined();
  });

  it("only accepts transmission values that match the Prisma enum (ignores garbage)", async () => {
    await searchListings({ transmission: "AUTOMATIC" });
    expect(getWhere().transmission).toBe("AUTOMATIC");

    findMany.mockClear();
    await searchListings({ transmission: "WARP" });
    expect(getWhere().transmission).toBeUndefined();
  });

  it("applies price bounds as gte / lte on askingPrice", async () => {
    await searchListings({ minPrice: 100_000, maxPrice: 500_000 });
    const w = getWhere();
    expect(w.askingPrice).toEqual({ gte: 100_000, lte: 500_000 });
  });

  it("orders by isBoosted desc first, then createdAt desc (paid placement)", async () => {
    await searchListings({});
    expect(getOrderBy()).toEqual([{ isBoosted: "desc" }, { createdAt: "desc" }]);
  });

  it("paginates: skip = (page-1)*limit, take = limit", async () => {
    await searchListings({ page: 3, limit: 20 });
    const call = findMany.mock.calls[0][0];
    expect(call.skip).toBe(40);
    expect(call.take).toBe(20);
  });

  it("computes totalPages = ceil(total/limit)", async () => {
    count.mockResolvedValue(45);
    const result = await searchListings({ page: 1, limit: 20 });
    expect(result.meta).toEqual({
      total: 45,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
  });

  it("includes a single inspections row so the browse grid can render the badge", async () => {
    await searchListings({});
    const includes = findMany.mock.calls[0][0].include;
    expect(includes.inspections).toEqual(
      expect.objectContaining({
        where: { status: "COMPLETED" },
        take: 1,
      }),
    );
  });
});
