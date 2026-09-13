"use client";

import { useActionState, useState, useCallback } from "react";
import { Field, Input, Select, Button } from "@wheewise/ui";
import { RtoLookup } from "./RtoLookup";
import { PhotoUploader } from "./PhotoUploader";
import { createListing, type ListingState } from "./actions";
import type { RtoVehicle } from "@/lib/rto";

const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"];
const CATEGORIES = ["CAR", "BIKE", "COMMERCIAL", "TAXI", "LEASE"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const VEHICLE_CLASSES = [
  "Motor Car", "Motor Cab", "Maxi Cab", "M-Cycle/Scooter", "Moped",
  "Three Wheeler (Goods)", "Three Wheeler (Passenger)", "Goods Carrier",
  "Tractor", "Trailer", "Bus", "Other",
];
const COLORS = [
  "White", "Black", "Silver", "Grey", "Red", "Blue", "Brown", "Beige",
  "Green", "Yellow", "Orange", "Maroon", "Gold", "Other",
];
const BODY_TYPES = [
  "Hatchback", "Sedan", "SUV", "MUV/MPV", "Coupe", "Convertible",
  "Pickup Truck", "Van", "Solo", "Cruiser", "Sports", "Naked", "Scooter",
  "Truck", "Mini Truck", "Tempo", "Auto Rickshaw", "E-Rickshaw", "Other",
];
const TRANSMISSIONS = ["Manual", "Automatic", "CVT", "AMT", "DCT", "Semi-Automatic"];
const EMISSION_NORMS = ["BS-III", "BS-IV", "BS-VI", "Not Available"];

type Step = 1 | 2 | 3;

const emptyFields = {
  regNumber: "",
  category: "CAR",
  make: "",
  model: "",
  year: "",
  mfgMonth: "",
  fuelType: "PETROL",
  transmission: "",
  vehicleClass: "",
  color: "",
  bodyType: "",
  cubicCapacityCc: "",
  horsepowerBhp: "",
  cylinders: "",
  emissionNorms: "",
  odometerKm: "",
  seatingCapacity: "",
  unladenWeightKg: "",
  wheelbaseMm: "",
  askingPrice: "",
  city: "",
  description: "",
};

export function ListingForm() {
  const [state, formAction, pending] = useActionState<ListingState | undefined, FormData>(
    createListing,
    undefined,
  );
  const errors = state && !state.ok ? state.errors : {};

  const [step, setStep] = useState<Step>(1);
  const [fields, setFields] = useState(emptyFields);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [stepError, setStepError] = useState("");

  const set = useCallback(
    (key: keyof typeof emptyFields) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
        setFields((f) => ({ ...f, [key]: e.target.value })),
    [],
  );

  const handleRtoFetched = useCallback((data: RtoVehicle) => {
    setFields((f) => ({
      ...f,
      regNumber: data.regNumber,
      make: data.make,
      model: data.model,
      year: String(data.year),
      fuelType: data.fuelType,
      vehicleClass: data.vehicleClass ?? f.vehicleClass,
      color: data.color ?? f.color,
      bodyType: data.bodyType ?? f.bodyType,
      cubicCapacityCc: data.cubicCapacityCc != null ? String(data.cubicCapacityCc) : f.cubicCapacityCc,
      horsepowerBhp: data.horsepowerBhp != null ? String(data.horsepowerBhp) : f.horsepowerBhp,
      cylinders: data.cylinders != null ? String(data.cylinders) : f.cylinders,
      emissionNorms: data.emissionNorms ?? f.emissionNorms,
      mfgMonth: data.mfgMonth != null ? String(data.mfgMonth) : f.mfgMonth,
      seatingCapacity: data.seatingCapacity != null ? String(data.seatingCapacity) : f.seatingCapacity,
      unladenWeightKg: data.unladenWeightKg != null ? String(data.unladenWeightKg) : f.unladenWeightKg,
      wheelbaseMm: data.wheelbaseMm != null ? String(data.wheelbaseMm) : f.wheelbaseMm,
    }));
  }, []);

  const goNext = useCallback(() => {
    if (step === 1 && (!fields.make.trim() || !fields.model.trim() || !fields.year.trim())) {
      setStepError("Make, model, and year are required.");
      return;
    }
    if (step === 2 && (!fields.askingPrice.trim() || !fields.city.trim() || !fields.description.trim())) {
      setStepError("Price, city, and description are required.");
      return;
    }
    setStepError("");
    setStep((s) => (s + 1) as Step);
  }, [step, fields]);

  const goBack = useCallback(() => {
    setStepError("");
    setStep((s) => (s - 1) as Step);
  }, []);

  // Every field stays mounted (as a hidden input off its own step) so the
  // final FormData submit always carries the full listing, not just
  // whatever step happened to be visible last.
  const hidden = (key: keyof typeof emptyFields) => (
    <input type="hidden" name={key} value={fields[key]} />
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {(["Vehicle details", "Condition & price", "Photos"] as const).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                step === i + 1 ? "bg-brand text-white" : step > i + 1 ? "bg-success/20 text-success" : "bg-surface-muted"
              }`}
            >
              {i + 1}
            </span>
            <span className={step === i + 1 ? "text-foreground" : ""}>{label}</span>
            {i < 2 ? <span className="mx-1 text-zinc-300">—</span> : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
        <div className="space-y-6">
          <RtoLookup onFetched={handleRtoFetched} />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Vehicle type" name="category">
              <Select value={fields.category} onChange={set("category")}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0] + c.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Make" name="make" errors={errors.make}>
              <Input value={fields.make} onChange={set("make")} required />
            </Field>
            <Field label="Model" name="model" errors={errors.model}>
              <Input value={fields.model} onChange={set("model")} required />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Year" name="year" errors={errors.year}>
              <Input type="number" value={fields.year} onChange={set("year")} required />
            </Field>
            <Field label="Month of manufacture" name="mfgMonth" hint="Optional">
              <Select value={fields.mfgMonth} onChange={set("mfgMonth")}>
                <option value="">—</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Registration number" name="regNumber" hint="Optional">
              <Input value={fields.regNumber} onChange={set("regNumber")} placeholder="e.g. KL07AB1234" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Vehicle class" name="vehicleClass" hint="Optional">
              <Select value={fields.vehicleClass} onChange={set("vehicleClass")}>
                <option value="">—</option>
                {VEHICLE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Color" name="color" hint="Optional">
              <Select value={fields.color} onChange={set("color")}>
                <option value="">—</option>
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Body type" name="bodyType" hint="Optional">
              <Select value={fields.bodyType} onChange={set("bodyType")}>
                <option value="">—</option>
                {BODY_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuel type" name="fuelType" errors={errors.fuelType}>
              <Select value={fields.fuelType} onChange={set("fuelType")}>
                {FUEL_TYPES.map((f) => (
                  <option key={f} value={f}>
                    {f[0] + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Transmission" name="transmission" hint="Optional">
              <Select value={fields.transmission} onChange={set("transmission")}>
                <option value="">—</option>
                {TRANSMISSIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Cubic capacity (cc)" name="cubicCapacityCc" hint="Optional">
              <Input type="number" step="0.01" value={fields.cubicCapacityCc} onChange={set("cubicCapacityCc")} />
            </Field>
            <Field label="Horsepower (bhp)" name="horsepowerBhp" hint="Optional">
              <Input type="number" step="0.01" value={fields.horsepowerBhp} onChange={set("horsepowerBhp")} />
            </Field>
            <Field label="No. of cylinders" name="cylinders" hint="Optional">
              <Input type="number" value={fields.cylinders} onChange={set("cylinders")} />
            </Field>
          </div>

          <Field label="Emission norms" name="emissionNorms" hint="Optional">
            <Select value={fields.emissionNorms} onChange={set("emissionNorms")}>
              <option value="">—</option>
              {EMISSION_NORMS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>

          {hidden("odometerKm")}
          {hidden("seatingCapacity")}
          {hidden("unladenWeightKg")}
          {hidden("wheelbaseMm")}
          {hidden("askingPrice")}
          {hidden("city")}
          {hidden("description")}
        </div>
      ) : null}

      {step === 2 ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Odometer (km)" name="odometerKm" errors={errors.odometerKm}>
              <Input type="number" min={0} value={fields.odometerKm} onChange={set("odometerKm")} required />
            </Field>
            <Field label="Seating capacity" name="seatingCapacity" hint="Optional">
              <Input type="number" min={1} value={fields.seatingCapacity} onChange={set("seatingCapacity")} />
            </Field>
            <Field label="Unladen weight (kg)" name="unladenWeightKg" hint="Optional">
              <Input type="number" min={0} value={fields.unladenWeightKg} onChange={set("unladenWeightKg")} />
            </Field>
          </div>

          <Field label="Wheelbase (mm)" name="wheelbaseMm" hint="Optional">
            <Input type="number" min={0} value={fields.wheelbaseMm} onChange={set("wheelbaseMm")} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Asking price (₹)" name="askingPrice" errors={errors.askingPrice}>
              <Input type="number" min={1000} value={fields.askingPrice} onChange={set("askingPrice")} required />
            </Field>
            <Field label="City" name="city" errors={errors.city}>
              <Input value={fields.city} onChange={set("city")} required />
            </Field>
          </div>

          <Field label="Description" name="description" errors={errors.description}>
            <textarea
              value={fields.description}
              onChange={set("description")}
              rows={4}
              required
              className="block w-full rounded-md border border-border-default px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </Field>

          {hidden("regNumber")}
          {hidden("category")}
          {hidden("make")}
          {hidden("model")}
          {hidden("year")}
          {hidden("mfgMonth")}
          {hidden("fuelType")}
          {hidden("transmission")}
          {hidden("vehicleClass")}
          {hidden("color")}
          {hidden("bodyType")}
          {hidden("cubicCapacityCc")}
          {hidden("horsepowerBhp")}
          {hidden("cylinders")}
          {hidden("emissionNorms")}
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium">Photos</label>
            <p className="mb-2 text-xs text-danger">{errors.photoUrls?.[0]}</p>
            <PhotoUploader onChange={setPhotoUrls} />
          </div>

          {(Object.keys(emptyFields) as (keyof typeof emptyFields)[]).map((key) => (
            <span key={key}>{hidden(key)}</span>
          ))}
        </div>
      ) : null}

      <input type="hidden" name="photoUrls" value={JSON.stringify(photoUrls)} />

      {stepError ? <p className="text-sm text-danger">{stepError}</p> : null}
      {state && !state.ok && state.formError ? (
        <p className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{state.formError}</p>
      ) : null}

      <div className="flex justify-between">
        {step > 1 ? (
          <Button type="button" variant="outline" onClick={goBack}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {step < 3 ? (
          <Button type="button" onClick={goNext}>
            Continue
          </Button>
        ) : (
          <Button type="submit" disabled={pending || photoUrls.length === 0}>
            {pending ? "Saving…" : "Publish listing"}
          </Button>
        )}
      </div>
    </form>
  );
}
