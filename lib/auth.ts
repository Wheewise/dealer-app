import "./env";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, unwrap, unwrapMaybe } from "./db";
import { verifyOtp } from "./otp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  dev: z.coerce.boolean().optional(),
});

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
      options: { domain: process.env.AUTH_COOKIE_DOMAIN || undefined },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        phone: { label: "Phone", type: "tel" },
        otp: { label: "OTP", type: "text" },
        dev: { label: "Dev", type: "checkbox" },
      },
      async authorize(creds) {
        // Phone OTP flow
        if (creds.phone && creds.otp) {
          const parsed = otpSchema.safeParse(creds);
          if (!parsed.success) return null;

          const valid = await verifyOtp(parsed.data.phone, parsed.data.otp);
          if (!valid) return null;

          const normalized = normalizePhone(parsed.data.phone);
          const existing = unwrapMaybe(
            await db
              .from("User")
              .select("id, email, name, role")
              .eq("phone", normalized)
              .maybeSingle(),
            "auth: lookup by phone",
          );

          if (existing) {
            return {
              id: existing.id,
              email: null,
              name: existing.name ?? `User ${normalized.slice(-4)}`,
              role: existing.role,
            };
          }

          // Auto-create buyer account for new phone numbers (no email for phone-only users)
          const user = unwrap(
            await db
              .from("User")
              .insert({
                email: null,
                phone: normalized,
                passwordHash: "",
                name: `User ${normalized.slice(-4)}`,
                role: "BUYER",
              })
              .select("id, email, name, role")
              .single(),
            "auth: create phone user",
          );

          return {
            id: user.id,
            // NextAuth requires a non-null email; use phone as synthetic identifier
            email: user.email ?? `${normalized}@wheewise.phone`,
            name: user.name,
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

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
          };
        }

        // Email/password flow
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        const user = unwrapMaybe(
          await db
            .from("User")
            .select("id, email, name, role, passwordHash")
            .eq("email", parsed.data.email)
            .maybeSingle(),
          "auth: lookup by email",
        );
        if (!user || !user.passwordHash) return null;

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
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
