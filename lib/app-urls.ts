import type { AppSurface } from "@/lib/rbac";

/**
 * Cross-application URL resolution.
 *
 * The three role apps deploy to three subdomains (user / dealer / admin), so a
 * bare `redirect("/dashboard")` issued by the user app would land on the user
 * subdomain, which has no such route. Anything that sends a caller *to a
 * different role's app* must therefore be absolute.
 *
 * When the env vars are unset — local development, or the single-host
 * monorepo — every helper falls back to a relative path, which is exactly the
 * behaviour this codebase had before the split. That keeps one code path for
 * both topologies.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so they are referenced
 * literally below rather than looked up dynamically.
 */

/**
 * Read inside the function rather than at module load: the textual
 * `NEXT_PUBLIC_*` substitution happens either way, and it keeps the helper
 * testable without module-registry gymnastics.
 */
function configuredOrigin(surface: AppSurface): string | undefined {
  switch (surface) {
    case "user":
      return process.env.NEXT_PUBLIC_USER_APP_URL;
    case "dealer":
      return process.env.NEXT_PUBLIC_DEALER_APP_URL;
    case "admin":
      return process.env.NEXT_PUBLIC_ADMIN_APP_URL;
  }
}

/** Origin for a role's app, or null when running everything on one host. */
export function appOrigin(surface: AppSurface): string | null {
  const raw = configuredOrigin(surface);
  if (!raw) return null;
  try {
    // Normalise away any trailing slash / stray path so joining is predictable.
    return new URL(raw).origin;
  } catch {
    // A malformed env var must not take the app down — degrade to same-host.
    console.warn(`[app-urls] Ignoring malformed origin for "${surface}": ${raw}`);
    return null;
  }
}

/**
 * Absolute URL into another app when that app's origin is configured,
 * otherwise the path unchanged for same-host routing.
 */
export function appHref(surface: AppSurface, path = "/"): string {
  const origin = appOrigin(surface);
  const normalised = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${normalised}` : normalised;
}

/** Home of the public/buyer app — where every "you don't belong here" lands. */
export function userAppHome(): string {
  return appHref("user", "/");
}
