import { prisma } from "@/lib/db";
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
  const since = new Date(Date.now() - days * 86_400_000);

  const [bySource, contacted, unread, hot, total] = await Promise.all([
    prisma.enquiry.groupBy({
      by: ["source"],
      where: { dealerId, createdAt: { gte: since } },
      _count: { source: true },
      orderBy: { _count: { source: "desc" } },
    }),
    prisma.enquiry.count({
      where: { dealerId, createdAt: { gte: since }, isContacted: true },
    }),
    prisma.enquiry.count({
      where: { dealerId, createdAt: { gte: since }, isRead: false },
    }),
    prisma.enquiry.count({
      where: { dealerId, createdAt: { gte: since }, priority: { gte: 50 } },
    }),
    prisma.enquiry.count({ where: { dealerId, createdAt: { gte: since } } }),
  ]);

  return {
    bySource: bySource.map((b) => ({ source: b.source, count: b._count.source })),
    contacted,
    unread,
    hot,
    total,
  };
}
