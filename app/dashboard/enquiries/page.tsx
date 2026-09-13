import Link from "next/link";
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DealerEnquiriesPage() {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase);

  const { data: enquiries } = await supabase
    .from("enquiries")
    .select("id, created_at, test_drive_requested, vehicles(make, model, year), profiles(name)")
    .eq("dealer_id", dealer.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-xl font-semibold">Enquiries</h1>
      {!enquiries || enquiries.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">No enquiries yet — they'll show up here once a buyer messages you.</p>
      ) : (
        <div className="mt-6 divide-y divide-border-default rounded-lg border border-border-default">
          {enquiries.map((e) => {
            const vehicle = e.vehicles as unknown as { make: string; model: string; year: number };
            const buyer = e.profiles as unknown as { name: string };
            return (
              <Link
                key={e.id}
                href={`/dashboard/enquiries/${e.id}`}
                className="flex items-center justify-between gap-3 p-4 hover:bg-surface-muted"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </p>
                  <p className="text-sm text-zinc-500">{buyer.name}</p>
                </div>
                {e.test_drive_requested ? (
                  <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                    Test drive
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
