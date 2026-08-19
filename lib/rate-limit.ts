type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function inMemoryCheck(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= limit) {
    return {
      ok: false,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

interface KvStore {
  get(key: string, type: "json"): Promise<Bucket | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

async function kvCheck(
  kv: KvStore,
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
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
    return {
      ok: false,
      retryAfter: Math.ceil((stored.resetAt - now) / 1000),
    };
  }

  stored.count += 1;
  const ttl = Math.ceil((stored.resetAt - now) / 1000);
  await kv.put(key, JSON.stringify(stored), { expirationTtl: ttl });
  return { ok: true, retryAfter: 0 };
}

let kvBinding: KvStore | undefined;

export function setRateLimitKv(kv: KvStore) {
  kvBinding = kv;
}

let noKvWarned = false;

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<{ ok: boolean; retryAfter: number }> {
  if (kvBinding) {
    return kvCheck(kvBinding, key, limit, windowMs);
  }

  // In production, in-memory buckets are reset on every cold start — rate limiting
  // is NOT effective without a KV store. Warn once per process.
  if (process.env.NODE_ENV === "production" && !noKvWarned) {
    noKvWarned = true;
    console.warn(
      "[rate-limit] No KV store configured. Rate limiting is ineffective on serverless " +
        "runtimes — call setRateLimitKv() with your Cloudflare KV binding on startup.",
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
