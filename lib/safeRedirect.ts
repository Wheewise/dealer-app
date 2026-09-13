// Guards against open-redirect phishing via a `callbackUrl` query param —
// only ever follow a same-origin relative path, never let it send the
// user off-site after a real, successful login.
export function safeRedirect(requested: string | null | undefined, fallback: string): string {
  if (requested && requested.startsWith("/") && !requested.startsWith("//")) return requested;
  return fallback;
}
