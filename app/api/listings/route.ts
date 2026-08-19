import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { apiRequireAuth } from "@/lib/rbac";

/**
 * Cursor-paginated listing feed.
 *
 * Previously this handler was unauthenticated, returned listings in *every*
 * status (DRAFT/PAUSED/SOLD included) and honoured any `dealerId` the caller
 * supplied — so `GET /api/listings?dealerId=<someone else>` exposed a rival
 * dealer's unpublished inventory and enquiry volume. Scope is now derived
 * from the session:
 *
 *   admin  → every listing; `dealerId` may be used as a filter.
 *   dealer → their own listings only; a foreign `dealerId` is refused.
 *   buyer  → ACTIVE listings only, exactly what /browse already shows.
 */
export async function GET(req: Request) {
  const gate = await apiRequireAuth();
  if (!gate.ok) return gate.response;
  const ctx = gate.ctx;

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");
  const requestedDealerId = searchParams.get("dealerId");

  // Clamp rather than trust: `parseInt` on a hostile value previously allowed
  // an unbounded `take`.
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

  let where: {
    dealerId?: string;
    status?: "ACTIVE";
  };

  if (ctx.isAdmin) {
    where = requestedDealerId ? { dealerId: requestedDealerId } : {};
  } else if (ctx.role === "DEALER" && ctx.dealerId) {
    if (requestedDealerId && requestedDealerId !== ctx.dealerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where = { dealerId: ctx.dealerId };
  } else {
    // Buyers see the public catalogue only. A `dealerId` filter is allowed
    // here because it cannot widen scope past ACTIVE.
    where = {
      status: "ACTIVE",
      ...(requestedDealerId ? { dealerId: requestedDealerId } : {}),
    };
  }

  try {
    const listings = await prisma.listing.findMany({
      take: limit + 1, // Fetch one extra to know if there's a next page
      cursor: cursor ? { id: cursor } : undefined,
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        photos: { take: 1, orderBy: { sortOrder: "asc" } },
        // Enquiry volume is commercially sensitive — dealers and admins only.
        ...(ctx.isAdmin || ctx.role === "DEALER"
          ? { _count: { select: { enquiries: true } } }
          : {}),
      },
    });

    let nextCursor: typeof cursor | undefined = undefined;
    if (listings.length > limit) {
      const nextItem = listings.pop();
      nextCursor = nextItem!.id;
    }

    return NextResponse.json({
      data: listings,
      meta: {
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Failed to fetch listings:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
