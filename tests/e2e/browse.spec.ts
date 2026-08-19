import { test, expect } from "@playwright/test";

test("browse page loads", async ({ page }) => {
  await page.goto("/browse");
  await expect(page).toHaveTitle(/Browse pre-owned cars and bikes/);
  const heading = page.locator("h1", { hasText: /Browse/ });
  await expect(heading).toBeVisible();
  await expect(page.locator("form")).toBeVisible();
});

test("homepage renders the brand hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1", { hasText: /Smart Wheels/i })).toBeVisible();
  // Privacy + Terms links live in the global footer added by Cluster D.
  await expect(page.getByRole("link", { name: /Privacy/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Terms/i })).toBeVisible();
});

test("legal pages render", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible();
});
