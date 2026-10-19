import "server-only";

import { articles } from "@/content/articles";
import { centres } from "@/content/centres";
import { contactDetails } from "@/content/contact";
import { faculty } from "@/content/faculty";
import { faqs } from "@/content/faqs";
import { hostelInfo } from "@/content/hostels";
import { instituteProfile } from "@/content/institute";
import { programs } from "@/content/programs";
import { rankers, results } from "@/content/results";
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
 */

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
export async function getPrograms(filter?: { exam?: ExamTrack; track?: ExamTrack }): Promise<Program[]> {
  return visible(programs).filter(
    (p) =>
      (!filter?.exam || p.exam === filter.exam) &&
      (!filter?.track || (p.tracks ?? [p.exam]).includes(filter.track)),
  );
}

/** One visible program by slug, or null. */
export async function getProgram(slug: string): Promise<Program | null> {
  return visible(programs).find((p) => p.slug === slug) ?? null;
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
 */
export async function getCentres(filter?: { query?: string; exam?: ExamTrack }): Promise<Centre[]> {
  const query = filter?.query?.trim().toLowerCase();
  return visible(centres).filter(
    (c) =>
      (!query ||
        c.name.toLowerCase().includes(query) ||
        c.district.toLowerCase().includes(query) ||
        (c.servesDistricts ?? []).some((d) => d.toLowerCase().includes(query))) &&
      (!filter?.exam || c.programs.includes(filter.exam)),
  );
}

/** One visible centre by slug, or null. */
export async function getCentre(slug: string): Promise<Centre | null> {
  return visible(centres).find((c) => c.slug === slug) ?? null;
}

// Results — consent is enforced here as well as by status.

/**
 * Detailed result records (selections wall), newest year first. Production:
 * only `published` with `granted` consent. Development / preview: also
 * placeholders. Use canShowStudentName() before rendering a name.
 */
export async function getResults(filter?: {
  year?: number;
  exam?: ExamTrack;
  centreSlug?: string;
}): Promise<ResultRecord[]> {
  return visibleWithConsent(results)
    .filter(
      (r) =>
        (!filter?.year || r.year === filter.year) &&
        (!filter?.exam || r.exam === filter.exam) &&
        (!filter?.centreSlug || r.centreSlug === filter.centreSlug),
    )
    .sort((a, b) => b.year - a.year);
}

/** Distinct years of getResults(), newest first. */
export async function getResultYears(): Promise<number[]> {
  const years = new Set((await getResults()).map((r) => r.year));
  return [...years].sort((a, b) => b - a);
}

/** Featured success stories (with school and quote) for the home page; same visibility rule as getResults(). */
export async function getFeaturedResults(): Promise<ResultRecord[]> {
  return (await getResults()).filter((r) => r.featured);
}

/**
 * Verified-rankers list (name, institution, exam, year), in source order
 * (newest first); same visibility rule as getResults(). Up to 715 entries —
 * paginate in the UI.
 */
export async function getRankers(filter?: { exam?: ExamTrack; year?: number }): Promise<RankerRecord[]> {
  return visibleWithConsent(rankers).filter(
    (r) => (!filter?.exam || r.exam === filter.exam) && (!filter?.year || r.year === filter.year),
  );
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
 * relation or the faculty member they mention.
 */
export async function getTestimonials(filter?: {
  centreSlug?: string;
  relation?: TestimonialRelation;
  facultySlug?: string;
}): Promise<Testimonial[]> {
  return visibleWithConsent(testimonials).filter(
    (t) =>
      (!filter?.centreSlug || t.centreSlug === filter.centreSlug) &&
      (!filter?.relation || t.relation === filter.relation) &&
      (!filter?.facultySlug || (t.facultySlugs ?? []).includes(filter.facultySlug)),
  );
}

// Stats

/** Visible headline figures (value, label, context), optionally one group. */
export async function getStats(group?: StatGroup): Promise<Stat[]> {
  return visible(stats).filter((s) => !group || s.group === group);
}

// Hostels

/** Hostel / residential information (facilities, routine, per-campus blocks), or null when not publishable. */
export async function getHostelInfo(): Promise<HostelInfo | null> {
  const info = visibleOne(hostelInfo);
  if (!info) return null;
  const visibleCentres = new Set(visible(centres).map((c) => c.slug));
  return { ...info, campuses: info.campuses.filter((c) => visibleCentres.has(c.centreSlug)) };
}

// Institute profile

/** Founding story, approach, milestones, social links and downloads, or null when not publishable. */
export async function getInstituteProfile(): Promise<InstituteProfile | null> {
  return visibleOne(instituteProfile);
}

/** Downloads list from the institute profile (empty when not publishable). Entries with `available: false` have no file yet. */
export async function getDownloads(): Promise<DownloadItem[]> {
  return (await getInstituteProfile())?.downloads ?? [];
}

// Contact

/**
 * Phone, email, WhatsApp, hours and per-campus desks, or null when not
 * publishable (production until Aspire verifies them). Campus desks are limited
 * to visible centres. Header and footer should hide contact UI on null.
 */
export async function getContactDetails(): Promise<ContactDetails | null> {
  const details = visibleOne(contactDetails);
  if (!details) return null;
  const visibleCentres = new Set(visible(centres).map((c) => c.slug));
  return { ...details, campusContacts: details.campusContacts.filter((c) => visibleCentres.has(c.centreSlug)) };
}

// Articles

/** Visible articles, newest first. */
export async function getArticles(): Promise<Article[]> {
  return visible(articles).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** One visible article by slug, or null. */
export async function getArticle(slug: string): Promise<Article | null> {
  return visible(articles).find((a) => a.slug === slug) ?? null;
}

/** All article slugs (any status) for generateStaticParams; always ≥1 entry. */
export function getArticleSlugs(): string[] {
  const slugs = articles.map((a) => a.slug);
  return slugs.length > 0 ? slugs : [STATIC_PARAM_FALLBACK];
}

// FAQs

/** Visible FAQs, optionally one category. */
export async function getFaqs(category?: FaqCategory): Promise<Faq[]> {
  return visible(faqs).filter((f) => !category || f.category === category);
}
