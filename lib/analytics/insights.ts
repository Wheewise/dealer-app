import type { Insight, Recommendation } from "./types";
import type { OverviewData } from "./overview";
import type { LeadAnalytics } from "./leads";
import type { InventoryAnalytics } from "./inventory";

export function generateInsights(
  overview: OverviewData,
  leads: LeadAnalytics,
  inventory: InventoryAnalytics,
): Insight[] {
  const insights: Insight[] = [];

  if (overview.conversionRate.value < 1 && overview.totalViews.value > 10) {
    insights.push({
      type: "warning",
      title: "Low lead conversion",
      description: `Your ${overview.conversionRate.value.toFixed(1)}% conversion rate is below average. Better photos, detailed descriptions, and competitive pricing typically improve this.`,
    });
  } else if (overview.conversionRate.value > 5) {
    insights.push({
      type: "positive",
      title: "Excellent conversion rate",
      description: `${overview.conversionRate.value.toFixed(1)}% of views become leads — well above the industry average. Your listings are compelling buyers.`,
    });
  }

  if (overview.totalViews.pct > 20) {
    insights.push({
      type: "positive",
      title: "Traffic trending up",
      description: `Views increased ${overview.totalViews.pct}% vs the previous period. Your inventory is attracting more buyers.`,
    });
  } else if (overview.totalViews.pct < -20 && overview.totalViews.prev > 0) {
    insights.push({
      type: "warning",
      title: "Traffic declining",
      description: `Views dropped ${Math.abs(overview.totalViews.pct)}% from the previous period. Consider refreshing descriptions or boosting key listings.`,
    });
  }

  if (overview.totalLeads.pct > 30) {
    insights.push({
      type: "positive",
      title: "Lead generation up",
      description: `${overview.totalLeads.pct}% more leads than the previous period. Strong buyer interest in your inventory.`,
    });
  }

  if (leads.bySource.length > 0) {
    const top = leads.bySource[0];
    const label =
      top.source === "WHATSAPP" ? "WhatsApp" : top.source === "FORM" ? "enquiry forms" : "phone calls";
    insights.push({
      type: "neutral",
      title: `${label.charAt(0).toUpperCase() + label.slice(1)} drives most leads`,
      description: `${top.count} of your recent leads arrived via ${label}. Keep your ${top.source === "WHATSAPP" ? "WhatsApp number" : "contact details"} current and responsive.`,
    });
  }

  if (leads.unread > 3) {
    insights.push({
      type: "warning",
      title: `${leads.unread} unread leads`,
      description: "Responding within 30 minutes increases conversion by 5×. Head to Leads to follow up.",
    });
  }

  if (inventory.avgDaysListed > 60) {
    insights.push({
      type: "warning",
      title: "Inventory aging",
      description: `Active listings average ${inventory.avgDaysListed} days on the platform. Vehicles older than 60 days see fewer enquiries — consider price adjustments or boosting.`,
    });
  }

  if (overview.wishlistAdds.value > 5) {
    insights.push({
      type: "positive",
      title: "Strong wishlist activity",
      description: `${overview.wishlistAdds.value} buyers saved your vehicles this period — warm leads who haven't contacted you yet.`,
    });
  }

  return insights.slice(0, 5);
}

export function generateRecommendations(
  overview: OverviewData,
  inventory: InventoryAnalytics,
): Recommendation[] {
  const recs: Recommendation[] = [];

  const lowView = inventory.topListings
    .filter((l) => l.status === "ACTIVE" && l.views < 5 && l.daysListed > 7)
    .slice(0, 2);

  for (const l of lowView) {
    recs.push({
      type: "boost",
      listingId: l.id,
      title: `Boost ${l.year} ${l.make} ${l.model}`,
      description: `Only ${l.views} view${l.views === 1 ? "" : "s"} in ${l.daysListed} days. Boosting will push this listing to the top of search results.`,
    });
  }

  const highViewNoLead = inventory.topListings
    .filter((l) => l.status === "ACTIVE" && l.views > 15 && l.leads === 0)
    .slice(0, 2);

  for (const l of highViewNoLead) {
    recs.push({
      type: "price",
      listingId: l.id,
      title: `Review pricing for ${l.year} ${l.make} ${l.model}`,
      description: `${l.views} views but no leads — buyers are looking but not enquiring. A price adjustment may unlock conversions.`,
    });
  }

  const aging = inventory.topListings
    .filter((l) => l.status === "ACTIVE" && l.daysListed > 90)
    .slice(0, 1);

  for (const l of aging) {
    recs.push({
      type: "update",
      listingId: l.id,
      title: `Refresh ${l.year} ${l.make} ${l.model}`,
      description: `Listed ${l.daysListed} days ago. Update photos or description to re-rank in search and attract new buyers.`,
    });
  }

  if (overview.activeListings < 3) {
    recs.push({
      type: "promote",
      title: "Grow your inventory",
      description: "Dealers with 5+ active listings receive 3× more profile views. Add more vehicles to maximise reach.",
    });
  }

  return recs.slice(0, 4);
}
