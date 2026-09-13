import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dealer, Profile, UserRole } from "@wheewise/supabase";

/**
 * Loads the caller's profile from the database — never trusts a client-
 * supplied role. Redirects to /login if there's no session at all.
 */
export async function requireAuthContext(
  supabase: SupabaseClient,
): Promise<{ userId: string; profile: Profile }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/login");

  return { userId: user.id, profile };
}

/**
 * Each app (user-app/dealer-app/association-app) only ever expects one
 * role — this is the per-app gate. A logged-in dealer visiting the buyer
 * app's account area, for example, gets redirected home rather than seeing
 * a role-mismatched UI.
 */
export async function requireRole(
  supabase: SupabaseClient,
  expectedRole: UserRole,
): Promise<{ userId: string; profile: Profile }> {
  const ctx = await requireAuthContext(supabase);
  if (ctx.profile.role !== expectedRole) redirect("/");
  return ctx;
}

/**
 * Dealer-app specific: loads the dealer row for the current user and
 * refuses a suspended dealer on write paths — mirrors the fix for the
 * "suspended dealers retained full write access" class of bug from the
 * prior build. Reads stay open (`write: false`) so billing/support remain
 * reachable even while suspended.
 */
export async function requireDealerContext(
  supabase: SupabaseClient,
  options: { write?: boolean } = {},
): Promise<{ userId: string; profile: Profile; dealer: Dealer }> {
  const { userId, profile } = await requireRole(supabase, "DEALER");

  const { data: dealer } = await supabase
    .from("dealers")
    .select("*")
    .eq("profile_id", userId)
    .single<Dealer>();

  if (!dealer) redirect("/onboarding");
  if (options.write && dealer.status === "SUSPENDED") {
    throw new Error("This dealer account is suspended and cannot make changes.");
  }

  return { userId, profile, dealer };
}
