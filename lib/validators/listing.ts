import { z } from "zod";
import { imageUrl } from "./url";

export const VEHICLE_TYPES = ["CAR", "BIKE"] as const;
export const FUEL_TYPES = ["PETROL", "DIESEL", "CNG", "ELECTRIC", "HYBRID"] as const;
export const TRANSMISSIONS = ["MANUAL", "AUTOMATIC", "AMT", "CVT"] as const;
export const VEHICLE_CONDITIONS = ["A", "B", "C"] as const;

export const listingSchema = z.object({
  vehicleType: z.enum(VEHICLE_TYPES),
  make: z.string().min(1, "Required").max(40),
  model: z.string().min(1, "Required").max(60),
  year: z.coerce
    .number()
    .int()
    .min(1980, "Year too old")
    .max(new Date().getFullYear() + 1, "Year too far in future"),
  fuelType: z.enum(FUEL_TYPES),
  transmission: z.enum(TRANSMISSIONS).optional(),
  odometerKm: z.coerce.number().int().min(0).max(1_000_000),
  askingPrice: z.coerce.number().min(1000, "Price too low").max(100_000_000),
  condition: z.enum(VEHICLE_CONDITIONS).optional(),
  testDriveAvailable: z.coerce.boolean().optional(),
  description: z.string().max(4000).optional(),
  city: z.string().min(2, "Required").max(60),
  photoUrls: z
    .array(imageUrl)
    .min(1, "Add at least 1 photo")
    .max(10, "Max 10 photos"),
});

export type ListingInput = z.infer<typeof listingSchema>;
