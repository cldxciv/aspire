import "server-only";

import { stockImages, type StockImageKey } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { localizeImage } from "@/lib/data";
import type { Article, ImageAsset } from "@/lib/types";

/**
 * Photos of /resources/[slug] (licensed stock only, D-018/D-030; no landscapes or result cards,
 * D-031). The hero (B · editorial frame, 2026-10-22 hero redesign) shows the article's own cover
 * beside the headline; the sticky column beside the text shows two calm study scenes. No photo
 * appears twice on the page: the sticky photos are never the cover or a related article's cover.
 * (/resources itself has no hero photo: its hero card shows the newest article instead.)
 */

/**
 * The sticky photo column, in order of preference: the first two that are not the article's cover
 * or a related article's cover. Portrait-friendly, calm study scenes.
 */
export const ARTICLE_STICKY_POOL = [
  "studyThroughWindow",
  "libraryReading",
  "libraryAisle",
  "deskLampEvening",
  "classroomDesks",
  "studentsTakingNotes",
] as const satisfies readonly StockImageKey[];

/** The hero photo of an article without a cover. */
export const ARTICLE_FALLBACK_COVER: StockImageKey = "booksAndNotebook";

/** Neutral desk and paper photos that top up the sticky column if the pool is ever used up. */
export const ARTICLE_PHOTO_FALLBACK = [
  "notebookSolutions",
  "pocketWatchWorksheet",
  "laptopStudy",
  "notebookPlanning",
] as const satisfies readonly StockImageKey[];

/** The hero photo and the sticky-column photos of one article page. */
export type ArticlePagePhotos = {
  /** The article's cover (alt already localised by `getArticle`), else a neutral books photo. */
  cover: ImageAsset;
  /** The sticky column beside the text (alt text in the page locale). */
  sticky: [ImageAsset, ImageAsset];
};

/** The article page's photos; no photo appears twice (related covers included). */
export function articlePagePhotos({
  article,
  related,
  locale,
}: {
  article: Article;
  /** The related-article cards shown on the same page (their covers are excluded). */
  related: readonly Article[];
  locale: Locale;
}): ArticlePagePhotos {
  const cover: ImageAsset = article.coverImage ?? localizeImage(stockImages[ARTICLE_FALLBACK_COVER], locale);
  const taken = new Set<string>([cover.src, ...related.flatMap((item) => (item.coverImage ? [item.coverImage.src] : []))]);
  const sticky: ImageAsset[] = [];
  for (const key of [...ARTICLE_STICKY_POOL, ...ARTICLE_PHOTO_FALLBACK]) {
    if (sticky.length === 2) break;
    const image = stockImages[key];
    if (taken.has(image.src)) continue;
    taken.add(image.src);
    sticky.push(localizeImage(image, locale));
  }
  return { cover, sticky: [sticky[0], sticky[1]] };
}
