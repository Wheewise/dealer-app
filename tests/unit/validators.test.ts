import { describe, it, expect } from "vitest";
import { listingSchema } from "../../lib/validators/listing";
import { storeSchema } from "../../lib/validators/store";

describe("listingSchema", () => {
  const validListing = {
    vehicleType: "CAR",
    make: "Hyundai",
    model: "Creta",
    year: "2021",
    fuelType: "PETROL",
    transmission: "MANUAL",
    odometerKm: "45000",
    askingPrice: "950000",
    description:
      "Well-maintained Hyundai Creta, single owner, all service records available.",
    city: "Mumbai",
    photoUrls: ["https://media.example.com/photo1.jpg"],
  };

  it("accepts a valid listing", () => {
    const result = listingSchema.safeParse(validListing);
    expect(result.success).toBe(true);
  });

  it("rejects missing make", () => {
    const result = listingSchema.safeParse({ ...validListing, make: "" });
    expect(result.success).toBe(false);
  });

  it("rejects price too low", () => {
    const result = listingSchema.safeParse({ ...validListing, askingPrice: "500" });
    expect(result.success).toBe(false);
  });

  it("accepts short description", () => {
    const result = listingSchema.safeParse({ ...validListing, description: "Too short" });
    expect(result.success).toBe(true);
  });

  it("rejects no photos", () => {
    const result = listingSchema.safeParse({ ...validListing, photoUrls: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 10 photos", () => {
    const urls = Array.from(
      { length: 11 },
      (_, i) => `https://media.example.com/photo${i}.jpg`,
    );
    const result = listingSchema.safeParse({ ...validListing, photoUrls: urls });
    expect(result.success).toBe(false);
  });

  it("rejects invalid vehicle type", () => {
    const result = listingSchema.safeParse({ ...validListing, vehicleType: "TRUCK" });
    expect(result.success).toBe(false);
  });

  it("coerces numeric strings to numbers", () => {
    const result = listingSchema.safeParse(validListing);
    if (result.success) {
      expect(typeof result.data.year).toBe("number");
      expect(typeof result.data.odometerKm).toBe("number");
      expect(typeof result.data.askingPrice).toBe("number");
    }
  });

  it("rejects year outside range", () => {
    const result = listingSchema.safeParse({ ...validListing, year: "1975" });
    expect(result.success).toBe(false);
  });
});

describe("storeSchema", () => {
  const validStore = {
    slug: "my-dealer-store",
    bio: "Trusted dealer since 2010.",
    primaryColor: "#DC2626",
    logoUrl: "https://media.example.com/logo.png",
    bannerUrl: "https://media.example.com/banner.png",
  };

  it("accepts a valid store", () => {
    const result = storeSchema.safeParse(validStore);
    expect(result.success).toBe(true);
  });

  it("rejects slug with uppercase", () => {
    const result = storeSchema.safeParse({ ...validStore, slug: "My-Store" });
    expect(result.success).toBe(false);
  });

  it("rejects slug shorter than 3 chars", () => {
    const result = storeSchema.safeParse({ ...validStore, slug: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects slug with special characters", () => {
    const result = storeSchema.safeParse({ ...validStore, slug: "my_store!" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid hex color", () => {
    const result = storeSchema.safeParse({ ...validStore, primaryColor: "red" });
    expect(result.success).toBe(false);
  });

  it("accepts optional fields as empty", () => {
    const result = storeSchema.safeParse({
      ...validStore,
      bio: "",
      logoUrl: "",
      bannerUrl: "",
    });
    expect(result.success).toBe(true);
  });
});
