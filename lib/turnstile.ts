/**
 * Cloudflare Turnstile — server-side token verification.
 *
 * Turnstile is bot protection for the endpoints that are expensive or
 * abusable when automated: the public enquiry form, OTP send (each one costs
 * real money in SMS), login, and signup. Rate limiting caps how fast a single
 * caller can go; Turnstile raises the cost of being a caller at all.
 *
 * Configuration:
 *   TURNSTILE_SECRET_KEY             server secret (never sent to the client)
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY   public site key, rendered in the widget
 *
 * With the secret unset, verification is skipped entirely so local
 * development and tests need no Cloudflare account. Production must set it —
 * `assertTurnstileConfigured()` exists to make that omission loud.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

export type TurnstileResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; reason: string };

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Boot-time check. Turnstile silently disabling itself in production is the
 * failure mode worth shouting about: nothing breaks, the forms keep working,
 * and the protection is simply gone.
 */
export function assertTurnstileConfigured(): void {
  if (process.env.NODE_ENV === "production" && !turnstileEnabled()) {
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY is not set — bot protection is DISABLED " +
        "on enquiry, OTP, login and signup.",
    );
  }
}

type SiteverifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
};

/**
 * Verifies a widget token with Cloudflare.
 *
 * Fails **closed**: a network error, a timeout or a malformed response all
 * return `ok: false`. The point of the control is to refuse traffic it cannot
 * vouch for, and Turnstile being unreachable is not a reason to wave
 * everything through. Callers that would rather degrade than block should say
 * so explicitly at the call site.
 *
 * `expectedAction` binds a token to the form it came from. Without it a token
 * minted on a cheap public form could be replayed against an expensive one.
 */
export async function verifyTurnstile(
  token: unknown,
  opts: { remoteIp?: string; expectedAction?: string } = {},
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };

  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "missing_token" };
  }
  // Cloudflare tokens are well under this; anything larger is not a token.
  if (token.length > 2048) {
    return { ok: false, reason: "malformed_token" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteIp && opts.remoteIp !== "unknown") {
    body.set("remoteip", opts.remoteIp);
  }
  // Lets a retry of the same token return the same verdict rather than
  // failing as already-redeemed.
  body.set("idempotency_key", crypto.randomUUID());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let data: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: `siteverify_http_${res.status}` };
    data = (await res.json()) as SiteverifyResponse;
  } catch (err) {
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? "siteverify_timeout"
        : "siteverify_unreachable";
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }

  if (!data.success) {
    // Error codes are Cloudflare's own vocabulary and contain no user data.
    const codes = data["error-codes"]?.join(",") || "unknown";
    return { ok: false, reason: `rejected:${codes}` };
  }

  if (opts.expectedAction && data.action && data.action !== opts.expectedAction) {
    return { ok: false, reason: "action_mismatch" };
  }

  return { ok: true };
}

/**
 * Field name Turnstile uses for its hidden input. Form-action call sites read
 * it straight off the FormData; fetch call sites send it in the JSON body
 * under the same name so there is one thing to remember.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/** Actions bound to each protected form. Keep in step with the widgets. */
export const TURNSTILE_ACTIONS = {
  login: "login",
  signupBuyer: "signup-buyer",
  signupDealer: "signup-dealer",
  sendOtp: "send-otp",
  lead: "lead",
} as const;
