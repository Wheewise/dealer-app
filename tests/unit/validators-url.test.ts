import { describe, it, expect, afterEach } from "vitest";
import { isSafeImageUrl, imageUrl } from "../../lib/validators/url";
import { listingSchema } from "../../lib/validators/listing";
import { storeSchema } from "../../lib/validators/store";

afterEach(() => {
  delete process.env.UPLOAD_HOST_ALLOWLIST;
});

describe("isSafeImageUrl", () => {
  it("accepts ordinary https URLs", () => {
    expect(isSafeImageUrl("https://cdn.example.com/a.jpg")).toBe(true);
    expect(isSafeImageUrl("https://x.public.blob.vercel-storage.com/p.webp")).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "http://cdn.example.com/a.jpg",
    "vbscript:msgbox(1)",
  ])("rejects the %j scheme", (value) => {
    expect(isSafeImageUrl(value)).toBe(false);
  });

  it.each([
    "https://localhost/a.jpg",
    "https://127.0.0.1/a.jpg",
    "https://169.254.169.254/latest/meta-data/",
    "https://10.0.0.5/a.jpg",
    "https://192.168.1.1/a.jpg",
    "https://172.16.0.1/a.jpg",
    "https://[::1]/a.jpg",
  ])("rejects the internal host %j", (value) => {
    expect(isSafeImageUrl(value)).toBe(false);
  });

  it("rejects credentials embedded in the authority", () => {
    expect(isSafeImageUrl("https://user:pass@cdn.example.com/a.jpg")).toBe(false);
  });

  it("rejects unparseable values", () => {
    expect(isSafeImageUrl("not a url")).toBe(false);
    expect(isSafeImageUrl("")).toBe(false);
  });

  it("honours an operator allowlist, including subdomains", () => {
    process.env.UPLOAD_HOST_ALLOWLIST = "blob.vercel-storage.com, cdn.wheewise.com";
    expect(isSafeImageUrl("https://cdn.wheewise.com/a.jpg")).toBe(true);
    expect(isSafeImageUrl("https://x.blob.vercel-storage.com/a.jpg")).toBe(true);
    expect(isSafeImageUrl("https://evil.example.com/a.jpg")).toBe(false);
    // Suffix must be on a dot boundary, so a lookalike host is not admitted.
    expect(isSafeImageUrl("https://notcdn.wheewise.com.evil.test/a.jpg")).toBe(false);
  });

  it("exposes the same policy through the zod schema", () => {
    expect(imageUrl.safeParse("https://cdn.example.com/a.jpg").success).toBe(true);
    expect(imageUrl.safeParse("http://cdn.example.com/a.jpg").success).toBe(false);
  });
});

describe("schemas reject hostile image URLs", () => {
  const validListing = {
    vehicleType: "CAR",
    make: "Honda",
    model: "City",
    year: 2020,
    fuelType: "PETROL",
    odometerKm: 40000,
    askingPrice: 500000,
    city: "Indore",
  };

  it("listingSchema accepts safe photo URLs", () => {
    const result = listingSchema.safeParse({
      ...validListing,
      photoUrls: ["https://cdn.example.com/1.jpg"],
    });
    expect(result.success).toBe(true);
  });

  it("listingSchema rejects a javascript: photo URL", () => {
    const result = listingSchema.safeParse({
      ...validListing,
      photoUrls: ["javascript:alert(document.cookie)"],
    });
    expect(result.success).toBe(false);
  });

  it("listingSchema rejects a cloud-metadata photo URL", () => {
    const result = listingSchema.safeParse({
      ...validListing,
      photoUrls: ["https://169.254.169.254/latest/meta-data/iam/"],
    });
    expect(result.success).toBe(false);
  });

  it("storeSchema rejects a hostile logo URL but keeps the empty-string case", () => {
    const base = { slug: "my-store", primaryColor: "#DC2626" };
    expect(storeSchema.safeParse({ ...base, logoUrl: "" }).success).toBe(true);
    expect(
      storeSchema.safeParse({ ...base, logoUrl: "https://cdn.example.com/l.png" })
        .success,
    ).toBe(true);
    expect(
      storeSchema.safeParse({ ...base, logoUrl: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      storeSchema.safeParse({ ...base, bannerUrl: "http://127.0.0.1/b.png" }).success,
    ).toBe(false);
  });
});
