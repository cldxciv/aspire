import "server-only";

import { articles } from "@/content/articles";
import { centres } from "@/content/centres";
import { contactDetails } from "@/content/contact";
import { faculty } from "@/content/faculty";
import { faqs } from "@/content/faqs";
import { hi } from "@/content/hi";
import { hostelInfo } from "@/content/hostels";
import { instituteProfile } from "@/content/institute";
import { programs } from "@/content/programs";
import { duplicateCards } from "@/content/result-photos";
import { RESULT_CARD_PATH, rankers, results } from "@/content/results";
import { stats } from "@/content/stats";
import { testimonials } from "@/content/testimonials";
import { showPlaceholderContent } from "@/lib/content-mode";
import type {
  Article,
  Centre,
  ConsentStatus,
  ContactDetails,
  ContentStatus,
  DownloadItem,
  ExamTrack,
  FacultyMember,
  Faq,
  FaqCategory,
  HostelInfo,
  ImageAsset,
  InstituteProfile,
  Program,
  RankerRecord,
  ResultRecord,
  Stat,
  StatGroup,
  Testimonial,
  TestimonialRelation,
} from "@/lib/types";

/**
 * Server-side content access. Pages and API routes read content only through
 * these functions so the source can later move to a CMS/database without
 * touching UI code. All accessors return only publishable records:
 * `published`, plus `placeholder` when showPlaceholderContent() is on.
 * Single-record accessors return `null` when the record is not publishable.
 *
 * Locale (D-028): accessors returning user-visible text take an optional LAST
 * `locale` argument (default "en", so existing callers are unchanged). For
 * "hi" the Hindi overlay from src/content/hi/ is applied AFTER the visibility
 * filters; it replaces text only (field-level fallback to English) and never
 * changes ids, slugs, status, consent, numbers, dates, links or images.
 * Hindi content is a machine draft pending native review
 * (docs/hindi-review-register.md).
 */

/** Content locales. Structurally identical to the site's i18n `Locale`. */
export type ContentLocale = "en" | "hi";

/**
 * Records that carry a person's own words (`quote`, and a testimonial's
 * `headline`). Those words are never translated; in a non-English locale the
 * record is returned with `quoteLang: "en"` so the UI can mark the quote
 * `lang="en"`. Absent in English, where the quote matches the page language.
 */
export type WithQuoteLang<T> = T & { quoteLang?: ContentLocale };

/** `item` in `locale`: unchanged for "en" (and any unknown value), Hindi overlay for "hi". */
function localized<T>(locale: ContentLocale, item: T, toHindi: (item: T) => T): T {
  return locale === "hi" ? toHindi(item) : item;
}

/** Marks the (untranslated) quote of a localised record as English. */
function withQuoteLang<T extends { quote?: string }>(record: T): WithQuoteLang<T> {
  return record.quote ? { ...record, quoteLang: "en" } : record;
}

/**
 * `image` with its alt text in `locale` (English alt when no translation
 * exists). For content images rendered on localised pages.
 */
export function localizeImage<T extends ImageAsset>(image: T, locale: ContentLocale = "en"): T {
  return localized(locale, image, hi.image);
}

/**
 * Display label for a DownloadItem `category`. The category value itself stays
 * English in every locale — filter on it, render this label.
 */
export function getDownloadCategoryLabel(category: string, locale: ContentLocale = "en"): string {
  return localized(locale, category, hi.downloadCategory);
}

function isVisible(item: { status: ContentStatus }): boolean {
  return item.status === "published" || (item.status === "placeholder" && showPlaceholderContent());
}

function visible<T extends { status: ContentStatus }>(items: readonly T[]): T[] {
  return items.filter(isVisible);
}

function visibleOne<T extends { status: ContentStatus }>(item: T): T | null {
  return isVisible(item) ? item : null;
}

export function isPlaceholder(item: { status: ContentStatus }): boolean {
  return item.status === "placeholder";
}

/**
 * Whether a person's name (result, ranker, testimonial) may be shown:
 * - `granted` consent → yes;
 * - a `placeholder` record while showPlaceholderContent() is on (development /
 *   preview, DEMO-labelled) → yes, even though its consent is `pending`;
 * - anything else → no.
 * Server-only (reads the placeholder switch). Compute it on the server and pass
 * the boolean to client components.
 */
export function canShowStudentName(record: { consentStatus: ConsentStatus; status: ContentStatus }): boolean {
  return record.consentStatus === "granted" || (record.status === "placeholder" && showPlaceholderContent());
}

/**
 * People-centred records (results, rankers, testimonials): in production only
 * `published` + `granted`; in development / preview also placeholders.
 */
function visibleWithConsent<T extends { status: ContentStatus; consentStatus: ConsentStatus }>(items: readonly T[]): T[] {
  return visible(items).filter(canShowStudentName);
}

/** Sentinel for generateStaticParams, which must return at least one entry under Cache Components. */
export const STATIC_PARAM_FALLBACK = "__none__";

// Programs

/**
 * Visible programs. `exam` matches the primary track only (existing behaviour);
 * `track` matches any of a program's `tracks` (e.g. dual JEE/NEET courses).
 */
export async function getPrograms(
  filter?: { exam?: ExamTrack; track?: ExamTrack },
  locale: ContentLocale = "en",
): Promise<Program[]> {
  return visible(programs)
    .filter(
      (p) =>
        (!filter?.exam || p.exam === filter.exam) &&
        (!filter?.track || (p.tracks ?? [p.exam]).includes(filter.track)),
    )
    .map((p) => localized(locale, p, hi.program));
}

/** One visible program by slug, or null. */
export async function getProgram(slug: string, locale: ContentLocale = "en"): Promise<Program | null> {
  const program = visible(programs).find((p) => p.slug === slug);
  return program ? localized(locale, program, hi.program) : null;
}

/** All slugs (any status) for generateStaticParams; pages must still call getProgram() and notFound(). */
export function getProgramSlugs(): string[] {
  const slugs = programs.map((p) => p.slug);
  return slugs.length > 0 ? slugs : [STATIC_PARAM_FALLBACK];
}

// Centres

/**
 * Visible centres. `query` matches name, district or a district the centre
 * serves (e.g. "Mandi" finds the Kullu centre); `exam` matches `programs`.
 * With locale "hi" the query matches the English and the Hindi text
 * ("Mandi" and "मंडी" both find Kullu).
 */
export async function getCentres(
  filter?: { query?: string; exam?: ExamTrack },
  locale: ContentLocale = "en",
): Promise<Centre[]> {
  const query = filter?.query?.trim().toLowerCase();
  const matches = (c: Centre) =>
    !query ||
    c.name.toLowerCase().includes(query) ||
    c.district.toLowerCase().includes(query) ||
    (c.servesDistricts ?? []).some((d) => d.toLowerCase().includes(query));
  return visible(centres)
    .filter((c) => !filter?.exam || c.programs.includes(filter.exam))
    .map((c) => ({ en: c, out: localized(locale, c, hi.centre) }))
    .filter(({ en, out }) => matches(en) || (out !== en && matches(out)))
    .map(({ out }) => out);
}

/** One visible centre by slug, or null. */
export async function getCentre(slug: string, locale: ContentLocale = "en"): Promise<Centre | null> {
  const centre = visible(centres).find((c) => c.slug === slug);
  return centre ? localized(locale, centre, hi.centre) : null;
}

// Results — consent is enforced here as well as by status.

/**
 * Detailed result records (selections wall), newest year first. Production:
 * only `published` with `granted` consent. Development / preview: also
 * placeholders. Use canShowStudentName() before rendering a name.
 * Hindi: only generic labels are translated; names, ranks and quotes stay as
 * they are (`quoteLang: "en"` on records with a quote).
 */
export async function getResults(
  filter?: {
    year?: number;
    exam?: ExamTrack;
    centreSlug?: string;
  },
  locale: ContentLocale = "en",
): Promise<WithQuoteLang<ResultRecord>[]> {
  return visibleWithConsent(results)
    .filter(
      (r) =>
        (!filter?.year || r.year === filter.year) &&
        (!filter?.exam || r.exam === filter.exam) &&
        (!filter?.centreSlug || r.centreSlug === filter.centreSlug),
    )
    .sort((a, b) => b.year - a.year)
    .map((r) => localized<WithQuoteLang<ResultRecord>>(locale, r, (en) => withQuoteLang(hi.result(en))));
}

/** Distinct years of getResults(), newest first. */
export async function getResultYears(): Promise<number[]> {
  const years = new Set((await getResults()).map((r) => r.year));
  return [...years].sort((a, b) => b - a);
}

/** Featured success stories (with school and quote) for the home page; same visibility rule as getResults(). */
export async function getFeaturedResults(locale: ContentLocale = "en"): Promise<WithQuoteLang<ResultRecord>[]> {
  return (await getResults(undefined, locale)).filter((r) => r.featured);
}

/**
 * Verified-rankers list (name, institution, exam, year), in source order
 * (newest first); same visibility rule as getResults(). Up to 715 entries —
 * paginate in the UI. Hindi translates only generic notes ("From SSB Batch").
 */
export async function getRankers(
  filter?: { exam?: ExamTrack; year?: number },
  locale: ContentLocale = "en",
): Promise<RankerRecord[]> {
  return visibleWithConsent(rankers)
    .filter((r) => (!filter?.exam || r.exam === filter.exam) && (!filter?.year || r.year === filter.year))
    .map((r) => localized(locale, r, hi.ranker));
}

/**
 * One result card (D-031) for ResultCardMosaic / ResultCardMarquee: the card image (a student's
 * photo, college and name, from Aspire's demo site) plus the data shown or announced with it.
 * Only produced for records whose name may be shown, so it is safe to render as is.
 */
export interface ResultCard {
  /** Record id (e.g. "ranker-24") — a stable React key. */
  id: string;
  /** The card; `alt` is in the requested locale. Served by GET /api/result-cards/[file]. */
  photo: ImageAsset;
  name: string;
  /** College / institute exactly as listed, e.g. "NIT Hamirpur", "MBBS · Tanda". */
  institute?: string;
  exam: ExamTrack;
  year: number;
  /** Exam and year as on the source's chip, e.g. "JEE 2026" (Latin script in every locale). */
  label: string;
  /** Placeholder record: render the DEMO badge (D-005). */
  placeholder: boolean;
}

/**
 * Result cards for image slots (D-031), most recent first: latest year, then the source order.
 * Only visible ranker records with a photo whose name may be shown (same rule as getRankers()
 * and canShowStudentName()), so the list is EMPTY in production while the imported records are
 * placeholders with consent pending — render a fallback then. Repeated cards (the same student's
 * card listed twice by the source) appear once. `limit` ≤ 0 or absent = all.
 *
 * Locale: pass it last like every accessor (`getResultCards({ exam: "NEET" }, locale)`) or as
 * `filter.locale`; Hindi changes only the alt text.
 */
export async function getResultCards(
  filter?: { exam?: ExamTrack; year?: number; limit?: number; locale?: ContentLocale },
  locale: ContentLocale = filter?.locale ?? "en",
): Promise<ResultCard[]> {
  const limit = filter?.limit && filter.limit > 0 ? Math.floor(filter.limit) : undefined;
  return visibleWithConsent(rankers)
    .filter(
      (r): r is RankerRecord & { photo: ImageAsset } =>
        r.photo !== undefined &&
        !duplicateCards[r.id] &&
        (!filter?.exam || r.exam === filter.exam) &&
        (!filter?.year || r.year === filter.year),
    )
    .sort((a, b) => b.year - a.year) // stable: source order within a year
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      photo: localizeImage(r.photo, locale),
      name: r.studentDisplayName.trim(),
      ...(r.institution?.trim() ? { institute: r.institution.trim() } : {}),
      exam: r.exam,
      year: r.year,
      label: `${r.exam} ${r.year}`,
      placeholder: isPlaceholder(r),
    }));
}

/**
 * Whether GET /api/result-cards/[file] may serve `file` (e.g. "ranker-24.webp") at request time: only
 * when a visible record whose name may be shown carries that photo — the same rule as names.
 * False for every file in production while the records are placeholders / consent pending.
 */
export function canServeResultCard(file: string): boolean {
  const src = `${RESULT_CARD_PATH}${file}`;
  return [...visibleWithConsent(rankers), ...visibleWithConsent(results)].some((r) => r.photo?.src === src);
}

/** One row of getRankerYearCounts(): counts only — never names. */
export interface RankerYearCount {
  year: number;
  jee: number;
  neet: number;
  /** True when any counted entry is a placeholder record (render a DEMO badge). */
  placeholder: boolean;
}

/**
 * Entries in the rankers list per exam year (JEE / NEET), for the homepage
 * impact chart (D-025). Same visibility rule as getRankers() — empty in
 * production today. Exact duplicate rows (same name, institution, exam and
 * year; 7 pairs in the demo import, C31) are counted once. These are list
 * entries, NOT ranks. Returns ascending years within [from, to].
 */
export async function getRankerYearCounts(range?: { from?: number; to?: number }): Promise<RankerYearCount[]> {
  const seen = new Set<string>();
  const byYear = new Map<number, RankerYearCount>();
  for (const r of await getRankers()) {
    if ((range?.from && r.year < range.from) || (range?.to && r.year > range.to)) continue;
    const key = [r.studentDisplayName, r.institution ?? "", r.exam, r.year].join("|").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const row = byYear.get(r.year) ?? { year: r.year, jee: 0, neet: 0, placeholder: false };
    if (r.exam === "JEE") row.jee += 1;
    else if (r.exam === "NEET") row.neet += 1;
    row.placeholder ||= r.status === "placeholder";
    byYear.set(r.year, row);
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}

// Faculty

/** Visible faculty members, optionally for one home campus. */
export async function getFaculty(filter?: { centreSlug?: string }): Promise<FacultyMember[]> {
  return visible(faculty).filter((f) => !filter?.centreSlug || f.centreSlug === filter.centreSlug);
}

/** One visible faculty member by slug, or null. */
export async function getFacultyMember(slug: string): Promise<FacultyMember | null> {
  return visible(faculty).find((f) => f.slug === slug) ?? null;
}

/** All faculty slugs (any status) for generateStaticParams; always ≥1 entry. */
export function getFacultySlugs(): string[] {
  const slugs = faculty.map((f) => f.slug);
  return slugs.length > 0 ? slugs : [STATIC_PARAM_FALLBACK];
}

// Testimonials

/**
 * Visible parent / student testimonials; same consent rule as results
 * (production: `published` + `granted` only). Optional filters by campus,
 * relation or the faculty member they mention. Hindi: quotes, headlines and
 * names stay as written (`quoteLang: "en"`); only captions, home towns and
 * generic descriptors are translated.
 */
export async function getTestimonials(
  filter?: {
    centreSlug?: string;
    relation?: TestimonialRelation;
    facultySlug?: string;
  },
  locale: ContentLocale = "en",
): Promise<WithQuoteLang<Testimonial>[]> {
  return visibleWithConsent(testimonials)
    .filter(
      (t) =>
        (!filter?.centreSlug || t.centreSlug === filter.centreSlug) &&
        (!filter?.relation || t.relation === filter.relation) &&
        (!filter?.facultySlug || (t.facultySlugs ?? []).includes(filter.facultySlug)),
    )
    .map((t) => localized<WithQuoteLang<Testimonial>>(locale, t, (en) => withQuoteLang(hi.testimonial(en))));
}

// Stats

/** Visible headline figures (value, label, context), optionally one group. */
export async function getStats(group?: StatGroup, locale: ContentLocale = "en"): Promise<Stat[]> {
  return visible(stats)
    .filter((s) => !group || s.group === group)
    .map((s) => localized(locale, s, hi.stat));
}

// Hostels

/** Hostel / residential information (facilities, routine, per-campus blocks), or null when not publishable. */
export async function getHostelInfo(locale: ContentLocale = "en"): Promise<HostelInfo | null> {
  const info = visibleOne(hostelInfo);
  if (!info) return null;
  const visibleCentres = new Set(visible(centres).map((c) => c.slug));
  const filtered = { ...info, campuses: info.campuses.filter((c) => visibleCentres.has(c.centreSlug)) };
  return localized(locale, filtered, hi.hostelInfo);
}

// Institute profile

/** Founding story, approach, milestones, social links and downloads, or null when not publishable. */
export async function getInstituteProfile(locale: ContentLocale = "en"): Promise<InstituteProfile | null> {
  const profile = visibleOne(instituteProfile);
  return profile ? localized(locale, profile, hi.instituteProfile) : null;
}

/** Downloads list from the institute profile (empty when not publishable). Entries with `available: false` have no file yet. */
export async function getDownloads(locale: ContentLocale = "en"): Promise<DownloadItem[]> {
  return (await getInstituteProfile(locale))?.downloads ?? [];
}

// Contact

/**
 * Phone, email, WhatsApp, hours and per-campus desks, or null when not
 * publishable (production until Aspire verifies them). Campus desks are limited
 * to visible centres. Header and footer should hide contact UI on null.
 */
export async function getContactDetails(locale: ContentLocale = "en"): Promise<ContactDetails | null> {
  const details = visibleOne(contactDetails);
  if (!details) return null;
  const visibleCentres = new Set(visible(centres).map((c) => c.slug));
  const filtered = {
    ...details,
    campusContacts: details.campusContacts.filter((c) => visibleCentres.has(c.centreSlug)),
  };
  return localized(locale, filtered, hi.contactDetails);
}

// Articles

/** Visible articles, newest first. */
export async function getArticles(locale: ContentLocale = "en"): Promise<Article[]> {
  return visible(articles)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .map((a) => localized(locale, a, hi.article));
}

/** One visible article by slug, or null. */
export async function getArticle(slug: string, locale: ContentLocale = "en"): Promise<Article | null> {
  const article = visible(articles).find((a) => a.slug === slug);
  return article ? localized(locale, article, hi.article) : null;
}

/** All article slugs (any status) for generateStaticParams; always ≥1 entry. */
export function getArticleSlugs(): string[] {
  const slugs = articles.map((a) => a.slug);
  return slugs.length > 0 ? slugs : [STATIC_PARAM_FALLBACK];
}

// FAQs

/** Visible FAQs, optionally one category. */
export async function getFaqs(category?: FaqCategory, locale: ContentLocale = "en"): Promise<Faq[]> {
  return visible(faqs)
    .filter((f) => !category || f.category === category)
    .map((f) => localized(locale, f, hi.faq));
}
