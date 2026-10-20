import { ArrowRight, Pause } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { getResultCards, type ResultCard } from "@/lib/data";
import type { ExamTrack, ImageAsset } from "@/lib/types";
import { ResultCardTile } from "./ResultCardTile";

/*
 * CSS-only motion (no client JS): the track holds the list twice and slides by half its width.
 * It pauses on hover, on keyboard focus inside, and while the "Pause" toggle (a checkbox) is
 * checked (WCAG 2.2.2). With prefers-reduced-motion it never animates: the copy is hidden and the
 * strip scrolls sideways instead.
 */
const MARQUEE_CSS = `
@keyframes aspire-result-marquee { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: no-preference) {
  .aspire-result-marquee-track { animation: aspire-result-marquee var(--marquee-duration, 64s) linear infinite; }
}
.aspire-result-marquee:hover .aspire-result-marquee-track,
.aspire-result-marquee:focus-within .aspire-result-marquee-track,
.aspire-result-marquee:has(.aspire-result-marquee-pause:checked) .aspire-result-marquee-track {
  animation-play-state: paused;
}`;

/**
 * A horizontally moving strip of result cards from Aspire's previous batches (D-031). Server
 * component; loads its own cards with getResultCards() unless `cards` is given. Same visibility
 * and fallback rules as ResultCardMosaic: no visible cards (production today) → `fallback`, else
 * `fallbackImage`, else nothing. Placeholder cards carry the DEMO badge.
 *
 * Motion: pauses on hover / focus and with the visible "Pause" toggle; no animation at all with
 * prefers-reduced-motion (the strip becomes a keyboard-scrollable row). Never wider than its
 * container, so it cannot cause horizontal page scroll.
 */
export async function ResultCardMarquee({
  locale,
  cards,
  exam,
  year,
  limit = 16,
  secondsPerCard = 4,
  seeAllHref,
  fallback,
  fallbackImage,
  fallbackImageLabel,
  className,
}: {
  locale: Locale;
  /** Cards to show (from getResultCards()); default: the `limit` most recent visible cards. */
  cards?: ResultCard[];
  exam?: ExamTrack;
  year?: number;
  limit?: number;
  /** Speed: one full loop takes `cards × secondsPerCard` seconds. */
  secondsPerCard?: number;
  /** "See all results" link under the strip; default localePath("/results", locale); null hides it. */
  seeAllHref?: string | null;
  fallback?: ReactNode;
  fallbackImage?: ImageAsset;
  fallbackImageLabel?: string;
  className?: string;
}) {
  const shown = cards ?? (await getResultCards({ exam, year, limit }, locale));

  if (shown.length === 0) {
    if (fallback !== undefined) return <>{fallback}</>;
    if (!fallbackImage) return null;
    return (
      <div className={cn("relative aspect-[21/9] min-h-40 overflow-hidden rounded-card bg-surface", className)}>
        <Image src={fallbackImage.src} alt={fallbackImage.alt} fill sizes="(min-width: 1280px) 1200px, 100vw" className="object-cover" />
        {fallbackImageLabel && (
          <span className="absolute bottom-2 left-2 rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white">
            {fallbackImageLabel}
          </span>
        )}
      </div>
    );
  }

  const t = messagesFor(locale, "results").cards;
  const demoLabel = messagesFor(locale, "common").labels.demo;
  const href = seeAllHref === null ? null : (seeAllHref ?? localePath("/results", locale));
  const sizes = "(min-width: 1024px) 192px, (min-width: 640px) 176px, 144px";
  const item = "aspect-square w-36 shrink-0 sm:w-44 lg:w-48";

  return (
    <div className={cn("aspire-result-marquee min-w-0 max-w-full", className)}>
      <style href="aspire-result-marquee" precedence="default">
        {MARQUEE_CSS}
      </style>
      {/* Focusable so keyboard users can pause it (focus) or scroll it (reduced motion). */}
      <div
        role="region"
        aria-label={t.scrollLabel}
        tabIndex={0}
        className="overflow-hidden rounded-card focus-visible:-outline-offset-3 motion-reduce:overflow-x-auto motion-reduce:snap-x"
      >
        <div
          className="aspire-result-marquee-track flex w-max py-0.5"
          style={{ "--marquee-duration": `${Math.max(shown.length * secondsPerCard, 10)}s` } as CSSProperties}
        >
          <ul aria-label={t.listLabel} className="m-0 flex list-none gap-3 p-0 pr-3">
            {shown.map((card) => (
              <li key={card.id} className={cn(item, "snap-start")}>
                <ResultCardTile card={card} demoLabel={demoLabel} sizes={sizes} />
              </li>
            ))}
          </ul>
          {/* Second copy for a seamless loop: hidden from assistive tech and with reduced motion. */}
          <ul aria-hidden="true" className="m-0 flex list-none gap-3 p-0 pr-3 motion-reduce:hidden">
            {shown.map((card) => (
              <li key={card.id} className={item}>
                <ResultCardTile card={card} demoLabel={demoLabel} sizes={sizes} decorative />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-xs font-bold text-navy has-checked:border-navy has-checked:bg-navy has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue motion-reduce:hidden">
          <input type="checkbox" aria-label={t.pauseLabel} className="aspire-result-marquee-pause sr-only" />
          <Pause aria-hidden="true" className="size-3.5" />
          <span aria-hidden="true">{t.pause}</span>
        </label>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue hover:underline">
            {t.seeAll}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
