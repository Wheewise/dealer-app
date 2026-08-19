"use client";

import Script from "next/script";
import { useState, useCallback } from "react";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

type CheckoutResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

export function BoostButton({
  listingId,
  isBoosted,
  boostExpiresAt,
}: {
  listingId: string;
  isBoosted: boolean;
  boostExpiresAt: Date | null;
}) {
  const [boosting, setBoosting] = useState(false);
  const [boosted, setBoosted] = useState(isBoosted);
  const [expiresAt, setExpiresAt] = useState(boostExpiresAt);
  const [error, setError] = useState<string | null>(null);

  const handleBoost = useCallback(
    async (duration: string) => {
      setBoosting(true);
      setError(null);
      try {
        const orderRes = await fetch("/api/dealer/boost", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId, duration }),
        });
        if (!orderRes.ok) {
          const body = (await orderRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Could not start boost");
        }
        const { orderId, amount, plan, keyId } = (await orderRes.json()) as {
          orderId: string;
          amount: number;
          plan: string;
          keyId: string;
        };

        if (!window.Razorpay) {
          throw new Error("Razorpay SDK not loaded");
        }

        const payment = await new Promise<CheckoutResponse>((resolve, reject) => {
          const rzp = new window.Razorpay!({
            key: keyId,
            order_id: orderId,
            amount,
            currency: "INR",
            name: "Wheewise",
            description: `Boost — ${plan}`,
            theme: { color: "#DC2626" },
            handler: (resp: CheckoutResponse) => resolve(resp),
            modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
          });
          rzp.open();
        });

        const verifyRes = await fetch("/api/dealer/boost/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payment),
        });
        if (!verifyRes.ok) {
          const body = (await verifyRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Payment verification failed");
        }
        const { expiresAt: newExpiry } = (await verifyRes.json()) as {
          expiresAt: string;
        };
        setBoosted(true);
        setExpiresAt(new Date(newExpiry));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Boost failed");
      } finally {
        setBoosting(false);
      }
    },
    [listingId],
  );

  if (boosted && expiresAt && new Date(expiresAt) > new Date()) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
        <span>⚡</span>
        Featured until {new Date(expiresAt).toLocaleDateString()}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">Boost this listing:</span>
        {(["7", "14", "30"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => handleBoost(d)}
            disabled={boosting}
            className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
          >
            {d}d
          </button>
        ))}
      </div>
      {error ? <p className="text-brand-red text-xs">{error}</p> : null}
    </div>
  );
}
