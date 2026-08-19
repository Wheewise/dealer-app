import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/db", () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import {
  hashApiKey,
  keyPrefixOf,
  generateApiKey,
  validateApiKey,
} from "../../lib/api-auth";
import { prisma } from "../../lib/db";

type Mock = ReturnType<typeof vi.fn>;
const findUnique = prisma.apiKey.findUnique as unknown as Mock;
const findFirst = prisma.apiKey.findFirst as unknown as Mock;
const update = prisma.apiKey.update as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  update.mockResolvedValue({});
});

function req(headers: Record<string, string>): Request {
  return new Request("http://test/", { headers });
}

describe("api-key primitives", () => {
  it("hashApiKey is deterministic SHA-256 hex", () => {
    expect(hashApiKey("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(hashApiKey("hello")).toBe(hashApiKey("hello"));
  });

  it("hashApiKey of different inputs differs", () => {
    expect(hashApiKey("a")).not.toBe(hashApiKey("b"));
  });

  it("keyPrefixOf returns first 8 chars", () => {
    expect(keyPrefixOf("wk_abcdefghijk")).toBe("wk_abcde");
  });

  it("generateApiKey produces unique, prefixed, high-entropy keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a).not.toBe(b);
    expect(a.startsWith("wk_")).toBe(true);
    expect(a.length).toBeGreaterThan(20);
  });
});

describe("validateApiKey", () => {
  it("returns null when no header is present", async () => {
    expect(await validateApiKey(req({}))).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("looks up by SHA-256 hash on the modern path", async () => {
    const plaintext = "wk_test_plaintext_key";
    findUnique.mockResolvedValue({ id: "k1", dealerId: "d1" });

    const dealerId = await validateApiKey(req({ authorization: `Bearer ${plaintext}` }));

    expect(dealerId).toBe("d1");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { keyHash: hashApiKey(plaintext) },
      }),
    );
    // legacy fallback should NOT have been queried
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("accepts X-API-Key header as fallback", async () => {
    findUnique.mockResolvedValue({ id: "k2", dealerId: "d2" });
    const dealerId = await validateApiKey(req({ "x-api-key": "wk_xxx" }));
    expect(dealerId).toBe("d2");
  });

  it("falls back to legacy plaintext column and backfills the hash", async () => {
    const plaintext = "wk_legacy_key";
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue({ id: "k3", dealerId: "d3" });

    const dealerId = await validateApiKey(req({ authorization: `Bearer ${plaintext}` }));

    expect(dealerId).toBe("d3");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: plaintext, keyHash: null },
      }),
    );
    // wait one microtask so the fire-and-forget backfill has dispatched
    await new Promise((r) => setTimeout(r, 0));
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "k3" },
        data: expect.objectContaining({
          keyHash: hashApiKey(plaintext),
          keyPrefix: keyPrefixOf(plaintext),
        }),
      }),
    );
  });

  it("returns null when neither hash nor legacy lookup matches", async () => {
    findUnique.mockResolvedValue(null);
    findFirst.mockResolvedValue(null);
    expect(await validateApiKey(req({ authorization: "Bearer wrong" }))).toBeNull();
  });

  it("rejects an Authorization header with no Bearer prefix", async () => {
    expect(await validateApiKey(req({ authorization: "Basic xyz" }))).toBeNull();
  });
});
