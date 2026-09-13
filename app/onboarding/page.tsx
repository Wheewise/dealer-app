import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";
import { OnboardingForm } from "./OnboardingForm";

// Signed-in-only setup step — nothing here is worth a search engine
// indexing.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase);

  if (dealer.onboarded) redirect("/dashboard");

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-xl font-semibold">Set up your shop</h1>
      <p className="mt-1 mb-6 text-sm text-zinc-500">
        This is what buyers see on your public storefront — make it count.
      </p>
      <OnboardingForm defaultBusinessName={dealer.business_name} />
    </div>
  );
}
