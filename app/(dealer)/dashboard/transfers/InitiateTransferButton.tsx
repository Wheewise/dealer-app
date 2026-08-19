"use client";

import { useState } from "react";
import { InitiateTransferForm } from "./InitiateTransferForm";

export function InitiateTransferButton({
  listingId,
  vehicleName,
  defaultSaleAmount,
  candidates,
}: {
  listingId: string;
  vehicleName: string;
  defaultSaleAmount: number;
  candidates: { id: string; name: string; phone: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white"
      >
        Initiate RC Transfer
      </button>
      {open ? (
        <InitiateTransferForm
          listingId={listingId}
          vehicleName={vehicleName}
          defaultSaleAmount={defaultSaleAmount}
          candidates={candidates}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
