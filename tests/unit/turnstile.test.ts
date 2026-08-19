import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  verifyTurnstile,
  turnstileEnabled,
  TURNSTILE_ACTIONS,
  TURNSTILE_FIELD,
} from "../../lib/turnstile";

function siteverifyReturns(payload: unknown, status = 200) {
  const spy = vi.fn(async () => new Response(JSON.stringify(payload), { status }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Parses the form-encoded body the last siteverify call sent. */
function lastBody(spy: ReturnType<typeof vi.fn>): URLSearchParams {
  const init = spy.mock.calls[0][1] as RequestInit;
  return new URLSearchParams(init.body as string);
}

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
});

afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration", () => {
  it("is enabled only when the secret is set", () => {
    expect(turnstileEnabled()).toBe(true);
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(turnstileEnabled()).toBe(false);
  });

  it("skips verification entirely when unconfigured, so dev is unaffected", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const spy = siteverifyReturns({ success: false });
    await expect(verifyTurnstile(null)).resolves.toEqual({ ok: true, skipped: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstile", () => {
  it("accepts a token Cloudflare confirms", async () => {
    siteverifyReturns({ success: true });
    await expect(verifyTurnstile("tok")).resolves.toEqual({ ok: true });
  });

  it("sends the secret and token, and never the secret anywhere else", async () => {
    const spy = siteverifyReturns({ success: true });
    await verifyTurnstile("tok", { remoteIp: "1.2.3.4" });
    const body = lastBody(spy);
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
    expect(spy.mock.calls[0][0]).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
  });

  it("omits an unknown remote IP rather than sending the literal string", async () => {
    const spy = siteverifyReturns({ success: true });
    await verifyTurnstile("tok", { remoteIp: "unknown" });
    expect(lastBody(spy).has("remoteip")).toBe(false);
  });

  it("sends an idempotency key so a retried token is not double-redeemed", async () => {
    const spy = siteverifyReturns({ success: true });
    await verifyTurnstile("tok");
    expect(lastBody(spy).get("idempotency_key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["a number", 12345],
    ["an object", { token: "x" }],
  ])("rejects a %s token without calling Cloudflare", async (_label, token) => {
    const spy = siteverifyReturns({ success: true });
    const res = await verifyTurnstile(token);
    expect(res.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects an implausibly long token without calling Cloudflare", async () => {
    const spy = siteverifyReturns({ success: true });
    const res = await verifyTurnstile("x".repeat(5000));
    expect(res).toEqual({ ok: false, reason: "malformed_token" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports Cloudflare's rejection codes", async () => {
    siteverifyReturns({ success: false, "error-codes": ["invalid-input-response"] });
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      reason: "rejected:invalid-input-response",
    });
  });

  /**
   * A token minted on a cheap public form must not be replayable against an
   * expensive one — sending an SMS, say.
   */
  it("rejects a token issued for a different form", async () => {
    siteverifyReturns({ success: true, action: TURNSTILE_ACTIONS.lead });
    await expect(
      verifyTurnstile("tok", { expectedAction: TURNSTILE_ACTIONS.sendOtp }),
    ).resolves.toEqual({ ok: false, reason: "action_mismatch" });
  });

  it("accepts a token whose action matches", async () => {
    siteverifyReturns({ success: true, action: TURNSTILE_ACTIONS.sendOtp });
    await expect(
      verifyTurnstile("tok", { expectedAction: TURNSTILE_ACTIONS.sendOtp }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("failure modes — fails closed", () => {
  it("rejects when siteverify returns an HTTP error", async () => {
    siteverifyReturns({}, 500);
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      reason: "siteverify_http_500",
    });
  });

  it("rejects when siteverify is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(verifyTurnstile("tok")).resolves.toEqual({
      ok: false,
      reason: "siteverify_unreachable",
    });
  });

  it("rejects, rather than hanging, when siteverify never responds", async () => {
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
    const pending = verifyTurnstile("tok");
    await vi.advanceTimersByTimeAsync(5_100);
    const res = await pending;
    vi.useRealTimers();

    expect(res).toEqual({ ok: false, reason: "siteverify_timeout" });
  });

  it("rejects a malformed response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json", { status: 200 })),
    );
    const res = await verifyTurnstile("tok");
    expect(res.ok).toBe(false);
  });
});

describe("shared constants", () => {
  it("uses the field name Turnstile itself injects", () => {
    expect(TURNSTILE_FIELD).toBe("cf-turnstile-response");
  });

  it("keeps one action per protected form", () => {
    const values = Object.values(TURNSTILE_ACTIONS);
    expect(new Set(values).size).toBe(values.length);
  });
});
