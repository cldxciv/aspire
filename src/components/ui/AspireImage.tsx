import Image from "next/image";
import type { AspireAsset } from "@/content/aspire-assets";
import { cn } from "@/lib/cn";

/**
 * Renders an asset from src/content/aspire-assets.ts with its usage rules applied:
 * - caps the rendered width at the asset's `maxWidth` (the files are small),
 * - hides the baked-in filename caption on `crop: "top-square"` icons,
 * - treats assets with empty alt as decorative (hidden from assistive tech).
 *
 * Size it with a width class on `className` (e.g. "w-16"); height follows the aspect ratio.
 */
export function AspireImage({
  asset,
  className,
  alt,
  rounded = false,
}: {
  asset: AspireAsset;
  className?: string;
  /** Override the registry alt text (e.g. to describe it in context). */
  alt?: string;
  rounded?: boolean;
}) {
  const text = alt ?? asset.alt;
  const decorative = text === "";
  const sizes = `${asset.maxWidth}px`;
  // Never wider than the asset allows, and never wider than its container.
  const maxWidth = `min(100%, ${asset.maxWidth}px)`;
  // Fill the container only when the caller hasn't sized it (e.g. "w-16", "sm:w-24").
  const callerSetsWidth = /(^|\s)([\w-]+:)*!?w-/.test(className ?? "");

  if (asset.crop === "top-square") {
    return (
      <span
        className={cn("relative block aspect-148/138 overflow-hidden", rounded && "rounded-control", className)}
        style={{ maxWidth }}
        aria-hidden={decorative || undefined}
      >
        <Image src={asset.src} alt={text} fill sizes={sizes} className="object-cover object-top" />
      </span>
    );
  }

  return (
    <Image
      src={asset.src}
      alt={text}
      width={asset.width}
      height={asset.height}
      sizes={sizes}
      aria-hidden={decorative || undefined}
      className={cn("h-auto", !callerSetsWidth && "w-full", rounded && "rounded-control", className)}
      style={{ maxWidth }}
    />
  );
}
