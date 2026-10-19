import { aspireAssets, type AspireAsset } from "@/content/aspire-assets";

/**
 * Illustrative images per centre slug (D-019). None of these show the real
 * building, so every use must carry a visible "Illustrative image" label.
 * Kullu has no centre illustration: a Himachal landscape stands in, with alt
 * text that says so. Centres not listed here render without an image.
 */
export const CENTRE_IMAGES: Record<string, { asset: AspireAsset; alt: string }> = {
  shimla: { asset: aspireAssets.centreShimla, alt: aspireAssets.centreShimla.alt },
  hamirpur: { asset: aspireAssets.centreHamirpur, alt: aspireAssets.centreHamirpur.alt },
  dharamshala: { asset: aspireAssets.centreDharamshala, alt: aspireAssets.centreDharamshala.alt },
  kullu: {
    asset: aspireAssets.himachalLandscape,
    alt: "Illustrative image of a Himachal hill town (not the actual centre)",
  },
};
