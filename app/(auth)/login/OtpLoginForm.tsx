"use client";

import { useState, useCallback } from "react";
import { signIn, getSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Field";
import { roleRedirectPath, safeCallbackPath } from "@/lib/role-redirect";

export function OtpLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const sendOtp = useCallback(async () => {
    const cleaned = phone.replace(/[^0-9]/g, "");
    if (cleaned.length < 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleaned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send OTP");
        return;
      }
      setStep("otp");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSending(false);
    }
  }, [phone]);

  const verifyOtp = useCallback(async () => {
    if (otp.length !== 6) {
      setError("Enter the 6-digit code");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await signIn("credentials", {
        phone: phone.replace(/[^0-9]/g, ""),
        otp,
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid or expired OTP. Try again.");
      } else {
        const session = await getSession();
        const callbackUrl = safeCallbackPath(searchParams.get("callbackUrl"));
        router.push(callbackUrl ?? roleRedirectPath(session?.user?.role));
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }, [phone, otp, router, searchParams]);

  return (
    <div className="space-y-4">
      {step === "phone" ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="phone" className="block text-sm font-medium">
              Phone number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="9876543210"
              className="focus:border-brand-red focus:ring-brand-red/20 border-border-default block w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors outline-none focus:ring-2"
              required
            />
            <p className="text-xs text-zinc-500">
              We&apos;ll send a 6-digit code via SMS.
            </p>
          </div>
          {error ? (
            <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <Button type="button" onClick={sendOtp} disabled={sending} className="w-full">
            {sending ? "Sending…" : "Send OTP"}
          </Button>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <label htmlFor="otp" className="block text-sm font-medium">
              Enter OTP
            </label>
            <input
              id="otp"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              className="focus:border-brand-red focus:ring-brand-red/20 border-border-default block w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors outline-none focus:ring-2"
              autoFocus
            />
            <p className="text-xs text-zinc-500">
              Sent to {phone}.{" "}
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError("");
                  setOtp("");
                }}
                className="text-brand-red hover:underline"
              >
                Change
              </button>
            </p>
          </div>
          {error ? (
            <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}
          <Button
            type="button"
            onClick={verifyOtp}
            disabled={pending || otp.length !== 6}
            className="w-full"
          >
            {pending ? "Verifying…" : "Sign in"}
          </Button>
          <button
            type="button"
            onClick={() => {
              setStep("phone");
              setError("");
              setOtp("");
            }}
            className="w-full text-center text-sm text-zinc-500 hover:underline"
          >
            ← Back
          </button>
        </>
      )}
    </div>
  );
}
