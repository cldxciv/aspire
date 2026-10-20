import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import { localeFromPathname } from "@/i18n/paths";
import type { ImageAsset } from "@/lib/types";
import { cn } from "@/lib/cn";
import type { CarouselSlide } from "./carousel-utils";
import { ImageCarousel, type CarouselLabels } from "./ImageCarousel";
import { Container, HERO_PANEL } from "./Layout";

export type Crumb = { label: string; href?: string };

/** Rendered media width: half the 1200px container from 1200, ~46vw at lg, ~44vw beside the copy on tablets (md). */
const HERO_SIZES = "(min-width: 1200px) 560px, (min-width: 1024px) 46vw, (min-width: 768px) 44vw, 100vw";

/**
 * Copy beside the media from `md`: about 55/45 on tablets (a 4:3 media box), 50/50 from `lg` (16:10),
 * so a portrait tablet never gets a strip of copy over a full-width photo (tablet audit R1).
 */
const SPLIT = "grid items-center gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-10 lg:grid-cols-2 lg:gap-14";

/**
 * Interior-page hero with breadcrumbs (Home is prepended automatically). Renders the page's only <h1>.
 *
 * With `image` (D-030) it becomes a split from `md`: copy on the left, a rounded photo on the right
 * (4:3 beside the copy on tablets, 16:10 at 50/50 from `lg`; stacked under the copy on phones).
 * `imageLabel` adds a visible caption pill
 * (e.g. "Illustrative stock photo") — use it for stock or AI imagery.
 *
 * With `slides` (2+), the right-hand media is an `ImageCarousel` in the same rounded box (`aspect="hero"`),
 * slide 1 preloaded at high fetch priority (`imagePriority`). Each slide carries its own visible
 * `label`. One slide renders as a static photo. `slides` wins over `image` when both are given.
 * Build slides with `heroSlides(images, label, locale)` from `@/components/ui/hero-slides`.
 *
 * Localisation: pass `homeLabel` / `homeHref` from the page's messages (defaults are English).
 * The breadcrumb landmark label and the carousel strings follow the locale of `homeHref` unless
 * `breadcrumbLabel` / `carouselLabels` are given.
 */
export function PageHero({
  title,
  lead,
  crumbs = [],
  children,
  image,
  imageLabel,
  slides,
  carouselLabels,
  imagePriority = true,
  homeLabel = "Home",
  homeHref = "/",
  breadcrumbLabel,
}: {
  title: string;
  lead?: ReactNode;
  /** Trail after Home; the last item is the current page and should omit href. */
  crumbs?: Crumb[];
  children?: ReactNode;
  /** Optional hero photo (licensed stock or approved asset). Decorative: alt comes from the asset. */
  image?: ImageAsset;
  /** Visible label on the photo, e.g. "Illustrative stock photo". */
  imageLabel?: string;
  /** Hero carousel (2+ slides; licensed stock or approved assets, each with its own visible label). */
  slides?: CarouselSlide[];
  /** Carousel strings; defaults to `common.carousel` in the locale of `homeHref`. */
  carouselLabels?: CarouselLabels;
  /** Preload the hero photo / first slide (it is above the fold). */
  imagePriority?: boolean;
  homeLabel?: string;
  homeHref?: string;
  /** Accessible name of the breadcrumb landmark; defaults to `common.labels.breadcrumb` in the locale of `homeHref`. */
  breadcrumbLabel?: string;
}) {
  const trail: Crumb[] = [{ label: homeLabel, href: homeHref }, ...crumbs];
  const common = localeFromPathname(homeHref) === "hi" ? hiCommon : enCommon;
  const navLabel = breadcrumbLabel ?? common.labels.breadcrumb;
  const hasSlides = (slides?.length ?? 0) > 0;
  const hasMedia = hasSlides || Boolean(image);

  const copy = (
    <div className={cn(hasMedia && "md:py-2 lg:py-4")}>
      <nav aria-label={navLabel} className="mb-3 text-xs text-[#b9d3f3]">
        <ol className="flex flex-wrap items-center gap-1.5">
          {trail.map((crumb, i) => {
            const last = i === trail.length - 1;
            return (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
                {crumb.href && !last ? (
                  <Link href={crumb.href} className="hover:text-white hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined}>{crumb.label}</span>
                )}
                {!last && <span aria-hidden="true">/</span>}
              </li>
            );
          })}
        </ol>
      </nav>
      {/* Beside media the h1 follows its column, not the viewport (~32px on tablets, ~34px at 1024, 44px from ~1330). */}
      <h1
        className={cn(
          "font-serif text-[clamp(2rem,4.5vw,2.75rem)] font-semibold leading-tight tracking-tight text-balance",
          hasMedia && "md:text-[clamp(2rem,3.6vw,2.5rem)] lg:text-[clamp(2rem,3.3vw,2.75rem)]",
        )}
      >
        {title}
      </h1>
      {lead && <div className="mt-4 max-w-3xl text-[#dbe8f7]">{lead}</div>}
      {children && <div className="mt-7 flex flex-wrap gap-3">{children}</div>}
    </div>
  );

  return (
    <div data-surface="dark" className={cn(HERO_PANEL, "bg-linear-to-r from-navy to-navy-2 py-12 text-white md:py-16 lg:py-20")}>
      <Container gutters="section">
        {hasSlides ? (
          <div className={SPLIT}>
            {copy}
            <ImageCarousel
              slides={slides ?? []}
              labels={carouselLabels ?? common.carousel}
              aspect="hero"
              priority={imagePriority}
              tone="dark"
              sizes={HERO_SIZES}
              className="rounded-card shadow-card ring-1 ring-white/15"
            />
          </div>
        ) : image ? (
          <div className={SPLIT}>
            {copy}
            <figure className="relative">
              <div className="relative aspect-16/10 overflow-hidden rounded-card shadow-card ring-1 ring-white/15 md:aspect-4/3 lg:aspect-16/10">
                <Image
                  src={image.src}
                  alt={image.alt}
                  fill
                  preload={imagePriority}
                  fetchPriority={imagePriority ? "high" : undefined}
                  sizes={HERO_SIZES}
                  className="object-cover"
                />
              </div>
              {imageLabel && (
                <figcaption className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
                  {imageLabel}
                </figcaption>
              )}
            </figure>
          </div>
        ) : (
          copy
        )}
      </Container>
    </div>
  );
}
