"use client";

import { useActionState, useState, useCallback } from "react";
import { Field, Input, Button } from "@/components/ui/Field";
import { PhotoUploader } from "./PhotoUploader";
import { Photo360Uploader } from "./Photo360Uploader";
import { RtoLookup } from "./RtoLookup";
import {
  FUEL_TYPES,
  TRANSMISSIONS,
  VEHICLE_TYPES,
  VEHICLE_CONDITIONS,
} from "@/lib/validators/listing";
import type { ListingActionState } from "@/lib/actions/listings";

type Defaults = {
  vehicleType?: string;
  make?: string;
  model?: string;
  year?: number;
  fuelType?: string;
  transmission?: string | null;
  odometerKm?: number;
  askingPrice?: number;
  condition?: string | null;
  testDriveAvailable?: boolean;
  description?: string;
  city?: string;
  photoUrls?: string[];
};

export function ListingForm({
  action,
  defaults = {},
  submitLabel = "Save listing",
  lockIdentity = false,
}: {
  action: (state: ListingActionState, formData: FormData) => Promise<ListingActionState>;
  defaults?: Defaults;
  submitLabel?: string;
  /** Edit mode: make/model/year were confirmed once from the RTO at creation
   * time and can't be retyped here — re-typing them would let a listing
   * quietly become a different vehicle while keeping its accumulated
   * views/enquiries. Creation flows leave this false so they stay editable. */
  lockIdentity?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ListingActionState, FormData>(
    action,
    undefined,
  );

  const [make, setMake] = useState(defaults.make ?? "");
  const [model, setModel] = useState(defaults.model ?? "");
  const [year, setYear] = useState(defaults.year?.toString() ?? "");
  const [fuelType, setFuelType] = useState(defaults.fuelType ?? "PETROL");
  const [description, setDescription] = useState(defaults.description ?? "");
  const [aiGenerating, setAiGenerating] = useState(false);

  const handleRtoFetched = useCallback(
    (data: { make: string; model: string; year: number; fuelType: string }) => {
      setMake(data.make);
      setModel(data.model);
      setYear(String(data.year));
      setFuelType(data.fuelType);
    },
    [],
  );

  const handleGenerateAi = useCallback(async () => {
    setAiGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType:
            (document.getElementById("vehicleType") as HTMLSelectElement)?.value ?? "CAR",
          make,
          model,
          year: Number(year),
          fuelType,
          transmission:
            (document.getElementById("transmission") as HTMLSelectElement)?.value ?? null,
          odometerKm: Number(
            (document.getElementById("odometerKm") as HTMLInputElement)?.value ?? 0,
          ),
          askingPrice: Number(
            (document.getElementById("askingPrice") as HTMLInputElement)?.value ?? 0,
          ),
          city: (document.getElementById("city") as HTMLInputElement)?.value ?? "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDescription(data.description);
      }
    } catch {
      // silently fail, keep mock descriptions
    } finally {
      setAiGenerating(false);
    }
  }, [make, model, year, fuelType]);

  const errors = state && "ok" in state && state.ok === false ? state.errors : {};

  const select =
    "block w-full rounded-md border border-border-default bg-background px-3 py-2 text-sm shadow-xs outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/20";

  return (
    <form action={formAction} className="space-y-6">
      {lockIdentity ? (
        <>
          <input type="hidden" name="make" value={make} />
          <input type="hidden" name="model" value={model} />
          <input type="hidden" name="year" value={year} />

          <div>
            <div className="text-xs font-medium tracking-wide text-zinc-500 uppercase">
              Vehicle
            </div>
            <div className="border-border-default bg-surface-muted mt-1 grid grid-cols-3 gap-3 rounded-md border p-3 text-sm">
              <div>
                <div className="text-xs text-zinc-500">Make</div>
                <div className="font-medium">{make}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Model</div>
                <div className="font-medium">{model}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Year</div>
                <div className="font-medium">{year}</div>
              </div>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Confirmed from the RC when this listing was created — can&apos;t be changed here.
            </p>
          </div>
        </>
      ) : (
        <>
          <RtoLookup onFetched={handleRtoFetched} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Make" name="make" errors={errors.make}>
              <Input
                id="make"
                name="make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                required
              />
            </Field>
            <Field label="Model" name="model" errors={errors.model}>
              <Input
                id="model"
                name="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
            </Field>
            <Field label="Year" name="year" errors={errors.year}>
              <Input
                id="year"
                name="year"
                type="number"
                min={1980}
                max={new Date().getFullYear() + 1}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
              />
            </Field>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle type" name="vehicleType" errors={errors.vehicleType}>
          <select
            id="vehicleType"
            name="vehicleType"
            defaultValue={defaults.vehicleType ?? "CAR"}
            className={select}
          >
            {VEHICLE_TYPES.map((v) => (
              <option key={v} value={v}>
                {v[0] + v.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="City" name="city" errors={errors.city}>
          <Input id="city" name="city" defaultValue={defaults.city} required />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Fuel type" name="fuelType" errors={errors.fuelType}>
          <select
            id="fuelType"
            name="fuelType"
            value={fuelType}
            onChange={(e) => setFuelType(e.target.value)}
            className={select}
          >
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>
                {f[0] + f.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transmission" name="transmission" errors={errors.transmission}>
          <select
            id="transmission"
            name="transmission"
            defaultValue={defaults.transmission ?? ""}
            className={select}
          >
            <option value="">—</option>
            {TRANSMISSIONS.map((t) => (
              <option key={t} value={t}>
                {t[0] + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Odometer (km)" name="odometerKm" errors={errors.odometerKm}>
          <Input
            id="odometerKm"
            name="odometerKm"
            type="number"
            min={0}
            defaultValue={defaults.odometerKm}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Asking price (₹)" name="askingPrice" errors={errors.askingPrice}>
          <Input
            id="askingPrice"
            name="askingPrice"
            type="number"
            min={1000}
            defaultValue={defaults.askingPrice}
            required
          />
        </Field>
        <Field label="Condition" name="condition" errors={errors.condition}>
          <select
            id="condition"
            name="condition"
            defaultValue={defaults.condition ?? "B"}
            className={select}
          >
            {VEHICLE_CONDITIONS.map((c) => (
              <option key={c} value={c}>
                Grade {c}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end pb-2.5">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="testDriveAvailable"
              value="true"
              defaultChecked={defaults.testDriveAvailable ?? false}
              className="border-border-default h-4 w-4 rounded"
            />
            Test drive available
          </label>
        </div>
      </div>

      <Field label="Description" name="description" errors={errors.description}>
        <div className="space-y-2">
          <textarea
            id="description"
            name="description"
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={select}
            required
          />
          <button
            type="button"
            onClick={handleGenerateAi}
            disabled={aiGenerating || !make || !model}
            className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            {aiGenerating ? "Generating…" : "Generate with AI"}
          </button>
        </div>
      </Field>

      <div>
        <label className="block text-sm font-medium">Photos</label>
        <p className="mb-2 text-xs text-zinc-500">
          {errors.photoUrls?.[0] ?? "At least one photo required."}
        </p>
        <PhotoUploader initialPhotos={defaults.photoUrls ?? []} />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">360° Spin Photos (optional)</p>
        <p className="mb-2 text-xs text-zinc-500">
          Upload 24 evenly-spaced photos for a 360° interactive view.
        </p>
        <Photo360Uploader />
      </div>

      {state && "ok" in state && state.ok === false && state.formError ? (
        <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
          {state.formError}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
