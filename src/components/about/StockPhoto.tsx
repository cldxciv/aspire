import Image from "next/image";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

const ASPECTS = { "4/3": "aspect-4/3", "16/10": "aspect-16/10", "1/1": "aspect-square", "3/4": "aspect-3/4" } as const;

/**
 * A single licensed stock photo in a fixed-ratio frame (no layout shift) with an optional visible
 * label pill ("Illustrative stock photo") and caption — the stand-alone counterpart of the
 * `MediaSplit` figure, for asides and columns. Pass the photo through `localizeImage()` so its
 * alt text matches the page language. Never place it beside a real person's name (D-019/D-030).
 */
export function StockPhoto({
  image,
  label,
  caption,
  aspect = "4/3",
  sizes = "(min-width: 1024px) 560px, 100vw",
  className,
}: {
  image: ImageAsset;
  label?: string;
  caption?: string;
  aspect?: keyof typeof ASPECTS;
  sizes?: string;
  className?: string;
}) {
  return (
    <figure className={cn("m-0", className)}>
      <div className={cn("relative overflow-hidden rounded-card bg-surface shadow-soft", ASPECTS[aspect])}>
        <Image src={image.src} alt={image.alt} fill sizes={sizes} className="object-cover" />
        {label && (
          <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {label}
          </span>
        )}
      </div>
      {caption && <figcaption className="mt-2 text-xs text-muted">{caption}</figcaption>}
    </figure>
  );
}
