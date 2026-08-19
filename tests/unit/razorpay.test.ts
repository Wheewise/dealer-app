import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const SECRET = "test-webhook-secret-1234567890abcdef";

function hmac(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function freshImport() {
  // Force a re-evaluation of lib/razorpay so it picks up the current env vars
  await import("../../lib/env");
  const mod = await import("../../lib/razorpay");
  return mod;
}

describe("verifyWebhookSignature", () => {
  const originalSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  beforeEach(() => {
    // Module captures webhookSecret on import — clear the cache
    process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
    } else {
      process.env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
    }
  });

  it("accepts a correctly-signed payload", async () => {
    const { verifyWebhookSignature } = await freshImport();
    const body = JSON.stringify({ event: "subscription.charged" });
    expect(verifyWebhookSignature(body, hmac(body, SECRET))).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const { verifyWebhookSignature } = await freshImport();
    const body = JSON.stringify({ event: "subscription.charged" });
    const sig = hmac(body, SECRET);
    const tampered = JSON.stringify({ event: "subscription.cancelled" });
    expect(verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it("rejects an empty signature", async () => {
    const { verifyWebhookSignature } = await freshImport();
    expect(verifyWebhookSignature("{}", "")).toBe(false);
  });

  it("rejects a signature of the wrong length (timingSafeEqual guard)", async () => {
    const { verifyWebhookSignature } = await freshImport();
    expect(verifyWebhookSignature("{}", "short")).toBe(false);
  });

  it("re-export from lib/payments points at the safe verifier (not the old mock)", async () => {
    await freshImport();
    const payments = await import("../../lib/payments");
    const razorpay = await import("../../lib/razorpay");
    expect(payments.verifyWebhookSignature).toBe(razorpay.verifyWebhookSignature);
  });
});
