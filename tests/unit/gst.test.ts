import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { isValidGstin, verifyGstin } from "../../lib/gst";

const originalNodeEnv = process.env.NODE_ENV;
const originalMockFlag = process.env.WHEEWISE_MOCK_GST;

describe("isValidGstin", () => {
  // Format: 2-digit state code + 5-char PAN + 4-digit count + 1-char entity + 1-char check-digit Z + 1-char checksum
  const VALID = [
    "22AAAAA0000A1Z5",
    "27ABCDE1234F1Z3",
    "07BBBBB0001B2Z6",
    "33CCCCC9999C9Z1",
  ];

  const INVALID = [
    "",
    "INVALID",
    "22AAAAA0000A1Z", // too short
    "22AAAAA0000A1Z55", // too long
    "00AAAAA0000A1Z5", // invalid state code 00
    "22AAAA00000A1Z5", // wrong PAN format (4 alpha instead of 5)
    "123456789012345", // all digits
  ];

  it.each(VALID)("accepts valid GSTIN: %s", (gstin) => {
    expect(isValidGstin(gstin)).toBe(true);
  });

  it.each(INVALID)("rejects invalid GSTIN: %s", (gstin) => {
    expect(isValidGstin(gstin)).toBe(false);
  });

  it("is case-insensitive and strips whitespace", () => {
    expect(isValidGstin("22 aaaaa 0000 a1z5")).toBe(true);
    expect(isValidGstin("  22AAAAA0000A1Z5  ")).toBe(true);
  });
});

describe("verifyGstin — production-safe defaults", () => {
  beforeEach(() => {
    delete process.env.WHEEWISE_MOCK_GST;
  });

  afterEach(() => {
    (process.env as Record<string, string | undefined>).NODE_ENV = originalNodeEnv;
    if (originalMockFlag === undefined) {
      delete process.env.WHEEWISE_MOCK_GST;
    } else {
      process.env.WHEEWISE_MOCK_GST = originalMockFlag;
    }
  });

  it("returns null without the mock flag (no provider configured)", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const result = await verifyGstin("27ABCDE1234F1Z3");
    expect(result).toBeNull();
  });

  it("returns null in production even when WHEEWISE_MOCK_GST=1", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    process.env.WHEEWISE_MOCK_GST = "1";
    const result = await verifyGstin("27ABCDE1234F1Z3");
    expect(result).toBeNull();
  });

  it("returns stub data with trusted=false in dev + flag set", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.WHEEWISE_MOCK_GST = "1";
    const result = await verifyGstin("27ABCDE1234F1Z3");
    expect(result).not.toBeNull();
    expect(result?.trusted).toBe(false);
    expect(result?.tradeName.length).toBeGreaterThan(0);
  });

  it("returns null for malformed GSTIN even with mock enabled", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    process.env.WHEEWISE_MOCK_GST = "1";
    const result = await verifyGstin("INVALID");
    expect(result).toBeNull();
  });
});
