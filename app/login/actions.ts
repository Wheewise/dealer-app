"use server";

import { createServerSupabaseClient } from "@wheewise/supabase/server";

export type PasswordCheckState =
  | { ok: true; phone: string | null }
  | { ok: false; error: string };

/**
 * Checks the password is correct without keeping the session it creates —
 * this app treats OTP as the real second factor, so no session should
 * exist until verifyLoginOtp succeeds. Sign in, confirm it worked, sign
 * straight back out.
 *
 * Returns `auth.users.phone` (from `data.user`), NOT `profiles.phone` —
 * they can differ. `profiles.phone` is just contact info collected at
 * signup; `signInWithOtp({ phone })` only works once that number has been
 * confirmed with Supabase itself (via the dashboard's one-time "verify
 * your phone" step, which is what actually sets `auth.users.phone`).
 * Offering the Mobile option based on `profiles.phone` let it show up
 * before it could work, always failing with "Signups not allowed for
 * otp" — Supabase's phone-OTP falling back to a signup attempt (blocked,
 * since this app disables open signups) when it can't find an existing
 * user by that phone number.
 */
export async function checkPassword(
  email: string,
  password: string,
  turnstileToken: string,
): Promise<PasswordCheckState> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: { captchaToken: turnstileToken },
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase.auth.signOut();
  return { ok: true, phone: data.user.phone || null };
}

export type OtpChannel = "email" | "sms";

export type OtpSendState = { ok: true } | { ok: false; error: string };

export async function sendLoginOtp(
  contact: string,
  channel: OtpChannel,
  turnstileToken: string,
): Promise<OtpSendState> {
  const supabase = await createServerSupabaseClient();
  const { error } =
    channel === "email"
      ? await supabase.auth.signInWithOtp({
          email: contact,
          options: { shouldCreateUser: false, captchaToken: turnstileToken },
        })
      : await supabase.auth.signInWithOtp({
          phone: contact,
          options: { shouldCreateUser: false, channel: "sms", captchaToken: turnstileToken },
        });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export type OtpVerifyState = { ok: true } | { ok: false; error: string };

export async function verifyLoginOtp(
  contact: string,
  channel: OtpChannel,
  code: string,
): Promise<OtpVerifyState> {
  const supabase = await createServerSupabaseClient();
  const { error } =
    channel === "email"
      ? await supabase.auth.verifyOtp({ email: contact, token: code, type: "email" })
      : await supabase.auth.verifyOtp({ phone: contact, token: code, type: "sms" });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
