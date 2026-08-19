"use client";

import { useTransition } from "react";
import { updateTestDriveStatus } from "@/lib/actions/testdrive";

export function TestDriveActions({
  testDriveId,
  status,
}: {
  testDriveId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();

  function setStatus(next: "CONFIRMED" | "CANCELLED" | "COMPLETED") {
    startTransition(() => {
      void updateTestDriveStatus(testDriveId, next);
    });
  }

  if (status === "PENDING") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("CONFIRMED")}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Confirm
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("CANCELLED")}
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (status === "CONFIRMED") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("COMPLETED")}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Mark Complete
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setStatus("CANCELLED")}
          className="bg-brand-red hover:bg-brand-red-dark rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return null;
}
