/**
 * Security event logging (OWASP A09).
 *
 * Deliberately narrow: it records *who* attempted *what* and the outcome, and
 * nothing else. Passwords, OTPs, tokens, API keys, signatures and request
 * bodies must never be passed in — `redact()` is the last line of defence but
 * callers are expected not to supply them in the first place.
 */

export type SecurityEventType =
  | "auth.login.success"
  | "auth.login.failure"
  | "auth.logout"
  | "auth.otp.requested"
  | "auth.rate_limited"
  | "authz.denied"
  | "authz.granted.privileged"
  | "privilege.changed"
  | "admin.action"
  | "config.changed";

export type SecurityEvent = {
  type: SecurityEventType;
  /** Authenticated subject, when known. Never an email/phone — ids only. */
  userId?: string | null;
  role?: string | null;
  /** Logical resource, e.g. "listing", "enquiry:abc123". */
  resource?: string | null;
  /** Operation attempted, e.g. "update", "manage_dealers". */
  action?: string | null;
  outcome: "allow" | "deny";
  /** Short machine-readable reason, e.g. "missing_permission". */
  reason?: string | null;
};

const SENSITIVE_KEY = /pass|secret|token|otp|key|signature|cookie|authorization/i;

function redact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redact(v);
  }
  return out;
}

/**
 * Emits a structured security event. Console is the transport on purpose: the
 * platform (Cloudflare/Vercel logs + Sentry breadcrumbs) already ships stdout,
 * so this needs no extra infrastructure and cannot itself fail a request.
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const payload = redact({
    ...event,
    at: new Date().toISOString(),
    channel: "security",
  });

  if (event.outcome === "deny") {
    console.warn("[security]", JSON.stringify(payload));
  } else {
    console.info("[security]", JSON.stringify(payload));
  }
}

/** Convenience wrapper for the most common event. */
export function logAuthzDenied(input: {
  userId?: string | null;
  role?: string | null;
  resource?: string | null;
  action?: string | null;
  reason: string;
}): void {
  logSecurityEvent({ type: "authz.denied", outcome: "deny", ...input });
}
