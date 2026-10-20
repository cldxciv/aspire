import { ArrowRight, ClipboardList, GraduationCap, HeartHandshake, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { HeroEnquiryForm, type EnquiryDeliveryStatus } from "@/components/forms/HeroEnquiryForm";
import { ButtonLink, Container, HERO_PANEL } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { MountainRidge } from "./MountainRidge";

const heroPhoto = stockImages.himalayaHero;

/** Qualitative trust points (no numbers; copy is on the Aspire approval checklist). Labels: `home.hero.trust`. */
const TRUST_POINTS = [
  { Icon: UsersRound, key: "faculty" },
  { Icon: ClipboardList, key: "tests" },
  { Icon: HeartHandshake, key: "mentoring" },
  { Icon: GraduationCap, key: "environment" },
] as const;

/**
 * Readability overlay from `lg` up, anchored to the layout rather than the viewport:
 * `--hero-text-end` is the right edge of the text (the Container is 1200px max with 20px
 * padding). At `lg` that is the card's left edge minus the 48px gap; from 1140px
 * (`min-[71.25rem]`) the text is capped at 440px (the students image sits to its right), so it
 * is content-left + 460px.
 * Navy 88% → 72% across the text, then a fade to 15% over 150px, so the mountains around the
 * students image and the card read clearly. Colours come from the theme tokens (D-026).
 * Contrast is measured over the brightest photo pixels (status report).
 */
const navyAt = (token: "navy" | "navy-deep", percent: number) =>
  `color-mix(in srgb, var(--color-${token}) ${percent}%, transparent)`;

const DESKTOP_OVERLAY: CSSProperties = {
  backgroundImage: `linear-gradient(90deg, ${navyAt("navy-deep", 88)} 0%, ${navyAt("navy", 72)} var(--hero-text-end), ${navyAt("navy", 15)} calc(var(--hero-text-end) + 150px), ${navyAt("navy", 15)} 100%)`,
};

/** Outline-white secondary CTA (metrics match ButtonLink `md`). */
const outlineWhite =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-white/85 px-4 py-2.5 text-sm font-bold text-white " +
  "transition hover:-translate-y-px hover:bg-white/10 motion-reduce:hover:translate-y-0";

const studentsImage = aspireAssets.heroStudentsLarge;

/**
 * AI-generated students in ASPIRE hoodies (D-023a; placeholder until a consented photo shoot).
 * Decorative (`alt=""`) and visibly labelled "Illustration"; the wrapper is hidden from assistive tech.
 *
 * - Below `md`: in flow after the form card, rounded, centred, at most 440px wide.
 * - `md` (portrait tablets): beside the form card, filling the card's height (cover crop).
 * - 1024–1139px: hidden (the text column is too wide to leave room without overlap).
 * - From 1140px (`min-[71.25rem]`, iPad landscape and up): bottom-anchored in the hero between the
 *   text column and the card, like
 *   reference/homepage/01. The 360×435 box starts 448px into the 1160px content box, after the
 *   440px text column, so no text overlaps it. Its right 80px sits behind the opaque card,
 *   so the image is cropped from the left (`object-right`) at its native 1:1 scale (rendered
 *   440px, under the asset's 460px maxWidth), keeping the main student's face left of the card.
 *   A mask fades the left, top and bottom edges into the mountains (and the right edge, which
 *   shows below the card). It sits above the photo/overlay (z -5) and under text and the card.
 *   The label lives outside the masked box so it never fades.
 */
function HeroStudents({ className, label }: { className?: string; label: string }) {
  return (
    <div aria-hidden="true" className={cn("relative mx-auto w-full max-w-[440px]", className)}>
      <div className="relative aspect-[440/435] overflow-hidden rounded-card md:aspect-auto md:h-full md:max-lg:shadow-[0_24px_60px_rgb(0_0_0/0.3)] md:max-lg:ring-1 md:max-lg:ring-white/15 min-[71.25rem]:rounded-none min-[71.25rem]:[mask-composite:intersect] min-[71.25rem]:[mask-image:linear-gradient(to_right,transparent,black_22%,black_84%,transparent),linear-gradient(to_bottom,transparent,black_10%,black_80%,transparent)]">
        <Image src={studentsImage.src} alt="" fill sizes="440px" className="object-cover md:object-[60%_25%] min-[71.25rem]:object-right" />
      </div>
      <span className="absolute bottom-3 left-3 rounded bg-navy/85 px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white min-[71.25rem]:bottom-[24%] min-[71.25rem]:left-[26%]">
        {label}
      </span>
    </div>
  );
}

/**
 * Home hero (reference/homepage/01, plan §4.1): full-bleed Dhauladhar stock photo (D-018) under a
 * lighter navy overlay, serif headline, CTAs, trust row and the 3-step enquiry card (D-021).
 *
 * Layout: one column below `md` in reading order eyebrow → H1 → lead → CTAs → card → students
 * image → trust row. `md` (portrait tablets): the copy spans the top, then the card and the students
 * image side by side (same height), then the trust row in four columns. From `lg`: text column +
 * 400/432px card column, `items-start` (the card grows by step); the trust row sits in row 2 of the
 * text column (`auto 1fr` rows, so a taller card never pushes it). From 1140px the text is capped at
 * 440px and the students image fills the space between the text and the card (HeroStudents).
 */
export function HomeHero({
  centreOptions,
  deliveryStatus,
  locale,
}: {
  centreOptions: { value: string; label: string }[];
  deliveryStatus: EnquiryDeliveryStatus;
  locale: Locale;
}) {
  const t = messagesFor(locale, "home").hero;
  const forms = messagesFor(locale, "forms");
  const common = messagesFor(locale, "common");
  return (
    <section
      aria-labelledby="home-hero-title"
      data-surface="dark"
      className={cn(HERO_PANEL, "relative isolate bg-navy text-white")}
    >
      {/* Fallback behind the photo (before it paints or if it fails). */}
      <MountainRidge className="pointer-events-none absolute inset-x-0 bottom-0 -z-20 h-[clamp(120px,22vw,320px)] w-full" />
      {/* Decorative background: the heading and copy carry the meaning, so alt is empty. */}
      <Image
        src={heroPhoto.src}
        alt=""
        fill
        preload
        // On narrow screens the landscape photo is cropped to a tall hero, so ask for a wider source
        // (QA M-1; ~1050px-tall hero on portrait tablets); kept moderate because the mobile overlay is 80–86% navy.
        sizes="(max-width: 767px) 200vw, (max-width: 1023px) 160vw, 100vw"
        className="-z-10 object-cover object-[50%_60%]"
      />
      {/* Below lg the copy spans the full width: near-uniform overlay. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-b from-navy-deep/86 via-navy/80 to-navy/84 lg:hidden"
      />
      <div
        aria-hidden="true"
        style={DESKTOP_OVERLAY}
        className="absolute inset-0 -z-10 hidden [--hero-text-end:calc(100%-max(0px,50%-600px)-20px-400px-48px)] lg:block min-[71.25rem]:[--hero-text-end:calc(max(0px,50%-600px)+20px+460px)]"
      />
      {/* Thin top vignette under the header. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-navy-deep/55 to-transparent"
      />

      <Container className="grid gap-y-8 pb-10 pt-10 short:pt-6 md:grid-cols-2 md:gap-x-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-12 xl:grid-cols-[minmax(0,1fr)_432px]">
        {/* From 1140px the text is capped at 440px so it never reaches the students image. */}
        <div className="md:col-span-2 lg:col-span-1 lg:col-start-1 lg:row-start-1 min-[71.25rem]:max-w-[440px]">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-gold min-[400px]:text-xs min-[400px]:tracking-[0.16em]">
            {t.eyebrow}
          </p>
          <h1
            id="home-hero-title"
            className="mt-4 font-serif text-[clamp(2.125rem,1rem+3.4vw,3.5rem)] font-bold leading-[1.06] tracking-tight short:mt-3 min-[71.25rem]:text-[3.375rem] [&:lang(hi)]:leading-[1.22]"
          >
            <span className="block">{t.titleLine1}</span> <span className="block">{t.titleLine2}</span>{" "}
            <span className="block text-gold">{t.titleLine3}</span>
          </h1>
          <p className="mt-5 max-w-[560px] text-base text-white/90 md:max-w-[640px] md:text-[17px] short:mt-4">{t.lead}</p>
          <div className="mt-7 flex flex-wrap gap-3 short:mt-5">
            <ButtonLink href={localePath("/programs", locale)}>
              {t.ctaPrograms}
              <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
            <Link href={localePath("/about", locale)} className={outlineWhite}>
              {t.ctaStory}
            </Link>
          </div>
        </div>

        <HeroEnquiryForm
          id="home-enquiry"
          centreOptions={centreOptions}
          deliveryStatus={deliveryStatus}
          messages={{ shared: forms.shared, hero: forms.hero }}
          className="w-full max-w-[560px] scroll-mt-24 md:col-start-1 md:row-start-2 md:max-w-none lg:col-start-2 lg:row-[1/span_2]"
        />

        {/* After the card on phones, beside it on tablets; out of flow (bottom-anchored in the hero) from 1140px. */}
        <HeroStudents
          label={common.labels.illustration}
          className="md:col-start-2 md:row-start-2 md:mx-0 md:max-w-none md:self-stretch lg:hidden min-[71.25rem]:absolute min-[71.25rem]:bottom-0 min-[71.25rem]:left-[calc(max(0px,50%-600px)+468px)] min-[71.25rem]:-z-5 min-[71.25rem]:block min-[71.25rem]:h-[435px] min-[71.25rem]:w-[360px] min-[71.25rem]:max-w-none" />

        {/* Tablets: one row of four under the card and image; lg resets the span, width and columns. */}
        <ul className="grid max-w-[560px] grid-cols-2 gap-x-5 gap-y-4 text-sm font-medium leading-snug text-white md:col-span-2 md:max-w-none md:grid-cols-4 lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:max-w-[560px] lg:grid-cols-2 min-[71.25rem]:max-w-[440px]">
          {TRUST_POINTS.map(({ Icon, key }) => (
            <li key={key} className="flex items-center gap-2.5">
              <Icon aria-hidden="true" className="size-6 shrink-0 text-gold" strokeWidth={1.75} />
              <span>{t.trust[key]}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
