import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const dealerId = await validateApiKey(req);
  if (!dealerId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      id: true,
      businessName: true,
      city: true,
      phone: true,
      gstVerified: true,
      status: true,
      createdAt: true,
      store: { select: { slug: true, bio: true, logoUrl: true } },
    },
  });

  if (!dealer) {
    return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
  }

  const [activeCount, soldCount] = await Promise.all([
    prisma.listing.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.listing.count({ where: { dealerId, status: "SOLD" } }),
  ]);

  return NextResponse.json({
    ...dealer,
    stats: { activeListings: activeCount, soldListings: soldCount },
  });
}
