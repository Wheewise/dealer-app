import { UpstashError, upstashConfigured, upstashPipeline, warnOnce } from "./upstash";

export type RateLimitResult = { ok: boolean; retryAfter: number };

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/**
 * Process-local fallback. Correct within one process, useless across many:
 * every serverless cold start begins with an empty Map, so a caller that
 * lands on fresh instances is never limited. Only ever a development
 * convenience or a last resort when the shared store is unreachable.
 */
function inMemoryCheck(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Upstash Redis — the production backend.
// ---------------------------------------------------------------------------

const PREFIX = "rl:";

/**
 * Atomic counter check.
 *
 * The three commands run as one pipeline, and `INCR` is itself atomic, so N
 * concurrent requests receive N distinct counter values. This is the whole
 * point of moving off the previous get-then-put design: that one read a count,
 * decided, then wrote it back, so two requests arriving together both read the
 * same value and both wrote `count + 1` — letting a caller exceed the limit by
 * however many requests they could land in the read window. For a login
 * throttle, that gap is the attack.
 *
 * `PEXPIRE ... NX` sets the window only on the first hit, so the window is
 * fixed from the first request rather than sliding forward on every one (which
 * would let a steady attacker hold the key alive indefinitely).
 */
async function upstashCheck(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const k = PREFIX + key;
  const [countRaw, , ttlRaw] = await upstashPipeline([
    ["INCR", k],
    ["PEXPIRE", k, windowMs, "NX"],
    ["PTTL", k],
  ]);

  const count = Number(countRaw);
  let ttlMs = Number(ttlRaw);

  // PTTL returns -1 for a key with no expiry and -2 if it vanished between
  // commands. Either way the key would otherwise live forever, so repair it.
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    await upstashPipeline([["PEXPIRE", k, windowMs]]);
    ttlMs = windowMs;
  }

  if (count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil(ttlMs / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Cloudflare KV — legacy backend, kept for the OpenNext/Workers deployment.
// ---------------------------------------------------------------------------

interface KvStore {
  get(key: string, type: "json"): Promise<Bucket | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/**
 * NOTE: this path is a read-modify-write and is therefore *not* atomic —
 * concurrent requests can overshoot the limit. Cloudflare KV offers no atomic
 * counter, so the shape cannot be fixed here; prefer Upstash, which takes
 * precedence whenever it is configured.
 */
async function kvCheck(
  kv: KvStore,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const stored = await kv.get(key, "json");

  if (!stored || stored.resetAt < now) {
    const ttl = Math.ceil(windowMs / 1000);
    await kv.put(key, JSON.stringify({ count: 1, resetAt: now + windowMs }), {
      expirationTtl: ttl,
    });
    return { ok: true, retryAfter: 0 };
  }

  if (stored.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((stored.resetAt - now) / 1000) };
  }

  stored.count += 1;
  const ttl = Math.ceil((stored.resetAt - now) / 1000);
  await kv.put(key, JSON.stringify(stored), { expirationTtl: ttl });
  return { ok: true, retryAfter: 0 };
}

let kvBinding: KvStore | undefined;

/** Wires the Cloudflare KV namespace. Ignored when Upstash is configured. */
export function setRateLimitKv(kv: KvStore) {
  kvBinding = kv;
}

/** Test-only: forget the process-local buckets and any KV binding. */
export function __resetRateLimit(): void {
  buckets.clear();
  kvBinding = undefined;
}

/**
 * Consumes one unit against `key`.
 *
 * Backend precedence: Upstash → Cloudflare KV → in-process.
 *
 * If Upstash is configured but unreachable, this degrades to the in-process
 * bucket rather than failing the request. That is a deliberate trade: a Redis
 * outage should not lock every user out of signing in. It does mean the limit
 * weakens exactly when the store is unhealthy, so the fallback logs once per
 * process — alert on that line.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  if (upstashConfigured()) {
    try {
      return await upstashCheck(key, limit, windowMs);
    } catch (err) {
      warnOnce(
        "rate-limit",
        `Rate limiting fell back to in-process buckets — limits are now per-instance. ${
          err instanceof UpstashError ? err.message : String(err)
        }`,
      );
      return inMemoryCheck(key, limit, windowMs);
    }
  }

  if (kvBinding) {
    return kvCheck(kvBinding, key, limit, windowMs);
  }

  if (process.env.NODE_ENV === "production") {
    warnOnce(
      "rate-limit-unconfigured",
      "No shared store configured. Rate limiting is ineffective on serverless " +
        "runtimes — set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
    );
  }

  return inMemoryCheck(key, limit, windowMs);
}

/**
 * Best-effort client IP extraction for rate-limit keys.
 *
 * Order:
 *   1. CF-Connecting-IP — Cloudflare-injected, cannot be spoofed by client.
 *   2. X-Forwarded-For: rightmost entry — the most-recent proxy that
 *      wrote the header. Earlier entries can be spoofed by the client.
 *   3. "unknown" — never used as a fallback; degrade to per-process bucket.
 */
export function getClientIp(req: Request): string {
  return getClientIpFromHeaders(req.headers);
}

/**
 * Same extraction, for callers that hold a `Headers` rather than a `Request`
 * — server actions read them via `headers()` from `next/headers`.
 */
export function getClientIpFromHeaders(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
}
