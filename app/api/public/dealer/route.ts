import { NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-auth";
import { count, db, unwrapMaybe } from "@/lib/db";

export async function GET(req: Request) {
  const dealerId = await validateApiKey(req);
  if (!dealerId) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const row = unwrapMaybe(
    await db
      .from("Dealer")
      .select(
        `id, businessName, city, phone, gstVerified, status, createdAt,
         store:Store(slug, bio, logoUrl)`,
      )
      .eq("id", dealerId)
      .maybeSingle(),
    "GET /api/public/dealer",
  );

  if (!row) {
    return NextResponse.json({ error: "Dealer not found" }, { status: 404 });
  }

  const dealer = {
    ...row,
    store: Array.isArray(row.store) ? (row.store[0] ?? null) : row.store,
  };

  const [activeCount, soldCount] = await Promise.all([
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealerId)
        .eq("status", "ACTIVE"),
    ),
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealerId)
        .eq("status", "SOLD"),
    ),
  ]);

  return NextResponse.json({
    ...dealer,
    stats: { activeListings: activeCount, soldListings: soldCount },
  });
}
