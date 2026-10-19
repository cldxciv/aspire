import { ArrowRight, GraduationCap, HeartHandshake, ListChecks, MapPin } from "lucide-react";
import Image from "next/image";
import { Suspense } from "react";
import { EnquiryForm } from "@/components/forms/EnquiryForm";
import { AspireImage, ButtonLink, Container, DemoBadge } from "@/components/ui";
import { aspireAssets } from "@/content/aspire-assets";
import { stockImages } from "@/content/images";
import type { InstituteProfile } from "@/lib/types";
import { MountainRidge } from "./MountainRidge";

const heroPhoto = stockImages.himalayaHero;

/** Qualitative trust points from the mockup — no numbers (copy needs Aspire approval). */
const TRUST_POINTS = [
  { Icon: GraduationCap, title: "Expert faculty", text: "& mentorship" },
  { Icon: ListChecks, title: "Structured learning", text: "& practice" },
  { Icon: HeartHandshake, title: "Personalized", text: "student support" },
  { Icon: MapPin, title: "Local guidance", text: "across Himachal" },
];

const DEFAULT_LEAD =
  "Guiding students across Himachal Pradesh with expert faculty, structured programs and a commitment to meaningful academic progress.";

/**
 * Decorative gold brush stroke under "Brighter Tomorrows." (aspireAssets.goldCurve).
 *
 * The asset is an opaque RGB file: a gold stroke on a pale background. On the navy hero
 * that background would show as a light box, so an inline SVG colour-matrix filter turns
 * "how much more red than blue" into alpha: the gold stroke stays opaque and the near-white
 * background becomes transparent. The box is cropped to the stroke's band (rows 14-76 of 84)
 * and sized in `em` of the heading's font size so it tracks the headline at every breakpoint;
 * its widest render (4em of 64px = 256px) stays under the asset's 420px maxWidth.
 * The filter `<svg>` must stay rendered (not display:none) for the reference to resolve, and
 * its id must match the `[filter:url(#…)]` class (a literal, so Tailwind can generate it).
 */
function GoldCurve() {
  return (
    <div aria-hidden="true" className="pointer-events-none text-[clamp(2.375rem,5vw,4rem)] leading-none">
      <svg className="absolute size-0 overflow-hidden" focusable="false">
        <filter id="home-hero-gold-key" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 0.3 0 0  1.6 0 -1.6 0 -0.08" />
        </filter>
      </svg>
      <div className="-mt-[0.1em] aspect-170/62 w-[3.2em] overflow-hidden sm:ml-[4.6em] sm:w-[4em]">
        <AspireImage asset={aspireAssets.goldCurve} className="-mt-[8.2%] [filter:url(#home-hero-gold-key)]" />
      </div>
    </div>
  );
}

/**
 * Home hero (mockup `.hero`): Himalayan photo (temporary stock, see docs/asset-manifest.md)
 * under a navy overlay, copy, CTAs and the quick enquiry card.
 *
 * Layers, back to front: navy gradient + SVG ridge (fallback if the photo fails),
 * photo, readability overlay. The overlay is near-uniform below `lg` (text spans the
 * full width) and a left-to-right fade from `lg` up (text sits in the left column),
 * keeping white and gold text at WCAG AA over the brightest parts of the photo.
 *
 * The lead is the institute profile's summary when a profile is publishable (DEMO-labelled
 * while it is a placeholder), otherwise the generic mockup line.
 */
export function HomeHero({ profile }: { profile: InstituteProfile | null }) {
  const lead = profile?.summary.trim() || DEFAULT_LEAD;
  const leadIsDemo = Boolean(profile?.summary.trim()) && profile?.status === "placeholder";

  return (
    <section
      aria-labelledby="home-hero-title"
      className="relative isolate overflow-hidden bg-linear-to-br from-[#051c35] via-navy to-[#164a82] text-white"
    >
      <MountainRidge className="pointer-events-none absolute inset-x-0 bottom-0 -z-20 h-[clamp(120px,22vw,320px)] w-full" />
      {/* Decorative background: the heading and copy carry the meaning, so alt is empty. */}
      <Image
        src={heroPhoto.src}
        alt=""
        fill
        preload
        sizes="100vw"
        className="-z-10 object-cover object-center"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(5_28_53/0.92),rgb(9_40_75/0.84)_55%,rgb(9_40_75/0.78))] lg:bg-[linear-gradient(90deg,rgb(5_28_53/0.94),rgb(9_40_75/0.86)_60%,rgb(9_40_75/0.4))]"
      />
      <Container className="grid items-center gap-10 pb-14 pt-10 md:pb-20 md:pt-14 lg:grid-cols-[1.25fr_0.75fr] lg:gap-12">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-gold">
            IIT JEE · NEET · Foundation · School Programs
          </p>
          <h1
            id="home-hero-title"
            className="mt-3.5 max-w-[680px] text-[clamp(2.375rem,5vw,4rem)] font-extrabold leading-[1.04] tracking-tight"
          >
            Higher Dreams.
            <br />
            <span className="text-gold">Brighter Tomorrows.</span>
          </h1>
          <GoldCurve />
          <p className="mt-3 max-w-[620px] text-[15px] text-[#e4edf8] md:text-[17px]">{lead}</p>
          {leadIsDemo && <DemoBadge className="mt-2" />}
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="/programs">
              Explore Programs <ArrowRight aria-hidden="true" className="size-4" />
            </ButtonLink>
            <ButtonLink href="/admissions#enquiry" variant="outline">
              Book a Free Counselling Session
            </ButtonLink>
          </div>
          <ul className="mt-8 grid grid-cols-1 gap-3 text-xs text-[#eaf2ff] min-[420px]:grid-cols-2 xl:flex xl:flex-wrap xl:gap-x-6">
            {TRUST_POINTS.map(({ Icon, title, text }) => (
              <li key={title} className="flex items-start gap-2">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  <strong className="block text-sm text-white">{title}</strong>
                  {text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="w-full max-w-lg justify-self-center rounded-2xl bg-white p-5 text-ink shadow-[0_20px_55px_rgb(0_0_0/0.2)] sm:p-6 lg:max-w-none lg:justify-self-stretch">
          <h2 className="text-[23px] font-extrabold leading-tight text-navy">Start your journey with Aspire</h2>
          <p className="mt-1.5 text-[13px] text-muted">
            Tell us a little about your goals. Our team can guide you to the right next step.
          </p>
          {/* Defensive boundary: keeps the hero prerenderable if the form ever suspends. */}
          <Suspense fallback={<p className="mt-4 text-sm text-muted">Loading the enquiry form…</p>}>
            <EnquiryForm variant="quick" className="mt-4" />
          </Suspense>
        </div>
      </Container>
    </section>
  );
}
