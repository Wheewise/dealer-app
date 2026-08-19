import { rateLimit } from "./rate-limit";
import { UpstashError, upstashConfigured, upstashPipeline } from "./upstash";

/**
 * Phone OTP issue/verify.
 *
 * Storage precedence: Upstash Redis → Cloudflare KV → in-process Map.
 *
 * The in-process Map is a development convenience only. On a serverless
 * runtime `generateOtp` and `verifyOtp` routinely execute in *different*
 * instances, so a code issued by one is invisible to the other — phone login
 * simply does not work without a shared store. That is a functional failure,
 * not only a security weakness, which is why a configured-but-failing Upstash
 * raises rather than silently degrading to memory.
 */

const OTP_TTL_SECONDS = 5 * 60;
const MAX_ATTEMPTS = 3;

type Entry = { otp: string; expiresAt: number };

const otpStore = new Map<string, { entry: Entry; attempts: number }>();

let kv: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, opts: { expirationTtl: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
} | null = null;

export function setOtpKv(store: typeof kv) {
  kv = store;
}

/** Test-only: drop in-process state and any KV binding. */
export function __resetOtpStore(): void {
  otpStore.clear();
  kv = null;
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

function otpKey(phone: string): string {
  return `otp:${normalizePhone(phone)}`;
}

function attemptsKey(phone: string): string {
  return `otp:attempts:${normalizePhone(phone)}`;
}

/**
 * Length-independent, non-short-circuiting comparison. The practical risk from
 * a leaky compare on a 6-digit code capped at 3 attempts is negligible, but
 * there is no reason to write the leaky version.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function generateOtp(phone: string): Promise<string> {
  // OTP bypass requires BOTH OTP_DEV_BYPASS=1 AND NODE_ENV=development.
  // Never enabled in production / staging / preview. See env.ts boot guard.
  const devBypass =
    process.env.OTP_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";
  const otp = devBypass ? "000000" : generateSecureCode();

  const entry: Entry = { otp, expiresAt: Date.now() + OTP_TTL_SECONDS * 1000 };
  const key = otpKey(phone);

  if (upstashConfigured()) {
    // Issuing a code we cannot later verify is worse than failing here: the
    // user would receive an SMS and then be told it is invalid.
    await upstashPipeline([
      ["SET", key, JSON.stringify(entry), "EX", OTP_TTL_SECONDS],
      ["DEL", attemptsKey(phone)],
    ]);
    return otp;
  }

  if (kv) {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: OTP_TTL_SECONDS });
    return otp;
  }

  otpStore.set(key, { entry, attempts: 0 });
  return otp;
}

/**
 * Six digits from a CSPRNG.
 *
 * `Math.random()` is not a CSPRNG: its output is predictable from prior
 * values, which for a login credential is a real weakness. `crypto` is global
 * in Node 18+, Edge and Workers.
 */
function generateSecureCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Rejection-free reduction: 900000 does not divide 2^32 evenly, so the low
  // codes are very slightly favoured — by ~2e-4 of a percent. Immaterial here.
  return String(100000 + (buf[0] % 900000));
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const normalized = normalizePhone(phone);
  const key = otpKey(phone);

  // Per-phone failure cap that survives regeneration — the attempt counter is
  // reset by each generateOtp, so without this an attacker could request a new
  // code to refresh their guesses.  Caps 10 wrong attempts per phone per hour.
  const limit = await rateLimit(`otp-verify:${normalized}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return false;

  if (upstashConfigured()) {
    return verifyViaUpstash(phone, key, otp);
  }

  let raw: string | null;
  let attempts: number;
  if (kv) {
    raw = await kv.get(key);
    attempts = raw ? (JSON.parse(raw).attempts ?? 0) + 1 : 0;
  } else {
    const held = otpStore.get(key);
    raw = held ? JSON.stringify(held.entry) : null;
    attempts = (held?.attempts ?? 0) + 1;
  }

  if (!raw) return false;
  const entry = JSON.parse(raw) as Entry;

  const discard = async () => {
    if (kv) await kv.delete(key);
    else otpStore.delete(key);
  };

  if (Date.now() > entry.expiresAt || attempts > MAX_ATTEMPTS) {
    await discard();
    return false;
  }

  if (!timingSafeEqual(entry.otp, otp)) {
    if (kv) {
      await kv.put(key, JSON.stringify({ ...entry, attempts }), {
        expirationTtl: OTP_TTL_SECONDS,
      });
    } else {
      otpStore.set(key, { entry, attempts });
    }
    return false;
  }

  await discard();
  return true;
}

/**
 * Attempts are counted with `INCR` rather than by rewriting the stored entry,
 * so parallel guesses cannot each read "attempts: 0" and collectively exceed
 * the cap.
 */
async function verifyViaUpstash(
  phone: string,
  key: string,
  otp: string,
): Promise<boolean> {
  const aKey = attemptsKey(phone);

  let stored: unknown;
  let attempts: number;
  try {
    const [rawEntry, rawAttempts] = await upstashPipeline([
      ["GET", key],
      ["INCR", aKey],
      ["EXPIRE", aKey, OTP_TTL_SECONDS, "NX"],
    ]);
    stored = rawEntry;
    attempts = Number(rawAttempts);
  } catch (err) {
    // Fail closed: an unavailable store must not become a way past the check.
    console.warn(
      `[otp] verification unavailable: ${
        err instanceof UpstashError ? err.message : String(err)
      }`,
    );
    return false;
  }

  if (typeof stored !== "string") return false;

  let entry: Entry;
  try {
    entry = JSON.parse(stored) as Entry;
  } catch {
    return false;
  }

  const discard = () =>
    upstashPipeline([
      ["DEL", key],
      ["DEL", aKey],
    ]).catch(() => {});

  if (Date.now() > entry.expiresAt || attempts > MAX_ATTEMPTS) {
    await discard();
    return false;
  }

  if (!timingSafeEqual(entry.otp, otp)) return false;

  await discard();
  return true;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  // Delegates to the unified SMS provider. In dev (no key configured) the
  // provider logs to console — preserving prior behaviour. In production a
  // missing provider throws so misconfiguration surfaces immediately.
  const { sendSms } = await import("./sms-provider");
  await sendSms(phone, `Your Wheewise verification code is ${otp}. Valid for 5 minutes.`);
}
