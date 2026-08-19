import { NextResponse } from "next/server";
import { db, unwrapMaybe } from "@/lib/db";
import { generateOtp, sendOtpSms } from "@/lib/otp";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FIELD,
  verifyTurnstile,
} from "@/lib/turnstile";

function normalizePhone(raw: string): string {
  return raw.replace(/[^0-9]/g, "").slice(-10);
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const ipLimit = await rateLimit(`otp-send:ip:${ip}`, 3, 15 * 60 * 1000);
  if (!ipLimit.ok) {
    return NextResponse.json(
      { error: `Too many OTP requests. Try again in ${ipLimit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfter) } },
    );
  }

  let phone: string;
  let captchaToken: unknown;
  try {
    const body = await req.json();
    phone = body.phone;
    captchaToken = body[TURNSTILE_FIELD];
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Each accepted request sends a paid SMS, so verify before spending.
  const captcha = await verifyTurnstile(captchaToken, {
    remoteIp: ip,
    expectedAction: TURNSTILE_ACTIONS.sendOtp,
  });
  if (!captcha.ok) {
    return NextResponse.json(
      { error: "Verification failed. Please refresh and try again." },
      { status: 403 },
    );
  }

  if (!phone || typeof phone !== "string" || normalizePhone(phone).length < 10) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
  }

  // This endpoint belongs to the dealer app: only an active dealership's
  // registered phone can receive a sign-in code. Do this before generating a
  // code or sending SMS so this endpoint cannot be used as a paid SMS relay.
  const dealer = unwrapMaybe(
    await db
      .from("Dealer")
      .select("id, status, user:User(role)")
      .eq("phone", normalizePhone(phone))
      .maybeSingle(),
    "send-otp: dealer lookup",
  );
  const user = Array.isArray(dealer?.user) ? dealer.user[0] : dealer?.user;
  if (!dealer || dealer.status !== "ACTIVE" || user?.role !== "DEALER") {
    return NextResponse.json(
      { error: "This mobile number is not registered for the dealer portal." },
      { status: 403 },
    );
  }

  // Per-phone cap blocks attackers cycling IPs to harass one number, and caps
  // SMS-spend per phone regardless of how many IPs request it.
  const phoneLimit = await rateLimit(
    `otp-send:phone:${normalizePhone(phone)}`,
    5,
    60 * 60 * 1000,
  );
  if (!phoneLimit.ok) {
    return NextResponse.json(
      {
        error: `Too many OTPs sent to this number. Try again in ${phoneLimit.retryAfter}s.`,
      },
      { status: 429, headers: { "Retry-After": String(phoneLimit.retryAfter) } },
    );
  }

  const otp = await generateOtp(phone);
  await sendOtpSms(phone, otp);

  return NextResponse.json({ ok: true });
}
