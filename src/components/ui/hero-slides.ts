import "server-only";

import { localizeImage, type ContentLocale } from "@/lib/data";
import type { ImageAsset } from "@/lib/types";
import type { CarouselSlide } from "./carousel-utils";

/**
 * Builds carousel slides from plain images with one shared visible label (or `undefined`), with
 * each alt text in `locale` (required, so a Hindi page can never ship English alt text):
 *
 *   import { stockImages } from "@/content/images";
 *   import { heroSlides } from "@/components/ui/hero-slides";
 *   const slides = heroSlides(
 *     [stockImages.physicsWhiteboard, stockImages.youngStudentWriting, stockImages.stethoscopeTextbooks],
 *     common.labels.illustrativeStockPhoto,
 *     locale,
 *   );
 *
 * Server-only (it reads the Hindi image overlay), so it is NOT re-exported from `@/components/ui`
 * (client components import that barrel): import it from `@/components/ui/hero-slides`.
 */
export function heroSlides(
  images: readonly ImageAsset[],
  label: string | undefined,
  locale: ContentLocale,
): CarouselSlide[] {
  return images.map((image) => ({
    image: localizeImage(image, locale),
    ...(label ? { label } : {}),
  }));
}
