import type { MetadataRoute } from "next";

/**
 * This app is a staff/dealer console, not public content. Nothing here should
 * ever appear in a search index.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
