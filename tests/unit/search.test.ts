import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});

import { searchListings } from "../../lib/search";
import * as dbModule from "../../lib/db";
import type { DbMock, RecordedCall } from "../helpers/supabase-mock";

const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

beforeEach(() => {
  dbMock.reset();
});

/**
 * `searchListings` issues two queries against Listing with the same predicate:
 * a `head: true` count and the page of rows. The page is the one carrying
 * `order`/`range`, so tests read whichever they need by that distinction.
 */
function pageCall(): RecordedCall {
  const call = dbMock.calls.find((c) => c.table === "Listing" && c.order.length > 0);
  if (!call) throw new Error("no page query was issued");
  return call;
}

function countCall(): RecordedCall {
  const call = dbMock.calls.find(
    (c) => c.table === "Listing" && c.selectOptions?.head === true,
  );
  if (!call) throw new Error("no count query was issued");
  return call;
}

/** All args passed to a given filter method on the page query. */
function filterArgs(method: string): unknown[][] {
  return pageCall()
    .filters.filter((f) => f.method === method)
    .map((f) => f.args);
}

describe("searchListings — filter composition", () => {
  it("always filters status=ACTIVE", async () => {
    await searchListings({});
    expect(filterArgs("eq")).toContainEqual(["status", "ACTIVE"]);
  });

  it("composes a text-search OR across make/model/description/city when q is set", async () => {
    await searchListings({ q: "swift" });
    const [[filter]] = filterArgs("or") as [[string]];
    for (const column of ["make", "model", "description", "city"]) {
      expect(filter).toContain(`${column}.ilike.`);
    }
    expect(filter).toContain("swift");
  });

  // The `or=` parameter is a comma-separated list, so an unquoted term
  // containing a comma or parenthesis would break out of its value and change
  // which columns are matched.
  it("quotes the search term so punctuation cannot break out of the or= list", async () => {
    await searchListings({ q: "a,b)c" });
    const [[filter]] = filterArgs("or") as [[string]];
    expect(filter).toContain('"%a,b)c%"');
    // Four columns, so exactly three separators outside the quoted values.
    expect(filter.split('"').length - 1).toBe(8);
  });

  it("applies vehicleType as an exact match and make/model/city case-insensitively", async () => {
    await searchListings({
      vehicleType: "BIKE",
      make: "Royal Enfield",
      model: "Classic 350",
      city: "Indore",
    });
    expect(filterArgs("eq")).toContainEqual(["vehicleType", "BIKE"]);
    expect(filterArgs("ilike")).toContainEqual(["make", "Royal Enfield"]);
    expect(filterArgs("ilike")).toContainEqual(["model", "Classic 350"]);
    expect(filterArgs("ilike")).toContainEqual(["city", "Indore"]);
  });

  it("only accepts fuelType values in the enum (ignores garbage)", async () => {
    await searchListings({ fuelTypes: ["PETROL"] });
    expect(filterArgs("in")).toContainEqual(["fuelType", ["PETROL"]]);

    dbMock.reset();
    await searchListings({ fuelTypes: ["totally-fake"] });
    expect(filterArgs("in")).toHaveLength(0);
  });

  it("only accepts transmission values in the enum (ignores garbage)", async () => {
    await searchListings({ transmission: "AUTOMATIC" });
    expect(filterArgs("eq")).toContainEqual(["transmission", "AUTOMATIC"]);

    dbMock.reset();
    await searchListings({ transmission: "WARP" });
    expect(filterArgs("eq")).not.toContainEqual(["transmission", "WARP"]);
  });

  it("applies price bounds as gte / lte on askingPrice", async () => {
    await searchListings({ minPrice: 100_000, maxPrice: 500_000 });
    expect(filterArgs("gte")).toContainEqual(["askingPrice", 100_000]);
    expect(filterArgs("lte")).toContainEqual(["askingPrice", 500_000]);
  });

  it("orders by isBoosted desc first, then createdAt desc (paid placement)", async () => {
    await searchListings({});
    expect(pageCall().order).toEqual([
      { column: "isBoosted", options: { ascending: false } },
      { column: "createdAt", options: { ascending: false } },
    ]);
  });

  it("does not boost-rank when an explicit sort is asked for", async () => {
    await searchListings({ sort: "price_asc" });
    expect(pageCall().order).toEqual([
      { column: "askingPrice", options: { ascending: true } },
    ]);
  });

  it("paginates with a range of [(page-1)*limit, that + limit - 1]", async () => {
    await searchListings({ page: 3, limit: 20 });
    expect(pageCall().range).toEqual([40, 59]);
  });

  // The count and the page must agree, or the pager lies about how many
  // results the filters actually matched.
  it("applies the same predicate to the count query as to the page", async () => {
    await searchListings({ vehicleType: "CAR", minPrice: 1 });
    const pageFilters = pageCall().filters;
    expect(countCall().filters).toEqual(pageFilters);
  });

  it("computes totalPages = ceil(total/limit)", async () => {
    dbMock.queue({ count: 45 }); // count query resolves first
    const result = await searchListings({ page: 1, limit: 20 });
    expect(result.meta).toEqual({
      total: 45,
      page: 1,
      limit: 20,
      totalPages: 3,
    });
  });

  it("requests inspections so the browse grid can render the score badge", async () => {
    await searchListings({});
    expect(pageCall().select).toContain("inspections:Inspection(");
  });

  it("keeps only the completed inspection and the first photo per row", async () => {
    dbMock.queue({ count: 1 });
    dbMock.queue({
      data: [
        {
          id: "l1",
          photos: [
            { id: "p2", url: "/b.jpg", sortOrder: 1 },
            { id: "p1", url: "/a.jpg", sortOrder: 0 },
          ],
          inspections: [
            { overallScore: 55, status: "REQUESTED" },
            { overallScore: 91, status: "COMPLETED" },
          ],
        },
      ],
    });

    const result = await searchListings({});
    expect(result.data[0].photos).toEqual([{ id: "p1", url: "/a.jpg", sortOrder: 0 }]);
    expect(result.data[0].inspections).toEqual([{ overallScore: 91 }]);
  });
});
