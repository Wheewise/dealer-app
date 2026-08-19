"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "wheewise.cookie-consent.v1";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Read localStorage *after* mount so SSR and CSR render the same null
    // initial state. We then defer setVisible to a microtask so the React 19
    // "no setState in effect body" rule sees a callback, not a sync call.
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        if (window.localStorage.getItem(STORAGE_KEY) !== "accepted") {
          setVisible(true);
        }
      } catch {
        // localStorage unavailable (incognito quotas) — show banner; accepting
        // is the only state change so worst case the user dismisses each visit.
        setVisible(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!visible) return null;

  const accept = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "accepted");
    } catch {
      // ignore — see above
    }
    setVisible(false);
  };

  return (
    <div className="border-border-default fixed inset-x-0 bottom-0 z-50 border-t bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur sm:py-4 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-xs text-zinc-700 sm:text-sm dark:text-zinc-300">
          Wheewise uses a small number of strictly-necessary cookies to keep you signed in
          and to count vehicle views accurately. No advertising trackers — promise.{" "}
          <Link href="/privacy" className="text-brand-red font-medium underline">
            Read our privacy policy
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={accept}
          className="bg-brand-red hover:bg-brand-red-dark shrink-0 rounded-full px-4 py-2 text-xs font-semibold text-white sm:text-sm"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
