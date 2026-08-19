"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TestDriveModal } from "./TestDriveModal";

export function TestDriveButton({
  listingId,
  vehicleName,
  isLoggedIn,
}: {
  listingId: string;
  vehicleName: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  if (!isLoggedIn) {
    return (
      <button
        type="button"
        onClick={() =>
          router.push(`/login?callbackUrl=${encodeURIComponent(`/vehicle/${listingId}`)}`)
        }
        className="border-border-default hover:bg-surface-muted w-full rounded-md border px-4 py-3 text-sm font-semibold"
      >
        🚗 Login to Book Test Drive
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-border-default hover:bg-surface-muted w-full rounded-md border px-4 py-3 text-sm font-semibold"
      >
        🚗 Book Test Drive
      </button>
      {open ? (
        <TestDriveModal
          listingId={listingId}
          vehicleName={vehicleName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
