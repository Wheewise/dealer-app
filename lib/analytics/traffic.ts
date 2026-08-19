import { prisma } from "@/lib/db";
import type { DaySeries } from "./types";

export async function getTrafficAnalytics(
  dealerId: string,
  days: number,
): Promise<DaySeries[]> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);

  const [views, enquiries] = await Promise.all([
    prisma.listingView.findMany({
      where: { listing: { dealerId }, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
    prisma.enquiry.findMany({
      where: { dealerId, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const viewsByDay: Record<string, number> = {};
  const leadsByDay: Record<string, number> = {};

  for (const v of views) {
    const d = v.createdAt.toISOString().split("T")[0];
    viewsByDay[d] = (viewsByDay[d] ?? 0) + 1;
  }
  for (const e of enquiries) {
    const d = e.createdAt.toISOString().split("T")[0];
    leadsByDay[d] = (leadsByDay[d] ?? 0) + 1;
  }

  const result: DaySeries[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 86_400_000)
      .toISOString()
      .split("T")[0];
    result.push({ date, views: viewsByDay[date] ?? 0, leads: leadsByDay[date] ?? 0 });
  }

  return result;
}
