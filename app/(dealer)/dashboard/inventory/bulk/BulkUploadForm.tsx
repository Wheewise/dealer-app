"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Field";

type RowResult = { row: number; id?: string; error?: string };

export function BulkUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<{
    created: number;
    failed: number;
    results: RowResult[];
  } | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError("");
    setResults(null);

    try {
      const res = await fetch("/api/dealer/bulk-upload", {
        method: "POST",
        body: file,
      });
      const data = await res.json();
      if (res.ok) {
        setResults(data);
      } else {
        setError(data.error || "Upload failed");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="border-border-default bg-background rounded-lg border p-6">
        <div className="border-border-default bg-surface-muted mb-4 rounded-lg border p-4">
          <p className="text-sm font-semibold">CSV format</p>
          <p className="mt-1 text-xs text-zinc-500">
            Columns: vehicleType, make, model, year, fuelType, transmission, odometerKm,
            askingPrice, description, city
          </p>
          <a
            href="/api/dealer/bulk-upload"
            className="text-brand-red mt-2 inline-block text-xs font-medium hover:underline"
          >
            Download template CSV
          </a>
        </div>

        <div className="space-y-4">
          <label className="border-border-default bg-surface-muted flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
            <svg
              className="h-8 w-8 text-zinc-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-sm font-medium">
              {file ? file.name : "Choose a CSV file"}
            </span>
            <span className="text-xs text-zinc-500">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : "or drag and drop"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="text/csv,.csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {error ? (
            <p className="bg-brand-red/10 text-brand-red rounded-md px-3 py-2 text-sm">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={handleUpload}
            disabled={!file || uploading}
            className="w-full"
          >
            {uploading ? "Uploading…" : "Upload CSV"}
          </Button>
        </div>
      </div>

      {results ? (
        <div className="border-border-default bg-background rounded-lg border p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
              {results.created} created
            </div>
            {results.failed > 0 ? (
              <div className="text-brand-red bg-brand-red/10 rounded-md px-3 py-2 text-sm font-semibold">
                {results.failed} failed
              </div>
            ) : null}
          </div>
          {results.results.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium text-zinc-500">
                    <th className="pb-2">Row</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.results.map((r) => (
                    <tr key={r.row} className="border-b last:border-0">
                      <td className="py-2 text-xs">Row {r.row}</td>
                      <td className="py-2">
                        {r.id ? (
                          <span className="text-xs text-emerald-700">✓ Created</span>
                        ) : (
                          <span className="text-brand-red text-xs">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
