"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Field, Input, Turnstile, OtpInput, MailIcon, PhoneIcon } from "@wheewise/ui";
import { checkPassword, sendLoginOtp, verifyLoginOtp, type OtpChannel } from "./actions";
import { safeRedirect } from "../../lib/safeRedirect";

type Step = "password" | "choose-method" | "otp";

const RESEND_COOLDOWN_SECONDS = 60;

/** Supabase's phone OTP needs E.164 (+countrycode…) — numbers are stored
 * as plain 10-digit locally, so this fills in +91 if it's missing. */
function toE164(phone: string): string {
  return phone.startsWith("+") ? phone : `+91${phone.replace(/\D/g, "")}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return phone;
  return `••••••${digits.slice(-4)}`;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState<string | null>(null);
  const [channel, setChannel] = useState<OtpChannel>("email");
  const [passwordToken, setPasswordToken] = useState("");
  const [otpSendToken, setOtpSendToken] = useState("");
  const [resendToken, setResendToken] = useState("");
  const [otpKey, setOtpKey] = useState(0);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (step !== "otp" || cooldown === 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [step, cooldown]);

  const submitPassword = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setPending(true);
      setError("");
      const result = await checkPassword(email, password, passwordToken);
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPhone(result.phone);
      setStep("choose-method");
    },
    [email, password, passwordToken],
  );

  const send = useCallback(
    async (selected: OtpChannel, token: string) => {
      const contact = selected === "email" ? email : toE164(phone!);
      return sendLoginOtp(contact, selected, token);
    },
    [email, phone],
  );

  const chooseMethod = useCallback(
    async (selected: OtpChannel) => {
      setPending(true);
      setError("");
      const result = await send(selected, otpSendToken);
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChannel(selected);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStep("otp");
    },
    [send, otpSendToken],
  );

  const resend = useCallback(async () => {
    setPending(true);
    setError("");
    const result = await send(channel, resendToken);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setResendToken("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setOtpKey((k) => k + 1); // remounts OtpInput so it clears
  }, [send, channel, resendToken]);

  const submitOtp = useCallback(
    async (code: string) => {
      setPending(true);
      setError("");
      const contact = channel === "email" ? email : toE164(phone!);
      const result = await verifyLoginOtp(contact, channel, code);
      setPending(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(safeRedirect(searchParams.get("callbackUrl"), "/dashboard"));
      router.refresh();
    },
    [email, phone, channel, router, searchParams],
  );

  const startOver = useCallback(() => {
    setStep("password");
    setPassword("");
    setPasswordToken("");
    setOtpSendToken("");
    setResendToken("");
    setError("");
  }, []);

  if (step === "password") {
    return (
      <form onSubmit={submitPassword} className="space-y-4">
        <Field label="Email" name="email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Password" name="password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>
        <Turnstile onVerify={setPasswordToken} />
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending || !passwordToken} className="w-full">
          {pending ? "Checking…" : "Continue"}
        </Button>
      </form>
    );
  }

  if (step === "choose-method") {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-zinc-500">
          For your security, verify it&apos;s you with a one-time code.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => chooseMethod("email")}
            disabled={pending || !otpSendToken}
            className="flex w-full items-center justify-between rounded-md border border-brand bg-brand/5 px-4 py-3 text-left text-sm font-medium disabled:opacity-50"
          >
            <span>
              Email
              <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                Recommended
              </span>
            </span>
            <span className="text-xs text-zinc-500">
              {pending && channel === "email" ? "Sending…" : "Send code"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => chooseMethod("sms")}
            disabled={pending || !otpSendToken || !phone}
            title={phone ? undefined : "No phone number on file"}
            className="flex w-full items-center justify-between rounded-md border border-border-default px-4 py-3 text-left text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Mobile{phone ? ` (${maskPhone(phone)})` : ""}</span>
            <span className="text-xs text-zinc-500">
              {pending && channel === "sms" ? "Sending…" : "Send code"}
            </span>
          </button>
        </div>
        <Turnstile onVerify={setOtpSendToken} />
        {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      </div>
    );
  }

  const destination = channel === "email" ? email : maskPhone(phone ?? "");

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-center text-sm text-zinc-500">We sent a sign-in code to</p>
        <div className="flex items-center justify-center gap-2 rounded-lg border border-border-default bg-surface-muted px-4 py-2.5">
          {channel === "email" ? (
            <MailIcon className="h-4 w-4 text-zinc-500" />
          ) : (
            <PhoneIcon className="h-4 w-4 text-zinc-500" />
          )}
          <span className="text-sm font-medium">{destination}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 text-center text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          Sign-in code
        </p>
        <OtpInput key={otpKey} disabled={pending} onComplete={submitOtp} />
      </div>

      {pending ? <p className="text-center text-xs text-zinc-500">Verifying…</p> : null}
      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}

      <div className="space-y-2 text-center text-sm">
        {cooldown > 0 ? (
          <p className="text-zinc-500">
            Resend code in 00:{cooldown.toString().padStart(2, "0")}
          </p>
        ) : (
          <div className="space-y-2">
            {!resendToken ? <Turnstile onVerify={setResendToken} /> : null}
            <button
              type="button"
              onClick={resend}
              disabled={pending || !resendToken}
              className="font-medium text-brand hover:underline disabled:opacity-50"
            >
              Resend code
            </button>
          </div>
        )}
        <div>
          <button type="button" onClick={startOver} className="text-zinc-500 hover:underline">
            Wrong account? Start over
          </button>
        </div>
      </div>
    </div>
  );
}
