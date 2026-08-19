import { db, DbError } from "@/lib/db";
import type { DaySeries } from "./types";

export async function getTrafficAnalytics(
  dealerId: string,
  days: number,
): Promise<DaySeries[]> {
  // The zero-filled day axis comes from generate_series in the database, so
  // the app no longer pulls every view and enquiry row across the window
  // just to bucket them by date.
  const { data, error } = await db.rpc("dealer_traffic_series", {
    p_dealer_id: dealerId,
    p_days: days,
  });
  if (error) throw new DbError(error, "getTrafficAnalytics");

  return data as unknown as DaySeries[];
}
