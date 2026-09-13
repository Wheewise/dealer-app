"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button, Field, Input, Turnstile } from "@wheewise/ui";
import { signupDealer, type SignupState } from "./actions";

export function DealerSignupForm() {
  const router = useRouter();
  const [turnstileToken, setTurnstileToken] = useState("");
  const [state, formAction, pending] = useActionState<SignupState | undefined, FormData>(
    signupDealer,
    undefined,
  );
  const errors = state && !state.ok ? state.errors : {};

  useEffect(() => {
    if (state?.ok && !state.needsConfirmation) router.push("/dashboard");
  }, [state, router]);

  if (state?.ok && state.needsConfirmation) {
    return (
      <div className="rounded-md border border-border-default bg-surface-muted px-4 py-6 text-center">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-zinc-500">
          We&apos;ve sent a confirmation link — click it to activate your account and sign in.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" errors={errors.name}>
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Business name" name="businessName" errors={errors.businessName}>
          <Input name="businessName" autoComplete="organization" required />
        </Field>
      </div>
      <Field
        label="GST number"
        name="gstNumber"
        errors={errors.gstNumber}
        hint="15-character GSTIN. Verification may be manual during early access."
      >
        <Input name="gstNumber" placeholder="22AAAAA0000A1Z5" maxLength={15} required />
      </Field>
      <Field label="Email" name="email" errors={errors.email}>
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label="Password"
        name="password"
        errors={errors.password}
        hint="At least 8 characters."
      >
        <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" name="city" errors={errors.city}>
          <Input name="city" autoComplete="address-level2" required />
        </Field>
        <Field label="Phone" name="phone" errors={errors.phone}>
          <Input name="phone" type="tel" autoComplete="tel" required />
        </Field>
      </div>
      <input type="hidden" name="turnstileToken" value={turnstileToken} />
      <Turnstile onVerify={setTurnstileToken} />
      {state && !state.ok && state.formError ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !turnstileToken} className="w-full">
        {pending ? "Verifying GST & creating account…" : "Register as dealer"}
      </Button>
    </form>
  );
}
