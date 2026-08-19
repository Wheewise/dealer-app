import { describe, it, expect } from "vitest";
import { scoreLead } from "../../lib/lead-priority";

describe("scoreLead", () => {
  it("returns 0 for empty signals", () => {
    expect(
      scoreLead({
        hasMessage: false,
        messageLength: 0,
        hasEmail: false,
        isAuthenticated: false,
        phoneLooksValid: false,
      }),
    ).toBe(0);
  });

  it("returns max score for all signals", () => {
    expect(
      scoreLead({
        hasMessage: true,
        messageLength: 100,
        hasEmail: true,
        isAuthenticated: true,
        phoneLooksValid: true,
      }),
    ).toBe(100);
  });

  it("caps at 100", () => {
    expect(
      scoreLead({
        hasMessage: true,
        messageLength: 200,
        hasEmail: true,
        isAuthenticated: true,
        phoneLooksValid: true,
      }),
    ).toBe(100);
  });

  it("scores authenticated buyer higher", () => {
    const without = scoreLead({
      hasMessage: false,
      messageLength: 0,
      hasEmail: false,
      isAuthenticated: false,
      phoneLooksValid: true,
    });
    const withAuth = scoreLead({
      hasMessage: false,
      messageLength: 0,
      hasEmail: false,
      isAuthenticated: true,
      phoneLooksValid: true,
    });
    expect(withAuth).toBeGreaterThan(without);
  });

  it("scores long message higher", () => {
    const short = scoreLead({
      hasMessage: true,
      messageLength: 10,
      hasEmail: false,
      isAuthenticated: false,
      phoneLooksValid: true,
    });
    const long = scoreLead({
      hasMessage: true,
      messageLength: 100,
      hasEmail: false,
      isAuthenticated: false,
      phoneLooksValid: true,
    });
    expect(long).toBeGreaterThan(short);
  });
});
