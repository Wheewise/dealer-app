"use client";

import { useEffect } from "react";
import { captureError } from "@/lib/sentry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="text-neutral-500">
          We&apos;ve been notified and are looking into it.
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-orange-600 px-4 py-2 text-white hover:bg-orange-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
