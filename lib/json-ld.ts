/**
 * Renders a JSON-LD `<script>` payload safely.
 *
 * `</script>` sequences inside the JSON string would prematurely close the
 * `<script>` tag and let arbitrary HTML execute. Escape every `</` so the
 * parser never sees a closing tag inside our payload.
 *
 * Always use this — never inline `JSON.stringify(schema)` into
 * `dangerouslySetInnerHTML` directly.
 */
export function jsonLdScriptContent(schema: unknown): string {
  return JSON.stringify(schema).replace(/<\//g, "<\\/");
}

/**
 * Base URL for canonical / OG / share links. Reads NEXT_PUBLIC_APP_URL and
 * falls back to wheewise.in. Centralised so we never sprinkle hardcoded
 * domains into route metadata.
 */
export function appUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://wheewise.in";
  const trimmedBase = base.replace(/\/+$/, "");
  const trimmedPath = path.replace(/^\/+/, "");
  return trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;
}
