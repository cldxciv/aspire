import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ImageAsset } from "@/lib/types";

/** One box of the sticky column: result-card `media` when there is any, else the fallback photo. */
export type StickyResultsBox = {
  /** E.g. resultMosaicMedia(...) — null / undefined shows `image`. */
  media?: ReactNode;
  /** Non-nature fallback photo (licensed stock, alt in the page's language). Decorative here. */
  image: ImageAsset;
  /** Visible label on the fallback photo, e.g. common.labels.illustrativeStockPhoto. */
  imageLabel?: string;
};

/**
 * The results page's long-form layout with result cards (D-030 / D-031): the same shape as
 * ui/StickyMediaLayout — content on one side, a sticky column on the other from `lg` — but each
 * box takes result-card `media` (exam-filtered mosaics) and falls back to a photo when there are
 * no visible cards (production today). Photo boxes stay decorative (aria-hidden, alt=""), mosaic
 * boxes keep their labelled list and alt text.
 *
 * Primary box: a 2:1 strip above the content below `lg` (match "4x2"), about square from `lg`
 * (`min(60vh, 560px)` tall; match "3x3"). Secondary box: tall viewports from `lg` only, about 2:1
 * (match "4x2"). Only for general results sections — never beside a centre, campus or hostel.
 */
export function StickyResultsLayout({
  primary,
  secondary,
  imageSide = "right",
  className,
  children,
}: {
  primary: StickyResultsBox;
  secondary?: StickyResultsBox;
  imageSide?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-8 lg:grid-cols-2 lg:gap-12", className)}>
      <div className={cn("relative min-w-0", imageSide === "left" ? "lg:order-1" : "lg:order-2")}>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <Box
            box={primary}
            className={cn(primary.media ? "aspect-2/1" : "aspect-16/10", "lg:aspect-auto lg:h-[min(60vh,560px)]")}
            sizes="(min-width: 1280px) 820px, (min-width: 1024px) 60vw, 100vw"
          />
          {secondary && (
            <Box
              box={secondary}
              className="hidden lg:h-[min(28vh,260px)] lg:tall:block"
              sizes="(min-width: 1280px) 820px, 60vw"
            />
          )}
        </div>
      </div>
      <div className={cn("min-w-0", imageSide === "left" ? "lg:order-2" : "lg:order-1")}>{children}</div>
    </div>
  );
}

function Box({ box, className, sizes }: { box: StickyResultsBox; className: string; sizes: string }) {
  const frame = "relative overflow-hidden rounded-card bg-surface shadow-soft";
  if (box.media) return <div className={cn(frame, className)}>{box.media}</div>;
  return (
    <div aria-hidden="true" className={cn(frame, className)}>
      <Image src={box.image.src} alt="" fill sizes={sizes} className="object-cover" />
      {box.imageLabel && (
        <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
          {box.imageLabel}
        </span>
      )}
    </div>
  );
}
