import type { Locale } from "@/i18n/config";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import type { CarouselLabels } from "./ImageCarousel";

/**
 * `common.carousel` in `locale`. For server parents that render
 * an `ImageCarousel` without messages loaded, e.g. `PageHero` and `MediaSplit`. Pages that already
 * load `common` can pass `t.carousel` directly.
 */
export function carouselLabelsFor(locale: Locale): CarouselLabels {
  return (locale === "hi" ? hiCommon : enCommon).carousel;
}
