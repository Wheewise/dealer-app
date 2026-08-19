import { describe, it, expect } from "vitest";
import { calculateEmi } from "../../lib/emi";

describe("calculateEmi", () => {
  it("calculates EMI correctly for standard loan", () => {
    const result = calculateEmi({
      principal: 500000,
      annualRate: 10,
      tenureMonths: 60,
    });
    // Monthly EMI should be around ₹10,624
    expect(result.monthlyEmi).toBe(10624);
    expect(result.totalPayable).toBeGreaterThan(result.monthlyEmi);
    expect(result.totalInterest).toBeGreaterThan(0);
    expect(result.totalPayable).toBe(result.monthlyEmi * 60);
  });

  it("returns lower EMI for longer tenure", () => {
    const short = calculateEmi({ principal: 500000, annualRate: 10, tenureMonths: 24 });
    const long = calculateEmi({ principal: 500000, annualRate: 10, tenureMonths: 72 });
    expect(long.monthlyEmi).toBeLessThan(short.monthlyEmi);
    expect(long.totalInterest).toBeGreaterThan(short.totalInterest);
  });

  it("handles zero principal", () => {
    const result = calculateEmi({ principal: 0, annualRate: 10, tenureMonths: 60 });
    expect(result.monthlyEmi).toBe(0);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPayable).toBe(0);
  });

  it("handles zero interest rate", () => {
    const result = calculateEmi({ principal: 600000, annualRate: 0, tenureMonths: 12 });
    expect(result.monthlyEmi).toBe(50000);
    expect(result.totalInterest).toBe(0);
    expect(result.totalPayable).toBe(600000);
  });
});
