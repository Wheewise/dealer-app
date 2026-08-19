import { describe, it, expect } from "vitest";
import { formatINR, formatNumber } from "../../lib/format";

describe("formatINR", () => {
  it("formats round rupees", () => {
    expect(formatINR(500000)).toBe("₹5,00,000");
  });

  it("formats zero", () => {
    expect(formatINR(0)).toBe("₹0");
  });

  it("formats large amounts", () => {
    expect(formatINR(10000000)).toBe("₹1,00,00,000");
  });
});

describe("formatNumber", () => {
  it("formats with Indian locale", () => {
    expect(formatNumber(1500000)).toBe("15,00,000");
  });

  it("formats zero", () => {
    expect(formatNumber(0)).toBe("0");
  });
});
