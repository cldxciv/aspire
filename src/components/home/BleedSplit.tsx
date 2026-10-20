import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { Container } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

const TONES = { white: "bg-white", surface: "bg-surface" } as const;

/**
 * Half-bleed editorial split (D-030 image-rich pages; UPLIFT-A): from `lg` the photo fills one half
 * of the viewport edge to centre and the full height of the section, while the copy sits in the
 * other half of the 1200px container. Below `lg` the photo is a full-width 16:10 (2:1 from `sm`)
 * strip above the copy (or after it with `imageFirstOnMobile={false}`). Renders its own
 * `<section>` (pass `aria-labelledby`), so place it directly in the page.
 *
 * `media` (D-031) replaces the photo in the same column when it is set — e.g. resultMosaicMedia(),
 * which is null without visible result cards (production), so `image` is then the fallback. In
 * media mode the strip below `lg` is 2:1 at every width (match the mosaic's "4x2"), `imageLabel`,
 * `overlay` and `decorative` do not apply, and `caption` is a solid bar under the media.
 *
 * Image rules as for `MediaSplit`: licensed stock or approved assets only (pass `localizeImage`
 * output for Hindi alt), `imageLabel` for stock / AI imagery, never a person image beside a real
 * name, no landscapes (D-031: only the home hero has them), never result cards beside a centre.
 * Lazy-loaded (below the fold); `sizes` = half the viewport from `lg`.
 */
export function BleedSplit({
  image,
  media,
  imageSide = "right",
  imageLabel,
  caption,
  overlay,
  decorative = false,
  imageFirstOnMobile = true,
  tone = "white",
  className,
  children,
  ...props
}: Omit<ComponentProps<"section">, "children"> & {
  /** The photo, or the fallback photo when `media` is given. */
  image: ImageAsset;
  /** Shown instead of `image` when set (a positioned box: children with `absolute inset-0` fill it). */
  media?: ReactNode;
  imageSide?: "left" | "right";
  /** Visible label on the photo, e.g. common.labels.illustrativeStockPhoto. */
  imageLabel?: string;
  /** Short caption over the bottom of the photo (under the media in media mode). */
  caption?: ReactNode;
  /** Decorative copy over the top of the photo (on a navy gradient); mark it aria-hidden if it repeats text. */
  overlay?: ReactNode;
  /** alt="" when the photo adds nothing the copy does not say. */
  decorative?: boolean;
  /** Below `lg`, show the photo above the copy (default) or after it (e.g. right under a photo hero). */
  imageFirstOnMobile?: boolean;
  tone?: keyof typeof TONES;
  /** The copy half. */
  children: ReactNode;
}) {
  const left = imageSide === "left";
  const hasMedia = media !== undefined && media !== null && media !== false;
  return (
    <section className={cn("relative flex flex-col overflow-x-clip lg:block", TONES[tone], className)} {...props}>
      <figure
        className={cn(
          "relative m-0 overflow-hidden lg:absolute lg:inset-y-0 lg:aspect-auto",
          hasMedia ? "flex aspect-2/1 flex-col bg-surface" : "aspect-16/10 bg-blue-soft sm:aspect-[2/1]",
          !imageFirstOnMobile && "order-last",
          left ? "lg:left-0 lg:right-[calc(50%+1.5rem)]" : "lg:right-0 lg:left-[calc(50%+1.5rem)]",
        )}
      >
        {hasMedia ? (
          <>
            <div className="relative min-h-0 flex-1">{media}</div>
            {caption && (
              <figcaption className="bg-navy px-4 py-2 text-xs font-semibold text-white md:px-6">{caption}</figcaption>
            )}
          </>
        ) : (
          <>
            <Image
              src={image.src}
              alt={decorative ? "" : image.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
            {overlay && (
              <div className="absolute inset-x-0 top-0 bg-linear-to-b from-navy/75 via-navy/25 to-transparent p-5 pb-16 text-white md:p-7 md:pb-20">
                {overlay}
              </div>
            )}
            {caption && (
              <figcaption className="absolute inset-x-0 bottom-0 bg-linear-to-t from-navy/85 to-transparent px-4 pb-3 pt-10 text-xs font-semibold text-white md:px-6">
                {caption}
              </figcaption>
            )}
            {imageLabel && (
              <span
                className={cn(
                  "absolute rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white",
                  caption ? "top-3" : "bottom-3",
                  left ? "right-3" : "left-3",
                )}
              >
                {imageLabel}
              </span>
            )}
          </>
        )}
      </figure>
      <Container className="lg:grid lg:grid-cols-2 lg:gap-12">
        <div
          className={cn(
            "min-w-0 py-10 md:py-14 lg:flex lg:min-h-[32rem] lg:flex-col lg:justify-center lg:py-16",
            left ? "lg:col-start-2" : "lg:col-start-1",
          )}
        >
          {children}
        </div>
      </Container>
    </section>
  );
}
