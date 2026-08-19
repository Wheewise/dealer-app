import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/db", async () => {
  const { makeDbModule } = await import("../helpers/supabase-mock");
  return makeDbModule();
});

import {
  hashApiKey,
  keyPrefixOf,
  generateApiKey,
  validateApiKey,
} from "../../lib/api-auth";
import * as dbModule from "../../lib/db";
import type { DbMock } from "../helpers/supabase-mock";

const dbMock = (dbModule as unknown as { __mock: DbMock }).__mock;

beforeEach(() => {
  dbMock.reset();
});

function req(headers: Record<string, string>): Request {
  return new Request("http://test/", { headers });
}

/** The ApiKey reads, in order: hash lookup first, legacy plaintext second. */
function selects() {
  return dbMock.calls.filter((c) => c.table === "ApiKey" && c.operation === "select");
}

function updates() {
  return dbMock.calls.filter((c) => c.table === "ApiKey" && c.operation === "update");
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
    expect(dbMock.calls).toHaveLength(0);
  });

  it("looks up by SHA-256 hash on the modern path", async () => {
    const plaintext = "wk_test_plaintext_key";
    dbMock.queue({ data: { id: "k1", dealerId: "d1" } });

    const dealerId = await validateApiKey(req({ authorization: `Bearer ${plaintext}` }));

    expect(dealerId).toBe("d1");
    expect(selects()[0].filters).toContainEqual({
      method: "eq",
      args: ["keyHash", hashApiKey(plaintext)],
    });
    // The legacy fallback must not have been queried.
    expect(selects()).toHaveLength(1);
  });

  it("accepts X-API-Key header as fallback", async () => {
    dbMock.queue({ data: { id: "k2", dealerId: "d2" } });
    const dealerId = await validateApiKey(req({ "x-api-key": "wk_xxx" }));
    expect(dealerId).toBe("d2");
  });

  it("never selects the secret columns back out", async () => {
    dbMock.queue({ data: { id: "k1", dealerId: "d1" } });
    await validateApiKey(req({ authorization: "Bearer wk_x" }));
    expect(selects()[0].select).toBe("id, dealerId");
  });

  it("falls back to legacy plaintext column and backfills the hash", async () => {
    const plaintext = "wk_legacy_key";
    dbMock.queue({ data: null }); // hash lookup misses
    dbMock.queue({ data: { id: "k3", dealerId: "d3" } }); // legacy hit

    const dealerId = await validateApiKey(req({ authorization: `Bearer ${plaintext}` }));

    expect(dealerId).toBe("d3");
    expect(selects()[1].filters).toEqual(
      expect.arrayContaining([
        { method: "eq", args: ["key", plaintext] },
        { method: "is", args: ["keyHash", null] },
      ]),
    );

    // Wait one turn so the fire-and-forget backfill has dispatched.
    await new Promise((r) => setTimeout(r, 0));
    const backfill = updates()[0];
    expect(backfill.payload).toEqual(
      expect.objectContaining({
        keyHash: hashApiKey(plaintext),
        keyPrefix: keyPrefixOf(plaintext),
      }),
    );
    expect(backfill.filters).toContainEqual({ method: "eq", args: ["id", "k3"] });
  });

  it("returns null when neither hash nor legacy lookup matches", async () => {
    dbMock.queue({ data: null });
    dbMock.queue({ data: null });
    expect(await validateApiKey(req({ authorization: "Bearer wrong" }))).toBeNull();
  });

  it("rejects an Authorization header with no Bearer prefix", async () => {
    expect(await validateApiKey(req({ authorization: "Basic xyz" }))).toBeNull();
  });
});
