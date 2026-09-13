"use client";

import { createBrowserClient } from "@supabase/ssr";

// Deliberately NOT the same SUPABASE_URL/SUPABASE_ANON_KEY the server client
// reads — this file runs in the browser, and Next.js only inlines an env
// var into the client bundle when it's named with the NEXT_PUBLIC_ prefix.
// Reading the unprefixed names here silently resolved to undefined at
// runtime, breaking every client-side auth call (sign-in, sign-out,
// password reset, Google OAuth) with no error until the "supabaseUrl is
// required" throw well after the button click. The anon key is meant to be
// public (RLS enforces access, not secrecy of this key), so exposing it via
// NEXT_PUBLIC_ isn't a security tradeoff — it's the value's designed use.
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
