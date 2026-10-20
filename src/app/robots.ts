import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n/config";
import { localePath } from "@/i18n/paths";
import { showPlaceholderContent } from "@/lib/content-mode";

/** Portal, account and sign-in pages, disallowed in every locale (`/student`, `/hi/student`, …). */
const PRIVATE_PATHS = ["/student", "/parent", "/admin", "/account", "/login"];

export default function robots(): MetadataRoute.Robots {
  // Preview builds (placeholder content visible) must not be crawled at all.
  if (showPlaceholderContent()) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...locales.flatMap((locale) => PRIVATE_PATHS.map((path) => localePath(path, locale)))],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
