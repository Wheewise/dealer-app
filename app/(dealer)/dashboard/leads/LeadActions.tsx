"use client";

import { useTransition } from "react";
import { setLeadFlags } from "@/lib/actions/leads";

export function LeadActions({
  leadId,
  isRead,
  isContacted,
}: {
  leadId: string;
  isRead: boolean;
  isContacted: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-1 text-xs">
      {!isRead ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => setLeadFlags(leadId, { isRead: true }))}
          className="hover:bg-surface-muted hover:text-foreground rounded px-2 py-1 text-zinc-500"
        >
          Mark read
        </button>
      ) : null}
      {!isContacted ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(() =>
              setLeadFlags(leadId, { isContacted: true, isRead: true }),
            )
          }
          className="hover:bg-surface-muted hover:text-foreground rounded px-2 py-1 text-zinc-500"
        >
          Mark contacted
        </button>
      ) : null}
    </div>
  );
}
