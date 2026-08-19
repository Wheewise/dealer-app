import { rateLimit } from "./rate-limit";

const otpStore = new Map<string, { otp: string; expiresAt: number; attempts: number }>();

let kv: {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string, opts: { expirationTtl: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
} | null = null;

export function setOtpKv(store: typeof kv) {
  kv = store;
}

function otpKey(phone: string): string {
  return `otp:${phone.replace(/[^0-9]/g, "").slice(-10)}`;
}

export async function generateOtp(phone: string): Promise<string> {
  // OTP bypass requires BOTH OTP_DEV_BYPASS=1 AND NODE_ENV=development.
  // Never enabled in production / staging / preview. See env.ts boot guard.
  const devBypass =
    process.env.OTP_DEV_BYPASS === "1" && process.env.NODE_ENV === "development";
  const otp = devBypass ? "000000" : String(Math.floor(100000 + Math.random() * 900000));

  const entry = { otp, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 };
  const key = otpKey(phone);

  if (kv) {
    await kv.put(key, JSON.stringify(entry), { expirationTtl: 300 });
  } else {
    otpStore.set(key, entry);
  }

  return otp;
}

export async function verifyOtp(phone: string, otp: string): Promise<boolean> {
  const normalized = phone.replace(/[^0-9]/g, "").slice(-10);
  const key = otpKey(phone);

  // Per-phone failure cap survives across generateOtp calls (the in-memory
  // entry.attempts counter resets every regenerate). Caps 10 wrong attempts
  // per phone per hour.
  const limit = await rateLimit(`otp-verify:${normalized}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return false;

  let raw: string | null;
  if (kv) {
    raw = await kv.get(key);
  } else {
    const entry = otpStore.get(key);
    raw = entry ? JSON.stringify(entry) : null;
  }

  if (!raw) return false;

  const entry = JSON.parse(raw) as { otp: string; expiresAt: number; attempts: number };

  if (Date.now() > entry.expiresAt) {
    if (kv) await kv.delete(key);
    else otpStore.delete(key);
    return false;
  }

  entry.attempts += 1;
  if (entry.attempts > 3) {
    if (kv) await kv.delete(key);
    else otpStore.delete(key);
    return false;
  }

  if (entry.otp !== otp) {
    if (kv) await kv.put(key, JSON.stringify(entry), { expirationTtl: 300 });
    else otpStore.set(key, entry);
    return false;
  }

  if (kv) await kv.delete(key);
  else otpStore.delete(key);
  return true;
}

export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  // Delegates to the unified SMS provider. In dev (no key configured) the
  // provider logs to console — preserving prior behaviour. In production a
  // missing provider throws so misconfiguration surfaces immediately.
  const { sendSms } = await import("./sms-provider");
  await sendSms(phone, `Your Wheewise verification code is ${otp}. Valid for 5 minutes.`);
}
