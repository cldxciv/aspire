import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getArticles, getPrograms } from "@/lib/data";

const staticRoutes = [
  "",
  "/about",
  "/programs",
  "/results",
  "/faculty",
  "/centres",
  "/hostels",
  "/admissions",
  "/resources",
  "/contact",
  "/privacy",
  "/terms",
];

/** Public routes only — portal, login and API routes are never listed. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, articles] = await Promise.all([getPrograms(), getArticles()]);
  return [
    ...staticRoutes.map((path) => ({ url: `${siteConfig.url}${path}` })),
    ...programs.map((p) => ({ url: `${siteConfig.url}/programs/${p.slug}`, lastModified: p.updatedAt })),
    ...articles.map((a) => ({ url: `${siteConfig.url}/resources/${a.slug}`, lastModified: a.publishedAt })),
  ];
}
