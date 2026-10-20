import Image from "next/image";
import type { ReactNode } from "react";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

/**
 * Text + photo side by side, 50/50 on `lg+` (D-030). Use inside a `<Section>`; alternate
 * `imageSide` between consecutive splits for an editorial rhythm. Stacks on small screens
 * (photo first unless `imageFirstOnMobile` is false).
 *
 * Image rules: licensed stock or approved assets only; never a person image beside a real
 * name; pass `imageLabel` ("Illustrative stock photo", "Illustration") for stock / AI imagery.
 */
export function MediaSplit({
  image,
  imageSide = "right",
  imageLabel,
  caption,
  aspect = "4/3",
  imageFirstOnMobile = true,
  className,
  children,
}: {
  image: ImageAsset;
  imageSide?: "left" | "right";
  imageLabel?: string;
  /** Optional caption below the photo. */
  caption?: ReactNode;
  aspect?: "4/3" | "16/10" | "1/1" | "3/4";
  imageFirstOnMobile?: boolean;
  className?: string;
  /** The text half: heading, copy, lists, buttons. */
  children: ReactNode;
}) {
  const aspectClass = { "4/3": "aspect-4/3", "16/10": "aspect-16/10", "1/1": "aspect-square", "3/4": "aspect-3/4" }[aspect];
  return (
    <div className={cn("grid items-center gap-8 lg:grid-cols-2 lg:gap-14", className)}>
      <figure
        className={cn(
          "relative m-0",
          imageSide === "left" ? "lg:order-1" : "lg:order-2",
          imageFirstOnMobile ? "order-1" : "order-2",
        )}
      >
        <div className={cn("relative overflow-hidden rounded-card bg-surface shadow-soft", aspectClass)}>
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw"
            className="object-cover"
          />
          {imageLabel && (
            <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {imageLabel}
            </span>
          )}
        </div>
        {caption && <figcaption className="mt-2 text-xs text-muted">{caption}</figcaption>}
      </figure>
      <div
        className={cn(
          "min-w-0",
          imageSide === "left" ? "lg:order-2" : "lg:order-1",
          imageFirstOnMobile ? "order-2" : "order-1",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A row of 2–4 captioned photos (galleries, "life at Aspire" strips). Stacks to 2 columns, then 1. */
export function PhotoStrip({
  items,
  label,
  className,
}: {
  items: { image: ImageAsset; caption?: string }[];
  /** Optional visible label applied to every photo, e.g. "Illustrative stock photo". */
  label?: string;
  className?: string;
}) {
  return (
    <ul className={cn("grid gap-4 sm:grid-cols-2", items.length >= 3 && "lg:grid-cols-3", items.length >= 4 && "xl:grid-cols-4", className)}>
      {items.map(({ image, caption }) => (
        <li key={image.src}>
          <figure className="m-0">
            <div className="relative aspect-4/3 overflow-hidden rounded-card bg-surface shadow-soft">
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes="(min-width: 1280px) 290px, (min-width: 1024px) 31vw, (min-width: 640px) 46vw, 100vw"
                className="object-cover"
              />
              {label && (
                <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {label}
                </span>
              )}
            </div>
            {caption && <figcaption className="mt-2 text-sm font-semibold text-navy">{caption}</figcaption>}
          </figure>
        </li>
      ))}
    </ul>
  );
}
