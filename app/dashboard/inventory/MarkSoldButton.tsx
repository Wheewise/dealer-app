"use client";

import { useState, useTransition } from "react";
import { Button } from "@wheewise/ui";
import { markVehicleSold } from "./actions";

export function MarkSoldButton({ vehicleId }: { vehicleId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const onClick = () => {
    if (!window.confirm("Mark this vehicle as sold? It will be removed from public listings.")) return;
    setError("");
    startTransition(async () => {
      const result = await markVehicleSold(vehicleId);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="shrink-0 text-right">
      <Button type="button" variant="danger" onClick={onClick} disabled={pending}>
        {pending ? "Marking…" : "Mark as sold"}
      </Button>
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
