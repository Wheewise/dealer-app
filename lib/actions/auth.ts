"use server";

import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { signIn } from "@/lib/auth";
import { roleRedirectPath, safeCallbackPath } from "@/lib/role-redirect";

import { passwordRule } from "@/lib/password";
import { rateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/rbac";

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

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email: parsed.data.email }, { phone: normalizedPhone }] },
    select: { email: true, phone: true },
  });
  if (existing?.email === parsed.data.email) {
    return { ok: false, errors: { email: ["Email already in use"] } };
  }
  if (existing?.phone === normalizedPhone) {
    return { ok: false, errors: { phone: ["Phone number already in use"] } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      email: parsed.data.email,
      phone: normalizedPhone,
      name: parsed.data.name,
      passwordHash,
      district: parsed.data.district,
      state: parsed.data.state,
      role: "BUYER",
    },
  });

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
  while (await prisma.store.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${++i}`;
  }
  return slug;
}

export async function signupDealer(
  _prev: SignupState | undefined,
  formData: FormData,
): Promise<SignupState> {
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
    existing = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true },
    });
  } catch (err) {
    console.error("[signupDealer] findUnique(user by email) failed:", err);
    throw err;
  }
  if (existing) {
    return { ok: false, errors: { email: ["Email already in use"] } };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);

  // Sequential single-table creates rather than one nested User->Dealer->
  // Store/Subscription write: a nested create needs an interactive
  // transaction, which the Cloudflare Workers Neon HTTP adapter cannot do.
  // Each call below is one independent INSERT, so no transaction is needed.
  // `user.delete` cascades to Dealer/Store/Subscription (see schema), so it's
  // the single compensating action if a later step fails.
  let user;
  try {
    user = await prisma.user.create({
      data: {
        email: parsed.data.email,
        name: parsed.data.name,
        passwordHash,
        role: "DEALER",
      },
    });
  } catch (err) {
    console.error("[signupDealer] user.create failed:", err);
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, errors: { email: ["Email already in use"] } };
    }
    throw err;
  }

  let dealer;
  try {
    dealer = await prisma.dealer.create({
      data: {
        userId: user.id,
        businessName: parsed.data.businessName,
        city: parsed.data.city,
        phone: parsed.data.phone,
        whatsapp: parsed.data.whatsapp,
      },
    });
  } catch (err) {
    console.error("[signupDealer] dealer.create failed:", err);
    await prisma.user.delete({ where: { id: user.id } }).catch((cleanupErr) => {
      console.error("[signupDealer] cleanup after dealer.create failure also failed:", cleanupErr);
    });
    throw err;
  }

  try {
    await prisma.subscription.create({
      data: {
        dealerId: dealer.id,
        plan: "FREE_TRIAL",
        status: "TRIALING",
        currentPeriodEnd: trialEnds,
      },
    });
  } catch (err) {
    console.error("[signupDealer] subscription.create failed:", err);
    await prisma.user.delete({ where: { id: user.id } }).catch((cleanupErr) => {
      console.error(
        "[signupDealer] cleanup after subscription.create failure also failed:",
        cleanupErr,
      );
    });
    throw err;
  }

  // Retry loop: handles slug uniqueness race condition (P2002 unique constraint violation).
  // Crypto-random suffix avoids predictable retries that could collide again.
  const MAX_ATTEMPTS = 5;
  let created = false;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const suffix = attempt > 0 ? `-${randomBytes(3).toString("hex")}` : "";
    const slug = (await generateUniqueSlug(parsed.data.businessName)) + suffix;

    try {
      await prisma.store.create({ data: { dealerId: dealer.id, slug } });
      created = true;
      break;
    } catch (err) {
      console.error(
        `[signupDealer] store.create attempt ${attempt} failed (slug=${slug}):`,
        err,
      );
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        continue;
      }
      throw err;
    }
  }

  if (!created) {
    // All retries collided. Surface as a form error rather than pretending success.
    await prisma.user.delete({ where: { id: user.id } }).catch((cleanupErr) => {
      console.error("[signupDealer] cleanup after slug exhaustion also failed:", cleanupErr);
    });
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

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true, role: true },
  });
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
