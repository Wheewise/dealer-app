"use client";

import { useState, useCallback } from "react";
import { Button, Input } from "@wheewise/ui";
import type { RtoVehicle } from "@/lib/rto";

export function RtoLookup({ onFetched }: { onFetched: (data: RtoVehicle) => void }) {
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
      onFetched(await res.json());
    } catch {
      setError("Failed to fetch vehicle data");
    } finally {
      setLoading(false);
    }
  }, [regNumber, onFetched]);

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border-default bg-surface-muted p-4">
      <div className="min-w-0 flex-1">
        <label className="block text-xs font-medium text-zinc-600">Registration number</label>
        <Input
          value={regNumber}
          onChange={(e) => setRegNumber(e.target.value)}
          placeholder="e.g. MH02AB1234"
          className="mt-1"
        />
      </div>
      <Button type="button" onClick={lookup} disabled={loading || !regNumber.trim()}>
        {loading ? "Fetching…" : "Auto-fill from RC"}
      </Button>
      {error ? <p className="w-full text-xs text-danger">{error}</p> : null}
    </div>
  );
}
