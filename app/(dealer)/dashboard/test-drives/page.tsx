import Link from "next/link";
import { requireDealer } from "@/lib/dealer";
import { getTestDrivesForDealer } from "@/lib/actions/testdrive";
import { TestDriveActions } from "./TestDriveActions";

export const metadata = { title: "Test Drives – Wheewise Dashboard" };

const TABS = [
  { label: "All", value: undefined },
  { label: "Pending", value: "PENDING" },
  { label: "Confirmed", value: "CONFIRMED" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Cancelled", value: "CANCELLED" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-emerald-100 text-emerald-800",
  COMPLETED: "bg-zinc-200 text-zinc-600",
  CANCELLED: "bg-red-100 text-red-700",
};

export default async function DealerTestDrivesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireDealer();
  const { status } = await searchParams;

  const all = await getTestDrivesForDealer();
  const filtered = status ? all.filter((t) => t.status === status) : all;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Test Drives</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {all.length} test drive request{all.length === 1 ? "" : "s"} across your listings.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border-default">
        {TABS.map((tab) => {
          const active = (status ?? undefined) === tab.value;
          const href = tab.value ? `/dashboard/test-drives?status=${tab.value}` : "/dashboard/test-drives";
          return (
            <Link
              key={tab.label}
              href={href}
              className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-red text-brand-red"
                  : "border-transparent text-zinc-500 hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="border-border-default bg-background rounded-lg border border-dashed p-10 text-center">
          <h2 className="text-base font-semibold">No test drives here</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Requests will show up here once buyers book a test drive.
          </p>
        </div>
      ) : (
        <ul className="border-border-default bg-background divide-border-default divide-y overflow-hidden rounded-lg border">
          {filtered.map((t) => {
            const vehicle = `${t.listing.year} ${t.listing.make} ${t.listing.model}`;
            const photo = t.listing.photos[0]?.url;
            const when = new Date(t.scheduledAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            });
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo}
                    alt={vehicle}
                    className="h-16 w-20 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="bg-surface-muted h-16 w-20 shrink-0 rounded-md" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/inventory/${t.listing.id}/edit`}
                      className="font-medium hover:underline"
                    >
                      {vehicle}
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_BADGE[t.status] ?? "bg-zinc-100 text-zinc-600"}`}
                    >
                      {t.status.toLowerCase()}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-600">
                    {t.buyer.name ?? "Buyer"} · {t.buyer.phone ?? "No phone on file"}
                  </div>
                  <div className="mt-0.5 text-xs text-zinc-500">Requested for {when}</div>
                  {t.notes ? (
                    <p className="text-foreground mt-1.5 text-sm">“{t.notes}”</p>
                  ) : null}
                </div>
                <div className="shrink-0">
                  {t.status === "COMPLETED" ? (
                    <span className="text-xs text-zinc-500">
                      Completed {new Date(t.updatedAt).toLocaleDateString("en-IN")}
                    </span>
                  ) : (
                    <TestDriveActions testDriveId={t.id} status={t.status} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
