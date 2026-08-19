"use client";

import Script from "next/script";
import { useState } from "react";
import { Button } from "@/components/ui/Field";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

export function CheckoutButton({
  plan,
  highlight,
}: {
  plan: "MONTHLY" | "YEARLY";
  highlight?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Checkout failed");
      }
      const { subscriptionId, keyId } = (await res.json()) as {
        subscriptionId: string;
        keyId: string;
      };
      if (!window.Razorpay) {
        throw new Error("Razorpay SDK not loaded");
      }
      const rzp = new window.Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: "Wheewise",
        description: `${plan === "YEARLY" ? "Yearly" : "Monthly"} subscription`,
        handler: () => {
          window.location.href = "/dashboard/billing?activated=1";
        },
        theme: { color: "#DC2626" },
      });
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" />
      <Button
        type="button"
        disabled={busy}
        onClick={start}
        className="mt-6 w-full"
        variant={highlight ? "primary" : "outline"}
      >
        {busy ? "Loading…" : "Subscribe"}
      </Button>
      {error ? <p className="text-brand-red mt-2 text-xs">{error}</p> : null}
    </>
  );
}
