import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localePath } from "@/i18n/paths";
import { cn } from "@/lib/cn";
import { getResultCards, type ResultCard } from "@/lib/data";
import type { ExamTrack, ImageAsset } from "@/lib/types";
import { ResultCardTile } from "./ResultCardTile";
import { ResultMarqueeFrame } from "./ResultMarqueeFrame";

/**
 * A horizontally moving strip of result cards from Aspire's previous batches (D-031). Server
 * component; loads its own cards with getResultCards() unless `cards` is given. Same visibility
 * and fallback rules as ResultCardMosaic: no visible cards (production today) → `fallback`, else
 * `fallbackImage`, else nothing. Placeholder cards carry the DEMO badge.
 *
 * Motion (ResultMarqueeFrame): always plays, also while the mouse rests on it. Normally a smooth
 * CSS loop (no JS needed); under prefers-reduced-motion, once hydrated, it advances one card every
 * 5 s (`AUTOPLAY_MS`) with instant jumps (no continuous motion), and the strip stays a
 * keyboard-scrollable row. Both rest while the tab is hidden or the strip is off screen, and stop
 * with the visible "Pause" toggle (WCAG 2.2.2), which sticks until unticked; keyboard focus in the
 * strip ticks it for the visitor. Never wider than its container, so it cannot cause horizontal
 * page scroll.
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
  /**
   * Speed of the normal-motion loop: one full loop takes `cards × secondsPerCard` seconds (at least
   * 10). Under reduced motion it steps one card every 5 s (`AUTOPLAY_MS`) whatever this is.
   */
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
    <ResultMarqueeFrame
      className={className}
      count={shown.length}
      regionLabel={t.scrollLabel}
      pauseLabel={t.pauseLabel}
      pauseText={t.pause}
      loopSeconds={Math.max(shown.length * secondsPerCard, 10)}
      footer={
        href && (
          <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-blue hover:underline">
            {t.seeAll}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        )
      }
    >
      <ul aria-label={t.listLabel} className="m-0 flex list-none gap-4 p-0 pr-4">
        {shown.map((card) => (
          <li key={card.id} className={cn(item, "snap-start")}>
            <ResultCardTile card={card} demoLabel={demoLabel} sizes={sizes} />
          </li>
        ))}
      </ul>
      {/* Second copy for a seamless CSS loop: hidden from assistive tech, and not shown with reduced motion. */}
      <ul aria-hidden="true" className="m-0 flex list-none gap-4 p-0 pr-4 motion-reduce:hidden">
        {shown.map((card) => (
          <li key={card.id} className={item}>
            <ResultCardTile card={card} demoLabel={demoLabel} sizes={sizes} decorative />
          </li>
        ))}
      </ul>
    </ResultMarqueeFrame>
  );
}
