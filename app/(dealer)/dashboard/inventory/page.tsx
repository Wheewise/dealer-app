import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireDealer } from "@/lib/dealer";
import { Button } from "@/components/ui/Field";
import { formatINR } from "@/lib/format";
import { InventoryList, type InventoryListingRow } from "@/components/listings/InventoryList";

function daysListedLabel(createdAt: Date): string {
  const days = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86_400_000));
  if (days === 0) return "Listed today";
  if (days === 1) return "Listed 1 day ago";
  return `Listed ${days} days ago`;
}

export default async function InventoryPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;
  const { dealer } = await requireDealer();

  const limit = 20;
  const cursor = searchParams?.cursor as string | undefined;
  const showUpdatedBanner = searchParams?.updated === "1";

  const [listings, total, activeCount, soldCount, activeValue] = await Promise.all([
    prisma.listing.findMany({
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      where: { dealerId: dealer.id },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        photos: { take: 1, orderBy: { sortOrder: "asc" } },
        _count: { select: { enquiries: true } },
      },
    }),
    prisma.listing.count({ where: { dealerId: dealer.id } }),
    prisma.listing.count({ where: { dealerId: dealer.id, status: "ACTIVE" } }),
    prisma.listing.count({ where: { dealerId: dealer.id, status: "SOLD" } }),
    prisma.listing.aggregate({
      where: { dealerId: dealer.id, status: "ACTIVE" },
      _sum: { askingPrice: true },
    }),
  ]);

  let nextCursor: string | undefined = undefined;
  if (listings.length > limit) {
    const nextItem = listings.pop();
    nextCursor = nextItem!.id;
  }

  const rows: InventoryListingRow[] = listings.map((l) => ({
    id: l.id,
    make: l.make,
    model: l.model,
    year: l.year,
    askingPrice: Number(l.askingPrice),
    odometerKm: l.odometerKm,
    status: l.status,
    enquiryCount: l._count.enquiries,
    photoUrl: l.photos[0]?.url ?? null,
    daysListedLabel: daysListedLabel(l.createdAt),
  }));

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
        <StatCard
          label="Total value"
          value={formatINR(Number(activeValue._sum.askingPrice ?? 0))}
          small
        />
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
