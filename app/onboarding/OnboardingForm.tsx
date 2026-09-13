"use client";

import { useActionState, useState } from "react";
import { Field, Input, Button } from "@wheewise/ui";
import { SingleImageUploader } from "./SingleImageUploader";
import { completeOnboarding, type OnboardingState } from "./actions";

export function OnboardingForm({ defaultBusinessName }: { defaultBusinessName: string }) {
  const [state, formAction, pending] = useActionState<OnboardingState | undefined, FormData>(
    completeOnboarding,
    undefined,
  );
  const errors = state && !state.ok ? state.errors : {};
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="logoUrl" value={logoUrl} />
      <input type="hidden" name="coverPhotoUrl" value={coverUrl} />

      <SingleImageUploader label="Cover photo" shape="wide" onChange={setCoverUrl} />
      <SingleImageUploader label="Shop logo" shape="circle" onChange={setLogoUrl} />
      {!logoUrl ? <p className="text-xs text-danger -mt-4">A logo is required.</p> : null}

      <Field label="Shop name" name="businessName" errors={errors.businessName}>
        <Input name="businessName" defaultValue={defaultBusinessName} required />
      </Field>

      <Field
        label="Bio"
        name="bio"
        errors={errors.bio}
        hint="A short line about your dealership — years in business, specialty, what makes you trustworthy."
      >
        <textarea
          name="bio"
          rows={3}
          maxLength={500}
          required
          className="block w-full rounded-md border border-border-default px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </Field>

      <Field label="Address" name="address" errors={errors.address}>
        <textarea
          name="address"
          rows={2}
          required
          className="block w-full rounded-md border border-border-default px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
      </Field>

      <Field
        label="Google Maps link"
        name="mapLink"
        errors={errors.mapLink}
        hint="Optional — share your location, search it on Google Maps, tap Share, and paste the link."
      >
        <Input name="mapLink" type="url" placeholder="https://maps.google.com/…" />
      </Field>

      {state && !state.ok && state.formError ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.formError}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || !logoUrl} className="w-full">
        {pending ? "Saving…" : "Finish setting up your shop"}
      </Button>
    </form>
  );
}
