import type { MetadataRoute } from "next";

const APP_URL = process.env.APP_URL || "https://dealer.wheewise.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/onboarding"],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
