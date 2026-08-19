import { z } from "zod";
import { imageUrl } from "./url";

export const storeSchema = z.object({
  slug: z
    .string()
    .min(3, "At least 3 characters")
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  bio: z.string().max(500).optional().or(z.literal("")),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #DC2626"),
  logoUrl: imageUrl.optional().or(z.literal("")),
  bannerUrl: imageUrl.optional().or(z.literal("")),
});

export type StoreInput = z.infer<typeof storeSchema>;
