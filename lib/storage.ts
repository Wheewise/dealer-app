import { AwsClient } from "aws4fetch";

/**
 * Object storage for listing photos, backed by Cloudflare R2.
 *
 * R2 speaks the S3 API, which means requests must carry a SigV4 signature.
 * `aws4fetch` does the signing with Web Crypto, so this works unchanged on
 * Node, Edge and Workers — an AWS SDK client would not, and would be orders of
 * magnitude larger.
 *
 * Reads never come through here. Objects are served straight off the bucket's
 * public hostname (a custom domain such as `cdn.wheewise.com`, or the
 * `pub-*.r2.dev` domain), so image delivery is Cloudflare's CDN edge and never
 * touches the app.
 *
 * Configuration:
 *   R2_ACCOUNT_ID          Cloudflare account id
 *   R2_ACCESS_KEY_ID       R2 API token key id
 *   R2_SECRET_ACCESS_KEY   R2 API token secret
 *   R2_BUCKET              bucket name
 *   R2_PUBLIC_BASE_URL     public origin, e.g. https://cdn.wheewise.com
 */

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function r2Configured(): boolean {
  return readConfig() !== null;
}

/** Public URL an object key is served from. */
export function publicUrlFor(key: string): string {
  const cfg = readConfig();
  if (!cfg) throw new StorageError("R2 is not configured");
  const base = cfg.publicBaseUrl.replace(/\/+$/, "");
  const path = key.replace(/^\/+/, "");
  return `${base}/${path}`;
}

/**
 * Object keys are built from server-controlled parts only — never from the
 * uploaded filename. A caller-supplied name could otherwise contain `../`, a
 * leading slash, or a second extension, and would let one dealer write over
 * another's object.
 */
export function buildPhotoKey(userId: string, extension: string): string {
  const safeExt = extension.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 5) || "jpg";
  const safeUser = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return `listings/${safeUser}/${Date.now()}-${crypto.randomUUID()}.${safeExt}`;
}

let client: AwsClient | null = null;
let clientKey = "";

function getClient(cfg: R2Config): AwsClient {
  // Rebuild only if the credentials actually changed (they don't, in practice
  // — this just avoids constructing a client per request).
  const key = `${cfg.accessKeyId}:${cfg.secretAccessKey}`;
  if (!client || clientKey !== key) {
    client = new AwsClient({
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      service: "s3",
      region: "auto", // R2 is single-region; "auto" is what it expects.
    });
    clientKey = key;
  }
  return client;
}

/**
 * Stores an object and returns the URL it will be served from.
 *
 * No ACL is sent: R2 ignores S3 ACLs entirely. Whether the bucket is readable
 * is a bucket-level setting (public development URL, or a custom domain), not
 * a per-object one — so a bucket left private will accept these writes and
 * then 404 every read. Verify public access once, at setup.
 */
export async function putObject(
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<string> {
  const cfg = readConfig();
  if (!cfg) throw new StorageError("R2 is not configured");

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  // Normalise to a plain ArrayBuffer: a Uint8Array may be backed by a
  // SharedArrayBuffer, which is not a valid request body, and aws4fetch needs
  // concrete bytes to compute the SigV4 payload hash.
  const payload: ArrayBuffer =
    body instanceof Uint8Array
      ? (body.buffer.slice(
          body.byteOffset,
          body.byteOffset + body.byteLength,
        ) as ArrayBuffer)
      : body;

  const res = await getClient(cfg).fetch(endpoint, {
    method: "PUT",
    body: payload,
    headers: {
      "Content-Type": contentType,
      // Photos are immutable: the key carries a timestamp and a UUID, so a
      // given URL never changes content and can be cached indefinitely.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

  if (!res.ok) {
    // The body can echo bucket and credential details — keep it out of logs.
    throw new StorageError(`R2 upload failed with status ${res.status}`);
  }

  return publicUrlFor(key);
}

/**
 * Removes an object. Best-effort: a failure here is logged, not raised, since
 * callers delete as cleanup after the database row is already gone.
 */
export async function deleteObject(key: string): Promise<void> {
  const cfg = readConfig();
  if (!cfg) return;

  const endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;

  try {
    const res = await getClient(cfg).fetch(endpoint, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      console.warn(`[storage] R2 delete returned ${res.status} for ${key}`);
    }
  } catch (err) {
    console.warn(`[storage] R2 delete failed for ${key}:`, err);
  }
}

/** Test-only: drop the memoised signing client. */
export function __resetStorageClient(): void {
  client = null;
  clientKey = "";
}
