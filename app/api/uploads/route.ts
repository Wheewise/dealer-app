import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES } from "@/lib/uploads";
import { buildPhotoKey, putObject, r2Configured } from "@/lib/storage";

export const runtime = "nodejs";

/**
 * Listing photo upload.
 *
 * Objects go to Cloudflare R2 and are served from the bucket's public
 * hostname, so delivery is on Cloudflare's CDN rather than through this app.
 *
 * Vercel Blob remains as a fallback purely so a deployment that has not yet
 * been given R2 credentials keeps working during the migration. It is
 * deprecated — once every environment has R2 configured, drop the branch and
 * the `@vercel/blob` dependency with it. Photos already stored on Blob keep
 * working regardless: the database holds absolute URLs, which are unaffected.
 */
export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // The declared MIME type is client-supplied and therefore only a first
  // filter; the magic-byte check below is what actually decides.
  if (!ALLOWED_PHOTO_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WebP allowed" },
      { status: 400 },
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Content sniffing: a client can claim `image/png` while uploading anything
  // at all. Since these objects are served from a hostname we control, letting
  // an attacker place arbitrary content there is worth preventing.
  const sniffed = sniffImageType(bytes);
  if (!sniffed) {
    return NextResponse.json(
      { error: "File content is not a valid JPEG, PNG, or WebP image" },
      { status: 400 },
    );
  }

  const ext = sniffed === "image/jpeg" ? "jpg" : sniffed === "image/png" ? "png" : "webp";
  const key = buildPhotoKey(gate.ctx.userId, ext);

  if (r2Configured()) {
    try {
      const url = await putObject(key, bytes, sniffed);
      return NextResponse.json({ url });
    } catch (error) {
      console.error("R2 upload failed:", error);
      return NextResponse.json(
        { error: "Storage is unavailable. Try again shortly." },
        { status: 503 },
      );
    }
  }

  // --- Deprecated Vercel Blob fallback ---
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { put } = await import("@vercel/blob");
      const blob = await put(key, new Blob([bytes], { type: sniffed }), {
        access: "public",
        contentType: sniffed,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
      return NextResponse.json({ url: blob.url });
    } catch (error) {
      console.error("Blob upload failed:", error);
      return NextResponse.json(
        { error: "Storage is unavailable. Try again shortly." },
        { status: 503 },
      );
    }
  }

  return NextResponse.json(
    { error: "Storage is not configured. Contact support." },
    { status: 503 },
  );
}

/**
 * Identifies an image by its magic bytes, returning the true MIME type or null.
 * Only the three formats the product accepts are recognised.
 */
function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && PNG.every((b, i) => bytes[i] === b)) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
