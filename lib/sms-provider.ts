/**
 * Unified SMS provider. Branches on which provider is configured:
 *
 *   1. MSG91 (preferred for India) — set MSG91_AUTH_KEY + MSG91_SENDER_ID
 *      and optionally MSG91_TEMPLATE_ID for transactional templates.
 *   2. Twilio (international fallback) — set TWILIO_ACCOUNT_SID,
 *      TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER.
 *   3. None configured → console.log in development; throws in production
 *      so a misconfigured deploy is obvious instead of silently dropping SMS.
 */
export async function sendSms(phone: string, body: string): Promise<void> {
  const normalised = normalisePhone(phone);
  if (!normalised) {
    throw new Error("sendSms: phone number is missing or malformed");
  }

  if (process.env.MSG91_AUTH_KEY) {
    return sendViaMsg91(normalised, body);
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    return sendViaTwilio(normalised, body);
  }

  if (process.env.NODE_ENV === "production") {
    // Fail loud so misconfigured prod deploys surface immediately.
    throw new Error(
      "sendSms: no SMS provider configured (set MSG91_AUTH_KEY or TWILIO_*)",
    );
  }

  console.log(`[sms:console] ${normalised} → ${body}`);
}

function normalisePhone(phone: string): string {
  // Strip non-digits, keep last 10 (Indian mobile), prepend country code if missing.
  const digits = phone.replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

async function sendViaMsg91(phone: string, body: string): Promise<void> {
  const url = "https://control.msg91.com/api/v5/flow/";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authkey: process.env.MSG91_AUTH_KEY!,
    },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      sender: process.env.MSG91_SENDER_ID ?? "WHWISE",
      short_url: "0",
      mobiles: phone,
      var: body,
    }),
  });
  if (!res.ok) {
    throw new Error(`MSG91 send failed: ${res.status} ${await res.text()}`);
  }
}

async function sendViaTwilio(phone: string, body: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!from) {
    throw new Error("sendSms: TWILIO_FROM_NUMBER is required for Twilio");
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams({ To: `+${phone}`, From: from, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
    },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`Twilio send failed: ${res.status} ${await res.text()}`);
  }
}
