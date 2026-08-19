import { requireDealer } from "@/lib/dealer";
import { prisma } from "@/lib/db";
import { RequestInspectionButton } from "./RequestButton";

export default async function DealerInspectionsPage() {
  const { dealer } = await requireDealer();

  const inspections = await prisma.inspection.findMany({
    where: { dealerId: dealer.id },
    include: {
      listing: { select: { make: true, model: true, year: true } },
      inspector: { select: { user: { select: { name: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  type Inspection = (typeof inspections)[number];

  const listings = await prisma.listing.findMany({
    where: { dealerId: dealer.id, status: "ACTIVE" },
    select: { id: true, make: true, model: true, year: true },
    orderBy: { createdAt: "desc" },
  });
  type InspectableListing = (typeof listings)[number];

  const inspectedIds = new Set(
    inspections.filter((i: Inspection) => i.status !== "CANCELLED").map((i: Inspection) => i.listingId),
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inspections</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Request quality inspections for your listings.
        </p>
      </div>

      <section>
        <h2 className="text-base font-semibold">Request inspection</h2>
        {listings.filter((l: InspectableListing) => !inspectedIds.has(l.id)).length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            All your active listings already have inspections in progress.
          </p>
        ) : (
          <div className="border-border-default bg-background mt-3 rounded-lg border">
            {listings
              .filter((l: InspectableListing) => !inspectedIds.has(l.id))
              .map((l: InspectableListing) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between border-b px-4 py-3 last:border-0"
                >
                  <span className="text-sm font-medium">
                    {l.year} {l.make} {l.model}
                  </span>
                  <RequestInspectionButton listingId={l.id} />
                </div>
              ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-base font-semibold">Inspection history</h2>
        {inspections.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No inspections yet.</p>
        ) : (
          <div className="border-border-default bg-background mt-3 rounded-lg border">
            {inspections.map((i: Inspection) => (
              <div
                key={i.id}
                className="flex items-center justify-between border-b px-4 py-3 last:border-0"
              >
                <div>
                  <span className="text-sm font-semibold">
                    {i.listing.year} {i.listing.make} {i.listing.model}
                  </span>
                  <p className="text-xs text-zinc-500">
                    {new Date(i.createdAt).toLocaleDateString("en-IN")}
                    {i.inspector ? ` · ${i.inspector.user.name ?? "Inspector"}` : ""}
                    {i.overallScore != null ? ` · Score: ${i.overallScore}%` : ""}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-medium uppercase ${
                    i.status === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : i.status === "CANCELLED"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {i.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
