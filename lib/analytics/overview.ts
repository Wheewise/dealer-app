import { prisma } from "@/lib/db";
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
  const now = new Date();
  const cur  = new Date(now.getTime() - days * 86_400_000);
  const prev = new Date(now.getTime() - days * 86_400_000 * 2);

  const [
    totalListings,
    activeListings,
    soldListings,
    pausedListings,
    newCur,
    newPrev,
    leadsCur,
    leadsPrev,
    viewsCur,
    viewsPrev,
    uvCur,
    uvPrev,
    wlCur,
    wlPrev,
  ] = await Promise.all([
    prisma.listing.count({ where: { dealerId } }),
    prisma.listing.count({ where: { dealerId, status: "ACTIVE" } }),
    prisma.listing.count({ where: { dealerId, status: "SOLD" } }),
    prisma.listing.count({ where: { dealerId, status: "PAUSED" } }),
    prisma.listing.count({ where: { dealerId, createdAt: { gte: cur } } }),
    prisma.listing.count({ where: { dealerId, createdAt: { gte: prev, lt: cur } } }),
    prisma.enquiry.count({ where: { dealerId, createdAt: { gte: cur } } }),
    prisma.enquiry.count({ where: { dealerId, createdAt: { gte: prev, lt: cur } } }),
    prisma.listingView.count({
      where: { listing: { dealerId }, createdAt: { gte: cur } },
    }),
    prisma.listingView.count({
      where: { listing: { dealerId }, createdAt: { gte: prev, lt: cur } },
    }),
    prisma.listingView
      .groupBy({
        by: ["visitorId"],
        where: { listing: { dealerId }, createdAt: { gte: cur } },
      })
      .then((r) => r.length),
    prisma.listingView
      .groupBy({
        by: ["visitorId"],
        where: { listing: { dealerId }, createdAt: { gte: prev, lt: cur } },
      })
      .then((r) => r.length),
    prisma.savedListing.count({
      where: { listing: { dealerId }, createdAt: { gte: cur } },
    }),
    prisma.savedListing.count({
      where: { listing: { dealerId }, createdAt: { gte: prev, lt: cur } },
    }),
  ]);

  const convCur  = viewsCur  > 0 ? +((leadsCur  / viewsCur)  * 100).toFixed(1) : 0;
  const convPrev = viewsPrev > 0 ? +((leadsPrev / viewsPrev) * 100).toFixed(1) : 0;

  return {
    totalListings,
    activeListings,
    soldListings,
    pausedListings,
    newListings:    metric(newCur,   newPrev),
    totalLeads:     metric(leadsCur, leadsPrev),
    totalViews:     metric(viewsCur, viewsPrev),
    uniqueVisitors: metric(uvCur,    uvPrev),
    wishlistAdds:   metric(wlCur,    wlPrev),
    conversionRate: metric(convCur,  convPrev),
  };
}
