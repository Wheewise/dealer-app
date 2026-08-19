import { db, DbError } from "@/lib/db";
import type { SourceBreakdown } from "./types";

export interface LeadAnalytics {
  bySource: SourceBreakdown[];
  contacted: number;
  unread: number;
  hot: number;
  total: number;
}

export async function getLeadAnalytics(
  dealerId: string,
  days: number,
): Promise<LeadAnalytics> {
  const { data, error } = await db.rpc("dealer_lead_analytics", {
    p_dealer_id: dealerId,
    p_days: days,
  });
  if (error) throw new DbError(error, "getLeadAnalytics");

  return data as unknown as LeadAnalytics;
}
