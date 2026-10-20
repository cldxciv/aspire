import "server-only";

import {
  getArticles,
  getCentres,
  getFaqs,
  getPrograms,
  getRankers,
  getResults,
  getStats,
  getTestimonials,
} from "@/lib/data";
import { showPlaceholderContent } from "@/lib/content-mode";
import type { ConsentStatus, ContentStatus } from "@/lib/types";

/** Content types counted on "What's on the website" (`portal.admin.website.types`). */
export type WebsiteContentKey = "programs" | "centres" | "results" | "rankers" | "testimonials" | "stats" | "articles" | "faqs";

export type WebsiteContentRow = {
  key: WebsiteContentKey;
  /** Records the public website shows right now. */
  shown: number;
  /** Of those, placeholders (shown only in demo mode, marked DEMO). */
  demo: number;
  /** Of those, approved (`published`) records. */
  approved: number;
  /** People records only: names shown without `granted` consent (only possible in demo mode). */
  withoutConsent: number | null;
  /** LOCALE-FREE path of the public page that shows them. */
  href: string;
};

export type WebsiteInventory = { demoMode: boolean; rows: WebsiteContentRow[] };

type Countable = { status: ContentStatus; consentStatus?: ConsentStatus };

/** Counts for one content type from the records the website shows (pure; exported for tests). */
export function countRecords(key: WebsiteContentKey, records: readonly Countable[], href: string, people = false): WebsiteContentRow {
  return {
    key,
    shown: records.length,
    demo: records.filter((record) => record.status === "placeholder").length,
    approved: records.filter((record) => record.status === "published").length,
    withoutConsent: people ? records.filter((record) => record.consentStatus !== "granted").length : null,
    href,
  };
}

/**
 * What the public website shows right now, read through `src/lib/data.ts` (the same accessors
 * and visibility rules the public pages use), so the counts can never disagree with the site.
 * Counts only: no names or other personal details leave this function. Request-time: render it
 * under `<PortalGate>` (the placeholder switch is read from the environment).
 */
export async function getWebsiteInventory(): Promise<WebsiteInventory> {
  const [programs, centres, results, rankers, testimonials, stats, articles, faqs] = await Promise.all([
    getPrograms(),
    getCentres(),
    getResults(),
    getRankers(),
    getTestimonials(),
    getStats(),
    getArticles(),
    getFaqs(),
  ]);
  return {
    demoMode: showPlaceholderContent(),
    rows: [
      countRecords("programs", programs, "/programs"),
      countRecords("centres", centres, "/centres"),
      countRecords("results", results, "/results", true),
      countRecords("rankers", rankers, "/results", true),
      countRecords("testimonials", testimonials, "/", true),
      countRecords("stats", stats, "/"),
      countRecords("articles", articles, "/resources"),
      countRecords("faqs", faqs, "/admissions"),
    ],
  };
}
