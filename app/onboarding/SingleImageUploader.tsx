"use client";

import { useCallback, useState } from "react";

export function SingleImageUploader({
  label,
  shape = "square",
  initialUrl,
  onChange,
}: {
  label: string;
  shape?: "square" | "circle" | "wide";
  initialUrl?: string;
  onChange: (url: string) => void;
}) {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setUploading(true);
      setError("");
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Upload failed");
        setUrl(body.url);
        onChange(body.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed. Try again.");
      } finally {
        setUploading(false);
      }
    },
    [onChange],
  );

  const previewClass =
    shape === "circle"
      ? "h-24 w-24 rounded-full"
      : shape === "wide"
        ? "aspect-[3/1] w-full rounded-lg"
        : "h-24 w-24 rounded-lg";

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={`${previewClass} border border-border-default object-cover`} />
      ) : (
        <div
          className={`${previewClass} flex items-center justify-center border border-dashed border-border-default bg-surface-muted text-xs text-zinc-400`}
        >
          No image
        </div>
      )}
      <input
        type="file"
        accept="image/*"
        disabled={uploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="block text-sm"
      />
      {uploading ? <p className="text-xs text-zinc-500">Uploading…</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
