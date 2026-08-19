"use client";

import { useState } from "react";

export type InquiryListingOption = {
  id: string;
  label: string;
};

type Props = {
  listings: InquiryListingOption[];
  defaultListingId?: string;
  accent: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; id: string }
  | { kind: "error"; message: string };

export function StorefrontInquiryForm({ listings, defaultListingId, accent }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [listingId, setListingId] = useState(defaultListingId ?? listings[0]?.id ?? "");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listingId) {
      setStatus({
        kind: "error",
        message: "This showroom has no active listings to enquire about yet.",
      });
      return;
    }
    setStatus({ kind: "submitting" });
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          buyerName: name,
          buyerPhone: phone,
          buyerEmail: email || undefined,
          message: message || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          res.status === 429
            ? "Too many enquiries. Please try again in an hour."
            : (body?.error as string | undefined) ||
              "Something went wrong sending your enquiry.";
        setStatus({ kind: "error", message: msg });
        return;
      }
      setStatus({ kind: "success", id: body.id });
      setName("");
      setPhone("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus({
        kind: "error",
        message: "Network error. Please check your connection and retry.",
      });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="border-border-default bg-background mx-auto max-w-3xl rounded-2xl border p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-7 w-7 text-emerald-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="mt-4 text-xl font-bold tracking-tight">Enquiry sent</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          The dealer has been notified and will reach out shortly.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-border-default bg-background mx-auto max-w-3xl rounded-2xl border p-6 shadow-sm sm:p-8"
    >
      <div className="mb-5">
        <div
          className="inline-block rounded-full px-3 py-1 text-[11px] font-bold tracking-widest text-white uppercase"
          style={{ backgroundColor: accent }}
        >
          Contact
        </div>
        <h2 className="mt-2 text-2xl font-bold tracking-tight">Get in touch</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Send a quick enquiry — the dealer typically replies the same day.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" required>
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-border-default bg-background block w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
            style={{ outlineColor: accent }}
          />
        </Field>
        <Field label="Phone" required>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 9XXXX XXXXX"
            pattern="[+\d\s\-]{7,20}"
            className="border-border-default bg-background block w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </Field>
        <Field label="Email (optional)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-border-default bg-background block w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </Field>
        <Field label="About">
          <select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className="border-border-default bg-background block w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          >
            {listings.length === 0 ? (
              <option value="">No active listings</option>
            ) : (
              listings.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))
            )}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Message (optional)">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Anything specific you're looking for?"
            className="border-border-default bg-background block w-full rounded-md border px-3 py-2 text-sm focus:ring-2 focus:outline-none"
          />
        </Field>
      </div>

      {status.kind === "error" ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
          {status.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={status.kind === "submitting" || listings.length === 0}
        className="mt-5 w-full rounded-full px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
        style={{ backgroundColor: accent }}
      >
        {status.kind === "submitting" ? "Sending…" : "Send enquiry"}
      </button>

      <p className="mt-3 text-center text-[11px] text-zinc-500">
        By submitting, you agree to share your contact details with this dealer.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold tracking-widest text-zinc-500 uppercase">
        {label}
        {required ? " *" : ""}
      </span>
      {children}
    </label>
  );
}
