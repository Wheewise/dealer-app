import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/db";
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

  const where = {
    status: "ACTIVE" as const,
    ...(q
      ? {
          OR: [
            { make: { contains: q, mode: "insensitive" as const } },
            { model: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
    ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
    ...(type === "CAR" || type === "BIKE" ? { vehicleType: type as "CAR" | "BIKE" } : {}),
  };

  const [listings, total] = await Promise.all([
    prisma.listing.findMany({
      where,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        fuelType: true,
        transmission: true,
        odometerKm: true,
        askingPrice: true,
        city: true,
        createdAt: true,
        photos: { take: 1, orderBy: { sortOrder: "asc" } },
        dealer: { select: { businessName: true, city: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.listing.count({ where }),
  ]);

  type PublicListing = (typeof listings)[number];
  const data = listings.map((l: PublicListing) => ({
    id: l.id,
    make: l.make,
    model: l.model,
    year: l.year,
    fuelType: l.fuelType,
    transmission: l.transmission,
    odometerKm: l.odometerKm,
    askingPrice: Number(l.askingPrice),
    city: l.city,
    dealer: l.dealer,
    coverUrl: l.photos[0]?.url ?? null,
    createdAt: l.createdAt,
  }));

  return NextResponse.json({
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
