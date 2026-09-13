// JSON.stringify alone doesn't escape "</script>" — if data flowing into a
// JSON-LD <script dangerouslySetInnerHTML> contained that sequence, a
// browser's HTML parser would close the script tag early and start
// rendering whatever followed as markup. Escaping "<" stays valid JSON
// (readers see < as "<") while making that injection impossible.
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
