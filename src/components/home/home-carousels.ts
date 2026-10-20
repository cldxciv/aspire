import { heroSlides } from "@/components/ui/hero-slides";
import type { CarouselSlide } from "@/components/ui";
import { stockImages, type StockImageKey } from "@/content/images";
import type { ContentLocale } from "@/lib/data";

/**
 * Homepage photo carousels (owner request 2026-10-20: "2–3 carousels where a half or full width is
 * covered with a single image"). Licensed stock only (D-018), every slide visibly labelled
 * "Illustrative stock photo", alt text in the page language, all below the fold (lazy, no
 * `priority`). Rules:
 *
 * - No landscapes (D-031): the hero's photo stays the page's only one.
 * - No result cards (preview-only personal data) and no person photo beside a real name (D-019).
 * - No photo twice on the homepage in either content mode: the three lists are disjoint and none of
 *   them is used by another home section (results / "why" / closing fallbacks, the life tiles,
 *   testimonials, impact chart, resources teaser, article covers). `home-carousels.test.ts` checks
 *   the rendered page in preview and production, English and Hindi.
 */

/** Programs half-bleed (right): class notes, then a physics, chemistry, biology and Foundation scene. */
export const HOME_PROGRAMS_SLIDES = [
  "studentsTakingNotes",
  "physicsWhiteboard",
  "chemistryGlassware",
  "plantCellMicrograph",
  "youngStudentNotebook",
] as const satisfies readonly StockImageKey[];

/** Student-life band (full container width): self-study, lectures, group work, practice, guidance. */
export const HOME_LIFE_SLIDES = [
  "studyThroughWindow",
  "seminarFromBehind",
  "tableDiscussion",
  "laptopStudy",
  "mentoringConversation",
] as const satisfies readonly StockImageKey[];

/**
 * Closing band, production fallback (preview shows the result-card marquee there): a goal, the
 * application, NEET study, books and a young student writing.
 */
export const HOME_CTA_SLIDES = [
  "graduateSilhouette",
  "signingForm",
  "stethoscopeTextbooks",
  "booksAndNotebook",
  "youngStudentWriting",
] as const satisfies readonly StockImageKey[];

/** Cover-crop focal points where the centre crop would cut the subject (wide bands). */
const FOCUS: Partial<Record<StockImageKey, string>> = {
  graduateSilhouette: "50% 30%",
};

/** Labelled, localised slides for `keys` (server-only: reads the Hindi alt overlay). */
export function homeSlides(keys: readonly StockImageKey[], label: string, locale: ContentLocale): CarouselSlide[] {
  return heroSlides(
    keys.map((key) => stockImages[key]),
    label,
    locale,
  ).map((slide, i) => {
    const position = FOCUS[keys[i]];
    return position ? { ...slide, position } : slide;
  });
}
