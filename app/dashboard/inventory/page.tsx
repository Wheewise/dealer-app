import type { Metadata } from "next";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import type { Vehicle } from "@wheewise/supabase";
import { MarkSoldButton } from "./MarkSoldButton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function InventoryPage() {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase);

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .eq("dealer_id", dealer.id)
    .order("created_at", { ascending: false })
    .returns<Vehicle[]>();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">My listings</h1>
      {!vehicles || vehicles.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">You haven't listed any vehicles yet.</p>
      ) : (
        <div className="mt-6 divide-y divide-border-default border-t border-border-default">
          {vehicles.map((v) => (
            <div key={v.id} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {v.make} {v.model} ({v.year})
                </p>
                <p className="text-sm text-zinc-500">
                  {v.city} · ₹{v.asking_price.toLocaleString("en-IN")} ·{" "}
                  <span className={v.status === "SOLD" ? "text-danger" : "text-zinc-500"}>{v.status}</span>
                </p>
              </div>
              {v.status !== "SOLD" ? <MarkSoldButton vehicleId={v.id} /> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
