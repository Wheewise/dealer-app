import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { apiRequireDealer } from "@/lib/rbac";
import { ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES } from "@/lib/uploads";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const gate = await apiRequireDealer({ write: true });
  if (!gate.ok) return gate.response;

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_PHOTO_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Only JPEG, PNG, or WebP allowed" },
      { status: 400 },
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "File too large (max 8 MB)" }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 5);
  const key = `listings/${gate.ctx.userId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Blob upload failed:", error);
    return NextResponse.json(
      { error: "Storage is not configured. Contact support." },
      { status: 503 },
    );
  }
}
