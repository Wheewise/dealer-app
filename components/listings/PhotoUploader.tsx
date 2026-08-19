"use client";

import { useState, useRef } from "react";
import { compressImage } from "@/lib/image";
import { uploadPhoto } from "@/lib/uploads";

type Photo = { url: string; uploading?: boolean; error?: string };

export function PhotoUploader({
  initialPhotos = [],
  name = "photoUrls",
}: {
  initialPhotos?: string[];
  name?: string;
}) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos.map((url) => ({ url })));
  const fileInput = useRef<HTMLInputElement>(null);

  async function uploadOne(file: File): Promise<string> {
    const compressed = await compressImage(file);
    return uploadPhoto(compressed, "photo.webp");
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = 10 - photos.length;
    const toUpload = Array.from(files).slice(0, remaining);

    setPhotos((prev) => [
      ...prev,
      ...toUpload.map((f) => ({ url: URL.createObjectURL(f), uploading: true })),
    ]);

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      try {
        const url = await uploadOne(file);
        setPhotos((prev) => {
          const next = [...prev];
          const tempIndex = next.findIndex(
            (p) => p.uploading && p.url.startsWith("blob:"),
          );
          if (tempIndex !== -1) {
            next[tempIndex] = { url };
          }
          return next;
        });
      } catch (err) {
        setPhotos((prev) => {
          const next = [...prev];
          const tempIndex = next.findIndex(
            (p) => p.uploading && p.url.startsWith("blob:"),
          );
          if (tempIndex !== -1) {
            next[tempIndex] = {
              url: next[tempIndex].url,
              error: err instanceof Error ? err.message : "Upload failed",
            };
          }
          return next;
        });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  }

  function removeAt(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

  function moveLeft(idx: number) {
    if (idx === 0) return;
    setPhotos((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  const uploadable = photos.filter((p) => !p.uploading && !p.error);

  return (
    <div className="space-y-3">
      {uploadable.map((p) => (
        <input key={p.url} type="hidden" name={name} value={p.url} />
      ))}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {photos.map((p, i) => (
          <div
            key={`${p.url}-${i}`}
            className="group border-border-default bg-surface-muted relative aspect-square overflow-hidden rounded-md border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt=""
              className={`h-full w-full object-cover ${p.uploading ? "opacity-50" : ""}`}
            />
            {p.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
                Uploading…
              </div>
            ) : null}
            {p.error ? (
              <div className="bg-brand-red/80 absolute inset-0 flex items-center justify-center px-2 text-center text-xs text-white">
                {p.error}
              </div>
            ) : null}
            {i === 0 && !p.uploading ? (
              <span className="bg-brand-red absolute top-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-white uppercase">
                Cover
              </span>
            ) : null}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {i > 0 && !p.uploading ? (
                <button
                  type="button"
                  onClick={() => moveLeft(i)}
                  className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
                >
                  ←
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {photos.length < 10 ? (
          <label className="border-border-default bg-background hover:bg-surface-muted flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-center text-xs text-zinc-500">
            <span className="text-lg">+</span>
            <span>Add photo</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        ) : null}
      </div>
      <p className="text-xs text-zinc-500">
        Up to 10 photos, JPG/PNG/WebP, 8 MB each. First photo is the cover.
      </p>
    </div>
  );
}
