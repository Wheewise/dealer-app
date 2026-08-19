"use client";

import { useActionState } from "react";
import { signupDealer, type SignupState } from "@/lib/actions/auth";
import { Field, Input, Button } from "@/components/ui/Field";

export function DealerSignupForm() {
  const [state, formAction, pending] = useActionState<SignupState | undefined, FormData>(
    signupDealer,
    undefined,
  );
  const errors = state && !state.ok ? state.errors : {};

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="name" errors={errors.name}>
          <Input id="name" name="name" autoComplete="name" required />
        </Field>
        <Field label="Business name" name="businessName" errors={errors.businessName}>
          <Input
            id="businessName"
            name="businessName"
            autoComplete="organization"
            required
          />
        </Field>
      </div>
      <Field label="Email" name="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field
        label="Password"
        name="password"
        errors={errors.password}
        hint="At least 8 characters, one uppercase, one lowercase, one digit, and one special character."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" name="city" errors={errors.city}>
          <Input id="city" name="city" autoComplete="address-level2" required />
        </Field>
        <Field label="Phone" name="phone" errors={errors.phone}>
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            required
          />
        </Field>
      </div>
      <Field
        label="WhatsApp number"
        name="whatsapp"
        errors={errors.whatsapp}
        hint="Optional. We'll show this on your storefront for buyers."
      >
        <Input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" />
      </Field>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating dealer account…" : "Start 14-day free trial"}
      </Button>
    </form>
  );
}
