import { redirect } from "next/navigation";

/**
 * This app is served on its own subdomain, so its root has no landing page of
 * its own — send visitors straight to the console. Authorization happens in
 * the target's layout, not here.
 */
export default function RootPage() {
  redirect("/dashboard");
}
