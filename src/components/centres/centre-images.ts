import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Messages } from "@/i18n/messages/types";
import type { ImageAsset } from "@/lib/types";

type AltKey = keyof Messages<"centres">["images"];

/**
 * Illustrative images per centre slug (D-019). None of these show the real
 * building, so every use must carry a visible "Illustrative image" label.
 * Centres not listed here (e.g. Kullu, which has no centre illustration) render
 * without an image — no landscape stands in (D-031).
 * `alt` is English; use `centreImage(slug, t.images)` for the page's language.
 */
export const CENTRE_IMAGES: Record<string, { asset: AspireAsset; alt: string; altKey: AltKey }> = {
  shimla: { asset: aspireAssets.centreShimla, alt: aspireAssets.centreShimla.alt, altKey: "buildingAlt" },
  hamirpur: { asset: aspireAssets.centreHamirpur, alt: aspireAssets.centreHamirpur.alt, altKey: "buildingAlt" },
  dharamshala: { asset: aspireAssets.centreDharamshala, alt: aspireAssets.centreDharamshala.alt, altKey: "buildingAlt" },
};

/** The centre's illustrative image with alt text from `alts` (`centres.images` messages), or undefined. */
export function centreImage(
  slug: string,
  alts: Messages<"centres">["images"],
): { asset: AspireAsset; alt: string } | undefined {
  const image = CENTRE_IMAGES[slug];
  return image ? { asset: image.asset, alt: alts[image.altKey] } : undefined;
}

/**
 * A stock education photo per centre card (D-030 / D-031): classrooms, notes, reading, discussion
 * — no landscapes and never result cards (the data does not say where a student studied). They
 * are not taken at the centres: every card labels its photo "Illustrative stock photo" and the
 * directory carries one note saying so (`centres.photos.note`). No caption names a place.
 * Each centre gets a different photo; centres not listed get none.
 */
export const CENTRE_PHOTOS: Record<string, ImageAsset> = {
  shimla: stockImages.classroomDesks,
  hamirpur: stockImages.studentsTakingNotes,
  dharamshala: stockImages.libraryReading,
  kullu: stockImages.tableDiscussion,
};
