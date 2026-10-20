"use client";

import { ChevronLeft, ChevronRight, GraduationCap, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { InitialsAvatar } from "@/components/faculty/InitialsAvatar";
import { DemoBadge } from "@/components/ui";
import {
  readRail,
  scrollRailTo,
  useHydrated,
  useInView,
  useInteractionPause,
  usePageHidden,
  useReducedMotion,
} from "@/components/ui/carousel-env";
import {
  autoplayDelay,
  isPlaying,
  liveMode,
  railNextIndex,
  shouldAutoRotate,
  type PlayChoice,
} from "@/components/ui/carousel-utils";
import { format } from "@/i18n/format";
import { cn } from "@/lib/cn";

/**
 * Client-safe result card, projected on the server by `toResultCardViews()`
 * (ResultsShowcase.tsx). Only displayed fields: no record id (it embeds the
 * student's name), `sourceRef`, consent status, school or quote. `name` is
 * already null unless canShowStudentName() allowed it, so a withheld name never
 * reaches the browser.
 */
export interface ResultCardView {
  /** Exam as recorded, e.g. "JEE Advanced", "NEET". */
  exam: string;
  /** Rank or outcome exactly as recorded, e.g. "AIR 312", "675 / 720". */
  outcome: string;
  year: number;
  name: string | null;
  destination: string | null;
  /** Placeholder record: render a DEMO badge. */
  placeholder: boolean;
}

/**
 * Localised rail copy (from `home.results`, `common.labels.demo` and `common.carousel.pause` /
 * `.play`, picked on the server).
 */
export type ResultRailMessages = {
  nameWithheld: string;
  yearPrefix: string;
  /** "{current} of {total}" */
  position: string;
  positionPrefix: string;
  previous: string;
  next: string;
  demo: string;
  /** Accessible name of the pause / play button while playing (`common.carousel.pause`). */
  pause: string;
  /** Accessible name of the pause / play button while paused (`common.carousel.play`). */
  play: string;
};

const controlClass =
  "grid size-11 place-items-center rounded-full border border-[#b9cbe0] bg-white text-navy shadow-soft transition " +
  "hover:border-blue aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-[#b9cbe0]";

function ResultCard({ card, t }: { card: ResultCardView; t: ResultRailMessages }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-white shadow-soft">
      <div data-surface="dark" className="bg-linear-to-br from-navy to-navy-2 p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-extrabold uppercase tracking-wide text-gold">{card.exam}</p>
          {/* Decorative: never a photo beside a name (D-019). */}
          <InitialsAvatar name={card.name} size="sm" />
        </div>
        <h3
          className={cn(
            "mt-2 break-words font-serif font-semibold leading-tight",
            card.outcome.length > 12 ? "text-xl" : "text-[1.75rem]",
          )}
        >
          {card.outcome}
        </h3>
        <p className="mt-1 text-sm text-[#d5e3f4]">
          <span className="sr-only">{t.yearPrefix} </span>
          {card.year}
        </p>
      </div>
      <div className="flex flex-1 items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className={cn("break-words", card.name ? "font-bold text-ink" : "font-semibold text-muted italic")}>
            {card.name ?? t.nameWithheld}
          </p>
          {card.destination && <p className="mt-1 break-words text-sm text-muted">{card.destination}</p>}
          {card.placeholder && <DemoBadge label={t.demo} className="mt-2" />}
        </div>
        {/* Generic mark instead of any institution's crest. */}
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-navy"
        >
          <GraduationCap className="size-5" strokeWidth={1.6} />
        </span>
      </div>
    </article>
  );
}

/**
 * Horizontal scroll-snap rail of result cards with 44px pause/play and previous/next buttons and
 * an "n of N" status.
 *
 * Autoplay (default on, 6 s, on every device once hydrated): advances one card at a time and wraps
 * from the end back to the first card. Under `prefers-reduced-motion` it still plays, but each
 * step is an instant jump (no smooth scroll) every 8 s at least. It pauses on mouse hover, keyboard
 * focus inside (not on the pause/play button), a hidden tab and when scrolled out of view (APG
 * carousel pattern); a Pause press sticks until Play (WCAG 2.2.2). The status is a polite live
 * region only while the rail is not auto-rotating. Nothing rotates and no pause/play button renders
 * before hydration, so the server markup is the static rail.
 *
 * The list itself is focusable so keyboard users can scroll it with the arrow keys; previous/next
 * stay focusable at the ends (aria-disabled) so focus is never lost.
 */
export function ResultRail({
  cards,
  label,
  messages: t,
  autoPlay = true,
  intervalMs = 6000,
}: {
  cards: ResultCardView[];
  label: string;
  messages: ResultRailMessages;
  autoPlay?: boolean;
  /** Autoplay interval; never below 2000, and at least 8000 under reduced motion. */
  intervalMs?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const [index, setIndex] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(cards.length <= 1);
  const [choice, setChoice] = useState<PlayChoice>("auto");
  const { hovered, focusWithin, noteKey, pointerHandlers, focusHandlers } = useInteractionPause();
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const pageHidden = usePageHidden();
  const inView = useInView(rootRef, cards.length > 1);

  // Every card already fits: nothing to move, so no autoplay and no pause/play button.
  const scrollable = cards.length > 1 && !(atStart && atEnd);
  const playing = hydrated && isPlaying({ autoPlay, choice });
  const rotate = shouldAutoRotate({
    count: scrollable ? cards.length : 1,
    playing,
    hovered,
    focusWithin,
    pageHidden,
    inView,
  });

  /** Syncs the "n of N" status and the button states with the scroll position. */
  const update = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const items = Array.from(list.children) as HTMLElement[];
    if (items.length === 0) return;
    const rail = readRail(list, items);
    setIndex(rail.index);
    setAtStart(rail.atStart);
    setAtEnd(rail.atEnd);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Fires once on observe, then whenever the rail resizes.
    const observer = new ResizeObserver(() => update());
    observer.observe(list);
    return () => observer.disconnect();
  }, [update]);

  // Autoplay: one timeout per position, so a manual move (buttons, swipe, keys) restarts the full
  // interval. From the end it wraps back to the first card.
  useEffect(() => {
    if (!rotate) return;
    const timer = window.setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      const items = Array.from(list.children) as HTMLElement[];
      scrollRailTo(list, items, railNextIndex(index, items.length, atEnd), reducedMotion);
    }, autoplayDelay(intervalMs, reducedMotion));
    return () => window.clearTimeout(timer);
  }, [rotate, index, atEnd, intervalMs, reducedMotion]);

  function go(direction: -1 | 1) {
    const list = listRef.current;
    if (!list || (direction < 0 ? atStart : atEnd)) return;
    const items = Array.from(list.children) as HTMLElement[];
    scrollRailTo(list, items, Math.min(Math.max(index + direction, 0), items.length - 1), reducedMotion);
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    // A click-focused control that is then used from the keyboard is keyboard focus too.
    noteKey(event.target);
  };

  return (
    // Container queries: the rail sits in half the page width beside a photo on the home page (D-030).
    // Hover and keyboard focus anywhere in the rail (cards or buttons) pause autoplay.
    <div ref={rootRef} className="@container flex min-w-0 flex-col" onKeyDown={onKeyDown} {...focusHandlers} {...pointerHandlers}>
      {/* Controls come first in DOM and tab order (APG: rotation control before the slides), shown below the cards. */}
      {cards.length > 1 && (
        <div className="order-last mt-4 flex items-center justify-end gap-3">
          {hydrated && scrollable && (
            // Client-only (it cannot work before hydration); first of the rail's buttons.
            <button
              type="button"
              data-carousel-toggle=""
              aria-controls={listId}
              aria-label={playing ? t.pause : t.play}
              onClick={() => setChoice(playing ? "paused" : "playing")}
              className={cn(controlClass, "mr-auto")}
            >
              {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
            </button>
          )}
          {/* Announces manual moves; silent while auto-rotating (APG). */}
          <p aria-live={liveMode(rotate)} className="text-sm font-semibold text-muted">
            <span className="sr-only">{t.positionPrefix} </span>
            {format(t.position, { current: index + 1, total: cards.length })}
          </p>
          <button
            type="button"
            aria-controls={listId}
            aria-disabled={atStart}
            aria-label={t.previous}
            onClick={() => go(-1)}
            className={controlClass}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-controls={listId}
            aria-disabled={atEnd}
            aria-label={t.next}
            onClick={() => go(1)}
            className={controlClass}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>
      )}
      <ul
        ref={listRef}
        id={listId}
        aria-label={label}
        tabIndex={0}
        onScroll={update}
        className="relative -mx-1 flex snap-x snap-mandatory scroll-px-1 gap-5 overflow-x-auto overscroll-x-contain px-1 pt-1 pb-3 [scrollbar-width:thin]"
      >
        {cards.map((card, i) => (
          <li
            // The list is static for the page's lifetime; ids are not sent to the client (they embed names).
            key={i}
            className="w-[78%] shrink-0 snap-start @sm:w-[calc((100%-1.25rem)/2)] @3xl:w-[calc((100%-2.5rem)/3)] @5xl:w-[calc((100%-3.75rem)/4)]"
          >
            <ResultCard card={card} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}
