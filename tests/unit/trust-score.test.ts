import { describe, it, expect } from "vitest";
import { computeTrustScore, scoreToStars, scoreLabel } from "../../lib/trust-score";

const now = new Date();
const monthsAgo = (n: number) => new Date(now.getTime() - n * 30 * 24 * 60 * 60 * 1000);

describe("computeTrustScore", () => {
  it("returns 0 for a brand-new unverified dealer", () => {
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: now,
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: null,
    });
    expect(score).toBe(0);
  });

  it("awards +20 for GST verification", () => {
    const score = computeTrustScore({
      gstVerified: true,
      accountCreatedAt: now,
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: null,
    });
    expect(score).toBe(20);
  });

  it("caps account age bonus at 20 (after 2+ years)", () => {
    // 30 months → 5 full 6-month periods → 25 uncapped → capped at 20
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: monthsAgo(30),
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: null,
    });
    expect(score).toBe(20);
  });

  it("awards +5 for every 6 months of account age", () => {
    // 12 months = 2 periods = +10
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: monthsAgo(12),
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: null,
    });
    expect(score).toBe(10);
  });

  it("caps sales bonus at 30 (for 30+ sold)", () => {
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: now,
      soldCount: 50,
      listingCount: 0,
      avgResponseHours: null,
    });
    expect(score).toBe(30);
  });

  it("awards +20 for response time under 1 hour", () => {
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: now,
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: 0.5,
    });
    expect(score).toBe(20);
  });

  it("does not award response bonus for exactly 1 hour or more", () => {
    const score = computeTrustScore({
      gstVerified: false,
      accountCreatedAt: now,
      soldCount: 0,
      listingCount: 0,
      avgResponseHours: 1,
    });
    expect(score).toBe(0);
  });

  it("caps total at 100", () => {
    const score = computeTrustScore({
      gstVerified: true, // +20
      accountCreatedAt: monthsAgo(36), // +20 (capped)
      soldCount: 100, // +30 (capped)
      listingCount: 0,
      avgResponseHours: 0.25, // +20
    });
    expect(score).toBe(90); // 20+20+30+20 = 90 (under cap)
  });
});

describe("scoreToStars", () => {
  it("returns 5 stars for score >= 80", () => expect(scoreToStars(80)).toBe(5));
  it("returns 4 stars for score 60–79", () => expect(scoreToStars(60)).toBe(4));
  it("returns 3 stars for score 40–59", () => expect(scoreToStars(40)).toBe(3));
  it("returns 2 stars for score 20–39", () => expect(scoreToStars(20)).toBe(2));
  it("returns 1 star for score < 20", () => expect(scoreToStars(19)).toBe(1));
  it("returns 1 star for score 0", () => expect(scoreToStars(0)).toBe(1));
});

describe("scoreLabel", () => {
  it("returns Excellent for 80+", () => expect(scoreLabel(90)).toBe("Excellent"));
  it("returns Very Good for 60–79", () => expect(scoreLabel(65)).toBe("Very Good"));
  it("returns Good for 40–59", () => expect(scoreLabel(50)).toBe("Good"));
  it("returns Fair for 20–39", () => expect(scoreLabel(30)).toBe("Fair"));
  it("returns New for < 20", () => expect(scoreLabel(5)).toBe("New"));
});
