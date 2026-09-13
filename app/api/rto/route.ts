import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { fetchRto } from "@/lib/rto";

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const ctx = await requireDealerContext(supabase, { write: true }).catch(() => null);
  if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const reg = new URL(request.url).searchParams.get("reg");
  if (!reg) return Response.json({ error: "Missing reg number" }, { status: 400 });

  const vehicle = await fetchRto(reg);
  if (!vehicle) {
    return Response.json(
      { error: "Vehicle not found or RTO lookup is not configured yet" },
      { status: 503 },
    );
  }
  return Response.json(vehicle);
}
