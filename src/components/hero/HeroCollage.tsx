import Image from "next/image";
import type { ReactNode } from "react";
import { DemoBadge } from "@/components/ui/Feedback";
import { cn } from "@/lib/cn";
import type { ImageAsset } from "@/lib/types";

/** A collage photo: licensed stock or an approved asset, with its visible label (e.g. "Illustrative stock photo"). */
export type CollagePhoto = { image: ImageAsset; label?: string; position?: string };

/**
 * A result card for the collage, straight from `getResultCards()` (D-031): only produced for
 * students whose name may be shown, so it is empty in production until consent is confirmed.
 * Use it only on general pages (About, Admissions), never beside a centre, campus or hostel.
 */
export type CollageResult = {
  photo: ImageAsset;
  name: string;
  institute?: string;
  /** Exam and year as on the card, e.g. "JEE 2026" (Latin script in every locale). */
  label: string;
  placeholder: boolean;
};

const MAIN_SIZES = "(min-width: 1200px) 500px, (min-width: 1024px) 42vw, (min-width: 768px) 40vw, 90vw";
const SMALL_SIZES = "(min-width: 1200px) 240px, (min-width: 768px) 20vw, 40vw";
const PILL = "absolute left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white";

function CollageResultCard({ result, badge, demoLabel }: { result: CollageResult; badge: string; demoLabel: string }) {
  return (
    <div
      data-surface="light"
      className="flex w-full max-w-[19rem] items-center gap-3 rounded-2xl bg-white p-3 text-ink shadow-[0_24px_40px_-18px_rgb(0_0_0/0.55)]"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-white ring-1 ring-line">
        {/* From the gated GET /api/result-cards/[file]: no /_next/image copy (D-031), files are ≤ 400 px. */}
        <Image src={result.photo.src} alt={result.photo.alt} fill unoptimized sizes="64px" className="object-contain" />
      </div>
      <div className="min-w-0">
        <p className="m-0 truncate text-[15px] font-bold">{result.name}</p>
        <p className="m-0 text-[13px] leading-snug text-muted">
          {result.institute && <span className="break-words">{result.institute} · </span>}
          <span lang="en">{result.label}</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <span className="rounded-md bg-gold-soft px-2 py-0.5 text-[11px] font-bold text-[#6b4e00]">{badge}</span>
          {result.placeholder && <DemoBadge label={demoLabel} className="px-1.5! py-0.5! text-[10px]!" />}
        </div>
      </div>
    </div>
  );
}

/**
 * A · photo collage beside the proof hero: a large photo tilted left, an optional small photo
 * tilted right in the top corner, an optional result card and an optional corner chip
 * (`RanchoChip` on About, `NextBatchCard compact` on Admissions).
 *
 * - Photos come from the page (stock or approved assets) and keep their visible label.
 * - The result card renders only when the page passes one from `getResultCards()` (none in
 *   production today); its badge text comes from the page (e.g. "Aspire result").
 * - Fixed aspect boxes: no layout shift. Up to 1279 px (a narrow column) the card and the chip
 *   sit under the photos, overlapping their lower edge; from `xl` they sit over the photos'
 *   bottom corners as in the design. Photo labels stay clear of both. The tilt is static.
 * - The large photo is the hero's LCP image: preloaded at high fetch priority unless
 *   `priority={false}`. Server component.
 */
export function HeroCollage({
  photos,
  result,
  resultBadge,
  demoLabel,
  chip,
  priority = true,
  className,
}: {
  photos: readonly CollagePhoto[];
  result?: CollageResult | null;
  /** Visible badge on the result card, e.g. "Aspire result" (page messages). */
  resultBadge: string;
  /** `common.labels.demo`. */
  demoLabel: string;
  chip?: ReactNode;
  priority?: boolean;
  className?: string;
}) {
  const [main, small] = photos;
  if (!main && !result && !chip) return null;
  const overlays = Boolean(result || chip);
  return (
    <div className={cn("relative mx-auto w-full max-w-xl", className)} data-hero-collage="">
      {main && (
        <div className={cn("relative", small ? "aspect-[6/5] sm:aspect-[5/4]" : "aspect-[4/3]")}>
          <figure
            className={cn(
              "absolute m-0 -rotate-3 overflow-hidden rounded-card bg-navy-2 shadow-[0_24px_48px_-24px_rgb(0_0_0/0.6)] ring-1 ring-white/15",
              small ? "top-[9%] left-[3%] h-[72%] w-[84%]" : "inset-[4%]",
            )}
          >
            <Image
              src={main.image.src}
              alt={main.image.alt}
              fill
              sizes={MAIN_SIZES}
              preload={priority}
              fetchPriority={priority ? "high" : undefined}
              className="object-cover"
              style={main.position ? { objectPosition: main.position } : undefined}
            />
            {/* Top corner: the result card and the chip overlap the photo's lower edge. */}
            {main.label && <figcaption className={cn(PILL, "top-2")}>{main.label}</figcaption>}
          </figure>
          {small && (
            <figure className="absolute top-0 right-0 m-0 aspect-[19/15] w-[42%] rotate-[4deg] overflow-hidden rounded-2xl border-4 border-navy bg-navy-2 shadow-[0_18px_36px_-20px_rgb(0_0_0/0.6)]">
              <Image
                src={small.image.src}
                alt={small.image.alt}
                fill
                sizes={SMALL_SIZES}
                className="object-cover"
                style={small.position ? { objectPosition: small.position } : undefined}
              />
              {small.label && <figcaption className={cn(PILL, "bottom-2")}>{small.label}</figcaption>}
            </figure>
          )}
        </div>
      )}
      {overlays && (
        <div
          className={cn(
            "relative flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between",
            main && "-mt-10 px-2 sm:-mt-14 xl:absolute xl:inset-x-0 xl:bottom-[3%] xl:mt-0 xl:flex-nowrap xl:px-0",
          )}
        >
          {result ? <CollageResultCard result={result} badge={resultBadge} demoLabel={demoLabel} /> : <span aria-hidden="true" />}
          {chip && <div className="max-w-full sm:max-w-[17rem] xl:mr-[2%]">{chip}</div>}
        </div>
      )}
    </div>
  );
}
