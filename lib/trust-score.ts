type DealerMetrics = {
  gstVerified: boolean;
  accountCreatedAt: Date;
  soldCount: number;
  listingCount: number;
  avgResponseHours: number | null;
};

export function computeTrustScore(metrics: DealerMetrics): number {
  let score = 0;

  // GST verified: +20
  if (metrics.gstVerified) score += 20;

  // Account age: +5 per 6 months, max 20
  const accountMonths =
    (Date.now() - metrics.accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30);
  score += Math.min(20, Math.floor(accountMonths / 6) * 5);

  // Sales: +10 per 10 sold, max 30
  score += Math.min(30, Math.floor(metrics.soldCount / 10) * 10);

  // Response time: +20 if avg < 1 hour
  if (metrics.avgResponseHours !== null && metrics.avgResponseHours < 1) score += 20;

  return Math.min(100, Math.max(0, score));
}

export function scoreToStars(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Very Good";
  if (score >= 40) return "Good";
  if (score >= 20) return "Fair";
  return "New";
}
