/**
 * Absolute base URL for store/showroom share links. Reads
 * NEXT_PUBLIC_APP_URL and falls back to the production domain so shared
 * links never resolve to a placeholder or relative path.
 */
export function siteUrl(path = ""): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://wheewise-app.vercel.app").replace(
    /\/+$/,
    "",
  );
  const trimmedPath = path.replace(/^\/+/, "");
  return trimmedPath ? `${base}/${trimmedPath}` : base;
}
