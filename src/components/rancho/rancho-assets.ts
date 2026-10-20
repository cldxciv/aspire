/**
 * Rancho is Aspire's existing snow leopard mascot (Instagram @aspireiit_medical). This is the ONE place
 * that lists the official artwork files. Until Aspire supplies them, `RanchoMascot` draws a
 * temporary SVG stand-in. To switch (see docs/rancho.md):
 *   1. put the files in `public/images/rancho/` with the names below,
 *   2. set each entry's real intrinsic `width` / `height`,
 *   3. flip `OFFICIAL_RANCHO_ART_AVAILABLE` to `true`.
 */
export const OFFICIAL_RANCHO_ART_AVAILABLE = false;

export interface RanchoArt {
  /** Public path (transparent PNG / WebP, or SVG). */
  src: string;
  /** Intrinsic pixel size of the file. */
  width: number;
  height: number;
  /** `sizes` hint for next/image: the largest size the art is shown at on the site. */
  sizes: string;
}

export const RANCHO_ART: Record<"head" | "wave", RanchoArt> = {
  /** Front-facing head / avatar, square, at least 512×512. Used from 32px (launcher) to ~160px. */
  head: { src: "/images/rancho/rancho-head.webp", width: 512, height: 512, sizes: "160px" },
  /** Waving or half-body pose, at least 1024px tall. Used in heroes and empty states. */
  wave: { src: "/images/rancho/rancho-wave.webp", width: 768, height: 1024, sizes: "320px" },
};
