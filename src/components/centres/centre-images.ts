import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Messages } from "@/i18n/messages/types";
import type { ImageAsset } from "@/lib/types";

type AltKey = keyof Messages<"centres">["images"];

/**
 * Illustrative images per centre slug (D-019). None of these show the real
 * building, so every use must carry a visible "Illustrative image" label.
 * Kullu has no centre illustration: a Himachal landscape stands in, with alt
 * text that says so. Centres not listed here render without an image.
 * `alt` is English; use `centreImage(slug, t.images)` for the page's language.
 */
export const CENTRE_IMAGES: Record<string, { asset: AspireAsset; alt: string; altKey: AltKey }> = {
  shimla: { asset: aspireAssets.centreShimla, alt: aspireAssets.centreShimla.alt, altKey: "buildingAlt" },
  hamirpur: { asset: aspireAssets.centreHamirpur, alt: aspireAssets.centreHamirpur.alt, altKey: "buildingAlt" },
  dharamshala: { asset: aspireAssets.centreDharamshala, alt: aspireAssets.centreDharamshala.alt, altKey: "buildingAlt" },
  kullu: {
    asset: aspireAssets.himachalLandscape,
    alt: "Illustrative image of a Himachal hill town (not the actual centre)",
    altKey: "kulluAlt",
  },
};

/** The centre's illustrative image with alt text from `alts` (`centres.images` messages), or undefined. */
export function centreImage(
  slug: string,
  alts: Messages<"centres">["images"],
): { asset: AspireAsset; alt: string } | undefined {
  const image = CENTRE_IMAGES[slug];
  return image ? { asset: image.asset, alt: alts[image.altKey] } : undefined;
}

/** A region landscape for a centre card: stock photo (alt in the page's language) + region caption. */
export type RegionPhoto = { image: ImageAsset; caption: string };

type RegionKey = "shimla" | "dharamshala" | "kullu" | "hamirpur";

/**
 * Stock landscape of the REGION around each centre (D-030). Captions name the region (from
 * `centres.regions` messages), never the centre or a campus. Centres not listed get no photo.
 */
export const REGION_PHOTOS: Record<string, { image: ImageAsset; key: RegionKey }> = {
  shimla: { image: stockImages.shimlaPanorama, key: "shimla" },
  dharamshala: { image: stockImages.dhauladharTriund, key: "dharamshala" },
  kullu: { image: stockImages.kulluValley, key: "kullu" },
  hamirpur: { image: stockImages.hamirpurHills, key: "hamirpur" },
};
