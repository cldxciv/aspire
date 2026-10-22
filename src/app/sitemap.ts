import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { examPatternServesPaper, loadExamPatternItems } from "@/components/mocktest/exam-pattern-items";
import { siteConfig } from "@/config/site";
import { SYLLABUS_STATUS } from "@/content/planner/syllabus";
import { locales } from "@/i18n/config";
import { languageAlternates } from "@/i18n/metadata";
import { localePath } from "@/i18n/paths";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getArticles, getPrograms } from "@/lib/data";
import { getVisibleMockTests } from "@/lib/mocktest/catalog";
import { isLeaderboardTest } from "@/lib/mocktest/timing";
import { getPredictorData } from "@/lib/predictor/data";

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
  "/tools",
  // Rancho, the AI doubt solver: live (the Ask page and the Rancho app home).
  "/tools/ask",
  "/rancho",
];

/**
 * Tool pages that only work with content Aspire has not published yet. Each is listed only while
 * its page shows the tool, using the same check as the page itself; otherwise the page is a
 * "coming soon" notice and stays out of the sitemap (in production today, none of the four is listed).
 */
function availableToolRoutes(): string[] {
  const mockTests = getVisibleMockTests();
  const tools: [path: string, available: boolean][] = [
    ["/tools/predictor", getPredictorData() !== null],
    ["/tools/mock-tests", mockTests.length > 0],
    ["/tools/mock-tests/leaderboard", mockTests.some(isLeaderboardTest)],
    ["/tools/planner", SYLLABUS_STATUS === "published" || showPlaceholderContent()],
  ];
  return tools.filter(([, available]) => available).map(([path]) => path);
}

/**
 * Exam-pattern mock pages (/tools/mock-tests/exam/[slot]) whose exam can serve a paper right now —
 * full length or a labelled shorter set — by the same check as the list on /tools/mock-tests. The
 * bank is read at request time (`connection()` first, as on the list), so the sitemap is dynamic;
 * if the bank cannot be read, no exam page is listed.
 */
async function availableExamRoutes(): Promise<string[]> {
  await connection();
  const items = await loadExamPatternItems({ placeholderMode: showPlaceholderContent() });
  return (items ?? []).filter(examPatternServesPaper).map((item) => `/tools/mock-tests/exam/${item.slot}`);
}

/** Absolute URL for a public href (`/` → the bare origin, matching the previous sitemap). */
function absolute(href: string): string {
  return href === "/" ? siteConfig.url : `${siteConfig.url}${href}`;
}

/**
 * Public routes only — portal, CRM, login and API routes are never listed. Every page is listed
 * once per locale (English unprefixed, Hindi under /hi) with hreflang alternates (D-028).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [programs, articles, examRoutes] = await Promise.all([getPrograms(), getArticles(), availableExamRoutes()]);
  const pages: { path: string; lastModified?: string }[] = [
    ...staticRoutes.map((path) => ({ path })),
    ...availableToolRoutes().map((path) => ({ path })),
    ...examRoutes.map((path) => ({ path })),
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
