import { NextResponse } from "next/server";
import { generateOtp, sendOtpSms } from "@/lib/otp";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

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
  try {
    const body = await req.json();
    phone = body.phone;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!phone || typeof phone !== "string" || normalizePhone(phone).length < 10) {
    return NextResponse.json({ error: "Valid phone number required" }, { status: 400 });
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
