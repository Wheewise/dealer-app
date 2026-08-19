import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildPhotoKey,
  publicUrlFor,
  putObject,
  r2Configured,
  StorageError,
  __resetStorageClient,
} from "../../lib/storage";

const R2_ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "AKIAEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "wheewise-photos",
  R2_PUBLIC_BASE_URL: "https://cdn.wheewise.com",
};

function configure(overrides: Partial<typeof R2_ENV> = {}) {
  for (const [k, v] of Object.entries({ ...R2_ENV, ...overrides })) {
    process.env[k] = v;
  }
}

beforeEach(() => {
  __resetStorageClient();
});

afterEach(() => {
  for (const k of Object.keys(R2_ENV)) delete process.env[k];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("r2Configured", () => {
  it("is false until every variable is present", () => {
    expect(r2Configured()).toBe(false);
    configure();
    expect(r2Configured()).toBe(true);
  });

  it("is false when any single variable is missing", () => {
    for (const missing of Object.keys(R2_ENV)) {
      configure();
      delete process.env[missing];
      expect(r2Configured()).toBe(false);
    }
  });
});

describe("buildPhotoKey", () => {
  it("namespaces by user and ends with the extension", () => {
    const key = buildPhotoKey("user_abc", "png");
    expect(key).toMatch(/^listings\/user_abc\/\d+-[0-9a-f-]{36}\.png$/);
  });

  it("produces a unique key per call", () => {
    const a = buildPhotoKey("u", "jpg");
    const b = buildPhotoKey("u", "jpg");
    expect(a).not.toBe(b);
  });

  /**
   * The key must be built from server-controlled parts only. A traversal
   * sequence reaching the key would let one dealer write over another's
   * object, or escape the `listings/` prefix entirely.
   */
  it("strips traversal and separators out of the user id", () => {
    const key = buildPhotoKey("../../etc/passwd", "jpg");
    expect(key).not.toContain("..");
    expect(key.startsWith("listings/")).toBe(true);
    expect(key.split("/")).toHaveLength(3);
  });

  it("sanitises a hostile extension", () => {
    expect(buildPhotoKey("u", "../../x")).toMatch(/\.x$/);
    expect(buildPhotoKey("u", "php%00")).toMatch(/\.php00$/);
    expect(buildPhotoKey("u", "")).toMatch(/\.jpg$/);
    // Long extensions are truncated rather than carried through.
    expect(buildPhotoKey("u", "abcdefghijk")).toMatch(/\.abcde$/);
  });
});

describe("publicUrlFor", () => {
  it("joins the public base with the key", () => {
    configure();
    expect(publicUrlFor("listings/u/1.jpg")).toBe(
      "https://cdn.wheewise.com/listings/u/1.jpg",
    );
  });

  it("tolerates a trailing slash on the base and a leading slash on the key", () => {
    configure({ R2_PUBLIC_BASE_URL: "https://cdn.wheewise.com/" });
    expect(publicUrlFor("/listings/u/1.jpg")).toBe(
      "https://cdn.wheewise.com/listings/u/1.jpg",
    );
  });

  it("raises when unconfigured rather than emitting a broken URL", () => {
    expect(() => publicUrlFor("k")).toThrow(StorageError);
  });
});

describe("putObject", () => {
  function captureFetch(status = 200) {
    const spy = vi.fn(async () => new Response("", { status }));
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("PUTs to the account's R2 endpoint and returns the public URL", async () => {
    configure();
    const spy = captureFetch();

    const url = await putObject(
      "listings/u/1.jpg",
      new Uint8Array([1, 2, 3]),
      "image/jpeg",
    );

    expect(url).toBe("https://cdn.wheewise.com/listings/u/1.jpg");
    const req = spy.mock.calls[0][0] as Request;
    expect(req.method).toBe("PUT");
    expect(req.url).toBe(
      "https://acct123.r2.cloudflarestorage.com/wheewise-photos/listings/u/1.jpg",
    );
  });

  it("signs the request", async () => {
    configure();
    const spy = captureFetch();
    await putObject("k.jpg", new Uint8Array([1]), "image/jpeg");
    const req = spy.mock.calls[0][0] as Request;
    // aws4fetch signs via the Authorization header (SigV4).
    expect(req.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it("sets an immutable cache header — keys are content-unique", async () => {
    configure();
    const spy = captureFetch();
    await putObject("k.jpg", new Uint8Array([1]), "image/webp");
    const req = spy.mock.calls[0][0] as Request;
    expect(req.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(req.headers.get("content-type")).toBe("image/webp");
  });

  it("raises without echoing the response body", async () => {
    configure();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<Error>secret bucket detail</Error>", { status: 403 })),
    );
    await expect(putObject("k.jpg", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
      /status 403/,
    );
    await expect(
      putObject("k.jpg", new Uint8Array([1]), "image/jpeg"),
    ).rejects.not.toThrow(/secret bucket detail/);
  });

  it("raises when unconfigured", async () => {
    await expect(putObject("k", new Uint8Array([1]), "image/jpeg")).rejects.toThrow(
      StorageError,
    );
  });
});
