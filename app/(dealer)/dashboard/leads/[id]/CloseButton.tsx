"use client";

import { useTransition } from "react";
import { closeEnquiry } from "@/lib/actions/enquiries";

export function CloseButton({ enquiryId, disabled }: { enquiryId: string; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();

  if (disabled) return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          void closeEnquiry(enquiryId);
        })
      }
      className="border-border-default hover:bg-surface-muted rounded-md border px-3 py-1.5 text-xs font-semibold"
    >
      {pending ? "Closing…" : "Mark closed"}
    </button>
  );
}
