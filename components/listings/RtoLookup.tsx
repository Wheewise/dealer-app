"use client";

import { useState, useCallback } from "react";
import type { RtoVehicle } from "@/lib/rto";

export function RtoLookup({
  onFetched,
}: {
  onFetched: (data: Pick<RtoVehicle, "make" | "model" | "year" | "fuelType">) => void;
}) {
  const [regNumber, setRegNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = useCallback(async () => {
    if (!regNumber.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rto?reg=${encodeURIComponent(regNumber.trim())}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Not found");
        return;
      }
      const vehicle = await res.json();
      onFetched({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        fuelType: vehicle.fuelType,
      });
    } catch {
      setError("Failed to fetch vehicle data");
    } finally {
      setLoading(false);
    }
  }, [regNumber, onFetched]);

  return (
    <div className="border-border-default bg-surface-muted flex flex-wrap items-end gap-3 rounded-lg border p-4">
      <div className="min-w-0 flex-1">
        <label className="block text-xs font-medium text-zinc-600">
          Registration number
        </label>
        <input
          type="text"
          value={regNumber}
          onChange={(e) => setRegNumber(e.target.value)}
          placeholder="e.g. MH02AB1234"
          className="border-border-default mt-1 w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>
      <button
        type="button"
        onClick={lookup}
        disabled={loading || !regNumber.trim()}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Fetching…" : "Auto-fill from RC"}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
      <p className="w-full text-[11px] text-zinc-400">
        Demo: try MH02AB1234, DL01CD5678, or KA03EF9012. In production this connects to
        the RTO Vahan API.
      </p>
    </div>
  );
}
