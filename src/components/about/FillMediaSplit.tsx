import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Text beside a photo that fills the full height of the text column from `md` (D-030: text and
 * visuals roughly 50/50; tablets too, so a page never stacks photo after photo). Short copy gets
 * at least a 320px photo (400px from `lg`); long copy (lists, FAQs, data cards) gets a photo as tall
 * as the viewport allows (at most 480px on tablets, 760px from `lg`), which then stays in view
 * (sticky) while the rest of the text scrolls. Phones stack it with a short 16:10 photo first.
 * Content in the text half must fit a ~330px column on tablets (one-column inner grids from `md`).
 *
 * `splitFrom="lg"` keeps the stacked layout up to `lg` (e.g. beside a form, which needs the full
 * width on tablets); the stacked photo is then a short 21:9 band from `md`.
 *
 * `imageWidth="wide"` gives the photo about 55 % of the row (e.g. beside a compact data card),
 * `"narrow"` about 40 % (e.g. beside a form). `imageFirstOnMobile={false}` puts the photo after the
 * text on small screens (e.g. so a form stays near the top).
 *
 * Same image rules as `MediaSplit`: licensed stock (pass it through `localizeImage()`), a visible
 * `imageLabel` ("Illustrative stock photo"), never a person image beside a real name, no
 * landscapes (D-031: homepage hero only).
 */
export function FillMediaSplit({
  image,
  imageSide = "right",
  imageLabel,
  caption,
  imageWidth = "half",
  imageFirstOnMobile = true,
  splitFrom = "md",
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
  /** Breakpoint where the photo moves beside the text (default `md`). */
  splitFrom?: "md" | "lg";
  className?: string;
  /** The text half. */
  children: ReactNode;
}) {
  // object-cover on a box up to ~580×760 px: a landscape photo renders wider than its column.
  const coverWidth = Math.min(1200, Math.max(640, Math.round((760 * image.width) / image.height)));
  const md = splitFrom === "md";
  const left = imageSide === "left";
  // Equal halves on tablets; the wide / narrow ratios apply from `lg`.
  const columns = {
    half: md ? "md:grid-cols-2" : "lg:grid-cols-2",
    wide: cn(md && "md:grid-cols-2", left ? "lg:grid-cols-[1.2fr_1fr]" : "lg:grid-cols-[1fr_1.2fr]"),
    narrow: cn(md && "md:grid-cols-2", left ? "lg:grid-cols-[0.8fr_1.2fr]" : "lg:grid-cols-[1.2fr_0.8fr]"),
  }[imageWidth];
  return (
    <div className={cn("grid gap-8", md ? "md:items-stretch lg:gap-14" : "lg:items-stretch lg:gap-14", columns, className)}>
      <figure
        className={cn(
          "relative m-0",
          md ? (left ? "md:order-1" : "md:order-2") : left ? "lg:order-1" : "lg:order-2",
          !imageFirstOnMobile && "order-2",
        )}
      >
        <div
          className={cn(
            "flex flex-col gap-2",
            md
              ? "md:sticky md:top-24 md:h-full md:max-h-[min(calc(100vh-8rem),30rem)] lg:max-h-[min(calc(100vh-8rem),760px)]"
              : "lg:sticky lg:top-24 lg:h-full lg:max-h-[min(calc(100vh-8rem),760px)]",
          )}
        >
          <div
            className={cn(
              "relative aspect-16/10 overflow-hidden rounded-card bg-surface shadow-soft",
              md ? "md:aspect-auto md:min-h-80 md:flex-1 lg:min-h-100" : "md:aspect-[21/9] lg:aspect-auto lg:min-h-100 lg:flex-1",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes={`(min-width: ${md ? 768 : 1024}px) ${coverWidth}px, 100vw`}
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
          "min-w-0",
          md ? "md:self-center" : "lg:self-center",
          md ? (left ? "md:order-2" : "md:order-1") : left ? "lg:order-2" : "lg:order-1",
          !imageFirstOnMobile && "order-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}
