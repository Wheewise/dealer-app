"use client";

import { useState, useCallback } from "react";

function getCompareIds(): string[] {
  try {
    const raw = localStorage.getItem("wheewise-compare");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCompareIds(ids: string[]) {
  localStorage.setItem("wheewise-compare", JSON.stringify(ids));
}

export function CompareButton({ listingId }: { listingId: string }) {
  const [inCompare, setInCompare] = useState(() => getCompareIds().includes(listingId));

  const toggle = useCallback(() => {
    const ids = getCompareIds();
    if (ids.includes(listingId)) {
      setCompareIds(ids.filter((id) => id !== listingId));
      setInCompare(false);
    } else if (ids.length < 3) {
      setCompareIds([...ids, listingId]);
      setInCompare(true);
    }
  }, [listingId]);

  const ids = getCompareIds();
  const showCompare = ids.length >= 2;

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={toggle}
        className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          inCompare
            ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
            : "border-border-default hover:bg-surface-muted text-zinc-600"
        }`}
      >
        <span>{inCompare ? "⊟" : "⊞"}</span>
        <span>{inCompare ? "Added" : "Compare"}</span>
      </button>
      {showCompare && (
        <a
          href={`/compare?ids=${ids.join(",")}`}
          className="text-brand-red text-sm font-medium hover:underline"
        >
          Compare {ids.length}
        </a>
      )}
    </div>
  );
}
