import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../lib/auth", () => ({ auth: vi.fn() }));
vi.mock("../../../lib/db", async () => {
  const { makeDbModule } = await import("../../helpers/supabase-mock");
  return makeDbModule();
});

import { auth } from "../../../lib/auth";
import * as dbModule from "../../../lib/db";
import type { DbMock } from "../../helpers/supabase-mock";
import { POST as uploadsPOST } from "../../../app/api/uploads/route";
import { __resetStorageClient } from "../../../lib/storage";

type M = ReturnType<typeof vi.fn>;
const authMock = auth as unknown as M;
const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

const R2_ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "AKIAEXAMPLE",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "wheewise-photos",
  R2_PUBLIC_BASE_URL: "https://cdn.wheewise.com",
};

function signInDealer() {
  authMock.mockResolvedValue({ user: { id: "u_a", role: "DEALER" } });
  dbMock.on("User", {
    data: {
      id: "u_a",
      email: "a@example.com",
      name: "Dealer A",
      role: "DEALER",
      dealer: { id: "dealer_A", status: "ACTIVE" },
    },
  });
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

function uploadRequest(bytes: Uint8Array, type: string, name = "photo.jpg") {
  const form = new FormData();
  form.append("file", new File([bytes], name, { type }));
  return new Request("https://x.test/api/uploads", { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.reset();
  __resetStorageClient();
  for (const [k, v] of Object.entries(R2_ENV)) process.env[k] = v;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("", { status: 200 })),
  );
});

afterEach(() => {
  for (const k of Object.keys(R2_ENV)) delete process.env[k];
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("POST /api/uploads — authorization", () => {
  it("rejects anonymous callers", async () => {
    authMock.mockResolvedValue(null);
    dbMock.on("User", { data: null });
    const res = await uploadsPOST(uploadRequest(JPEG, "image/jpeg"));
    expect(res.status).toBe(401);
  });

  it("rejects buyers", async () => {
    authMock.mockResolvedValue({ user: { id: "u_b", role: "BUYER" } });
    dbMock.on("User", {
      data: {
        id: "u_b",
        email: "b@example.com",
        name: "Buyer",
        role: "BUYER",
        dealer: null,
      },
    });
    const res = await uploadsPOST(uploadRequest(JPEG, "image/jpeg"));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/uploads — content validation", () => {
  beforeEach(signInDealer);

  it("accepts a genuine JPEG and returns its CDN URL", async () => {
    const res = await uploadsPOST(uploadRequest(JPEG, "image/jpeg"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(
      /^https:\/\/cdn\.wheewise\.com\/listings\/u_a\/\d+-[0-9a-f-]{36}\.jpg$/,
    );
  });

  it.each([
    ["PNG", PNG, "image/png", "png"],
    ["WebP", WEBP, "image/webp", "webp"],
  ])("accepts a genuine %s", async (_label, bytes, type, ext) => {
    const res = await uploadsPOST(uploadRequest(bytes as Uint8Array, type as string));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url.endsWith(`.${ext}`)).toBe(true);
  });

  it("rejects a declared type the product does not allow", async () => {
    const res = await uploadsPOST(uploadRequest(JPEG, "image/svg+xml", "x.svg"));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * The declared MIME type is attacker-controlled. Since these objects are
   * served from a hostname we control, content that is not actually an image
   * must not reach the bucket.
   */
  it("rejects a non-image masquerading as an image", async () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script>");
    const res = await uploadsPOST(uploadRequest(html, "image/png", "evil.png"));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/not a valid/i) });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("names the object from the sniffed type, not the supplied filename", async () => {
    // Real PNG bytes, but the client claims .jpg and image/png.
    const res = await uploadsPOST(uploadRequest(PNG, "image/png", "payload.php"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url.endsWith(".png")).toBe(true);
    expect(url).not.toContain("payload");
    expect(url).not.toContain(".php");
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(9 * 1024 * 1024);
    big.set(JPEG);
    const res = await uploadsPOST(uploadRequest(big, "image/jpeg"));
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a request with no file", async () => {
    const res = await uploadsPOST(
      new Request("https://x.test/api/uploads", {
        method: "POST",
        body: new FormData(),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /api/uploads — storage failures", () => {
  beforeEach(signInDealer);

  it("returns 503 when R2 rejects the write", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("denied", { status: 403 })),
    );
    const res = await uploadsPOST(uploadRequest(JPEG, "image/jpeg"));
    expect(res.status).toBe(503);
  });

  it("returns 503 when no storage backend is configured at all", async () => {
    for (const k of Object.keys(R2_ENV)) delete process.env[k];
    __resetStorageClient();
    const res = await uploadsPOST(uploadRequest(JPEG, "image/jpeg"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({
      error: expect.stringMatching(/not configured/i),
    });
  });
});
