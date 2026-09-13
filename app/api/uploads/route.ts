import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { uploadVehiclePhoto } from "@/lib/r2";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase, { write: true }).catch(() => ({
    dealer: null,
  }));
  if (!dealer) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return Response.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File too large (max 8MB)" }, { status: 400 });
  }

  try {
    const url = await uploadVehiclePhoto(dealer.id, file);
    return Response.json({ url });
  } catch (err) {
    // Surfacing the real message (e.g. R2's "SignatureDoesNotMatch") instead
    // of a blanket 500 — that message doesn't leak secrets, and it's the
    // only way to tell a bad env var apart from a network blip from the UI.
    const message = err instanceof Error ? err.message : "Upload failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
