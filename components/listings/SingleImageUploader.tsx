"use client";

import { useState } from "react";
import { uploadPhoto } from "@/lib/uploads";

export function SingleImageUploader({
  name,
  initialUrl = "",
  aspectClass = "aspect-square",
}: {
  name: string;
  initialUrl?: string;
  aspectClass?: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const uploadedUrl = await uploadPhoto(file, file.name);
      setUrl(uploadedUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={url} />
      <div className="flex items-start gap-4">
        <div
          className={`relative w-40 ${aspectClass} border-border-default bg-surface-muted overflow-hidden rounded-md border`}
        >
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
              No image
            </div>
          )}
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs text-white">
              Uploading…
            </div>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <label className="border-border-default bg-background hover:bg-surface-muted inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-1.5 text-sm">
            {url ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {url ? (
            <button
              type="button"
              onClick={() => setUrl("")}
              className="hover:text-brand-red text-xs text-zinc-500"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="text-brand-red text-xs">{error}</p> : null}
    </div>
  );
}
