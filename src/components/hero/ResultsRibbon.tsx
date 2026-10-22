"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { DemoBadge } from "@/components/ui/Feedback";
import {
  isPausingFocus,
  readRail,
  scrollRailTo,
  stepRail,
  useAutoplay,
  useHydrated,
  useInView,
  usePageHidden,
  useReducedMotion,
  useScrollSettle,
} from "@/components/ui/carousel-env";
import { AUTOPLAY_MS, autoplayDelay, isPlaying, liveMode, shouldAutoRotate, type PlayChoice } from "@/components/ui/carousel-utils";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";
import type { ImageAsset } from "@/lib/types";
import { cardsForYear, initialRibbonYear, ribbonYears, type RibbonYear } from "./ribbon-data";
import { HERO_CHIP, HERO_ROUND_BUTTON } from "./hero-styles";

/**
 * One card of the ribbon: a `ResultCard` from `getResultCards()` (D-031), passed through as is.
 * Only students whose name may be shown are in that list, so the ribbon is empty in production
 * until consent is confirmed.
 */
export type RibbonCard = {
  id: string;
  photo: ImageAsset;
  name: string;
  institute?: string;
  exam: string;
  year: number;
  /** "JEE 2026" (Latin script in every locale). */
  label: string;
  placeholder: boolean;
};

/** Strings from the Results page messages (and `common`), in the page locale. */
export type RibbonLabels = {
  /** Accessible name of the scrolling list, e.g. "Results from Aspire's previous batches". */
  listLabel: string;
  /** Accessible name of the year pills, e.g. "Show results from". */
  yearGroup: string;
  /** Last pill, e.g. "All years". */
  allYears: string;
  /** Pause / play button names while playing / paused, e.g. "Pause the results" / "Play the results". */
  pause: string;
  play: string;
  previous: string;
  next: string;
  /** Announced position, "{current} of {total}". */
  position: string;
  /** Optional visible hint beside the controls, e.g. "A new card every 5 seconds". */
  hint?: string;
  /** `common.labels.demo`. */
  demo: string;
};

/** Card widths: 168 px on phones, 192 px from `sm`, 230 px from `lg` (the design's width). */
const ITEM = "w-[10.5rem] shrink-0 snap-start sm:w-48 lg:w-[14.375rem]";
const IMAGE_SIZES = "(min-width: 1024px) 200px, (min-width: 640px) 168px, 144px";
/** The track bleeds to the panel edge; its padding and snap padding match the page gutters. */
const BLEED = "-mx-5 sm:-mx-6 md:-mx-8 lg:-mx-10";
const GUTTER = "px-5 sm:px-6 md:px-8 lg:px-10";
const SNAP_GUTTER = "scroll-px-5 sm:scroll-px-6 md:scroll-px-8 lg:scroll-px-10";

/**
 * C · results ribbon (client island): year pills over a sideways row of result cards that steps
 * one card every 5 s, with Pause / Play and previous / next buttons.
 *
 * Built on the shared carousel logic (`carousel-utils` / `carousel-env`, as the home ResultRail):
 * - Autoplay (default on, once hydrated) advances one card every `AUTOPLAY_MS` (5 s), read from
 *   the row's live scroll position and wrapping from the end; under `prefers-reduced-motion` each
 *   step is an instant jump at the same pace. Mouse hover never pauses (owner decision).
 * - The visible Pause / Play button (WCAG 2.2.2) is first in the tab order; a Pause sticks until
 *   Play; keyboard focus anywhere else in the ribbon presses Pause (APG). It also rests while the
 *   tab is hidden or the ribbon is off screen. A swipe, key or button restarts the full interval.
 * - The row is a focusable, labelled region (arrow keys scroll it); the position is announced
 *   politely whenever it is not rotating.
 * - Server render: the default year's cards (`defaultYear`, else the newest year) in a static,
 *   swipeable row; no buttons until hydration (nothing dead, nothing moving). Without JavaScript the
 *   pills are hidden and the row shows a scrollbar. Fixed card sizes: no layout shift.
 * - Renders nothing without cards (production today): the page shows its fallback instead.
 */
export function ResultsRibbon({
  cards,
  labels: t,
  defaultYear,
  autoPlay = true,
  intervalMs = AUTOPLAY_MS,
  className,
}: {
  cards: readonly RibbonCard[];
  labels: RibbonLabels;
  defaultYear?: RibbonYear;
  autoPlay?: boolean;
  /** Autoplay interval (default `AUTOPLAY_MS`, 5000); never below 2000. */
  intervalMs?: number;
  className?: string;
}) {
  const years = ribbonYears(cards);
  const [year, setYear] = useState<RibbonYear>(() => initialRibbonYear(years, defaultYear));
  const shown = cardsForYear(cards, year);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(shown.length <= 1);
  const [choice, setChoice] = useState<PlayChoice>("auto");
  const [moves, setMoves] = useState(0);
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const pageHidden = usePageHidden();
  const inView = useInView(rootRef, shown.length > 1);

  const scrollable = shown.length > 1 && !(atStart && atEnd);
  const playing = hydrated && isPlaying({ autoPlay, choice });
  const rotate = shouldAutoRotate({ count: scrollable ? shown.length : 1, playing, pageHidden, inView });

  const items = (): HTMLElement[] => {
    const list = listRef.current;
    return list ? (Array.from(list.children) as HTMLElement[]) : [];
  };

  /** Syncs the position and the button states with the scroll position. */
  const update = useCallback(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;
    if (!scroller || !list || list.children.length === 0) return;
    const rail = readRail(scroller, Array.from(list.children) as HTMLElement[]);
    setIndex(rail.index);
    setAtStart(rail.atStart);
    setAtEnd(rail.atEnd);
  }, []);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const list = listRef.current;
    if (!scroller || !list || typeof ResizeObserver === "undefined") return;
    // Fires once on observe, then whenever the row or its content (another year) resizes.
    const observer = new ResizeObserver(() => update());
    observer.observe(scroller);
    observer.observe(list);
    return () => observer.disconnect();
  }, [update]);

  useAutoplay(
    rotate,
    autoplayDelay(intervalMs),
    () => {
      const scroller = scrollerRef.current;
      if (scroller) stepRail(scroller, items(), reducedMotion);
    },
    moves,
  );

  // Every settled scroll updates the position; one the visitor made restarts the interval.
  useScrollSettle(scrollerRef, hydrated && shown.length > 1, (userGesture) => {
    update();
    if (userGesture) setMoves((n) => n + 1);
  });

  function pickYear(next: RibbonYear) {
    if (next === year) return;
    setYear(next);
    setMoves((n) => n + 1);
    // A new set of cards starts from its first card.
    scrollerRef.current?.scrollTo({ left: 0, behavior: "auto" });
  }

  function go(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller || (direction < 0 ? atStart : atEnd)) return;
    const all = items();
    scrollRailTo(scroller, all, Math.min(Math.max(index + direction, 0), all.length - 1), reducedMotion);
    setMoves((n) => n + 1);
  }

  if (cards.length === 0) return null;

  const pills: RibbonYear[] = years.length > 1 ? [...years, "all"] : [];

  return (
    // Keyboard focus in the ribbon (not on Pause / Play) presses Pause (APG); hover never does.
    <div
      ref={rootRef}
      className={cn("flex min-w-0 flex-col", className)}
      onFocus={(event) => {
        if (isPausingFocus(event.target)) setChoice("paused");
      }}
    >
      {pills.length > 0 && (
        <div role="group" aria-label={t.yearGroup} className="flex flex-wrap gap-2 noscript:hidden">
          {pills.map((pill) => (
            <button
              key={pill}
              type="button"
              aria-pressed={pill === year}
              aria-controls={listId}
              onClick={() => pickYear(pill)}
              className={HERO_CHIP}
            >
              {pill === "all" ? t.allYears : pill}
            </button>
          ))}
        </div>
      )}

      {/* Controls first in the DOM and tab order (APG: the rotation control before the cards), shown under them.
          `data-rancho-avoid`: the floating Ask Rancho button steps aside while it would cover them. */}
      <div data-rancho-avoid="" className="order-last mt-4 flex min-h-11 items-center justify-between gap-3">
        {t.hint ? <p className="m-0 text-[13px] leading-snug text-[#b9d3f3]">{t.hint}</p> : <span aria-hidden="true" />}
        {hydrated && scrollable && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-carousel-toggle=""
              aria-controls={listId}
              aria-label={playing ? t.pause : t.play}
              onClick={() => setChoice(playing ? "paused" : "playing")}
              className={HERO_ROUND_BUTTON}
            >
              {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
            </button>
            <button
              type="button"
              aria-controls={listId}
              aria-disabled={atStart}
              aria-label={t.previous}
              onClick={() => go(-1)}
              className={HERO_ROUND_BUTTON}
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-controls={listId}
              aria-disabled={atEnd}
              aria-label={t.next}
              onClick={() => go(1)}
              className={HERO_ROUND_BUTTON}
            >
              <ChevronRight aria-hidden="true" className="size-5" />
            </button>
          </div>
        )}
        {/* Announces manual moves and year changes; silent while auto-rotating (APG). */}
        <p aria-live={liveMode(rotate)} className="sr-only">
          {hydrated && shown.length > 1 ? format(t.position, { current: index + 1, total: shown.length }) : ""}
        </p>
      </div>

      <div
        ref={scrollerRef}
        role="region"
        aria-label={t.listLabel}
        tabIndex={0}
        className={cn(
          BLEED,
          SNAP_GUTTER,
          "relative mt-5 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain py-2 outline-none",
          "[scrollbar-width:none] focus-visible:ring-3 focus-visible:ring-gold focus-visible:ring-inset [&::-webkit-scrollbar]:hidden",
          "noscript:[scrollbar-width:thin] noscript:[&::-webkit-scrollbar]:block noscript:[&::-webkit-scrollbar]:h-2",
        )}
      >
        <ul ref={listRef} id={listId} className={cn("m-0 flex w-max list-none gap-4 p-0", GUTTER)}>
          {shown.map((card, i) => (
            <li key={card.id} className={ITEM}>
              <article
                data-surface="light"
                className="flex h-full flex-col rounded-card bg-white p-3 text-ink shadow-[0_22px_40px_-24px_rgb(0_0_0/0.6)] sm:p-4"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-line">
                  {/* From the gated GET /api/result-cards/[file]: no /_next/image copy (D-031). */}
                  <Image
                    src={card.photo.src}
                    alt={card.photo.alt}
                    fill
                    unoptimized
                    sizes={IMAGE_SIZES}
                    loading={i < 4 ? "eager" : "lazy"}
                    className="object-contain"
                    draggable={false}
                  />
                </div>
                <p className="m-0 mt-3 truncate text-[15px] font-bold">{card.name}</p>
                {card.institute && <p className="m-0 mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{card.institute}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                  <span lang="en" className="rounded-md bg-gold-soft px-2 py-0.5 text-xs font-bold text-[#6b4e00]">
                    {card.label}
                  </span>
                  {card.placeholder && <DemoBadge label={t.demo} className="px-1.5! py-0.5! text-[10px]!" />}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
