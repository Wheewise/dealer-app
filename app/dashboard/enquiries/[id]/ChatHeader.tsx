"use client";

import { useRouter } from "next/navigation";
import { ChevronLeftIcon, UserIcon } from "@wheewise/ui";

// WhatsApp-style contact header — the buyer comes first, the vehicle that
// started the conversation is a small secondary line (still needed since
// the same buyer can have more than one thread with you).
export function ChatHeader({ buyerName, vehicleLabel }: { buyerName: string; vehicleLabel: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3 border-b border-border-default px-4 py-3">
      <button
        type="button"
        onClick={() => router.back()}
        aria-label="Back"
        className="text-foreground hover:text-zinc-500"
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-zinc-400">
        <UserIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{buyerName}</p>
        <p className="truncate text-xs text-zinc-500">{vehicleLabel}</p>
      </div>
    </div>
  );
}
