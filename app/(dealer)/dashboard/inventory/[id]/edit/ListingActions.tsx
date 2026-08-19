"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setListingStatus, deleteListing } from "@/lib/actions/listings";
import { Button } from "@/components/ui/Field";

export function ListingActions({
  listingId,
  status,
}: {
  listingId: string;
  status: "ACTIVE" | "SOLD" | "PAUSED";
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const flip = (next: "ACTIVE" | "SOLD" | "PAUSED") => {
    startTransition(async () => {
      await setListingStatus(listingId, next);
    });
  };

  const remove = () => {
    if (!confirm("Delete this listing? This can't be undone.")) return;
    startTransition(async () => {
      await deleteListing(listingId);
      router.push("/dashboard/inventory");
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "SOLD" ? (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => flip("SOLD")}
        >
          Mark sold
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => flip("ACTIVE")}
        >
          Reactivate
        </Button>
      )}
      {status === "ACTIVE" ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => flip("PAUSED")}
        >
          Pause
        </Button>
      ) : status === "PAUSED" ? (
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => flip("ACTIVE")}
        >
          Resume
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={remove}
        className="text-brand-red hover:bg-brand-red/10"
      >
        Delete
      </Button>
    </div>
  );
}
