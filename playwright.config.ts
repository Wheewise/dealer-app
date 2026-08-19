import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3017";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Reuse a dev server only if one isn't already up on the port.
  // The CI workflow boots its own server via `npm run dev`.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "PORT=3017 npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
