import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { carouselLabelsFor, Container, ImageCarousel, type CarouselLabels, type CarouselSlide, HERO_PANEL } from "@/components/ui";
import type { ImageAsset } from "@/lib/types";

/**
 * Cover-crop `sizes` for the photo column. On `lg+` the box is about as tall as it is wide
 * (≈1.1–1.2), so a 3:2 photo renders ~1.35× the column width (560 px column at 1200+). On tablets
 * (`md`) the column is ~320–390 px wide and taller than wide; below `md` it is a full-width 16/10 band,
 * where a 3:2 photo is no wider than the box.
 */
const MEDIA_SIZES = "(min-width: 1200px) 760px, (min-width: 1024px) 62vw, (min-width: 768px) 60vw, 100vw";

type AuthSplitMedia =
  | {
      /** One photo (rendered as a static image). */
      image: ImageAsset;
      /** Visible label on the photo, e.g. "Illustrative stock photo". */
      imageLabel: string;
      slides?: undefined;
      carouselLabels?: undefined;
    }
  | {
      image?: undefined;
      imageLabel?: undefined;
      /** Carousel slides (licensed stock, each with its own visible `label`); one slide renders a static photo. */
      slides: CarouselSlide[];
      /** `common.carousel` in the page locale. */
      carouselLabels: CarouselLabels;
    };

/**
 * Sign-in / account page layout (D-030): copy and a white form card on the left, a licensed
 * stock photo (or a carousel of them) filling the right column from `md` (about 55/45 on tablets,
 * 50/50 from `lg`), stacked under the card on phones, with a visible label on each photo and an
 * optional navy note under the media.
 * Renders the page's only <h1>.
 *
 * Never pass a person photo when the card can show a real name (signed-in panels do): use
 * object / desk / library stock only.
 */
export function AuthSplit({
  eyebrow,
  title,
  lead,
  notice,
  image,
  imageLabel,
  slides,
  carouselLabels,
  aside,
  children,
}: AuthSplitMedia & {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  /** Shown between the lead and the card (e.g. "sign in to continue"). */
  notice?: ReactNode;
  /** Short note shown under the photo / carousel (kept off the photo so it never covers the controls). */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const mediaSlides: CarouselSlide[] = slides ?? (image ? [{ image, label: imageLabel }] : []);
  // A single slide renders without controls, so its strings are never shown.
  const labels = carouselLabels ?? carouselLabelsFor("en");

  return (
    <section className={cn(HERO_PANEL, "bg-surface")}>
      <Container className="grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] md:py-12 lg:grid-cols-2 lg:gap-12 lg:py-14">
        <div className="min-w-0">
          {eyebrow && <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-blue">{eyebrow}</p>}
          <h1 className="font-serif text-[clamp(2rem,4.5vw,2.75rem)] font-semibold leading-tight text-navy">{title}</h1>
          {lead && <p className="mt-2.5 max-w-xl text-muted">{lead}</p>}
          {notice && <div className="mt-4 max-w-xl">{notice}</div>}
          <div data-surface="light" className="mt-6 rounded-card border border-line bg-white p-5 shadow-card md:p-7">
            {children}
          </div>
        </div>

        {/* md+: the media box grows to the row height (at least 32rem with the note); the note sits under it. */}
        <div className="flex min-w-0 flex-col gap-4 md:min-h-[32rem]">
          <div className="relative aspect-16/10 overflow-hidden rounded-card bg-navy shadow-card md:aspect-auto md:min-h-[22rem] md:flex-1">
            <ImageCarousel
              slides={mediaSlides}
              labels={labels}
              aspect="fill"
              sizes={MEDIA_SIZES}
              priority
              tone="light"
            />
          </div>
          {aside && (
            <div data-surface="dark" className="rounded-card bg-navy p-5 text-white shadow-card">
              {aside}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}
