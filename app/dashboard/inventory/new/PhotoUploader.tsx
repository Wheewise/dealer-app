"use client";

import { useCallback, useState } from "react";

export function PhotoUploader({ onChange }: { onChange: (urls: string[]) => void }) {
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const uploadOne = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Upload failed");
    return body.url as string;
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      setError("");
      // In parallel, not one-at-a-time — sequential awaits meant N photos
      // took N round trips end-to-end instead of ~1.
      const results = await Promise.allSettled(Array.from(files).map(uploadOne));
      const uploaded = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      const failed = results.filter((r) => r.status === "rejected");
      if (uploaded.length) {
        const next = [...photos, ...uploaded];
        setPhotos(next);
        onChange(next);
      }
      if (failed.length) {
        const first = failed[0] as PromiseRejectedResult;
        const message = first.reason instanceof Error ? first.reason.message : "Upload failed";
        setError(failed.length === 1 ? message : `${failed.length} photos failed: ${message}`);
      }
      setUploading(false);
    },
    [photos, onChange, uploadOne],
  );

  return (
    <div className="space-y-3">
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={uploading}
        onChange={(e) => handleFiles(e.target.files)}
        className="block text-sm"
      />
      <p className="text-xs text-zinc-500">
        {uploading ? "Uploading…" : "Photos are stripped of location/device metadata and converted to WebP automatically."}
      </p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {photos.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={url} src={url} alt="" className="aspect-square rounded-md object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
