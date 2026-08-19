"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Button, Field, Input } from "@/components/ui/Field";

export function LoginTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function sendCode() {
    setPending(true);
    setError("");
    const { error: otpError } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setPending(false);
    if (otpError) return setError(otpError.message);
    setSent(true);
  }

  async function verifyCode() {
    setPending(true);
    setError("");
    const { data, error: verifyError } = await supabaseBrowser.auth.verifyOtp({
      email,
      token: code,
      type: "email",
    });
    if (verifyError || !data.session) {
      setPending(false);
      return setError(verifyError?.message ?? "The verification code is invalid or expired.");
    }
    const result = await signIn("credentials", {
      supabaseAccessToken: data.session.access_token,
      redirect: false,
    });
    setPending(false);
    if (result?.error) return setError("This email is not authorised for the dealer portal.");
    router.push(searchParams.get("callbackUrl") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        We will send a one-time sign-in code to your dealership email.
      </p>
      <Field label="Dealership email" name="email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={sent}
          required
        />
      </Field>
      {sent ? (
        <Field label="Email verification code" name="code">
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            required
          />
        </Field>
      ) : null}
      {error ? <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">{error}</p> : null}
      <Button
        type="button"
        className="w-full"
        disabled={pending || !email || (sent && code.length !== 6)}
        onClick={sent ? verifyCode : sendCode}
      >
        {pending ? "Please wait…" : sent ? "Verify and sign in" : "Email me a code"}
      </Button>
      {sent ? (
        <button type="button" className="w-full text-sm text-zinc-500 hover:underline" onClick={() => setSent(false)}>
          Use a different email
        </button>
      ) : null}
    </div>
  );
}
