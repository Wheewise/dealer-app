"use client";

import type { OverviewData } from "@/lib/analytics/overview";
import type { DaySeries } from "@/lib/analytics/types";
import type { TopListing } from "@/lib/analytics/types";

interface Props {
  overview: OverviewData;
  traffic: DaySeries[];
  topListings: TopListing[];
  days: number;
}

function toCSV(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (String(cell).includes(",") ? `"${cell}"` : cell)).join(","),
    )
    .join("\n");
}

function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ExportButton({ overview, traffic, topListings, days }: Props) {
  function handleExport() {
    const date = new Date().toISOString().split("T")[0];

    const summary = toCSV([
      ["Metric", "Value", "Previous period", "Change %"],
      ["Total listings",    String(overview.totalListings), "", ""],
      ["Active listings",   String(overview.activeListings), "", ""],
      ["Sold listings",     String(overview.soldListings), "", ""],
      ["New listings",      String(overview.newListings.value),    String(overview.newListings.prev),    String(overview.newListings.pct) + "%"],
      ["Total leads",       String(overview.totalLeads.value),     String(overview.totalLeads.prev),     String(overview.totalLeads.pct) + "%"],
      ["Total views",       String(overview.totalViews.value),     String(overview.totalViews.prev),     String(overview.totalViews.pct) + "%"],
      ["Unique visitors",   String(overview.uniqueVisitors.value), String(overview.uniqueVisitors.prev), String(overview.uniqueVisitors.pct) + "%"],
      ["Wishlist adds",     String(overview.wishlistAdds.value),   String(overview.wishlistAdds.prev),   String(overview.wishlistAdds.pct) + "%"],
      ["Conversion rate %", String(overview.conversionRate.value), String(overview.conversionRate.prev), String(overview.conversionRate.pct) + "%"],
    ]);

    const trafficCSV = toCSV([
      ["Date", "Views", "Leads"],
      ...traffic.map((d) => [d.date, String(d.views), String(d.leads)]),
    ]);

    const listingsCSV = toCSV([
      ["Vehicle", "Views", "Leads", "Conversion %", "Days listed", "Status"],
      ...topListings.map((l) => [
        `${l.year} ${l.make} ${l.model}`,
        String(l.views),
        String(l.leads),
        String(l.convRate),
        String(l.daysListed),
        l.status,
      ]),
    ]);

    const full = [
      `Wheewise Analytics Export — Last ${days} days (${date})`,
      "",
      "=== KPI Summary ===",
      summary,
      "",
      "=== Daily Traffic ===",
      trafficCSV,
      "",
      "=== Listing Performance ===",
      listingsCSV,
    ].join("\n");

    downloadCSV(`wheewise-analytics-${date}.csv`, full);
  }

  return (
    <button
      onClick={handleExport}
      className="border-border-default bg-background hover:bg-surface-muted inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-semibold transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-zinc-500">
        <path
          d="M7 1v8M4 6l3 3 3-3M2 10v1.5A1.5 1.5 0 003.5 13h7A1.5 1.5 0 0012 11.5V10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Export CSV
    </button>
  );
}
