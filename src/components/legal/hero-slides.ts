import "server-only";

import type { CarouselSlide } from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages, type StockImageKey } from "@/content/images";
import type { Locale } from "@/i18n/config";

/**
 * Hero carousels for the draft legal pages: calm desk, paper and book photos (licensed stock,
 * labelled; no landscapes, D-031; no result cards or people beside names, D-019/D-031).
 * Each page's sticky column photos are listed too, so a photo never appears twice on a page.
 */
export const LEGAL_PAGE_PHOTOS = {
  privacy: {
    /** Notes, an online account, a signed form (the enquiry data the policy covers), a quiet desk. */
    hero: ["notebookPlanning", "laptopStudy", "signingForm", "studyThroughWindow"],
    sticky: ["booksAndNotebook", "libraryAisle"],
  },
  terms: {
    hero: ["signingForm", "booksAndNotebook", "laptopStudy", "libraryAisle"],
    sticky: ["notebookPlanning", "deskLampEvening"],
  },
} as const satisfies Record<string, { hero: readonly StockImageKey[]; sticky: readonly [StockImageKey, StockImageKey] }>;

export type LegalPage = keyof typeof LEGAL_PAGE_PHOTOS;

/** The hero slides of a legal page, alt text in `locale`, each with the visible stock label. */
export function legalHeroSlides(page: LegalPage, label: string, locale: Locale): CarouselSlide[] {
  return heroSlides(
    LEGAL_PAGE_PHOTOS[page].hero.map((key) => stockImages[key]),
    label,
    locale,
  );
}
