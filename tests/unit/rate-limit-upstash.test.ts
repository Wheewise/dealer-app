import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit, __resetRateLimit } from "../../lib/rate-limit";
import { __resetWarnings } from "../../lib/upstash";

/**
 * A fake Redis that implements just enough of INCR / PEXPIRE / PTTL / DEL to
 * exercise the real pipeline the rate limiter sends.
 *
 * It is deliberately a *shared* store with atomic INCR semantics, because the
 * property under test is precisely the one the previous get-then-put design
 * could not provide.
 */
class FakeRedis {
  values = new Map<string, number>();
  expiries = new Map<string, number>();
  calls: unknown[][] = [];
  now = 1_000_000;

  exec(command: (string | number)[]): unknown {
    this.calls.push(command);
    const [op, key] = command as [string, string];
    switch (op) {
      case "INCR": {
        const next = (this.values.get(key) ?? 0) + 1;
        this.values.set(key, next);
        return next;
      }
      case "PEXPIRE": {
        const ms = Number(command[2]);
        const nx = command[3] === "NX";
        if (nx && this.expiries.has(key)) return 0;
        this.expiries.set(key, this.now + ms);
        return 1;
      }
      case "PTTL": {
        const at = this.expiries.get(key);
        if (at === undefined) return -1;
        return at - this.now;
      }
      case "DEL":
        this.values.delete(key);
        this.expiries.delete(key);
        return 1;
      default:
        throw new Error(`FakeRedis: unsupported ${op}`);
    }
  }

  install() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const commands = JSON.parse(init.body as string) as (string | number)[][];
        const results = commands.map((c) => ({ result: this.exec(c) }));
        return new Response(JSON.stringify(results), { status: 200 });
      }),
    );
  }
}

let redis: FakeRedis;

beforeEach(() => {
  __resetRateLimit();
  __resetWarnings();
  process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  redis = new FakeRedis();
  redis.install();
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("rateLimit — Upstash backend", () => {
  it("issues INCR + PEXPIRE NX + PTTL as a single pipeline", async () => {
    await rateLimit("login:ip:1.2.3.4", 5, 60_000);
    expect(redis.calls).toEqual([
      ["INCR", "rl:login:ip:1.2.3.4"],
      ["PEXPIRE", "rl:login:ip:1.2.3.4", 60_000, "NX"],
      ["PTTL", "rl:login:ip:1.2.3.4"],
    ]);
    // One pipeline, one HTTP call.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("namespaces keys so they cannot collide with OTP entries", async () => {
    await rateLimit("otp-verify:9999999999", 10, 1000);
    expect(redis.values.has("rl:otp-verify:9999999999")).toBe(true);
    expect(redis.values.has("otp:9999999999")).toBe(false);
  });

  it("allows exactly `limit` requests, then denies", async () => {
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await rateLimit("k", 5, 60_000));
    expect(results.map((r) => r.ok)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("reports retryAfter from the key's remaining TTL", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("k", 5, 60_000);
    redis.now += 20_000; // 40s left in the window
    const denied = await rateLimit("k", 5, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBe(40);
  });

  it("never reports retryAfter below 1s while denying", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("k", 5, 60_000);
    redis.now += 59_950; // 50ms left
    const denied = await rateLimit("k", 5, 60_000);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfter).toBe(1);
  });

  it("fixes the window at the first request rather than sliding it", async () => {
    await rateLimit("k", 5, 60_000);
    const firstExpiry = redis.expiries.get("rl:k");
    redis.now += 30_000;
    await rateLimit("k", 5, 60_000);
    // PEXPIRE used NX, so the deadline is unchanged — a steady stream of
    // requests cannot keep pushing the window forward.
    expect(redis.expiries.get("rl:k")).toBe(firstExpiry);
  });

  it("repairs a key that somehow has no expiry", async () => {
    redis.exec(["INCR", "rl:k"]); // seeded without an expiry
    redis.expiries.delete("rl:k");
    const res = await rateLimit("k", 5, 60_000);
    expect(res.ok).toBe(true);
    expect(redis.expiries.get("rl:k")).toBe(redis.now + 60_000);
  });

  /**
   * The regression that motivated the rewrite. Under the old read-then-write
   * design, requests arriving together all read the same count and all wrote
   * count+1, so more than `limit` were admitted.
   */
  it("holds the limit under concurrent requests", async () => {
    const limit = 5;
    const results = await Promise.all(
      Array.from({ length: 25 }, () => rateLimit("burst", limit, 60_000)),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(limit);
    expect(results.filter((r) => !r.ok)).toHaveLength(20);
  });

  it("keeps separate counters per key", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("a", 5, 60_000);
    expect((await rateLimit("a", 5, 60_000)).ok).toBe(false);
    expect((await rateLimit("b", 5, 60_000)).ok).toBe(true);
  });
});

describe("rateLimit — Upstash unavailable", () => {
  it("degrades to in-process buckets and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );

    // Still limiting, just per-instance now.
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit("k", 2, 60_000));
    expect(results.map((r) => r.ok)).toEqual([true, true, false, false]);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/fell back to in-process/i);
  });

  it("does not hang the caller when the store never responds", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );

    vi.useFakeTimers();
    const pending = rateLimit("k", 5, 60_000);
    await vi.advanceTimersByTimeAsync(3_100);
    const res = await pending;
    vi.useRealTimers();

    expect(res.ok).toBe(true); // fell back rather than blocking
  });
});

describe("rateLimit — no store configured", () => {
  it("falls back to in-process buckets", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.unstubAllGlobals();

    const results = [];
    for (let i = 0; i < 3; i++) results.push(await rateLimit("k", 2, 60_000));
    expect(results.map((r) => r.ok)).toEqual([true, true, false]);
  });
});
