"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { signupBuyer, type SignupState } from "@/lib/actions/auth";
import { Field, Input, Select, Button } from "@/components/ui/Field";
import statesData from "@/lib/data/india-states-districts.json";
import { Turnstile } from "@/components/common/Turnstile";

interface StateEntry {
  state: string;
  districts: string[];
}

const STATES: StateEntry[] = (statesData as { states: StateEntry[] }).states;

export function BuyerSignupForm() {
  const [state, formAction, pending] = useActionState<SignupState | undefined, FormData>(
    signupBuyer,
    undefined,
  );
  const errors = state && !state.ok ? state.errors : {};

  const [selectedState, setSelectedState] = useState("");
  const districts = useMemo(
    () => STATES.find((entry) => entry.state === selectedState)?.districts ?? [],
    [selectedState],
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Full name" name="name" errors={errors.name}>
        <Input id="name" name="name" autoComplete="name" required />
      </Field>
      <Field label="Email" name="email" errors={errors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Phone number" name="phone" errors={errors.phone}>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" required />
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
      <Field
        label="Confirm password"
        name="confirmPassword"
        errors={errors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </Field>
      <Field label="State" name="state" errors={errors.state}>
        <Select
          id="state"
          name="state"
          autoComplete="address-level1"
          required
          value={selectedState}
          onChange={(e) => setSelectedState(e.target.value)}
        >
          <option value="" disabled>
            Select state
          </option>
          {STATES.map((entry) => (
            <option key={entry.state} value={entry.state}>
              {entry.state}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="District" name="district" errors={errors.district}>
        <Select
          key={selectedState}
          id="district"
          name="district"
          autoComplete="address-level2"
          required
          disabled={!selectedState}
          defaultValue=""
        >
          <option value="" disabled>
            {selectedState ? "Select district" : "Select state first"}
          </option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </Select>
      </Field>
      {errors.form ? (
        <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
          {errors.form[0]}
        </p>
      ) : null}
      <Turnstile action="signup-buyer" />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
