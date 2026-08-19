import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { count, db, unwrap, withFilters, type FilterChain } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const dealerId = await validateApiKey(req);
  if (!dealerId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { ok: withinLimit } = await rateLimit(`api-listings:${ip}`, 100, 60 * 1000);
  if (!withinLimit) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
  const q = searchParams.get("q");
  const city = searchParams.get("city");
  const type = searchParams.get("type");

  // Quoted so a comma or parenthesis in the term cannot terminate the value
  // and change which columns the `or=` filter matches.
  const quote = (v: string) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

  // The count and the page must see the same predicate, so it is written once.
  const predicate = (query: FilterChain): FilterChain => {
    let out = query.eq("status", "ACTIVE");
    if (q) {
      const term = quote(`%${q}%`);
      out = out.or(`make.ilike.${term},model.ilike.${term}`);
    }
    if (city) out = out.ilike("city", `%${city}%`);
    if (type === "CAR" || type === "BIKE") out = out.eq("vehicleType", type);
    return out;
  };

  const from = (page - 1) * limit;

  const [listings, total] = await Promise.all([
    withFilters(
      db
        .from("Listing")
        .select(
          `id, make, model, year, fuelType, transmission, odometerKm, askingPrice,
           city, createdAt,
           photos:ListingPhoto(url, sortOrder),
           dealer:Dealer(businessName, city)`,
        ),
      predicate,
    )
      .order("createdAt", { ascending: false })
      .range(from, from + limit - 1)
      .then((r) => unwrap(r, "GET /api/public/listings")),
    count(
      withFilters(
        db.from("Listing").select("id", { count: "exact", head: true }),
        predicate,
      ),
    ),
  ]);

  const data = listings.map((l) => {
    const dealer = Array.isArray(l.dealer) ? (l.dealer[0] ?? null) : l.dealer;
    // PostgREST cannot order an embed per parent row, so the cover photo is
    // picked here.
    const cover = [...(l.photos ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    return {
      id: l.id,
      make: l.make,
      model: l.model,
      year: l.year,
      fuelType: l.fuelType,
      transmission: l.transmission,
      odometerKm: l.odometerKm,
      askingPrice: Number(l.askingPrice),
      city: l.city,
      dealer,
      coverUrl: cover?.url ?? null,
      createdAt: l.createdAt,
    };
  });

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
