import Link from "next/link";
import { formatINR, formatNumber } from "@/lib/format";
import { SaveButton } from "@/components/vehicle/SaveButton";
import { CompareButton } from "@/components/vehicle/CompareButton";

export type ListingCardData = {
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
};

export function ListingCard({
  listing,
  isLoggedIn,
}: {
  listing: ListingCardData;
  isLoggedIn: boolean;
}) {
  const sold = listing.status === "SOLD";
  return (
    <div className="group border-border-default bg-background relative block overflow-hidden rounded-lg border transition-shadow hover:shadow-md">
      <Link href={`/vehicle/${listing.id}`} className="block">
        <div className="bg-surface-muted relative aspect-[4/3] overflow-hidden">
          {listing.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.coverUrl}
              alt=""
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          ) : null}
          {sold ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <span className="bg-brand-red rounded-md px-3 py-1 text-sm font-bold text-white uppercase">
                Sold
              </span>
            </div>
          ) : null}
        </div>
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold">
              {listing.year} {listing.make} {listing.model}
            </span>
            {listing.isBoosted ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 uppercase">
                Featured
              </span>
            ) : null}
            {listing.inspectionScore != null ? (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 uppercase">
                Inspected {listing.inspectionScore}%
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {formatNumber(listing.odometerKm)} km ·{" "}
            {listing.fuelType[0] + listing.fuelType.slice(1).toLowerCase()}
            {listing.transmission
              ? ` · ${listing.transmission[0] + listing.transmission.slice(1).toLowerCase()}`
              : ""}
            {" · "}
            {listing.city}
          </div>
          <div className="text-brand-red mt-3 text-lg font-bold">
            {formatINR(listing.askingPrice)}
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-between px-4 pb-3">
        <SaveButton listingId={listing.id} isLoggedIn={isLoggedIn} />
        <CompareButton listingId={listing.id} />
      </div>
    </div>
  );
}
