import { requireDealer } from "@/lib/dealer";
import {
  getOverviewMetrics,
  getTrafficAnalytics,
  getLeadAnalytics,
  getInventoryAnalytics,
  generateInsights,
  generateRecommendations,
} from "@/lib/analytics";
import { KpiCard } from "@/components/analytics/KpiCard";
import { PeriodSelector } from "@/components/analytics/PeriodSelector";
import { InsightsPanel } from "@/components/analytics/InsightsPanel";
import { TopListingsTable } from "@/components/analytics/TopListingsTable";
import { TrafficChart } from "@/components/analytics/TrafficChart";
import { LeadsBreakdown } from "@/components/analytics/LeadsBreakdown";
import { InventoryCharts } from "@/components/analytics/InventoryCharts";
import { ExportButton } from "@/components/analytics/ExportButton";

export const metadata = { title: "Analytics – Wheewise Dashboard" };

const VALID_DAYS = new Set([7, 30, 90, 365]);

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { dealer } = await requireDealer();
  const sp  = await searchParams;
  const raw = parseInt(sp.days ?? "30", 10);
  const days = VALID_DAYS.has(raw) ? raw : 30;

  const [overview, traffic, leads, inventory] = await Promise.all([
    getOverviewMetrics(dealer.id, days),
    getTrafficAnalytics(dealer.id, days),
    getLeadAnalytics(dealer.id, days),
    getInventoryAnalytics(dealer.id),
  ]);

  const insights        = generateInsights(overview, leads, inventory);
  const recommendations = generateRecommendations(overview, inventory);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Performance metrics for your dealership.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector current={days} />
          <ExportButton
            overview={overview}
            traffic={traffic}
            topListings={inventory.topListings}
            days={days}
          />
        </div>
      </div>

      {/* Inventory snapshot */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Inventory snapshot
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total listings"
            value={overview.totalListings}
            description={`${overview.activeListings} active · ${overview.soldListings} sold`}
          />
          <KpiCard
            label="New listings"
            value={overview.newListings.value}
            metric={overview.newListings}
          />
          <KpiCard
            label="Active"
            value={overview.activeListings}
          />
          <KpiCard
            label="Avg days listed"
            value={inventory.avgDaysListed}
            suffix="d"
            description="For active listings"
          />
        </div>
      </section>

      {/* Engagement KPIs */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Engagement — last {days} days vs prev. {days} days
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <KpiCard
            label="Total views"
            value={overview.totalViews.value.toLocaleString()}
            metric={overview.totalViews}
          />
          <KpiCard
            label="Unique visitors"
            value={overview.uniqueVisitors.value.toLocaleString()}
            metric={overview.uniqueVisitors}
          />
          <KpiCard
            label="Wishlist saves"
            value={overview.wishlistAdds.value}
            metric={overview.wishlistAdds}
          />
          <KpiCard
            label="Total leads"
            value={overview.totalLeads.value}
            metric={overview.totalLeads}
          />
          <KpiCard
            label="Conversion rate"
            value={overview.conversionRate.value}
            suffix="%"
            metric={overview.conversionRate}
            description="Leads ÷ views"
          />
          <KpiCard
            label="Hot leads"
            value={leads.hot}
            description="High-intent buyers"
          />
        </div>
      </section>

      {/* Traffic chart */}
      <TrafficChart data={traffic} days={days} />

      {/* Leads + breakdown */}
      <LeadsBreakdown leads={leads} />

      {/* Inventory distribution charts */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Inventory mix
        </h2>
        <InventoryCharts inventory={inventory} />
      </section>

      {/* Insights & recommendations */}
      <InsightsPanel insights={insights} recommendations={recommendations} />

      {/* Top listings table */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Listing performance
        </h2>
        <TopListingsTable listings={inventory.topListings} />
      </section>
    </div>
  );
}
