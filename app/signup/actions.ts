"use server";

import { createServerSupabaseClient } from "@wheewise/supabase/server";
import { verifyGst } from "@/lib/gst";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  businessName: z.string().min(1),
  gstNumber: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Enter a valid 15-character GSTIN"),
  email: z.string().email(),
  password: z.string().min(8),
  city: z.string().min(1),
  phone: z.string().min(10),
  turnstileToken: z.string(),
});

export type SignupState =
  | { ok: true; needsConfirmation: boolean }
  | { ok: false; errors: Record<string, string[]>; formError?: string };

export async function signupDealer(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.flatten().fieldErrors };
  }
  const { name, businessName, gstNumber, email, password, city, phone, turnstileToken } =
    parsed.data;

  // Turnstile is verified server-side by Supabase itself when signUp() is
  // called below (options.captchaToken) — do not also verify it
  // independently here: Turnstile tokens are single-use, so a separate
  // check would consume it and make Supabase's own verification fail on
  // the same request.

  // GST verification is skipped entirely while no provider is configured
  // (GSTINAPI_KEY unset) — dealers land as PENDING_VERIFICATION instead of
  // ACTIVE rather than the signup being blocked outright. The moment a real
  // key is added, this reverts to full strict verification automatically —
  // no separate flag to remember to flip back.
  const gstConfigured = Boolean(process.env.GSTINAPI_KEY);
  let gstVerifiedAt: string | null = null;
  let dealerStatus: "ACTIVE" | "PENDING_VERIFICATION" = "PENDING_VERIFICATION";

  if (gstConfigured) {
    const gst = await verifyGst(gstNumber);
    if (!gst) {
      return {
        ok: false,
        errors: {},
        formError: "GST verification is temporarily unavailable. Try again shortly.",
      };
    }
    if (!gst.verified) {
      return {
        ok: false,
        errors: { gstNumber: [`GSTIN status is "${gst.status}" — must be Active to register.`] },
      };
    }
    gstVerifiedAt = new Date().toISOString();
    dealerStatus = "ACTIVE";
  }

  const supabase = await createServerSupabaseClient();

  // Neither the profile nor the dealers row is created here — with email
  // confirmation enabled, signUp() returns no active session yet, so
  // there's no auth.uid() for RLS to check. Metadata travels with the auth
  // user instead, and `on_auth_user_confirmed` (see supabase/migrations)
  // creates both rows the moment the confirmation link is actually clicked.
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken: turnstileToken,
      // Without this, the confirmation link falls back to Supabase's single
      // Site URL (wheewise.com) regardless of which app the dealer signed
      // up on — this is what actually sends them back to dealer.wheewise.com.
      emailRedirectTo: `${process.env.APP_URL}/login`,
      data: {
        role: "DEALER",
        name,
        phone,
        businessName,
        gstNumber,
        city,
        gstVerifiedAt: gstVerifiedAt ?? "",
        dealerStatus,
      },
    },
  });
  if (signUpError || !signUpData.user) {
    return { ok: false, errors: {}, formError: signUpError?.message ?? "Signup failed." };
  }

  return { ok: true, needsConfirmation: !signUpData.session };
}
