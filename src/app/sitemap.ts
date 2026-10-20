import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { locales } from "@/i18n/config";
import { languageAlternates } from "@/i18n/metadata";
import { localePath } from "@/i18n/paths";
import { getArticles, getPrograms } from "@/lib/data";

const staticRoutes = [
  "/",
  "/about",
  "/programs",
  "/results",
  "/centres",
  "/hostels",
  "/admissions",
  "/resources",
  "/contact",
  "/privacy",
  "/terms",
];

/** Absolute URL for a public href (`/` → the bare origin, matching the previous sitemap). */
function absolute(href: string): string {
  return href === "/" ? siteConfig.url : `${siteConfig.url}${href}`;
}

/**
 * Public routes only — portal, login and API routes are never listed. Every page is listed
 * once per locale (English unprefixed, Hindi under /hi) with hreflang alternates (D-028).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, articles] = await Promise.all([getPrograms(), getArticles()]);
  const pages: { path: string; lastModified?: string }[] = [
    ...staticRoutes.map((path) => ({ path })),
    ...programs.map((p) => ({ path: `/programs/${p.slug}`, lastModified: p.updatedAt })),
    ...articles.map((a) => ({ path: `/resources/${a.slug}`, lastModified: a.publishedAt })),
  ];
  return pages.flatMap(({ path, lastModified }) =>
    locales.map((locale) => ({
      url: absolute(localePath(path, locale)),
      ...(lastModified ? { lastModified } : {}),
      alternates: { languages: languageAlternates(path, absolute) },
    })),
  );
}
