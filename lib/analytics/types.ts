export interface ChangeMetric {
  value: number;
  prev: number;
  pct: number;
}

export interface DaySeries {
  date: string;
  views: number;
  leads: number;
}

export interface SourceBreakdown {
  source: string;
  count: number;
}

export interface InventoryDistribution {
  label: string;
  count: number;
}

export interface TopListing {
  id: string;
  make: string;
  model: string;
  year: number;
  status: string;
  views: number;
  leads: number;
  daysListed: number;
  convRate: number;
}

export interface Insight {
  type: "positive" | "warning" | "neutral";
  title: string;
  description: string;
}

export interface Recommendation {
  type: "boost" | "price" | "update" | "promote";
  listingId?: string;
  title: string;
  description: string;
}
