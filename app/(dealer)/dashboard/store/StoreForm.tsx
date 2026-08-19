"use client";

import { useActionState, useState, useCallback } from "react";
import { Field, Input, Button } from "@/components/ui/Field";
import { updateStore, type StoreActionState } from "@/lib/actions/store";
import { SingleImageUploader } from "@/components/listings/SingleImageUploader";

type Defaults = {
  slug: string;
  bio: string;
  primaryColor: string;
  logoUrl: string;
  bannerUrl: string;
  gstin?: string | null;
  gstVerified?: boolean;
};

export function StoreForm({ defaults }: { defaults: Defaults }) {
  const [state, formAction, pending] = useActionState<StoreActionState, FormData>(
    updateStore,
    undefined,
  );
  const errors = state && "ok" in state && state.ok === false ? state.errors : {};
  const [color, setColor] = useState(defaults.primaryColor);
  const [gstin, setGstin] = useState(defaults.gstin ?? "");
  const [gstVerified, setGstVerified] = useState(defaults.gstVerified ?? false);
  const [gstVerifying, setGstVerifying] = useState(false);

  const verifyGst = useCallback(async () => {
    if (!gstin.trim()) return;
    setGstVerifying(true);
    try {
      const res = await fetch("/api/gst/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: gstin.trim() }),
      });
      if (res.ok) setGstVerified(true);
    } catch {
      // keep unverified
    } finally {
      setGstVerifying(false);
    }
  }, [gstin]);

  return (
    <form action={formAction} className="space-y-6">
      <Field
        label="Showroom URL"
        name="slug"
        errors={errors.slug}
        hint={
          <>
            Your shareable link: <span className="font-mono">/s/{defaults.slug}</span>
          </>
        }
      >
        <Input
          id="slug"
          name="slug"
          defaultValue={defaults.slug}
          required
          autoComplete="off"
        />
      </Field>

      <Field label="Bio" name="bio" errors={errors.bio}>
        <textarea
          id="bio"
          name="bio"
          rows={4}
          defaultValue={defaults.bio}
          maxLength={500}
          className="border-border-default bg-background focus:border-brand-red focus:ring-brand-red/20 block w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus:ring-2"
          placeholder="Tell buyers what makes your showroom different."
        />
      </Field>

      <Field
        label="GSTIN"
        name="gstin"
        errors={errors.gstin}
        hint={
          gstVerified
            ? "✓ GST verified"
            : "Enter your GSTIN to get a verified badge on your storefront."
        }
      >
        <div className="flex gap-2">
          <Input
            id="gstin"
            name="gstin"
            value={gstin}
            onChange={(e) => {
              setGstin(e.target.value);
              setGstVerified(false);
            }}
            placeholder="22AAAAA0000A1Z5"
            className="font-mono"
          />
          <button
            type="button"
            onClick={verifyGst}
            disabled={gstVerifying || gstin.trim().length < 15 || gstVerified}
            className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {gstVerified ? "✓" : gstVerifying ? "…" : "Verify"}
          </button>
        </div>
      </Field>

      <Field
        label="Primary color"
        name="primaryColor"
        errors={errors.primaryColor}
        hint="Used for accents on your storefront."
      >
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="border-border-default h-10 w-14 cursor-pointer rounded border"
          />
          <Input
            id="primaryColor"
            name="primaryColor"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="font-mono"
            required
          />
        </div>
      </Field>

      <div>
        <label className="block text-sm font-medium">Logo</label>
        <p className="mb-2 text-xs text-zinc-500">Square image works best.</p>
        <SingleImageUploader name="logoUrl" initialUrl={defaults.logoUrl} />
      </div>

      <div>
        <label className="block text-sm font-medium">Banner</label>
        <p className="mb-2 text-xs text-zinc-500">
          Wide image for the top of your storefront.
        </p>
        <SingleImageUploader
          name="bannerUrl"
          initialUrl={defaults.bannerUrl}
          aspectClass="aspect-[3/1]"
        />
      </div>

      {state && "ok" in state && state.ok === false && state.formError ? (
        <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
          {state.formError}
        </p>
      ) : null}
      {state && "ok" in state && state.ok === true ? (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Saved. Live at /s/{state.slug}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
