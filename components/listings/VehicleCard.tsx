"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { formatNumber } from "@/lib/format";

export type VehicleCardProps = {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  fuelType: string;
  odometer: number;
  primaryPhoto?: string | null;
  dealerName: string;
  city: string;
  isLoggedIn: boolean;
};

export function VehicleCard({
  id,
  make,
  model,
  year,
  price,
  fuelType,
  odometer,
  primaryPhoto,
  dealerName,
  city,
  isLoggedIn,
}: VehicleCardProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const toggleWishlist = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isLoggedIn) {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/vehicle/${id}`)}`);
        return;
      }
      setPending(true);
      const next = !saved;
      try {
        const res = await fetch("/api/wishlist", {
          method: next ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listingId: id }),
        });
        if (res.ok) setSaved(next);
      } finally {
        setPending(false);
      }
    },
    [id, isLoggedIn, router, saved],
  );

  return (
    <Link
      href={`/vehicle/${id}`}
      className="group cursor-pointer overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 transition-all duration-300 hover:border-red-600/30 hover:shadow-lg hover:shadow-red-950/20"
    >
      {/* Photo */}
      <div className="aspect-[4/3] overflow-hidden bg-zinc-800">
        {primaryPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primaryPhoto}
            alt={`${year} ${make} ${model}`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900">
            <span className="text-4xl text-zinc-600">🚗</span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="p-4">
        <h3 className="text-lg leading-tight font-bold text-white">
          {make} {model}
        </h3>
        <p className="mt-1 text-sm text-zinc-400">
          {year} • {fuelType[0] + fuelType.slice(1).toLowerCase()}
        </p>
        <p className="text-xs text-zinc-500">{formatNumber(odometer)} km</p>

        {/* Price */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xl font-bold text-red-500">
            ₹{price.toLocaleString("en-IN")}
          </span>
          <button
            type="button"
            onClick={toggleWishlist}
            disabled={pending}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`transition-colors ${saved ? "text-red-500" : "text-zinc-600 hover:text-red-500"}`}
          >
            {saved ? "♥" : "♡"}
          </button>
        </div>

        {/* Dealer */}
        <div className="mt-2 border-t border-zinc-800 pt-2">
          <p className="text-xs text-zinc-500">
            {dealerName} • {city}
          </p>
        </div>
      </div>
    </Link>
  );
}
