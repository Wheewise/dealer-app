"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Field";
import { applyForLoan } from "@/lib/actions/finance";
import type { NBFC } from "@/types/supabase";

const NBFC_OPTIONS: { value: NBFC; label: string }[] = [
  { value: "BAJAJ_FINSERV", label: "Bajaj Finserv" },
  { value: "HDFC_BANK", label: "HDFC Bank" },
  { value: "ICICI_BANK", label: "ICICI Bank" },
  { value: "MAHINDRA_FINANCE", label: "Mahindra Finance" },
  { value: "KOTAK_MAHINDRA", label: "Kotak Mahindra" },
  { value: "CHOLAMANDALAM", label: "Cholamandalam" },
  { value: "SHRIRAM_FINANCE", label: "Shriram Finance" },
  { value: "SUNDARAM_FINANCE", label: "Sundaram Finance" },
  { value: "TATA_CAPITAL", label: "Tata Capital" },
  { value: "OTHER", label: "Other NBFC" },
];

export function LoanApplyForm({
  listingId,
  price,
  isLoggedIn,
}: {
  listingId: string;
  price: number;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(Math.round(price * 0.8));
  const [tenure, setTenure] = useState(60);
  const [nbfc, setNbfc] = useState<NBFC>("HDFC_BANK");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pan, setPan] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ emi: number } | null>(null);

  if (!open) {
    return (
      <Button
        onClick={() => {
          if (!isLoggedIn) {
            router.push(
              `/login?callbackUrl=${encodeURIComponent(`/vehicle/${listingId}`)}`,
            );
            return;
          }
          setOpen(true);
        }}
        title={isLoggedIn ? undefined : "Sign in to apply for a loan"}
        className="w-full text-xs"
      >
        Apply for loan
      </Button>
    );
  }

  const rate = 0.115;
  const mr = rate / 12;
  const estEmi = Math.round(
    (amount * mr * Math.pow(1 + mr, tenure)) / (Math.pow(1 + mr, tenure) - 1),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSaving(true);
    try {
      const res = await applyForLoan({
        listingId,
        amount,
        tenureMonths: tenure,
        nbfc,
        applicantName: name.trim(),
        applicantPhone: phone.trim(),
        applicantPan: pan.trim() || undefined,
      });
      if (res.ok) {
        setResult({ emi: res.emi });
      } else {
        alert(res.error);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (result) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold text-green-700">Application submitted!</p>
        <p>
          Monthly EMI:{" "}
          <span className="font-bold">₹{result.emi.toLocaleString("en-IN")}</span>
        </p>
        <p className="text-xs text-zinc-500">
          The NBFC will contact you within 2-3 business days.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Loan Application</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-500 hover:underline"
        >
          Cancel
        </button>
      </div>

      <label className="block">
        <span className="text-xs text-zinc-500">Loan amount (₹)</span>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          max={price}
          className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
        />
      </label>

      <label className="block">
        <span className="text-xs text-zinc-500">Tenure (months)</span>
        <select
          value={tenure}
          onChange={(e) => setTenure(Number(e.target.value))}
          className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
        >
          {[12, 24, 36, 48, 60, 72, 84].map((m) => (
            <option key={m} value={m}>
              {m} months
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs text-zinc-500">NBFC Partner</span>
        <select
          value={nbfc}
          onChange={(e) => setNbfc(e.target.value as NBFC)}
          className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
        >
          {NBFC_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded bg-zinc-100 px-3 py-2 text-xs">
        Estimated EMI:{" "}
        <span className="font-bold">₹{estEmi.toLocaleString("en-IN")}</span> (@ 11.5%
        p.a.)
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
        required
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number"
        type="tel"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
        required
      />
      <input
        value={pan}
        onChange={(e) => setPan(e.target.value)}
        placeholder="PAN (optional)"
        className="border-border-default focus:border-brand-red w-full rounded-md border px-3 py-1.5 text-sm outline-none"
      />

      <Button disabled={saving || !name.trim() || !phone.trim()} className="w-full">
        {saving ? "Submitting…" : "Submit application"}
      </Button>
    </form>
  );
}
