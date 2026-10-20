import "server-only";

import type { CarouselSlide } from "@/components/ui";
import { heroSlides } from "@/components/ui/hero-slides";
import { stockImages, type StockImageKey } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { localizeImage } from "@/lib/data";
import type { Article, ArticleCategory, ImageAsset } from "@/lib/types";

/**
 * Hero carousels for /resources and /resources/[slug] (licensed stock only, D-018/D-030; no
 * landscapes, D-031; no result cards — the list page already has its own results band).
 *
 * Every photo on a page appears once: the /resources hero keys avoid that page's body photos
 * (laptopStudy, libraryAisle, studyThroughWindow, graduateSilhouette, mentoringConversation and the
 * article covers), and `articlePagePhotos` drops anything the article page already shows.
 */

/** /resources: study material for both tracks (books, worked solutions, NEET texts, reading). */
export const RESOURCES_HERO_KEYS = [
  "booksAndNotebook",
  "notebookSolutions",
  "stethoscopeTextbooks",
  "libraryReading",
] as const satisfies readonly StockImageKey[];

/**
 * The article page's sticky photo column (beside the text), in order of preference: the first two
 * that are not the article's cover or a related article's cover. Portrait-friendly, calm study scenes.
 */
export const ARTICLE_STICKY_POOL = [
  "studyThroughWindow",
  "libraryReading",
  "libraryAisle",
  "deskLampEvening",
  "classroomDesks",
  "studentsTakingNotes",
] as const satisfies readonly StockImageKey[];

/** Used when an article has no cover photo (the hero's first slide). */
export const ARTICLE_FALLBACK_COVER: StockImageKey = "booksAndNotebook";

/**
 * Extra hero slides after an article's own cover, by category, in order of preference. Objects
 * and hands only (no faces), so nothing in the hero can read as the article's author (D-019).
 * `ARTICLE_PHOTO_FALLBACK` tops a list up when the page already shows some of its photos.
 */
export const ARTICLE_HERO_EXTRAS: Record<ArticleCategory, readonly StockImageKey[]> = {
  "study-guidance": ["pocketWatchWorksheet", "notebookSolutions", "booksAndNotebook", "mathsNotebook", "laptopStudy"],
  "exam-updates": ["pocketWatchWorksheet", "physicsWhiteboard", "stethoscopeTextbooks", "notebookSolutions", "booksAndNotebook"],
  news: ["booksAndNotebook", "classroomDesks", "laptopStudy", "libraryAisle", "notebookPlanning"],
  admissions: ["signingForm", "laptopStudy", "booksAndNotebook", "notebookPlanning", "libraryAisle"],
};

/**
 * Neutral desk and paper photos that top up the hero (after the category's own) and, if ever
 * needed, the sticky column, so a page with many related covers still gets enough unused photos.
 */
export const ARTICLE_PHOTO_FALLBACK = [
  "booksAndNotebook",
  "notebookSolutions",
  "pocketWatchWorksheet",
  "laptopStudy",
  "notebookPlanning",
  "mathsNotebook",
  "signingForm",
  "physicsWhiteboard",
] as const satisfies readonly StockImageKey[];

/** Slides per article hero: its cover plus three category (or fallback) photos. */
const ARTICLE_HERO_MAX = 4;

/** The /resources hero slides, alt text in `locale`, each with the visible stock label. */
export function resourcesHeroSlides(label: string, locale: Locale): CarouselSlide[] {
  return heroSlides(
    RESOURCES_HERO_KEYS.map((key) => stockImages[key]),
    label,
    locale,
  );
}

/** Hero slides and sticky-column photos of one article page; no photo appears twice. */
export type ArticlePagePhotos = {
  /** The hero carousel: the cover, then up to three category photos (3–4 slides). */
  slides: CarouselSlide[];
  /** The sticky column beside the text (alt text in the page locale). */
  sticky: [ImageAsset, ImageAsset];
};

/**
 * The article page's photos. The hero leads with the article's cover (already localised by
 * `getArticle`; a neutral books photo when it has none), then category photos the page shows
 * nowhere else. The sticky column takes the first two pool photos that are neither the cover nor a
 * related article's cover thumbnail, and the category photos skip those too (topped up from
 * `ARTICLE_PHOTO_FALLBACK`, so the hero always has 4 slides with up to 3 related articles).
 */
export function articlePagePhotos({
  article,
  related,
  label,
  locale,
}: {
  article: Article;
  /** The related-article cards shown on the same page (their covers are excluded). */
  related: readonly Article[];
  label: string;
  locale: Locale;
}): ArticlePagePhotos {
  const cover: ImageAsset = article.coverImage ?? localizeImage(stockImages[ARTICLE_FALLBACK_COVER], locale);
  const taken = new Set<string>([cover.src, ...related.flatMap((item) => (item.coverImage ? [item.coverImage.src] : []))]);
  const pick = (keys: readonly StockImageKey[], limit: number): ImageAsset[] => {
    const picked: ImageAsset[] = [];
    for (const key of keys) {
      if (picked.length === limit) break;
      const image = stockImages[key];
      if (taken.has(image.src)) continue;
      taken.add(image.src);
      picked.push(image);
    }
    return picked;
  };
  const [first, second] = pick([...ARTICLE_STICKY_POOL, ...ARTICLE_PHOTO_FALLBACK], 2).map((image) =>
    localizeImage(image, locale),
  );
  const extras = pick([...(ARTICLE_HERO_EXTRAS[article.category] ?? []), ...ARTICLE_PHOTO_FALLBACK], ARTICLE_HERO_MAX - 1);
  return {
    slides: [{ image: cover, label }, ...heroSlides(extras, label, locale)],
    sticky: [first, second],
  };
}
