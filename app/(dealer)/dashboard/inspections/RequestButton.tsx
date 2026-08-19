"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Field";
import { requestInspection } from "@/lib/actions/inspections";

export function RequestInspectionButton({ listingId }: { listingId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      className="text-xs"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await requestInspection(listingId);
        } catch (e) {
          alert(e instanceof Error ? e.message : "Failed");
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "…" : "Request"}
    </Button>
  );
}
