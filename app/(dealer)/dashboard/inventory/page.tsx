import Link from "next/link";
import { count, db, unwrap } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { Button } from "@/components/ui/Field";
import { formatINR } from "@/lib/format";
import { InventoryList, type InventoryListingRow } from "@/components/listings/InventoryList";

function daysListedLabel(createdAt: string): string {
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000),
  );
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed 1 day ago";
  return `Listed ${days} days ago`;
}

/**
 * The "Load more" cursor is the sort key of the last row, not just its id.
 *
 * Prisma's `cursor: { id }` re-found the row and resumed from it; PostgREST
 * has no equivalent, so the ordering tuple travels in the cursor and the next
 * page is selected by a keyset predicate.
 */
type Cursor = { status: string; createdAt: string; id: string };

function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(raw: string | undefined): Cursor | null {
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
    // A malformed cursor restarts from the first page rather than throwing.
  }
  return null;
}

export default async function InventoryPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const { dealer } = await requireDealer();

  const limit = 20;
  const cursor = decodeCursor(searchParams?.cursor as string | undefined);
  const showUpdatedBanner = searchParams?.updated === "1";

  let page = db
    .from("Listing")
    .select("*, photos:ListingPhoto(url, sortOrder), enquiries:Enquiry(count)")
    .eq("dealerId", dealer.id)
    .order("status", { ascending: true })
    .order("createdAt", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    // Keyset resume, matching (status asc, createdAt desc, id desc).
    page = page.or(
      [
        `status.gt.${cursor.status}`,
        `and(status.eq.${cursor.status},createdAt.lt.${cursor.createdAt})`,
        `and(status.eq.${cursor.status},createdAt.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      ].join(","),
    );
  }

  const [listings, total, activeCount, soldCount, activePrices] = await Promise.all([
    page.then((r) => unwrap(r, "inventory: listings")),
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealer.id),
    ),
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealer.id)
        .eq("status", "ACTIVE"),
    ),
    count(
      db
        .from("Listing")
        .select("id", { count: "exact", head: true })
        .eq("dealerId", dealer.id)
        .eq("status", "SOLD"),
    ),
    // SUM has no PostgREST equivalent; one dealer's active prices are few.
    db
      .from("Listing")
      .select("askingPrice")
      .eq("dealerId", dealer.id)
      .eq("status", "ACTIVE")
      .then((r) => unwrap(r, "inventory: active value")),
  ]);

  let nextCursor: string | undefined = undefined;
  if (listings.length > limit) {
    listings.pop();
    const last = listings[listings.length - 1];
    nextCursor = encodeCursor({
      status: last.status,
      createdAt: last.createdAt,
      id: last.id,
    });
  }

  const activeValue = activePrices.reduce((s, l) => s + Number(l.askingPrice), 0);

  const rows: InventoryListingRow[] = listings.map((l) => {
    // PostgREST cannot order or limit an embed per parent row, and returns an
    // embedded count aggregate as `[{ count: n }]`.
    const cover = [...(l.photos ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    const enquiries = Array.isArray(l.enquiries)
      ? (l.enquiries[0]?.count ?? 0)
      : ((l.enquiries as { count: number } | null)?.count ?? 0);
    return {
      id: l.id,
      make: l.make,
      model: l.model,
      year: l.year,
      askingPrice: Number(l.askingPrice),
      odometerKm: l.odometerKm,
      status: l.status,
      enquiryCount: enquiries,
      photoUrl: cover?.url ?? null,
      daysListedLabel: daysListedLabel(l.createdAt),
    };
  });

  return (
    <div className="space-y-6">
      {showUpdatedBanner ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          Vehicle updated successfully!
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {total} vehicle{total === 1 ? "" : "s"} in your showroom
          </p>
        </div>
        <Link href="/dashboard/inventory/new">
          <Button>Add vehicle</Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={total} />
        <StatCard label="Active" value={activeCount} />
        <StatCard label="Sold" value={soldCount} />
        <StatCard label="Total value" value={formatINR(activeValue)} small />
      </div>

      {total === 0 ? (
        <div className="py-20 text-center">
          <span className="text-6xl">🚗</span>
          <h2 className="text-foreground mt-4 mb-2 text-xl font-bold">
            No vehicles listed yet
          </h2>
          <p className="mb-6 text-zinc-500">
            Add your first vehicle to start receiving enquiries
          </p>
          <Link
            href="/dashboard/inventory/new"
            className="rounded-xl bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700"
          >
            Add Your First Vehicle
          </Link>
        </div>
      ) : (
        <>
          <InventoryList listings={rows} />

          {nextCursor && (
            <div className="flex justify-center pt-2">
              <Link href={`/dashboard/inventory?cursor=${nextCursor}`}>
                <Button variant="outline">Load More</Button>
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="border-border-default bg-background border-t-red-600/30 rounded-lg border border-t-2 p-4">
      <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{label}</div>
      <div className={`mt-1 font-bold tracking-tight ${small ? "text-lg" : "text-2xl"}`}>
        {value}
      </div>
    </div>
  );
}
