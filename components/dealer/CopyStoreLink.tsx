"use client";

import { useState } from "react";

export function CopyStoreLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable — nothing more we can do silently
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="border-border-default hover:bg-surface-muted inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors"
    >
      {copied ? "Copied!" : "Copy Store Link"}
    </button>
  );
}
