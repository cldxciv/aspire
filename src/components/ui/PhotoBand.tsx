import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * A wide photo band between sections (D-030 image-rich pages). Full container width, short
 * aspect so it adds visual weight without pushing content far down. Optional overlay text
 * sits on a navy gradient for contrast. Lazy-loaded (never above the fold).
 *
 * Image rules as for `MediaSplit`: licensed stock or approved assets only; pass `imageLabel`
 * for stock / AI imagery; never a person image beside a real name; landscapes are labelled
 * as the region, never as an Aspire centre, campus or hostel.
 */
export function PhotoBand({
  image,
  imageLabel,
  aspect = "21/9",
  className,
  children,
}: {
  image: ImageAsset;
  imageLabel?: string;
  aspect?: "21/9" | "3/1" | "16/7";
  className?: string;
  /** Optional overlay copy (short heading / sentence), bottom-left on a gradient. */
  children?: ReactNode;
}) {
  const aspectClass = { "21/9": "aspect-[21/9]", "3/1": "aspect-[3/1]", "16/7": "aspect-[16/7]" }[aspect];
  return (
    <figure className={cn("relative m-0 overflow-hidden rounded-card bg-surface shadow-soft", className)}>
      <div className={cn("relative min-h-56 w-full", aspectClass)}>
        <Image src={image.src} alt={image.alt} fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />
        {children && (
          <div
            data-surface="dark"
            className="absolute inset-0 flex items-end bg-linear-to-t from-navy/85 via-navy/35 to-transparent p-5 text-white md:p-8"
          >
            <div className="max-w-2xl">{children}</div>
          </div>
        )}
        {imageLabel && (
          <span className="absolute top-2 right-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {imageLabel}
          </span>
        )}
      </div>
    </figure>
  );
}

/**
 * Long-form layout (legal text, articles, data tables): content on one side and a sticky photo
 * column on the other at `lg+`, so roughly half of the reading viewport stays visual while the
 * text scrolls (D-030). Below `lg` the photo column is left out: it is decorative and the page hero
 * above already has photos, so the content (draft banner, article, list) starts right after the hero.
 */
export function StickyMediaLayout({
  image,
  imageLabel,
  imageSide = "right",
  secondaryImage,
  className,
  children,
}: {
  image: ImageAsset;
  imageLabel?: string;
  imageSide?: "left" | "right";
  /** Optional second photo stacked under the first inside the sticky column (viewports at least 760px tall). */
  secondaryImage?: ImageAsset;
  className?: string;
  children: ReactNode;
}) {
  const label = imageLabel && (
    <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
      {imageLabel}
    </span>
  );
  return (
    <div className={cn("grid gap-10 lg:grid-cols-2 lg:gap-16", className)}>
      <div aria-hidden="true" className={cn("relative max-lg:hidden", imageSide === "left" ? "lg:order-1" : "lg:order-2")}>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24">
          <div className="relative aspect-16/10 overflow-hidden rounded-card bg-surface shadow-soft lg:aspect-auto lg:h-[min(60vh,560px)]">
            <Image src={image.src} alt="" fill sizes="(min-width: 1280px) 820px, (min-width: 1024px) 60vw, 100vw" className="object-cover" />
            {label}
          </div>
          {secondaryImage && (
            // Sized to the space left under the primary photo, so the sticky column never runs off-screen.
            <div className="relative hidden overflow-hidden rounded-card bg-surface shadow-soft lg:h-[min(calc(40vh-8rem),260px)] lg:tall:block">
              <Image src={secondaryImage.src} alt="" fill sizes="(min-width: 1280px) 820px, 60vw" className="object-cover" />
              {label}
            </div>
          )}
        </div>
      </div>
      <div className={cn("min-w-0", imageSide === "left" ? "lg:order-2" : "lg:order-1")}>{children}</div>
    </div>
  );
}
