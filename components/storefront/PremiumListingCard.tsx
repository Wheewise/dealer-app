"use client";

import Link from "next/link";
import { formatINR, formatNumber } from "@/lib/format";
import { SaveButton } from "@/components/vehicle/SaveButton";
import { CompareButton } from "@/components/vehicle/CompareButton";

export type PremiumListingCardData = {
  id: string;
  year: number;
  make: string;
  model: string;
  fuelType: string;
  transmission?: string | null;
  odometerKm: number;
  askingPrice: number;
  city: string;
  status: string;
  coverUrl?: string;
  isBoosted?: boolean;
  inspectionScore?: number | null;
  hasSpinView?: boolean;
  emiFromMonthly?: number | null;
};

export function PremiumListingCard({
  listing,
  accent = "#dc2626",
  size = "default",
  isLoggedIn,
}: {
  listing: PremiumListingCardData;
  accent?: string;
  size?: "default" | "featured";
  isLoggedIn: boolean;
}) {
  const sold = listing.status === "SOLD";
  const featured = size === "featured";

  return (
    <div
      className={`group border-border-default bg-background relative overflow-hidden rounded-xl border transition-all hover:-translate-y-0.5 hover:shadow-xl ${
        featured ? "w-[300px] flex-shrink-0 sm:w-[340px]" : ""
      }`}
    >
      <Link href={`/vehicle/${listing.id}`} className="block">
        <div
          className={`bg-surface-muted relative overflow-hidden ${
            featured ? "aspect-[4/3]" : "aspect-[4/3]"
          }`}
        >
          {listing.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.coverUrl}
              alt={`${listing.year} ${listing.make} ${listing.model}`}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              <svg className="h-12 w-12" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

          {listing.isBoosted ? (
            <div
              className="absolute top-0 left-0 px-3 py-1 text-[10px] font-bold tracking-wider text-white uppercase shadow-md"
              style={{ backgroundColor: accent }}
            >
              ★ Featured
            </div>
          ) : null}

          <div className="absolute top-2 right-2 flex flex-col gap-1.5">
            {listing.hasSpinView ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                <svg
                  className="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                360°
              </span>
            ) : null}
            {listing.inspectionScore != null ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/90 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur">
                ✓ Inspected {listing.inspectionScore}%
              </span>
            ) : null}
          </div>

          {sold ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55">
              <span className="bg-brand-red rounded-md px-4 py-1.5 text-sm font-bold tracking-wider text-white uppercase">
                Sold
              </span>
            </div>
          ) : null}
        </div>

        <div className="px-4 pt-4 pb-2">
          <div className="text-base leading-tight font-semibold tracking-tight">
            {listing.year} {listing.make} {listing.model}
          </div>
          <div className="mt-1.5 text-[11px] tracking-wide text-zinc-500 uppercase">
            {formatNumber(listing.odometerKm)} km ·{" "}
            {listing.fuelType[0] + listing.fuelType.slice(1).toLowerCase()}
            {listing.transmission
              ? ` · ${listing.transmission[0] + listing.transmission.slice(1).toLowerCase()}`
              : ""}
            {" · "}
            {listing.city}
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-xl font-bold tracking-tight" style={{ color: accent }}>
              {formatINR(listing.askingPrice)}
            </span>
            {listing.emiFromMonthly != null && !sold ? (
              <span className="text-[11px] text-zinc-500">
                EMI{" "}
                <span className="font-semibold text-zinc-700">
                  {formatINR(listing.emiFromMonthly)}/mo
                </span>
              </span>
            ) : null}
          </div>
        </div>
      </Link>

      <div className="border-border-default flex items-center justify-between border-t px-4 py-2.5">
        <SaveButton listingId={listing.id} isLoggedIn={isLoggedIn} />
        <CompareButton listingId={listing.id} />
      </div>
    </div>
  );
}
