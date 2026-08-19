const store = new Map<string, { value: string; expiresAt: number }>();

let redis: {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, opts?: { ex?: number }) => Promise<void>;
  del: (key: string) => Promise<void>;
} | null = null;

export function setRedisCache(client: typeof redis) {
  redis = client;
}

function keyFor(namespace: string, id: string): string {
  return `wheewise:${namespace}:${id}`;
}

export async function cacheGet<T>(namespace: string, id: string): Promise<T | null> {
  const key = keyFor(namespace, id);

  if (redis) {
    const raw = await redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  try {
    return JSON.parse(entry.value) as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  namespace: string,
  id: string,
  value: T,
  ttlMs: number,
): Promise<void> {
  const key = keyFor(namespace, id);
  const raw = JSON.stringify(value);

  if (redis) {
    await redis.set(key, raw, { ex: Math.ceil(ttlMs / 1000) });
    return;
  }

  store.set(key, { value: raw, expiresAt: Date.now() + ttlMs });
}

export async function cacheDelete(namespace: string, id: string): Promise<void> {
  const key = keyFor(namespace, id);

  if (redis) {
    await redis.del(key);
    return;
  }

  store.delete(key);
}

export async function cacheInvalidate(namespace: string): Promise<void> {
  const prefix = `wheewise:${namespace}:`;

  if (redis) {
    // Upstash Redis doesn't support SCAN in REST mode. In production,
    // maintain a set of keys per namespace or use Redis SCAN via the SDK.
    return;
  }

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

// Start a periodic cleanup of in-memory store
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key);
    }
  }, 60 * 1000);
}
