import { AspireImage } from "@/components/ui";
import type { AspireAsset } from "@/content/aspire-assets";

/**
 * An Aspire illustration at a fixed width set on a wrapper.
 *
 * Why the wrapper: AspireImage's non-cropped path always adds `w-full`, and Tailwind v4
 * emits `.w-full` after `.w-12`…`.w-44`, so a width class passed on its `className`
 * loses. Sizing the wrapper keeps the image at the intended width (still capped at
 * the asset's `maxWidth` by AspireImage itself).
 *
 * `className` must include the display and width, e.g. "block w-20" or "hidden w-28 sm:block".
 */
export function Art({ asset, className, rounded = false }: { asset: AspireAsset; className: string; rounded?: boolean }) {
  return (
    <span className={className}>
      <AspireImage asset={asset} rounded={rounded} />
    </span>
  );
}
