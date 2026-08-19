/**
 * One-time wiring of Cloudflare Workers bindings into the in-process modules
 * that need them (rate-limit, OTP store). Safe to import in any runtime —
 * if `getCloudflareContext` isn't available (dev/test, Node), it's a no-op.
 *
 * The KV namespaces must be declared in wrangler.jsonc:
 *
 *   "kv_namespaces": [
 *     { "binding": "RATE_LIMIT_KV", "id": "<id>" },
 *     { "binding": "OTP_KV",        "id": "<id>" }
 *   ]
 *
 * Call `initCloudflareBindings()` once at startup (from instrumentation.ts).
 */
import { setRateLimitKv } from "./rate-limit";
import { setOtpKv } from "./otp";

let wired = false;

// Structural KV type — avoids depending on @cloudflare/workers-types globals.
// Only the subset we actually call is typed.
interface KvLike {
  get(key: string, options?: { type: "text" | "json" }): Promise<string | unknown | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

declare global {
  interface CloudflareEnv {
    RATE_LIMIT_KV?: KvLike;
    OTP_KV?: KvLike;
  }
}

export async function initCloudflareBindings(): Promise<void> {
  if (wired) return;

  let env: CloudflareEnv | undefined;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    env = ctx.env;
  } catch {
    // Not running under the Cloudflare runtime (dev / unit tests).
    wired = true;
    return;
  }

  if (env?.RATE_LIMIT_KV) {
    setRateLimitKv(adaptKv(env.RATE_LIMIT_KV));
  }
  if (env?.OTP_KV) {
    setOtpKv(adaptOtpKv(env.OTP_KV));
  }
  wired = true;
}

// rate-limit's KvStore interface expects { get(key, "json"), put(key, value, opts) }.
function adaptKv(kv: KvLike) {
  return {
    get: async <T>(key: string, _type: "json"): Promise<T | null> => {
      const v = await kv.get(key, { type: "json" });
      return (v as T) ?? null;
    },
    put: (key: string, value: string, options?: { expirationTtl?: number }) =>
      kv.put(key, value, options),
  };
}

// otp's expected interface is slightly different (string get, delete supported).
function adaptOtpKv(kv: KvLike) {
  return {
    get: async (key: string): Promise<string | null> => {
      const v = await kv.get(key, { type: "text" });
      return (v as string) ?? null;
    },
    put: (key: string, value: string, opts: { expirationTtl: number }) =>
      kv.put(key, value, opts),
    delete: (key: string) => kv.delete(key),
  };
}
