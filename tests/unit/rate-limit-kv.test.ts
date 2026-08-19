import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, setRateLimitKv } from "../../lib/rate-limit";

type Bucket = { count: number; resetAt: number };

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async <T>(key: string, _type: "json"): Promise<T | null> => {
      const raw = store.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    },
    put: async (
      key: string,
      value: string,
      _opts?: { expirationTtl?: number },
    ): Promise<void> => {
      store.set(key, value);
    },
  };
}

describe("rateLimit — KV backed", () => {
  let kv: ReturnType<typeof fakeKv>;

  beforeEach(() => {
    kv = fakeKv();
    setRateLimitKv(kv);
  });

  it("allows the first request and seeds the bucket", async () => {
    const res = await rateLimit("test:a", 3, 60_000);
    expect(res.ok).toBe(true);
    expect(res.retryAfter).toBe(0);

    const stored = JSON.parse(kv.store.get("test:a")!) as Bucket;
    expect(stored.count).toBe(1);
    expect(stored.resetAt).toBeGreaterThan(Date.now());
  });

  it("increments count within window", async () => {
    await rateLimit("test:b", 3, 60_000);
    await rateLimit("test:b", 3, 60_000);
    const stored = JSON.parse(kv.store.get("test:b")!) as Bucket;
    expect(stored.count).toBe(2);
  });

  it("blocks after limit is hit and returns retryAfter > 0", async () => {
    await rateLimit("test:c", 2, 60_000);
    await rateLimit("test:c", 2, 60_000);
    const res = await rateLimit("test:c", 2, 60_000);
    expect(res.ok).toBe(false);
    expect(res.retryAfter).toBeGreaterThan(0);
  });

  it("resets the bucket after the window expires", async () => {
    // Seed an already-expired bucket directly.
    kv.store.set("test:d", JSON.stringify({ count: 99, resetAt: Date.now() - 1000 }));
    const res = await rateLimit("test:d", 3, 60_000);
    expect(res.ok).toBe(true);
    const stored = JSON.parse(kv.store.get("test:d")!) as Bucket;
    expect(stored.count).toBe(1);
  });

  it("keys are isolated per identifier", async () => {
    await rateLimit("test:e1", 1, 60_000);
    await rateLimit("test:e1", 1, 60_000); // e1 now over
    const e1 = await rateLimit("test:e1", 1, 60_000);
    const e2 = await rateLimit("test:e2", 1, 60_000);
    expect(e1.ok).toBe(false);
    expect(e2.ok).toBe(true);
  });
});
