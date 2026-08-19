import { describe, it, expect } from "vitest";
import { getClientIp } from "../../lib/rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://example.com/", { headers });
}

describe("getClientIp", () => {
  it("prefers CF-Connecting-IP when present", () => {
    expect(
      getClientIp(
        req({
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "10.0.0.1, 198.51.100.2",
        }),
      ),
    ).toBe("203.0.113.10");
  });

  it("falls back to the rightmost X-Forwarded-For hop", () => {
    expect(getClientIp(req({ "x-forwarded-for": "10.0.0.1, 198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
  });

  it("handles a single XFF entry", () => {
    expect(getClientIp(req({ "x-forwarded-for": "203.0.113.42" }))).toBe("203.0.113.42");
  });

  it("returns 'unknown' when no headers present", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });

  it("ignores empty XFF entries", () => {
    expect(getClientIp(req({ "x-forwarded-for": ", , 198.51.100.7" }))).toBe(
      "198.51.100.7",
    );
  });
});
