"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { initiateTransfer } from "@/lib/actions/rctransfer";

export function InitiateTransferForm({
  listingId,
  vehicleName,
  defaultSaleAmount,
  candidates,
  onClose,
}: {
  listingId: string;
  vehicleName: string;
  defaultSaleAmount: number;
  candidates: { id: string; name: string; phone: string | null }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [buyerId, setBuyerId] = useState(candidates[0]?.id ?? "");
  const [registrationNo, setRegistrationNo] = useState("");
  const [saleAmount, setSaleAmount] = useState(String(defaultSaleAmount));

  function handleSubmit() {
    setError(null);
    if (!buyerId) {
      setError("Select which buyer purchased this vehicle.");
      return;
    }
    startTransition(async () => {
      const result = await initiateTransfer({
        listingId,
        buyerId,
        registrationNo,
        saleAmount: Number(saleAmount),
      });
      if (result.ok) {
        router.push(`/rc-transfer/${result.id}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="border-border-default bg-background w-full max-w-md rounded-t-2xl border-t p-6 sm:rounded-2xl sm:border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold">Initiate RC Transfer</h3>
        <p className="mt-1 text-sm text-zinc-500">{vehicleName}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Buyer</label>
            {candidates.length === 0 ? (
              <p className="text-brand-red text-sm">
                No buyer enquiries or test drives found for this listing yet — a buyer
                record is required to start a transfer.
              </p>
            ) : (
              <select
                value={buyerId}
                onChange={(e) => setBuyerId(e.target.value)}
                className="border-border-default w-full rounded-md border px-3 py-2 text-sm"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `· ${c.phone}` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Registration number
            </label>
            <input
              value={registrationNo}
              onChange={(e) => setRegistrationNo(e.target.value.toUpperCase())}
              placeholder="e.g. KA03EF9012"
              className="border-border-default w-full rounded-md border px-3 py-2 text-sm uppercase"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Sale amount (₹)</label>
            <input
              type="number"
              min={1000}
              value={saleAmount}
              onChange={(e) => setSaleAmount(e.target.value)}
              className="border-border-default w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error ? (
          <p className="bg-brand-red/10 text-brand-red mt-3 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="border-border-default flex-1 rounded-md border px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || candidates.length === 0}
            className="bg-brand-red hover:bg-brand-red-dark flex-1 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Starting…" : "Start Transfer"}
          </button>
        </div>
      </div>
    </div>
  );
}
