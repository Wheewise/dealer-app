import { test, expect } from "@playwright/test";

// Relies on the demo seed (npm run db:seed) — slug from prisma/seed.ts.
const SLUG = process.env.E2E_DEMO_SLUG ?? "sharma-auto-indore";

test("dealer showcase renders all major sections", async ({ page }) => {
  const res = await page.goto(`/s/${SLUG}/showcase`);
  expect(res?.status()).toBe(200);

  // Hero — business name + member-since chip.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/MEMBER SINCE/i)).toBeVisible();

  // Trust strip stats — "In stock" / "Sold to date" / "On Wheewise".
  await expect(page.getByText("In stock")).toBeVisible();
  await expect(page.getByText("Sold to date")).toBeVisible();

  // Featured carousel headline.
  await expect(page.getByRole("heading", { name: /Showroom highlights/i })).toBeVisible();

  // Inventory section.
  await expect(page.getByRole("heading", { name: /All vehicles/i })).toBeVisible();

  // Inquiry form.
  await expect(page.getByRole("heading", { name: /Get in touch/i })).toBeVisible();

  // At least one vehicle tile resolves to /vehicle/<id>.
  const vehicleLinks = page.locator('a[href^="/vehicle/"]');
  await expect(vehicleLinks.first()).toBeVisible();
});

test("legacy /s/[slug] permanently redirects to the showcase", async ({ page }) => {
  const res = await page.goto(`/s/${SLUG}`);
  expect(res?.status()).toBe(200); // final response after following the 308
  expect(page.url()).toMatch(/\/showcase$/);
});

test("legacy storefront preserves filter query params on redirect", async ({ page }) => {
  await page.goto(`/s/${SLUG}?type=CAR`);
  expect(page.url()).toMatch(/\/s\/[^/]+\/showcase\?type=CAR$/);
});
