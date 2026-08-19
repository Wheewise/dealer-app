import type { Role } from "@prisma/client";
import { appHref } from "@/lib/app-urls";

/**
 * Where to send a user right after successful sign-in, based on their role.
 *
 * Returns an absolute URL when the target role's app is deployed to its own
 * subdomain, and a relative path when everything shares one host. The value is
 * derived from environment configuration, never from request input, so this
 * cannot become an open redirect — user-supplied `callbackUrl` values still go
 * through `safeCallbackPath` below.
 */
export function roleRedirectPath(role: Role | null | undefined): string {
  switch (role) {
    case "DEALER":
      return appHref("dealer", "/dashboard");
    case "ADMIN":
    case "SUPER_ADMIN":
      return appHref("admin", "/admin");
    default:
      return appHref("user", "/browse");
  }
}

/**
 * Validates a `callbackUrl` value is a safe same-site relative path before
 * using it as a post-login redirect target — rejects absolute/protocol-
 * relative URLs (e.g. "https://evil.com" or "//evil.com") to prevent open
 * redirects. Returns null if the value is missing or unsafe.
 */
export function safeCallbackPath(url: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof url !== "string" || !url) return null;
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  return url;
}
