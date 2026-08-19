import { db, DbError } from "@/lib/db";
import type { ChangeMetric } from "./types";

export interface OverviewData {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  pausedListings: number;
  newListings: ChangeMetric;
  totalLeads: ChangeMetric;
  totalViews: ChangeMetric;
  uniqueVisitors: ChangeMetric;
  wishlistAdds: ChangeMetric;
  conversionRate: ChangeMetric;
}

/** Shape of `dealer_overview_metrics()` in supabase/schema.sql. */
interface OverviewCounts {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  pausedListings: number;
  newCur: number;
  newPrev: number;
  leadsCur: number;
  leadsPrev: number;
  viewsCur: number;
  viewsPrev: number;
  uvCur: number;
  uvPrev: number;
  wlCur: number;
  wlPrev: number;
}

function pctChange(current: number, prev: number): number {
  if (prev === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - prev) / prev) * 100);
}

function metric(current: number, prev: number): ChangeMetric {
  return { value: current, prev, pct: pctChange(current, prev) };
}

export async function getOverviewMetrics(
  dealerId: string,
  days: number,
): Promise<OverviewData> {
  // Fourteen counts, one round trip. The distinct-visitor tallies in
  // particular used to page every ListingView row into the app to measure
  // the size of the result.
  const { data, error } = await db.rpc("dealer_overview_metrics", {
    p_dealer_id: dealerId,
    p_days: days,
  });
  if (error) throw new DbError(error, "getOverviewMetrics");

  const c = data as unknown as OverviewCounts;

  const convCur = c.viewsCur > 0 ? +((c.leadsCur / c.viewsCur) * 100).toFixed(1) : 0;
  const convPrev = c.viewsPrev > 0 ? +((c.leadsPrev / c.viewsPrev) * 100).toFixed(1) : 0;

  return {
    totalListings: c.totalListings,
    activeListings: c.activeListings,
    soldListings: c.soldListings,
    pausedListings: c.pausedListings,
    newListings: metric(c.newCur, c.newPrev),
    totalLeads: metric(c.leadsCur, c.leadsPrev),
    totalViews: metric(c.viewsCur, c.viewsPrev),
    uniqueVisitors: metric(c.uvCur, c.uvPrev),
    wishlistAdds: metric(c.wlCur, c.wlPrev),
    conversionRate: metric(convCur, convPrev),
  };
}
