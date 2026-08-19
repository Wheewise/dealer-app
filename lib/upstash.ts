/**
 * Minimal Upstash Redis client over the REST API.
 *
 * Why REST and not a Redis driver: the app runs on Vercel serverless and, via
 * OpenNext, on Cloudflare Workers. Neither can hold a TCP connection across
 * invocations, and the Workers runtime has no raw sockets at all. The REST
 * endpoint is plain `fetch`, which works unchanged in Node, Edge and Workers —
 * and needs no dependency.
 *
 * Configured entirely by environment, so nothing has to be wired at startup:
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

type Command = (string | number)[];

export type UpstashResult<T = unknown> = { result: T } | { error: string };

export function upstashConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/** Milliseconds before an Upstash call is abandoned. */
const TIMEOUT_MS = 3_000;

export class UpstashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstashError";
  }
}

/**
 * Runs commands as a single pipeline (one HTTP round trip) and returns their
 * results in order.
 *
 * Pipelining matters for correctness here, not just latency: a rate-limit
 * check is INCR + PEXPIRE + PTTL, and issuing those as three separate requests
 * would reintroduce the interleaving the atomic path exists to remove.
 */
export async function upstashPipeline(commands: Command[]): Promise<unknown[]> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new UpstashError("Upstash is not configured");
  }

  // A hung store must not hang the request it is protecting.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/+$/, "")}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new UpstashError(
      err instanceof Error && err.name === "AbortError"
        ? `Upstash timed out after ${TIMEOUT_MS}ms`
        : `Upstash request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Deliberately does not include the response body: an auth failure echoes
    // back request details, and this string reaches the logs.
    throw new UpstashError(`Upstash responded ${res.status}`);
  }

  const body = (await res.json()) as UpstashResult[];
  if (!Array.isArray(body)) {
    throw new UpstashError("Upstash returned an unexpected payload");
  }

  return body.map((entry, i) => {
    if (entry && typeof entry === "object" && "error" in entry) {
      throw new UpstashError(`Upstash command ${i} failed: ${entry.error}`);
    }
    return (entry as { result: unknown }).result;
  });
}

/** Single command convenience wrapper. */
export async function upstashCommand<T = unknown>(command: Command): Promise<T> {
  const [result] = await upstashPipeline([command]);
  return result as T;
}

/**
 * Warns at most once per process per subject. Upstash being down would
 * otherwise emit a line on every request.
 */
const warned = new Set<string>();

export function warnOnce(subject: string, message: string): void {
  if (warned.has(subject)) return;
  warned.add(subject);
  console.warn(`[upstash] ${message}`);
}

/** Test-only: clears the warn-once memo. */
export function __resetWarnings(): void {
  warned.clear();
}
