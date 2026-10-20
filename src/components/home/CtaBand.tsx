import { ArrowRight, Phone } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { ButtonLink, Container, DemoBadge, ImageCarousel, SECTION_PANEL, type CarouselLabels, type CarouselSlide } from "@/components/ui";
import { cn } from "@/lib/cn";
import { stockImages } from "@/content/images";

type CtaAction = { label: string; href: string };

/** A phone number as stored by getContactDetails() (`display` for people, `tel` E.164). */
export type CtaPhone = { display: string; tel: string };

/** Primary action when none is passed: the home hero enquiry form. */
const DEFAULT_PRIMARY: CtaAction = { label: "Enquire Now", href: "#home-enquiry" };

export type CtaBandProps = {
  headingId: string;
  title: string;
  description: string;
  /** Defaults to "Enquire Now" → #home-enquiry (the home hero form). Existing pages always pass one. */
  primary?: CtaAction;
  secondary?: CtaAction;
  /** Default variant only: decorative image shown above the copy on small screens and to its left from `lg`. */
  media?: ReactNode;
  /**
   * "default" (unchanged): pale band, rendered inside the caller's <Section>.
   * "photo": a strip of Aspire's previous result cards (`strip`) or, without one, a full-bleed
   * stock-photo strip, over a navy band; renders its own <section> — place it directly in the
   * page, not inside <Section>.
   */
  variant?: "default" | "photo";
  /**
   * Photo variant only: shown above the copy instead of the photo strip when set, e.g. a
   * ResultCardMarquee of previous results (D-031; null in production, where the photo shows).
   */
  strip?: ReactNode;
  /**
   * Photo variant only: 2+ labelled slides (e.g. homeSlides(HOME_CTA_SLIDES, …)) turn the photo
   * strip into an ImageCarousel when there is no `strip`; needs `carouselLabels` (`common.carousel`).
   */
  slides?: CarouselSlide[];
  carouselLabels?: CarouselLabels;
  /** Accessible name of that carousel (default `carouselLabels.label`). */
  carouselLabel?: string;
  /**
   * Photo variant only: the "Call Us" button and the number/hours render only when this is
   * set (pass getContactDetails()?.phone — null in production today).
   */
  phone?: CtaPhone | null;
  /** Photo variant only: opening hours shown under the phone number (only with `phone`). */
  hours?: string;
  /** Photo variant only: the phone record is a placeholder — show a DEMO badge beside it. */
  demo?: boolean;
  /** Photo variant only: localised fixed copy (defaults are English); `stockPhoto` labels the photo strip. */
  labels?: { callUs: string; demo: string; slogan: [string, string, string]; stockPhoto?: string };
};

const DEFAULT_PHOTO_LABELS: NonNullable<CtaBandProps["labels"]> = {
  callUs: "Call Us",
  demo: "Demo",
  slogan: ["Dream", "Prepare", "Achieve"],
};

/**
 * Mockup `.cta`: pale blue-to-gold band with a heading and up to two actions.
 * Used by several pages; `media` (optional) adds an image beside the copy — pass an
 * `<AspireImage>` so its maxWidth cap applies. Without `media` the layout is unchanged.
 * `variant="photo"` is the homepage's closing band (see PhotoCtaBand).
 */
export function CtaBand(props: CtaBandProps) {
  if (props.variant === "photo") return <PhotoCtaBand {...props} />;

  const { headingId, title, description, primary = DEFAULT_PRIMARY, secondary, media } = props;
  const copy = (
    <div>
      <h2 id={headingId} className="text-[clamp(1.5rem,3vw,1.875rem)] font-extrabold leading-tight text-navy">
        {title}
      </h2>
      <p className="mt-2 text-muted">{description}</p>
    </div>
  );
  const actions = (
    <div className="flex flex-wrap gap-2.5">
      <ButtonLink href={primary.href}>
        {primary.label} <ArrowRight aria-hidden="true" className="size-4" />
      </ButtonLink>
      {secondary && (
        <ButtonLink href={secondary.href} variant="outline">
          {secondary.label}
        </ButtonLink>
      )}
    </div>
  );

  if (media) {
    return (
      <div className="grid items-center gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:p-8 lg:grid-cols-[auto_1fr_auto] lg:gap-8">
        <div className="w-full max-w-sm lg:w-72">{media}</div>
        {copy}
        {actions}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start justify-between gap-5 rounded-card bg-linear-to-r from-[#eaf3ff] to-[#fff7dd] p-6 md:flex-row md:items-center md:p-8">
      {copy}
      {actions}
    </div>
  );
}

/**
 * Homepage closing band (plan §4.12, design board 03; D-031): a strip of Aspire's previous result
 * cards (`strip`, the home page passes a ResultCardMarquee) or — without visible cards (production
 * today) — a carousel of labelled stock photos (`slides`; no landscape) in the same container box,
 * or without slides a decorative full-bleed stock photo (graduate silhouette, labelled) fading
 * into a solid navy band. The carousel has no fade: it would cover its controls. The navy band holds the serif heading, the gold primary button,
 * and — only when `phone` is set — a "Call Us" outline button (tel: link) beside the number and
 * hours, plus the decorative script slogan.
 *
 * All text sits on solid navy (white ≥ 12:1; light-blue copy and gold ≥ 8:1).
 */
function PhotoCtaBand({
  headingId,
  title,
  description,
  primary = DEFAULT_PRIMARY,
  secondary,
  strip,
  slides,
  carouselLabels,
  carouselLabel,
  phone,
  hours,
  demo = false,
  labels = DEFAULT_PHOTO_LABELS,
}: CtaBandProps) {
  const tel = phone?.tel.replace(/[^\d+]/g, "");
  const photo = stockImages.graduateSilhouette;
  const hasStrip = strip !== undefined && strip !== null && strip !== false;
  const carousel = !hasStrip && slides && slides.length > 1 && carouselLabels ? { slides, labels: carouselLabels } : null;

  return (
    <section
      aria-labelledby={headingId}
      data-surface="dark"
      className={cn(SECTION_PANEL, "relative isolate bg-navy text-white")}
    >
      {hasStrip ? (
        <Container gutters="section" className="pt-14 md:pt-16 lg:pt-20">{strip}</Container>
      ) : carousel ? (
        <Container gutters="section" className="pt-14 md:pt-16 lg:pt-20">
          <div className="relative aspect-16/10 overflow-hidden rounded-card shadow-soft sm:aspect-2/1 lg:aspect-3/1">
            <ImageCarousel
              slides={carousel.slides}
              labels={carousel.labels}
              label={carouselLabel}
              aspect="fill"
              sizes="(min-width: 1200px) 1120px, 100vw"
              boxRatio={1.6}
              tone="dark"
            />
          </div>
        </Container>
      ) : (
        <div aria-hidden="true" className="relative h-36 sm:h-48 lg:h-72">
          <Image src={photo.src} alt="" fill sizes="100vw" className="object-cover object-[50%_30%]" />
          <div className="absolute inset-0 bg-linear-to-b from-navy/5 via-navy/25 to-navy" />
          {labels.stockPhoto && (
            <span className="absolute right-2 top-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
              {labels.stockPhoto}
            </span>
          )}
        </div>
      )}

      <Container
        gutters="section"
        className={cn(
          "grid items-center gap-8 pb-14 pt-10 md:pb-16 md:pt-12 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:gap-12 lg:pb-20",
        )}
      >
        <div className="max-w-xl">
          <h2
            id={headingId}
            className="font-serif text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-tight [&:lang(hi)]:leading-snug"
          >
            {title}
          </h2>
          <p className="mt-4 max-w-prose leading-relaxed text-[#d9e6f6]">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-4">
          <ButtonLink href={primary.href}>
            {primary.label} <ArrowRight aria-hidden="true" className="size-4" />
          </ButtonLink>
          {secondary && (
            <ButtonLink href={secondary.href} variant="outline">
              {secondary.label}
            </ButtonLink>
          )}
          {phone && tel && (
            <>
              <a
                href={`tel:${tel}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-gold/80 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/10"
              >
                <Phone aria-hidden="true" className="size-4 text-gold" />
                {labels.callUs}
              </a>
              <div className="flex items-center gap-3">
                <div className="text-sm">
                  <p className="flex items-center gap-1.5 font-bold">
                    <Phone aria-hidden="true" className="size-3.5 text-gold" />
                    {phone.display}
                  </p>
                  {hours && <p className="text-xs text-[#d3e1f3]">{hours}</p>}
                </div>
                {demo && <DemoBadge label={labels.demo} />}
              </div>
            </>
          )}
        </div>

        <p
          aria-hidden="true"
          className="flex flex-wrap gap-x-2 font-serif text-xl italic leading-tight text-gold lg:-rotate-6 lg:flex-col lg:text-right lg:text-2xl"
        >
          <span>{labels.slogan[0]}</span>
          <span className="lg:hidden">·</span>
          <span>{labels.slogan[1]}</span>
          <span className="lg:hidden">·</span>
          <span>{labels.slogan[2]}</span>
        </p>
      </Container>
    </section>
  );
}
