"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button, OtpInput, PhoneIcon } from "@wheewise/ui";
import { sendPhoneVerification, verifyPhoneVerification } from "./phone-actions";

/**
 * Links + verifies the dealer's phone with Supabase itself — required
 * before mobile OTP login can work at all: signInWithOtp({ phone }) looks
 * up an existing user by auth.users.phone, which is never set just from
 * signing up with email/password. This is a one-time step, not shown
 * again once phone_confirmed_at is set (see the `!phoneVerified` check on
 * the dashboard page).
 */
export function PhoneVerification({ phone }: { phone: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"prompt" | "otp" | "done">("prompt");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const send = useCallback(async () => {
    setPending(true);
    setError("");
    const result = await sendPhoneVerification(phone);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setStep("otp");
  }, [phone]);

  const verify = useCallback(
    async (code: string) => {
      setPending(true);
      setError("");
      const result = await verifyPhoneVerification(phone, code);
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setStep("done");
      router.refresh();
    },
    [phone, router],
  );

  if (step === "done") return null;

  return (
    <div className="mb-6 rounded-lg border border-border-default bg-surface-muted p-4">
      <div className="flex items-center gap-2">
        <PhoneIcon className="h-4 w-4 text-zinc-500" />
        <p className="text-sm font-medium">Verify your phone for mobile sign-in codes</p>
      </div>
      {step === "prompt" ? (
        <>
          <p className="mt-1 text-xs text-zinc-500">
            One-time setup so you can use Mobile as a sign-in verification method.
          </p>
          <Button onClick={send} disabled={pending} variant="outline" className="mt-3">
            {pending ? "Sending…" : `Send code to ${phone}`}
          </Button>
        </>
      ) : (
        <div className="mt-3">
          <OtpInput disabled={pending} onComplete={verify} />
          {pending ? <p className="mt-2 text-center text-xs text-zinc-500">Verifying…</p> : null}
        </div>
      )}
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
