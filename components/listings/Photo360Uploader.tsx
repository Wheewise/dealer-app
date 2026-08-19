"use client";

import { useState, useRef } from "react";
import { compressImage } from "@/lib/image";
import { uploadPhoto } from "@/lib/uploads";

type Photo = { url: string; angle: number; uploading?: boolean; error?: string };

async function uploadOne(file: File): Promise<string> {
  const compressed = await compressImage(file);
  return uploadPhoto(compressed, "photo.webp");
}

export function Photo360Uploader({ name = "photo360Urls" }: { name?: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Assign angle from 0 to N-1 based on insertion order
    const baseAngle = photos.length;
    const toUpload = Array.from(files).slice(0, 24 - photos.length);

    setPhotos((prev) => [
      ...prev,
      ...toUpload.map((f, i) => ({
        url: URL.createObjectURL(f),
        angle: baseAngle + i,
        uploading: true,
      })),
    ]);

    for (let i = 0; i < toUpload.length; i++) {
      const file = toUpload[i];
      try {
        const url = await uploadOne(file);
        setPhotos((prev) => {
          const next = [...prev];
          const idx = next.findIndex(
            (p) => p.uploading && p.url.startsWith("blob:") && p.angle === baseAngle + i,
          );
          if (idx !== -1) next[idx] = { url, angle: next[idx].angle };
          return next;
        });
      } catch (err) {
        setPhotos((prev) => {
          const next = [...prev];
          const idx = next.findIndex(
            (p) => p.uploading && p.url.startsWith("blob:") && p.angle === baseAngle + i,
          );
          if (idx !== -1) {
            next[idx] = {
              ...next[idx],
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
    setPhotos((prev) =>
      prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, angle: i })),
    );
  }

  const uploadable = photos.filter((p) => !p.uploading && !p.error);

  return (
    <div className="space-y-3">
      {uploadable.map((p) => (
        <input
          key={`${p.url}`}
          type="hidden"
          name={name}
          value={JSON.stringify({ url: p.url, angle: p.angle })}
        />
      ))}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {photos.map((p, i) => (
          <div
            key={`${p.url}-${i}`}
            className="group border-border-default bg-surface-muted relative aspect-square overflow-hidden rounded-md border"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={`Angle ${p.angle}`}
              className={`h-full w-full object-cover ${p.uploading ? "opacity-50" : ""}`}
            />
            <span className="absolute top-0.5 left-0.5 rounded bg-black/70 px-1 text-[9px] text-white">
              {p.angle}°
            </span>
            {p.uploading ? (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white">
                …
              </div>
            ) : null}
            {p.error ? (
              <div className="bg-brand-red/80 absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] text-white">
                {p.error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => removeAt(i)}
              className="absolute top-0.5 right-0.5 rounded bg-black/70 px-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}

        {photos.length < 24 ? (
          <label className="border-border-default bg-background hover:bg-surface-muted flex aspect-square cursor-pointer flex-col items-center justify-center rounded-md border border-dashed text-center text-[10px] text-zinc-500">
            <span>+</span>
            <span>Add</span>
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
        Upload 24 photos for a 360° spin view. Shoot around the vehicle at equal
        intervals. Drag the photos to reorder.
      </p>
    </div>
  );
}
