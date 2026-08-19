import "./env";

import Razorpay from "razorpay";
import crypto from "crypto";

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

export const razorpay =
  keyId && keySecret ? new Razorpay({ key_id: keyId, key_secret: keySecret }) : null;

export const PLAN_IDS = {
  MONTHLY: process.env.RAZORPAY_PLAN_MONTHLY ?? "",
  YEARLY: process.env.RAZORPAY_PLAN_YEARLY ?? "",
} as const;

export type RazorpayPlanTier = keyof typeof PLAN_IDS;

export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!webhookSecret) return false;
  return constantTimeHmacEqual(webhookSecret, rawBody, signature);
}

/**
 * Verifies a Razorpay payment-success signature returned to the client after checkout.
 * Spec: HMAC-SHA256 of `${orderId}|${paymentId}` using the API key secret.
 */
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  if (!keySecret) return false;
  return constantTimeHmacEqual(keySecret, `${orderId}|${paymentId}`, signature);
}

function constantTimeHmacEqual(
  secret: string,
  message: string,
  signature: string,
): boolean {
  const expected = crypto.createHmac("sha256", secret).update(message).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Server-side source of truth for boost plan pricing.
 * Order-creation builds against this; order-verification rejects any
 * mismatch — so a stale client (or tampered cart) cannot pay yesterday's
 * price for today's plan duration.
 */
export const BOOST_PLANS = {
  "7": { days: 7, amount: 19900, label: "7 days — ₹199" },
  "14": { days: 14, amount: 29900, label: "14 days — ₹299" },
  "30": { days: 30, amount: 49900, label: "30 days — ₹499" },
} as const;

export type BoostDuration = keyof typeof BOOST_PLANS;

export type RazorpayWebhookEvent = {
  /** Razorpay event id — unique per delivery, used for replay protection. */
  id?: string;
  event: string;
  payload: {
    subscription?: {
      entity: {
        id: string;
        status: string;
        current_end?: number;
        notes?: Record<string, string>;
      };
    };
  };
};
