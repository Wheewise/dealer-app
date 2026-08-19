import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateOtp, verifyOtp, __resetOtpStore } from "../../lib/otp";
import { __resetRateLimit } from "../../lib/rate-limit";

/**
 * Fake Redis covering the commands the OTP store uses. Crucially it is a
 * single shared store, which is what makes the "issue on one instance, verify
 * on another" case work at all — the in-process Map cannot.
 */
class FakeRedis {
  strings = new Map<string, string>();
  counters = new Map<string, number>();
  expiries = new Map<string, number>();

  exec(command: (string | number)[]): unknown {
    const [op, key] = command as [string, string];
    switch (op) {
      case "SET":
        this.strings.set(key, String(command[2]));
        return "OK";
      case "GET":
        return this.strings.get(key) ?? null;
      case "INCR": {
        const next = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, next);
        return next;
      }
      case "EXPIRE":
        this.expiries.set(key, Number(command[2]));
        return 1;
      case "DEL":
        this.strings.delete(key);
        this.counters.delete(key);
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
        return new Response(
          JSON.stringify(commands.map((c) => ({ result: this.exec(c) }))),
          { status: 200 },
        );
      }),
    );
  }
}

let redis: FakeRedis;
const PHONE = "9876543210";

beforeEach(() => {
  __resetOtpStore();
  __resetRateLimit();
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

describe("OTP over a shared store", () => {
  it("issues a six-digit code and stores it under the normalised phone", async () => {
    const otp = await generateOtp(PHONE);
    expect(otp).toMatch(/^\d{6}$/);
    expect(redis.strings.has(`otp:${PHONE}`)).toBe(true);
  });

  it("normalises the phone so formatting differences hit the same key", async () => {
    const otp = await generateOtp("+91 98765-43210");
    expect(await verifyOtp(PHONE, otp)).toBe(true);
  });

  it("verifies a correct code and consumes it", async () => {
    const otp = await generateOtp(PHONE);
    expect(await verifyOtp(PHONE, otp)).toBe(true);
    // Single use — replaying the same code fails.
    expect(await verifyOtp(PHONE, otp)).toBe(false);
  });

  it("rejects a wrong code without consuming the real one", async () => {
    const otp = await generateOtp(PHONE);
    expect(await verifyOtp(PHONE, "000000")).toBe(false);
    expect(await verifyOtp(PHONE, otp)).toBe(true);
  });

  it("locks the code after 3 wrong attempts", async () => {
    const otp = await generateOtp(PHONE);
    for (let i = 0; i < 3; i++) {
      expect(await verifyOtp(PHONE, "111111")).toBe(false);
    }
    // Fourth attempt trips the cap and discards the entry, so even the
    // correct code no longer works.
    expect(await verifyOtp(PHONE, otp)).toBe(false);
    expect(redis.strings.has(`otp:${PHONE}`)).toBe(false);
  });

  it("resets the attempt counter when a fresh code is issued", async () => {
    await generateOtp(PHONE);
    await verifyOtp(PHONE, "111111");
    await verifyOtp(PHONE, "222222");

    const fresh = await generateOtp(PHONE);
    expect(redis.counters.get(`otp:attempts:${PHONE}`)).toBeUndefined();
    expect(await verifyOtp(PHONE, fresh)).toBe(true);
  });

  it("rejects an expired code", async () => {
    const otp = await generateOtp(PHONE);
    // Rewrite the stored entry as already expired.
    const key = `otp:${PHONE}`;
    const entry = JSON.parse(redis.strings.get(key)!);
    redis.strings.set(key, JSON.stringify({ ...entry, expiresAt: Date.now() - 1 }));

    expect(await verifyOtp(PHONE, otp)).toBe(false);
    expect(redis.strings.has(key)).toBe(false);
  });

  it("rejects verification for a phone that was never issued a code", async () => {
    expect(await verifyOtp("9000000000", "123456")).toBe(false);
  });

  it("keeps codes independent per phone", async () => {
    const a = await generateOtp("9111111111");
    const b = await generateOtp("9222222222");
    expect(await verifyOtp("9111111111", b)).toBe(false);
    expect(await verifyOtp("9111111111", a)).toBe(true);
  });

  /**
   * The reason this had to move off the in-process Map: on serverless,
   * `generateOtp` and `verifyOtp` routinely run in different instances.
   */
  it("verifies a code issued by a different instance", async () => {
    const otp = await generateOtp(PHONE);
    __resetOtpStore(); // simulate a cold start between issue and verify
    expect(await verifyOtp(PHONE, otp)).toBe(true);
  });
});

describe("OTP when the store is unavailable", () => {
  it("fails verification closed rather than open", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const otp = await generateOtp(PHONE);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    expect(await verifyOtp(PHONE, otp)).toBe(false);
  });

  it("refuses to issue a code it could never verify", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    // Better a visible error than an SMS carrying a dead code.
    await expect(generateOtp(PHONE)).rejects.toThrow(/upstash/i);
  });
});
