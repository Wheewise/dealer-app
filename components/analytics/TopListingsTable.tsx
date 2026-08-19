import Link from "next/link";
import type { TopListing } from "@/lib/analytics/types";

const STATUS_PILL: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  SOLD:   "bg-zinc-100   text-zinc-600",
  PAUSED: "bg-amber-100  text-amber-700",
};

export function TopListingsTable({ listings }: { listings: TopListing[] }) {
  if (listings.length === 0) {
    return (
      <div className="border-border-default rounded-lg border border-dashed p-8 text-center text-sm text-zinc-400">
        No listings yet. Add vehicles to your inventory to see performance data.
      </div>
    );
  }

  return (
    <div className="border-border-default bg-background overflow-hidden rounded-lg border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-border-default border-b bg-surface-muted/50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Vehicle
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Views
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Leads
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Conv.
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Days listed
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-border-default divide-y">
            {listings.map((l) => (
              <tr key={l.id} className="hover:bg-surface-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <Link
                    href={`/dashboard/inventory/${l.id}/edit`}
                    className="font-medium hover:text-brand-red hover:underline"
                  >
                    {l.year} {l.make} {l.model}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                  {l.views.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                  {l.leads}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums font-medium ${l.convRate > 3 ? "text-emerald-600" : "text-zinc-700"}`}>
                  {l.convRate.toFixed(1)}%
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                  {l.daysListed}d
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_PILL[l.status] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {l.status.toLowerCase()}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
