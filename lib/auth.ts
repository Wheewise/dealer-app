import "./env";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db, unwrap, unwrapMaybe } from "./db";
import { verifyOtp } from "./otp";

const APP_ROLE = "DEALER";

const supabaseTokenSchema = z.object({ supabaseAccessToken: z.string().min(20) });

const otpSchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6),
});

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

// No database adapter. Sessions are JWTs and the only provider is
// Credentials, which never consults an adapter — the User rows this reads
// live in Supabase and are written directly below.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  // Cross-subdomain sessions.
  //
  // The three role apps deploy to user/dealer/admin subdomains. Scoping the
  // session cookie to the parent domain (e.g. AUTH_COOKIE_DOMAIN=".wheewise.com")
  // lets one sign-in carry across all three; all three must then share the same
  // AUTH_SECRET so each can verify the JWT the others issued.
  //
  // Only the session cookie gets a Domain. Auth.js names the CSRF cookie with
  // the `__Host-` prefix under HTTPS, and that prefix *forbids* a Domain
  // attribute — browsers drop such a cookie outright, which would break login.
  // CSRF is per-origin anyway: each app validates its own sign-in POST.
  //
  // Auth.js deep-merges this over its defaults and skips `undefined`, so an
  // unset variable leaves stock single-host behaviour intact for local dev.
  cookies: {
    sessionToken: {
      name: "wheewise-dealer.session-token",
      options: {},
    },
  },
  providers: [
    Credentials({
      credentials: {
        phone: { label: "Phone", type: "tel" },
        otp: { label: "OTP", type: "text" },
        supabaseAccessToken: { label: "Supabase access token", type: "text" },
        dev: { label: "Dev", type: "checkbox" },
      },
      async authorize(creds) {
        // Email OTP is the recommended dealer sign-in route. The browser only
        // presents a Supabase token; its validity is checked here before the
        // user is matched to an existing dealer account.
        if (creds.supabaseAccessToken) {
          const parsed = supabaseTokenSchema.safeParse(creds);
          if (!parsed.success) return null;
          const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
          const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          if (!url || !anon) return null;
          const supabase = createClient(url, anon, { auth: { persistSession: false } });
          const { data, error } = await supabase.auth.getUser(parsed.data.supabaseAccessToken);
          const email = data.user?.email?.toLowerCase();
          if (error || !email) return null;
          const user = unwrapMaybe(
            await db.from("User").select("id, email, name, role").eq("email", email).maybeSingle(),
            "auth: dealer email lookup",
          );
          if (!user || user.role !== APP_ROLE) return null;
          return { id: user.id, email: user.email, name: user.name, role: user.role };
        }

        // SMS OTP remains available for a dealer's registered phone number.
        if (creds.phone && creds.otp) {
          const parsed = otpSchema.safeParse(creds);
          if (!parsed.success) return null;

          const valid = await verifyOtp(parsed.data.phone, parsed.data.otp);
          if (!valid) return null;

          const normalized = normalizePhone(parsed.data.phone);
          const dealer = unwrapMaybe(
            await db
              .from("Dealer")
              .select("phone, status, user:User(id, email, name, role)")
              .eq("phone", normalized)
              .maybeSingle(),
            "auth: dealer lookup by phone",
          );
          const user = Array.isArray(dealer?.user) ? dealer.user[0] : dealer?.user;

          if (!dealer || dealer.status !== "ACTIVE" || user?.role !== APP_ROLE) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? `Dealer ${normalized.slice(-4)}`,
            role: user.role,
          };
        }

        // Dev fast-login — requires BOTH WHEEWISE_DEV_LOGIN=1 AND NODE_ENV=development.
        // Never enabled in production / staging / preview. See env.ts boot guard.
        if (
          process.env.NODE_ENV === "development" &&
          process.env.WHEEWISE_DEV_LOGIN === "1" &&
          creds.dev
        ) {
          const devEmail = "dev@wheewise.local";
          let user = unwrapMaybe(
            await db
              .from("User")
              .select("id, email, name, role")
              .eq("email", devEmail)
              .maybeSingle(),
            "auth: dev user lookup",
          );

          if (!user) {
            user = unwrap(
              await db
                .from("User")
                .insert({
                  email: devEmail,
                  passwordHash: await bcrypt.hash("dev-pass-ignored", 10),
                  name: "Dev Dealer",
                  role: "DEALER",
                })
                .select("id, email, name, role")
                .single(),
              "auth: create dev user",
            );
          }

          // Ensure dealer + store records exist
          const dealer = unwrapMaybe(
            await db.from("Dealer").select("id").eq("userId", user.id).maybeSingle(),
            "auth: dev dealer lookup",
          );
          if (!dealer) {
            const created = unwrap(
              await db
                .from("Dealer")
                .insert({
                  userId: user.id,
                  businessName: "Dev Dealership",
                  city: "Bangalore",
                  phone: "9999999999",
                })
                .select("id")
                .single(),
              "auth: create dev dealer",
            );
            unwrap(
              await db
                .from("Store")
                .insert({ dealerId: created.id, slug: "dev-store" })
                .select("id")
                .single(),
              "auth: create dev store",
            );
          }

          if (user.role !== APP_ROLE) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
        if (token.role) session.user.role = token.role;
      }
      return session;
    },
  },
});
