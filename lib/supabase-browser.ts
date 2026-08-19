import { createClient } from "@supabase/supabase-js";

// This browser client is used solely to request and verify dealer email OTPs.
// It has only the public anon key; all role authorization happens server-side.
export const supabaseBrowser = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
