import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { requireDealerContext } from "@wheewise/rbac";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { dealer } = await requireDealerContext(supabase);

  if (!dealer.onboarded) redirect("/onboarding");

  return <>{children}</>;
}
