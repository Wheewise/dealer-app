import crypto from "crypto";
import { prisma } from "./db";

/** Returns the SHA-256 hex of an API key plaintext. */
export function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

/** First 8 chars of plaintext, displayed in UI so dealers can recognise their keys. */
export function keyPrefixOf(plaintext: string): string {
  return plaintext.slice(0, 8);
}

/** Generates a new plaintext API key. Never persisted; only the hash + prefix are. */
export function generateApiKey(): string {
  // `wk_` brand prefix + 32 url-safe random bytes ≈ 43 chars of base64url entropy.
  return `wk_${crypto.randomBytes(32).toString("base64url")}`;
}

function extractKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }
  const xKey = req.headers.get("x-api-key");
  if (xKey) return xKey.trim();
  return null;
}

/**
 * Validates an inbound API key. Returns the owning dealerId, or null.
 *
 * Lookup order:
 *   1. Hash the incoming key and look up by `keyHash` (current path).
 *   2. Fall back to plaintext `key` column for legacy keys created before
 *      this migration. On a legacy match, opportunistically backfill the
 *      hash and prefix so subsequent requests use the fast path.
 */
export async function validateApiKey(req: Request): Promise<string | null> {
  const plaintext = extractKey(req);
  if (!plaintext) return null;

  const hash = hashApiKey(plaintext);

  const byHash = await prisma.apiKey.findUnique({
    where: { keyHash: hash },
    select: { id: true, dealerId: true },
  });
  if (byHash) {
    prisma.apiKey
      .update({ where: { id: byHash.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
    return byHash.dealerId;
  }

  // Legacy plaintext lookup. Only matches keys that pre-date the hash column.
  const byPlain = await prisma.apiKey.findFirst({
    where: { key: plaintext, keyHash: null },
    select: { id: true, dealerId: true },
  });
  if (!byPlain) return null;

  // Silent backfill — future requests hit the hash path.
  prisma.apiKey
    .update({
      where: { id: byPlain.id },
      data: {
        keyHash: hash,
        keyPrefix: keyPrefixOf(plaintext),
        lastUsedAt: new Date(),
      },
    })
    .catch(() => {});

  return byPlain.dealerId;
}
