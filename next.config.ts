import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@wheewise/supabase", "@wheewise/rbac", "@wheewise/ui", "@wheewise/neon"],
  // Client code reads the NEXT_PUBLIC_ names (Next.js only inlines those
  // into the browser bundle) but Vercel still holds the values under the
  // original unprefixed names — alias them here instead of renaming/adding
  // env vars in Vercel.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.TURNSTILE_SITE_KEY,
  },
};

export default nextConfig;
