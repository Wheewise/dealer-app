"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, isUniqueViolation, unwrap, unwrapMaybe } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { roleRedirectPath, safeCallbackPath } from "@/lib/role-redirect";

import { passwordRule } from "@/lib/password";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/rbac";
import {
  TURNSTILE_ACTIONS,
  TURNSTILE_FIELD,
  verifyTurnstile,
} from "@/lib/turnstile";
import { getClientIpFromHeaders as clientIp } from "@/lib/rate-limit";

const baseSignupSchema = z.object({
  name: z.string().min(2, "Name is too short"),
  email: z.string().email("Enter a valid email"),
  password: passwordRule,
});

const phoneField = z
  .string()
  .min(10, "Phone must be at least 10 digits")
  .regex(/^[+\d\s-]+$/, "Use digits, spaces, + or -");

const buyerSignupSchema = baseSignupSchema
  .extend({
    phone: phoneField,
    confirmPassword: z.string().min(1, "Confirm your password"),
    district: z.string().min(2, "District is required"),
    state: z.string().min(2, "State is required"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, "").slice(-10);
}

const dealerSignupSchema = baseSignupSchema.extend({
  businessName: z.string().min(2, "Business name is required"),
  city: z.string().min(2, "City is required"),
  phone: phoneField,
  whatsapp: z.string().optional(),
});

export type SignupState = { ok: false; errors: Record<string, string[]> } | { ok: true };

function flattenErrors(error: z.ZodError): Record<string, string[]> {
  return z.flattenError(error).fieldErrors;
}

export async function signupBuyer(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  // Fake-account creation is the abuse this blocks; it runs before any
  // database work so a bot cannot even probe for taken emails.
  const captcha = await verifyTurnstile(formData.get(TURNSTILE_FIELD), {
    remoteIp: clientIp(await headers()),
    expectedAction: TURNSTILE_ACTIONS.signupBuyer,
  });
  if (!captcha.ok) {
    return { ok: false, errors: { form: ["Verification failed. Please refresh and try again."] } };
  }

  const parsed = buyerSignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    district: formData.get("district"),
    state: formData.get("state"),
  });
  if (!parsed.success) {
    return { ok: false, errors: flattenErrors(parsed.error) };
  }

  const normalizedPhone = normalizePhone(parsed.data.phone);

  const clashes = unwrap(
    await db
      .from("User")
      .select("email, phone")
      .or(`email.eq.${parsed.data.email},phone.eq.${normalizedPhone}`),
    "signupBuyer: clash check",
  );
  if (clashes.some((u) => u.email === parsed.data.email)) {
    return { ok: false, errors: { email: ["Email already in use"] } };
  }
  if (clashes.some((u) => u.phone === normalizedPhone)) {
    return { ok: false, errors: { phone: ["Phone number already in use"] } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  // The check above races; the unique indexes are what actually decide, so a
  // concurrent signup surfaces as the same field error rather than a 500.
  const { error: insertError } = await db.from("User").insert({
    email: parsed.data.email,
    phone: normalizedPhone,
    name: parsed.data.name,
    passwordHash,
    district: parsed.data.district,
    state: parsed.data.state,
    role: "BUYER",
  });
  if (insertError) {
    if (isUniqueViolation(insertError)) {
      const field = insertError.message.includes("phone") ? "phone" : "email";
      return {
        ok: false,
        errors: {
          [field]: [
            field === "phone" ? "Phone number already in use" : "Email already in use",
          ],
        },
      };
    }
    console.error("[signupBuyer] user insert failed:", insertError);
    throw new Error(insertError.message);
  }

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  redirect("/browse?welcome=1");
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

async function generateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "store";
  let slug = root;
  let i = 1;
  while (
    unwrapMaybe(
      await db.from("Store").select("id").eq("slug", slug).maybeSingle(),
      "generateUniqueSlug",
    )
  ) {
    slug = `${root}-${++i}`;
  }
  return slug;
}

export async function signupDealer(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
  const captcha = await verifyTurnstile(formData.get(TURNSTILE_FIELD), {
    remoteIp: clientIp(await headers()),
    expectedAction: TURNSTILE_ACTIONS.signupDealer,
  });
  if (!captcha.ok) {
    return { ok: false, errors: { form: ["Verification failed. Please refresh and try again."] } };
  }

  const parsed = dealerSignupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    businessName: formData.get("businessName"),
    city: formData.get("city"),
    phone: formData.get("phone"),
    whatsapp: formData.get("whatsapp") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, errors: flattenErrors(parsed.error) };
  }

  let existing;
  try {
    existing = unwrapMaybe(
      await db.from("User").select("id").eq("email", parsed.data.email).maybeSingle(),
      "signupDealer: email check",
    );
  } catch (err) {
    console.error("[signupDealer] lookup(user by email) failed:", err);
    throw err;
  }
  if (existing) {
    return { ok: false, errors: { email: ["Email already in use"] } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  // Four separate INSERTs rather than one nested write: PostgREST has no
  // interactive transaction. Deleting the User cascades to Dealer, Store and
  // Subscription, so it is the single compensating action if a later step
  // fails.
  const deleteUser = async (userId: string, stage: string) => {
    const { error } = await db.from("User").delete().eq("id", userId);
    if (error) {
      console.error(`[signupDealer] cleanup after ${stage} also failed:`, error);
    }
  };

  const userResult = await db
    .from("User")
    .insert({
      email: parsed.data.email,
      name: parsed.data.name,
      passwordHash,
      role: "DEALER",
    })
    .select("id")
    .single();
  if (userResult.error) {
    console.error("[signupDealer] user insert failed:", userResult.error);
    if (isUniqueViolation(userResult.error)) {
      return { ok: false, errors: { email: ["Email already in use"] } };
    }
    throw new Error(userResult.error.message);
  }
  const user = userResult.data;

  const dealerResult = await db
    .from("Dealer")
    .insert({
      userId: user.id,
      businessName: parsed.data.businessName,
      city: parsed.data.city,
      phone: parsed.data.phone,
      whatsapp: parsed.data.whatsapp,
    })
    .select("id")
    .single();
  if (dealerResult.error) {
    console.error("[signupDealer] dealer insert failed:", dealerResult.error);
    await deleteUser(user.id, "dealer insert failure");
    throw new Error(dealerResult.error.message);
  }
  const dealer = dealerResult.data;

  const subscriptionResult = await db.from("Subscription").insert({
    dealerId: dealer.id,
    plan: "FREE_TRIAL",
    status: "TRIALING",
    currentPeriodEnd: trialEnds.toISOString(),
  });
  if (subscriptionResult.error) {
    console.error("[signupDealer] subscription insert failed:", subscriptionResult.error);
    await deleteUser(user.id, "subscription insert failure");
    throw new Error(subscriptionResult.error.message);
  }

  // Retry loop: handles the slug uniqueness race. `generateUniqueSlug` reads
  // then writes, so two dealers registering the same business name at once
  // can both pass the read. A crypto-random suffix keeps the retries from
  // colliding on the same value again.
  const MAX_ATTEMPTS = 5;
  let created = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = attempt > 0 ? `-${randomBytes(3).toString("hex")}` : "";
    const slug = (await generateUniqueSlug(parsed.data.businessName)) + suffix;

    const { error } = await db.from("Store").insert({ dealerId: dealer.id, slug });
    if (!error) {
      created = true;
      break;
    }
    console.error(
      `[signupDealer] store insert attempt ${attempt} failed (slug=${slug}):`,
      error,
    );
    if (isUniqueViolation(error)) continue;
    await deleteUser(user.id, "store insert failure");
    throw new Error(error.message);
  }

  if (!created) {
    // All retries collided. Surface as a form error rather than pretending success.
    await deleteUser(user.id, "slug exhaustion");
    return {
      ok: false,
      errors: {
        businessName: [
          "Could not allocate a unique storefront URL. Try a slightly different business name.",
        ],
      },
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (err) {
    console.error("[signupDealer] signIn after account creation failed:", err);
    throw err;
  }

  redirect("/dashboard/onboarding");
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginState = { ok: false; error: string } | undefined;

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid email and password." };
  }

  // Brute-force protection. The OTP routes were already rate limited; the
  // password path was not, leaving it open to credential stuffing and to
  // password spraying against a known address.
  //
  // Two buckets, because either alone is bypassable: an IP-only bucket is
  // defeated by a botnet, an email-only bucket by spraying many accounts
  // from one host.
  const ip = getClientIpFromHeaders(await headers());

  const captcha = await verifyTurnstile(formData.get(TURNSTILE_FIELD), {
    remoteIp: ip,
    expectedAction: TURNSTILE_ACTIONS.login,
  });
  if (!captcha.ok) {
    logSecurityEvent({
      type: "auth.login.failure",
      outcome: "deny",
      action: "login",
      reason: "captcha_failed",
    });
    return { ok: false, error: "Verification failed. Please refresh and try again." };
  }

  const emailKey = parsed.data.email.trim().toLowerCase();
  const [ipLimit, accountLimit] = await Promise.all([
    rateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000),
    rateLimit(`login:account:${emailKey}`, 5, 15 * 60 * 1000),
  ]);
  const blocked = !ipLimit.ok || !accountLimit.ok;
  if (blocked) {
    const retryAfter = Math.max(ipLimit.retryAfter, accountLimit.retryAfter);
    logSecurityEvent({
      type: "auth.rate_limited",
      outcome: "deny",
      action: "login",
      reason: ipLimit.ok ? "account_bucket" : "ip_bucket",
    });
    return {
      ok: false,
      error: `Too many sign-in attempts. Try again in ${retryAfter}s.`,
    };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    // The same message for "no such account" and "wrong password" — telling
    // the two apart is an account-enumeration oracle. The event log records
    // no email or password, only that a failure happened.
    logSecurityEvent({
      type: "auth.login.failure",
      outcome: "deny",
      action: "login",
      reason: "invalid_credentials",
    });
    return { ok: false, error: "Invalid email or password." };
  }

  const user = unwrapMaybe(
    await db.from("User").select("id, role").eq("email", parsed.data.email).maybeSingle(),
    "loginAction: post-signin lookup",
  );
  logSecurityEvent({
    type: "auth.login.success",
    outcome: "allow",
    userId: user?.id ?? null,
    role: user?.role ?? null,
    action: "login",
  });

  const callbackUrl = safeCallbackPath(formData.get("callbackUrl"));
  redirect(callbackUrl ?? roleRedirectPath(user?.role));
}
