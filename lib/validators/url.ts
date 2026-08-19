import { z } from "zod";

/**
 * Shared validator for image URLs that users supply and other users then load.
 *
 * `z.string().url()` alone accepts anything `new URL()` parses — including
 * `javascript:`, `data:`, `file:`, credentials-in-authority
 * (`https://user:pass@host`) and internal hosts such as
 * `http://169.254.169.254/`. Those values get stored and re-served to every
 * visitor, which turns a listing photo into an off-platform beacon and, in any
 * `href` context, into an XSS vector.
 *
 * Policy: https only, no embedded credentials, no loopback/link-local/private
 * authority. Optionally pinned to an operator-configured host allowlist
 * (`UPLOAD_HOST_ALLOWLIST`, comma-separated) — unset means "any public https
 * host", which keeps existing rows and local development working.
 */

const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?fd)/i;

function allowlist(): string[] {
  return (process.env.UPLOAD_HOST_ALLOWLIST ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

export function isSafeImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;

  const host = url.hostname.toLowerCase();
  if (PRIVATE_HOST.test(host)) return false;

  const allowed = allowlist();
  if (allowed.length > 0) {
    const match = allowed.some((h) => host === h || host.endsWith(`.${h}`));
    if (!match) return false;
  }

  return true;
}

/** Zod schema for a single user-supplied image URL. */
export const imageUrl = z
  .string()
  .url("Enter a valid URL")
  .refine(isSafeImageUrl, "Image URLs must be https and publicly reachable");
