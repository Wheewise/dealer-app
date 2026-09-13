"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { insertNotification } from "@wheewise/neon";

export async function markVehicleSold(vehicleId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase, { write: true });

  // "vehicles: dealer updates own" (RLS) already scopes this to the
  // dealer's own rows — dealer_id here is defense in depth, not the only
  // check, and rules out one dealer accidentally hitting another's vehicle.
  const { data: vehicle, error } = await supabase
    .from("vehicles")
    .update({ status: "SOLD" })
    .eq("id", vehicleId)
    .eq("dealer_id", dealer.id)
    .select("make, model")
    .single();

  if (error) return { ok: false, error: error.message };

  // No same-database trigger can do this anymore — notifications moved to
  // Neon, a separate database a Supabase trigger can't reach. "wishlists:
  // dealer reads for own vehicles" (RLS) lets a dealer see who wishlisted
  // their own vehicle, nothing more, which is what authorizes this read.
  if (vehicle) {
    const { data: wishlisters } = await supabase.from("wishlists").select("buyer_id").eq("vehicle_id", vehicleId);
    await Promise.all(
      (wishlisters ?? []).map((w) =>
        insertNotification(
          w.buyer_id,
          "VEHICLE_SOLD",
          `${vehicle.make} ${vehicle.model} — sold`,
          "A vehicle on your wishlist just sold. Browse similar listings for something else you might like.",
          null,
        ),
      ),
    );
  }

  revalidatePath("/dashboard/inventory");
  return { ok: true };
}
