"use client";

import { useState, useMemo } from "react";
import { calculateEmi } from "@/lib/emi";
import { formatINR } from "@/lib/format";

export function EmiCalculator({ price }: { price: number }) {
  const [downPayment, setDownPayment] = useState(Math.round(price * 0.2));
  const [annualRate, setAnnualRate] = useState(9.5);
  const [tenureMonths, setTenureMonths] = useState(60);

  const result = useMemo(() => {
    const principal = Math.max(0, price - downPayment);
    if (principal <= 0) return { monthlyEmi: 0, totalInterest: 0, totalPayable: 0 };
    return calculateEmi({ principal, annualRate, tenureMonths });
  }, [price, downPayment, annualRate, tenureMonths]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3">
        <SliderField
          label="Down payment"
          value={downPayment}
          min={0}
          max={price}
          step={10000}
          onChange={setDownPayment}
          format={formatINR}
        />
        <SliderField
          label="Interest rate"
          value={annualRate}
          min={6}
          max={18}
          step={0.5}
          onChange={setAnnualRate}
          format={(v) => `${v.toFixed(1)}%`}
        />
        <SliderField
          label="Tenure"
          value={tenureMonths}
          min={12}
          max={84}
          step={12}
          onChange={setTenureMonths}
          format={(v) => `${Math.round(v / 12)} yr`}
        />
      </div>

      <div className="border-border-default bg-surface-muted space-y-2 rounded-lg border p-4">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Monthly EMI</span>
          <span className="text-brand-red text-2xl font-bold">
            {formatINR(result.monthlyEmi)}
          </span>
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Total interest</span>
          <span>{formatINR(result.totalInterest)}</span>
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>Total payable</span>
          <span>{formatINR(result.totalPayable)}</span>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-zinc-400">
        Estimated figures. Actual EMI depends on your credit profile and lender policies.
        Rates shown are indicative for pre-owned vehicles.
      </p>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-medium">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-red-600"
      />
    </div>
  );
}
