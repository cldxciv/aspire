import Image from "next/image";
import type { ComponentProps, ReactNode } from "react";
import { Container, ImageCarousel, SECTION_PANEL, type CarouselLabels, type CarouselSlide } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";

const TONES = { white: "bg-white", surface: "bg-surface" } as const;

/**
 * `sizes` for a carousel in the photo column: the full width below `lg`; from `lg` the column is a
 * tall box (about 50vw × the section height, ~950px on the home page), where a 3:2 photo is
 * cover-cropped from a render about 1.5 × the box height wide.
 */
const CAROUSEL_SIZES = "(min-width: 1024px) 1440px, 100vw";

/**
 * Half-bleed editorial split (D-030 image-rich pages; UPLIFT-A): from `lg` the photo fills one half
 * of the section, panel edge to centre, and its full height, while the copy sits in the other half
 * of the 1200px container. Below `lg` the photo is a full-width 16:10 (2:1 from `sm`) strip above
 * the copy (or after it with `imageFirstOnMobile={false}`). Renders its own `<section>` as a
 * SECTION_PANEL (rounded floating panel, `overflow-clip`, so the photo ends at the rounded panel
 * edge) — pass `aria-labelledby` and place it directly in the page.
 *
 * `media` (D-031) replaces the photo in the same column when it is set — e.g. resultMosaicMedia(),
 * which is null without visible result cards (production), so `image` is then the fallback. In
 * media mode the strip below `lg` is 2:1 at every width (match the mosaic's "4x2"), `imageLabel`,
 * `overlay` and `decorative` do not apply, and `caption` is a solid bar under the media.
 *
 * `carousel` (2+ slides) turns the photo into an `ImageCarousel` filling the same column (light
 * controls, lazy slides, each slide with its own visible label); `image` is then the fallback for
 * fewer slides, and `imageLabel`, `overlay`, `caption` and `decorative` do not apply (they would
 * sit on the carousel's controls). `media` still wins when both are set.
 *
 * Image rules as for `MediaSplit`: licensed stock or approved assets only (pass `localizeImage`
 * output for Hindi alt), `imageLabel` for stock / AI imagery, never a person image beside a real
 * name, no landscapes (D-031: only the home hero has them), never result cards beside a centre.
 * Lazy-loaded (below the fold); `sizes` = half the viewport from `lg`.
 */
export function BleedSplit({
  image,
  media,
  carousel,
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
  /** Slides for a photo carousel in the column (see above); `labels` from `common.carousel`. */
  carousel?: { slides: CarouselSlide[]; labels: CarouselLabels; label?: string };
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
  const slides = !hasMedia && carousel && carousel.slides.length > 1 ? carousel.slides : null;
  return (
    <section className={cn(SECTION_PANEL, "relative flex flex-col lg:block", TONES[tone], className)} {...props}>
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
        ) : slides && carousel ? (
          <ImageCarousel
            slides={slides}
            labels={carousel.labels}
            label={carousel.label}
            aspect="fill"
            sizes={CAROUSEL_SIZES}
            tone="light"
          />
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
      <Container gutters="section" className="lg:grid lg:grid-cols-2 lg:gap-16">
        <div
          className={cn(
            "min-w-0 py-14 md:py-16 lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-center lg:py-20 xl:px-4",
            left ? "lg:col-start-2" : "lg:col-start-1",
          )}
        >
          {children}
        </div>
      </Container>
    </section>
  );
}
