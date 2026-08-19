"use client";

import { useState } from "react";
import { requestTestDrive } from "@/lib/actions/testdrive";

const SLOTS = {
  Morning: ["09:00", "10:00", "11:00"],
  Afternoon: ["12:00", "14:00", "15:00", "16:00"],
  Evening: ["17:00", "18:00"],
} as const;

function formatSlot(slot: string): string {
  const [h] = slot.split(":").map(Number);
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${h < 12 ? "AM" : "PM"}`;
}

export function TestDriveModal({
  listingId,
  vehicleName,
  onClose,
}: {
  listingId: string;
  vehicleName: string;
  onClose: () => void;
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [todayStr] = useState(() => new Date().toISOString().split("T")[0]);
  const [maxStr] = useState(
    () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );

  async function handleSubmit() {
    if (!date || !time) return;
    setLoading(true);
    setError(null);

    const scheduledAt = new Date(`${date}T${time}:00`);
    const result = await requestTestDrive(listingId, scheduledAt, notes);

    setLoading(false);
    if (result.ok) {
      setSuccess(true);
    } else {
      setError(result.error);
    }
  }

  if (success) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        onClick={onClose}
      >
        <div
          className="bg-background w-full max-w-sm rounded-t-2xl p-8 text-center sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 text-5xl">🎉</div>
          <h3 className="text-lg font-bold">Test Drive Requested!</h3>
          <p className="mt-2 text-sm text-zinc-500">
            Test drive requested for {date} at {formatSlot(time)}! Dealer will confirm
            shortly.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="bg-brand-red hover:bg-brand-red-dark mt-6 w-full rounded-xl py-3 font-medium text-white"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      onClick={onClose}
    >
      <div
        className="bg-background max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold">Book Test Drive</h3>
            <p className="mt-1 text-sm text-zinc-500">{vehicleName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl text-zinc-500 hover:text-zinc-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label htmlFor="td-date" className="mb-2 block text-sm font-medium">
            Select Date
          </label>
          <input
            id="td-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={todayStr}
            max={maxStr}
            className="border-border-default focus:border-brand-red w-full rounded-xl border px-4 py-3 outline-none"
          />
        </div>

        <div className="mb-4">
          <span className="mb-2 block text-sm font-medium">Select Time</span>
          {Object.entries(SLOTS).map(([period, slots]) => (
            <div key={period} className="mb-3">
              <p className="mb-1.5 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                {period}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setTime(slot)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      time === slot
                        ? "bg-brand-red text-white"
                        : "bg-surface-muted text-zinc-500 hover:text-foreground"
                    }`}
                  >
                    {formatSlot(slot)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mb-6">
          <label htmlFor="td-notes" className="mb-2 block text-sm font-medium">
            Notes (optional)
          </label>
          <textarea
            id="td-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything specific you want to check?"
            rows={3}
            className="border-border-default focus:border-brand-red w-full resize-none rounded-xl border px-4 py-3 outline-none"
          />
        </div>

        {error ? (
          <p className="bg-brand-red/10 text-brand-red mb-4 rounded-md px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!date || !time || loading}
          className="bg-brand-red hover:bg-brand-red-dark w-full rounded-xl py-3 font-bold text-white transition-colors disabled:opacity-50"
        >
          {loading ? "Requesting…" : "Request Test Drive"}
        </button>
      </div>
    </div>
  );
}
