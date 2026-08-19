"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { markAsSold, deleteListing } from "@/lib/actions/listings";
import { ConfirmDialog } from "./ConfirmDialog";
import { PencilIcon, CheckCircleIcon, TrashIcon, RocketIcon } from "./icons";

export function ListingRowActions({
  listingId,
  status,
}: {
  listingId: string;
  status: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"sold" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function confirmMarkSold() {
    setError(null);
    startTransition(async () => {
      const result = await markAsSold(listingId);
      if (!result.ok) setError(result.error);
      setConfirming(null);
    });
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteListing(listingId);
      if (!result.ok) setError(result.error);
      setConfirming(null);
    });
  }

  const iconButton =
    "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors";

  return (
    <div className="flex items-center justify-end gap-1.5">
      {error ? <span className="text-brand-red text-xs">{error}</span> : null}

      <Link
        href={`/dashboard/inventory/${listingId}/edit`}
        title="Edit"
        aria-label="Edit listing"
        className={`${iconButton} text-blue-600 hover:bg-blue-50`}
      >
        <PencilIcon className="h-4 w-4" />
      </Link>

      {status !== "SOLD" ? (
        <button
          type="button"
          title="Mark as sold"
          aria-label="Mark as sold"
          disabled={isPending}
          onClick={() => setConfirming("sold")}
          className={`${iconButton} text-emerald-600 hover:bg-emerald-50 disabled:opacity-50`}
        >
          <CheckCircleIcon className="h-4 w-4" />
        </button>
      ) : null}

      <Link
        href={`/dashboard/inventory/${listingId}/edit#boost`}
        title="Boost"
        aria-label="Boost listing"
        className={`${iconButton} text-orange-600 hover:bg-orange-50`}
      >
        <RocketIcon className="h-4 w-4" />
      </Link>

      <button
        type="button"
        title="Delete"
        aria-label="Delete listing"
        disabled={isPending}
        onClick={() => setConfirming("delete")}
        className={`${iconButton} text-brand-red hover:bg-brand-red/10 disabled:opacity-50`}
      >
        <TrashIcon className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={confirming === "sold"}
        title="Mark this vehicle as sold?"
        message="It will no longer appear in browse."
        confirmLabel="Mark sold"
        confirmClassName="bg-emerald-600 hover:bg-emerald-700"
        pending={isPending}
        onConfirm={confirmMarkSold}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        title="Are you sure you want to delete this listing?"
        message="This cannot be undone."
        confirmLabel="Delete"
        confirmClassName="bg-brand-red hover:bg-brand-red-dark"
        pending={isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
