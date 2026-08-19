import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiRequireAuth } from "@/lib/rbac";

/**
 * The cursor is the sort key of the last row returned, not just its id.
 *
 * Prisma's `cursor: { id }` re-found the row and resumed from it; PostgREST
 * has no equivalent, so the ordering tuple travels in the cursor and the next
 * page is selected by a keyset predicate. It stays opaque to clients — the
 * value is only ever handed back verbatim.
 */
type Cursor = { status: string; createdAt: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed?.status === "string" &&
      typeof parsed?.createdAt === "string" &&
      typeof parsed?.id === "string"
    ) {
      return parsed as Cursor;
    }
  } catch {
    // A malformed cursor restarts from the first page rather than 500ing.
  }
  return null;
}

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
  const cursor = decodeCursor(searchParams.get("cursor"));
  const requestedDealerId = searchParams.get("dealerId");

  // Clamp rather than trust: `parseInt` on a hostile value previously allowed
  // an unbounded `take`.
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20", 10) || 20));

  const showEnquiryCount = ctx.isAdmin || ctx.role === "DEALER";

  let scopedDealerId: string | null = null;
  let activeOnly = false;

  if (ctx.isAdmin) {
    scopedDealerId = requestedDealerId;
  } else if (ctx.role === "DEALER" && ctx.dealerId) {
    if (requestedDealerId && requestedDealerId !== ctx.dealerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    scopedDealerId = ctx.dealerId;
  } else {
    // Buyers see the public catalogue only. A `dealerId` filter is allowed
    // here because it cannot widen scope past ACTIVE.
    activeOnly = true;
    scopedDealerId = requestedDealerId;
  }

  try {
    let query = db
      .from("Listing")
      .select(
        showEnquiryCount
          ? // Enquiry volume is commercially sensitive — dealers and admins only.
            "*, photos:ListingPhoto(id, url, sortOrder), enquiries:Enquiry(count)"
          : "*, photos:ListingPhoto(id, url, sortOrder)",
      )
      .order("status", { ascending: true })
      .order("createdAt", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1); // one extra, to know whether a next page exists

    if (activeOnly) query = query.eq("status", "ACTIVE");
    if (scopedDealerId) query = query.eq("dealerId", scopedDealerId);

    if (cursor) {
      // Keyset resume, matching (status asc, createdAt desc, id desc).
      query = query.or(
        [
          `status.gt.${cursor.status}`,
          `and(status.eq.${cursor.status},createdAt.lt.${cursor.createdAt})`,
          `and(status.eq.${cursor.status},createdAt.eq.${cursor.createdAt},id.lt.${cursor.id})`,
        ].join(","),
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as {
      id: string;
      status: string;
      createdAt: string;
      photos: { id: string; url: string; sortOrder: number }[] | null;
      enquiries?: { count: number }[] | { count: number } | null;
    }[];

    let nextCursor: string | undefined = undefined;
    if (rows.length > limit) {
      rows.pop();
      const last = rows[rows.length - 1];
      nextCursor = encodeCursor({
        status: last.status,
        createdAt: last.createdAt,
        id: last.id,
      });
    }

    // PostgREST cannot limit an embed per parent row, and returns an embedded
    // count aggregate as `[{ count: n }]` — both normalised here so the
    // response shape is unchanged from the Prisma version.
    const listings = rows.map((l) => {
      const { enquiries, ...rest } = l;
      const photos = [...(l.photos ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .slice(0, 1);
      if (!showEnquiryCount) return { ...rest, photos };
      const n = Array.isArray(enquiries) ? (enquiries[0]?.count ?? 0) : (enquiries?.count ?? 0);
      return { ...rest, photos, _count: { enquiries: n } };
    });

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
