"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatINR, formatNumber } from "@/lib/format";
import { bulkSetStatus, bulkDelete } from "@/lib/actions/listings";
import { ListingRowActions } from "./ListingRowActions";
import { ConfirmDialog } from "./ConfirmDialog";

export type InventoryListingRow = {
  id: string;
  make: string;
  model: string;
  year: number;
  askingPrice: number;
  odometerKm: number;
  status: "ACTIVE" | "SOLD" | "PAUSED";
  enquiryCount: number;
  photoUrl: string | null;
  daysListedLabel: string;
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-800" },
  SOLD: { label: "Sold", className: "bg-zinc-200 text-zinc-600" },
  PAUSED: { label: "Archived", className: "bg-amber-100 text-amber-800" },
};

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.ACTIVE;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

export function InventoryList({ listings }: { listings: InventoryListingRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [bulkConfirm, setBulkConfirm] = useState<"sold" | "archive" | "delete" | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === listings.length ? new Set() : new Set(listings.map((l) => l.id))));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function runBulkStatus(status: "SOLD" | "PAUSED") {
    const ids = [...selected];
    startTransition(async () => {
      await bulkSetStatus(ids, status);
      setBulkConfirm(null);
      clearSelection();
    });
  }

  function runBulkDelete() {
    const ids = [...selected];
    startTransition(async () => {
      await bulkDelete(ids);
      setBulkConfirm(null);
      clearSelection();
    });
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="border-brand-red bg-brand-red/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setBulkConfirm("sold")}
              className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
            >
              Mark selected as sold
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setBulkConfirm("archive")}
              className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              Archive selected
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setBulkConfirm("delete")}
              className="text-brand-red border-brand-red/30 hover:bg-brand-red/10 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            >
              Delete selected
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-foreground hover:bg-surface-muted rounded-md px-3 py-1.5 text-xs font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-border-default bg-background overflow-hidden rounded-lg border">
        <div className="border-border-default bg-surface-muted flex items-center gap-3 border-b px-4 py-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
          <input
            type="checkbox"
            checked={selected.size === listings.length && listings.length > 0}
            onChange={toggleAll}
            aria-label="Select all"
            className="border-border-default h-4 w-4 rounded"
          />
          <span>Select all</span>
        </div>
        <ul className="divide-border-default divide-y">
          {listings.map((l) => (
            <li key={l.id} className="flex items-center gap-4 px-4 py-4">
              <input
                type="checkbox"
                checked={selected.has(l.id)}
                onChange={() => toggle(l.id)}
                aria-label={`Select ${l.year} ${l.make} ${l.model}`}
                className="border-border-default h-4 w-4 shrink-0 rounded"
              />

              {l.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={l.photoUrl}
                  alt={`${l.year} ${l.make} ${l.model}`}
                  className="h-20 w-20 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div className="bg-surface-muted flex h-20 w-20 shrink-0 items-center justify-center rounded-md text-2xl">
                  🚗
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/dashboard/inventory/${l.id}/edit`}
                    className="font-semibold hover:underline"
                  >
                    {l.year} {l.make} {l.model}
                  </Link>
                  <StatusBadge status={l.status} />
                </div>
                <div className="mt-1 text-sm font-medium">{formatINR(l.askingPrice)}</div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {formatNumber(l.odometerKm)} km · {l.enquiryCount} enquir
                  {l.enquiryCount === 1 ? "y" : "ies"} · {l.daysListedLabel}
                </div>
              </div>

              <ListingRowActions listingId={l.id} status={l.status} />
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={bulkConfirm === "sold"}
        title={`Mark ${selected.size} vehicle${selected.size === 1 ? "" : "s"} as sold?`}
        message="They will no longer appear in browse."
        confirmLabel="Mark sold"
        confirmClassName="bg-emerald-600 hover:bg-emerald-700"
        pending={isPending}
        onConfirm={() => runBulkStatus("SOLD")}
        onCancel={() => setBulkConfirm(null)}
      />
      <ConfirmDialog
        open={bulkConfirm === "archive"}
        title={`Archive ${selected.size} vehicle${selected.size === 1 ? "" : "s"}?`}
        message="They will be hidden from browse until reactivated."
        confirmLabel="Archive"
        confirmClassName="bg-amber-600 hover:bg-amber-700"
        pending={isPending}
        onConfirm={() => runBulkStatus("PAUSED")}
        onCancel={() => setBulkConfirm(null)}
      />
      <ConfirmDialog
        open={bulkConfirm === "delete"}
        title={`Delete ${selected.size} vehicle${selected.size === 1 ? "" : "s"}?`}
        message="This cannot be undone."
        confirmLabel="Delete"
        confirmClassName="bg-brand-red hover:bg-brand-red-dark"
        pending={isPending}
        onConfirm={runBulkDelete}
        onCancel={() => setBulkConfirm(null)}
      />
    </div>
  );
}
