import { describe, it, expect, afterEach, vi } from "vitest";
import { appOrigin, appHref, userAppHome } from "../../lib/app-urls";
import { roleRedirectPath, safeCallbackPath } from "../../lib/role-redirect";

const VARS = [
  "NEXT_PUBLIC_USER_APP_URL",
  "NEXT_PUBLIC_DEALER_APP_URL",
  "NEXT_PUBLIC_ADMIN_APP_URL",
] as const;

afterEach(() => {
  for (const v of VARS) delete process.env[v];
  vi.restoreAllMocks();
});

function deployThreeSubdomains() {
  process.env.NEXT_PUBLIC_USER_APP_URL = "https://wheewise.com";
  process.env.NEXT_PUBLIC_DEALER_APP_URL = "https://dealer.wheewise.com";
  process.env.NEXT_PUBLIC_ADMIN_APP_URL = "https://admin.wheewise.com";
}

describe("single-host mode (env unset)", () => {
  it("keeps every href relative, exactly as before the split", () => {
    expect(appOrigin("user")).toBeNull();
    expect(appHref("dealer", "/dashboard")).toBe("/dashboard");
    expect(userAppHome()).toBe("/");
  });

  it("keeps post-login redirects relative", () => {
    expect(roleRedirectPath("DEALER")).toBe("/dashboard");
    expect(roleRedirectPath("ADMIN")).toBe("/admin");
    expect(roleRedirectPath("SUPER_ADMIN")).toBe("/admin");
    expect(roleRedirectPath("BUYER")).toBe("/browse");
    expect(roleRedirectPath(null)).toBe("/browse");
  });
});

describe("three-subdomain deployment", () => {
  it("sends each role to its own app after sign-in", () => {
    deployThreeSubdomains();
    expect(roleRedirectPath("DEALER")).toBe("https://dealer.wheewise.com/dashboard");
    expect(roleRedirectPath("ADMIN")).toBe("https://admin.wheewise.com/admin");
    expect(roleRedirectPath("SUPER_ADMIN")).toBe("https://admin.wheewise.com/admin");
    expect(roleRedirectPath("BUYER")).toBe("https://wheewise.com/browse");
  });

  /**
   * The loop this guards against: an unauthorized visitor on
   * dealer.wheewise.com/dashboard gets `redirect("/")`, which on that host is
   * the dashboard again.
   */
  it("points 'you don't belong here' at the user app, not the current host", () => {
    deployThreeSubdomains();
    expect(userAppHome()).toBe("https://wheewise.com/");
  });

  it("normalises a trailing slash or stray path in the env value", () => {
    process.env.NEXT_PUBLIC_DEALER_APP_URL = "https://dealer.wheewise.com/";
    expect(appHref("dealer", "/dashboard")).toBe("https://dealer.wheewise.com/dashboard");

    process.env.NEXT_PUBLIC_DEALER_APP_URL = "https://dealer.wheewise.com/ignored/path";
    expect(appHref("dealer", "/dashboard")).toBe("https://dealer.wheewise.com/dashboard");
  });

  it("tolerates a path missing its leading slash", () => {
    deployThreeSubdomains();
    expect(appHref("admin", "admin")).toBe("https://admin.wheewise.com/admin");
  });

  it("degrades to same-host rather than crashing on a malformed value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.NEXT_PUBLIC_ADMIN_APP_URL = "not a url";
    expect(appOrigin("admin")).toBeNull();
    expect(appHref("admin", "/admin")).toBe("/admin");
    expect(warn).toHaveBeenCalled();
  });
});

/**
 * `roleRedirectPath` may now return an absolute URL, so it is worth restating
 * that the *user-supplied* redirect input is still refused when absolute.
 */
describe("callbackUrl remains open-redirect resistant", () => {
  it("accepts same-site relative paths", () => {
    expect(safeCallbackPath("/dashboard/leads")).toBe("/dashboard/leads");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "http://wheewise.com.evil.test",
    "",
    null,
    undefined,
  ])("rejects %j", (value) => {
    expect(safeCallbackPath(value as string | null | undefined)).toBeNull();
  });
});
