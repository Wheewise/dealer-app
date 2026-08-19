import { z } from "zod";

const serverSchema = z.object({
  // Accepted as an alias for NEXT_PUBLIC_SUPABASE_URL so server-only
  // deployments need not expose the project URL to the browser bundle.
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.string().url().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_PLAN_MONTHLY: z.string().optional(),
  RAZORPAY_PLAN_YEARLY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "production", "test"]).optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

let parsed = false;

try {
  serverSchema.parse(process.env);
  publicSchema.parse(process.env);
  parsed = true;
} catch (error) {
  if (error instanceof z.ZodError) {
    const missing = error.issues
      .filter((i) => i.code === "invalid_type")
      .map((i) => i.path.join("."));
    if (missing.length > 0) {
      console.error(`Missing required env vars: ${missing.join(", ")}`);
    }
    console.error(error.flatten().fieldErrors);
  }
}

// Hard-fail on boot if any dev backdoor flag is set in production.
// Catches the staging-leak vulnerability where flags get carried through CI.
if (process.env.NODE_ENV === "production") {
  const forbidden = [
    "WHEEWISE_DEV_LOGIN",
    "OTP_DEV_BYPASS",
    "WHEEWISE_MOCK_GST",
    "WHEEWISE_MOCK_RTO",
  ].filter((k) => process.env[k] === "1" || process.env[k] === "true");
  if (forbidden.length > 0) {
    throw new Error(
      `Refusing to boot: dev-only flags set in production: ${forbidden.join(", ")}`,
    );
  }
}

export const env = { parsed };
