import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { Button } from "@wheewise/ui";
import { PhoneVerification } from "./PhoneVerification";

// Signed-in-only, one dealer's own data — nothing here is ever the same
// page twice, so there's nothing worth a search engine indexing.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const { userId, dealer } = await requireDealerContext(supabase);

  const { count: listingCount } = await supabase
    .from("vehicles")
    .select("id", { count: "exact", head: true })
    .eq("dealer_id", dealer.id);

  // auth.users.phone (not profiles.phone) is what signInWithOtp({ phone })
  // actually checks — this tells us whether mobile OTP login is usable yet.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .single();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {!user?.phone && profile?.phone ? <PhoneVerification phone={profile.phone} /> : null}

      <h1 className="text-xl font-semibold">{dealer.business_name}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {listingCount ?? 0} listing{listingCount === 1 ? "" : "s"} · {dealer.city}
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/dashboard/inventory/new">
          <Button>Add a vehicle</Button>
        </Link>
        <Link href="/dashboard/inventory">
          <Button variant="outline">My listings</Button>
        </Link>
        <Link href="/dashboard/enquiries">
          <Button variant="outline">Enquiries</Button>
        </Link>
      </div>
    </div>
  );
}
