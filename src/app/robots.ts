import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { showPlaceholderContent } from "@/lib/content-mode";

export default function robots(): MetadataRoute.Robots {
  // Preview builds (placeholder content visible) must not be crawled at all.
  if (showPlaceholderContent()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/student", "/parent", "/admin", "/login"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
