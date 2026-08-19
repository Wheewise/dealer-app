"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEnquiry } from "@/lib/actions/enquiries";

export function EnquireButton({
  listingId,
  vehicle,
  photoUrl,
  isLoggedIn,
}: {
  listingId: string;
  vehicle: string;
  photoUrl?: string;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    `Hi, I'm interested in this ${vehicle}. Is it still available?`,
  );
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <button
        type="button"
        onClick={() =>
          router.push(`/login?callbackUrl=${encodeURIComponent(`/vehicle/${listingId}`)}`)
        }
        className="bg-brand-red hover:bg-brand-red-dark w-full rounded-md px-4 py-3 text-sm font-semibold text-white"
      >
        Login to Enquire
      </button>
    );
  }

  function handleSend() {
    setError(null);
    startTransition(async () => {
      const result = await createEnquiry(listingId, message);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error);
      }
    });
  }

  function handleClose() {
    setOpen(false);
    setSent(false);
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-brand-red hover:bg-brand-red-dark w-full rounded-md px-4 py-3 text-sm font-semibold text-white"
      >
        Enquire Now
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={handleClose}
        >
          <div
            className="bg-background w-full max-w-md rounded-xl p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="py-4 text-center">
                <div className="text-3xl">✅</div>
                <p className="mt-2 font-semibold">Enquiry sent!</p>
                <p className="mt-1 text-sm text-zinc-500">
                  Dealer will contact you soon.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="border-border-default mt-4 w-full rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Send an enquiry</h3>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-zinc-400 hover:text-zinc-600"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-3">
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={vehicle}
                      className="h-14 w-20 rounded-md object-cover"
                    />
                  ) : (
                    <div className="bg-surface-muted h-14 w-20 rounded-md" />
                  )}
                  <span className="text-sm font-medium">{vehicle}</span>
                </div>

                <label
                  htmlFor="enquiry-message"
                  className="mt-4 block text-sm font-medium"
                >
                  Your message to dealer
                </label>
                <textarea
                  id="enquiry-message"
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="border-border-default focus:border-brand-red focus:ring-brand-red/20 mt-1.5 block w-full rounded-md border px-3 py-2 text-sm outline-none focus:ring-2"
                />

                {error ? (
                  <p className="bg-brand-red/10 text-brand-red mt-2 rounded-md px-3 py-2 text-sm">
                    {error}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={pending || !message.trim()}
                  className="bg-brand-red hover:bg-brand-red-dark mt-4 w-full rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {pending ? "Sending…" : "Send"}
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
