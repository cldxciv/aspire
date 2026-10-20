import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Text beside a photo that fills the full height of the text column on `lg+` (D-030: text and
 * visuals roughly 50/50). Short copy gets at least a 400px photo; long copy (lists, FAQs, data
 * cards) gets a photo as tall as the viewport allows, which then stays in view (sticky) while
 * the rest of the text scrolls. Below `lg` it stacks with a short 16:10 photo first.
 *
 * `imageWidth="wide"` gives the photo about 55 % of the row (e.g. beside a compact data card),
 * `"narrow"` about 40 % (e.g. beside a form). `imageFirstOnMobile={false}` puts the photo after the
 * text on small screens (e.g. so a form stays near the top).
 *
 * Same image rules as `MediaSplit`: licensed stock (pass it through `localizeImage()`), a visible
 * `imageLabel` ("Illustrative stock photo"), never a person image beside a real name, landscapes
 * captioned as the region only.
 */
export function FillMediaSplit({
  image,
  imageSide = "right",
  imageLabel,
  caption,
  imageWidth = "half",
  imageFirstOnMobile = true,
  className,
  children,
}: {
  image: ImageAsset;
  imageSide?: "left" | "right";
  imageLabel?: string;
  /** Optional caption under the photo. */
  caption?: ReactNode;
  imageWidth?: "half" | "wide" | "narrow";
  imageFirstOnMobile?: boolean;
  className?: string;
  /** The text half. */
  children: ReactNode;
}) {
  // object-cover on a box up to ~580×760 px: a landscape photo renders wider than its column.
  const coverWidth = Math.min(1200, Math.max(640, Math.round((760 * image.width) / image.height)));
  const columns = {
    half: "lg:grid-cols-2",
    wide: imageSide === "left" ? "lg:grid-cols-[1.2fr_1fr]" : "lg:grid-cols-[1fr_1.2fr]",
    narrow: imageSide === "left" ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1.2fr_0.8fr]",
  }[imageWidth];
  return (
    <div className={cn("grid gap-8 lg:items-stretch lg:gap-14", columns, className)}>
      <figure
        className={cn(
          "relative m-0",
          imageSide === "left" ? "lg:order-1" : "lg:order-2",
          !imageFirstOnMobile && "order-2",
        )}
      >
        <div className="flex flex-col gap-2 lg:sticky lg:top-24 lg:h-full lg:max-h-[min(calc(100vh-8rem),760px)]">
          <div className="relative aspect-16/10 overflow-hidden rounded-card bg-surface shadow-soft lg:aspect-auto lg:min-h-100 lg:flex-1">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes={`(min-width: 1024px) ${coverWidth}px, 100vw`}
              className="object-cover"
            />
            {imageLabel && (
              <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                {imageLabel}
              </span>
            )}
          </div>
          {caption && <figcaption className="text-xs text-muted">{caption}</figcaption>}
        </div>
      </figure>
      <div
        className={cn(
          "min-w-0 lg:self-center",
          imageSide === "left" ? "lg:order-2" : "lg:order-1",
          !imageFirstOnMobile && "order-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}
