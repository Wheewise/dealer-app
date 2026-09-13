import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_URL || "https://dealer.wheewise.com";

// Only /signup is a real public page worth indexing — /login is a utility
// page with no unique content, / just redirects, and everything else
// under /dashboard and /onboarding is signed-in-only.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${APP_URL}/signup`,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
