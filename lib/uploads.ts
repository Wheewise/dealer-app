export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export const ALLOWED_PHOTO_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function uploadPhoto(file: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", file, filename);
  const res = await fetch("/api/uploads", { method: "POST", body: formData });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({}));
    throw new Error(error || "Upload failed");
  }
  const { url } = (await res.json()) as { url: string };
  return url;
}
