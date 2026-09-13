// Deliberately client-safe only. Server-only code (createServerSupabaseClient,
// updateSession) lives at separate subpath exports — @wheewise/supabase/server
// and @wheewise/supabase/middleware — so a "use client" component can never
// accidentally pull `next/headers` into the browser bundle by importing this
// barrel file. Learned this the hard way on the first build check.
export * from "./browser-client";
export * from "./types";
