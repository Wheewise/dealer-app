"use client";

import { SignOutButton } from "@wheewise/ui";
import { createBrowserSupabaseClient } from "@wheewise/supabase";

export function HeaderSignOut() {
  return (
    <SignOutButton signOut={async () => { await createBrowserSupabaseClient().auth.signOut(); }} />
  );
}
