"use client";

import { Pause } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  readRail,
  scrollRailTo,
  useHydrated,
  useInView,
  useInteractionPause,
  usePageHidden,
  useReducedMotion,
} from "@/components/ui/carousel-env";
import { autoplayDelay, railNextIndex, shouldAutoRotate } from "@/components/ui/carousel-utils";
import { cn } from "@/lib/cn";

/*
 * Normal motion is CSS only (it runs before and without JS): the track holds the list twice and
 * slides by half its width. It pauses on hover, on keyboard focus in the strip, while the "Pause"
 * toggle (a checkbox) is checked (WCAG 2.2.2) and, once hydrated, while the tab is hidden or the
 * strip is off screen (`data-marquee-idle`). One selector per rule, so a browser without `:has()`
 * or `:focus-visible` still gets the other pauses.
 *
 * Reduced motion has no CSS animation at all (the global reduced-motion rule would cut it short
 * anyway): the copy is hidden and the strip is a sideways-scrollable row that the frame below
 * advances one card at a time with instant jumps.
 */
export const MARQUEE_CSS = `
@keyframes aspire-result-marquee { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: no-preference) {
  .aspire-result-marquee-track { animation: aspire-result-marquee var(--marquee-duration, 64s) linear infinite; }
}
.aspire-result-marquee:hover .aspire-result-marquee-track { animation-play-state: paused; }
.aspire-result-marquee [role="region"]:focus-visible .aspire-result-marquee-track { animation-play-state: paused; }
.aspire-result-marquee[data-marquee-idle] .aspire-result-marquee-track { animation-play-state: paused; }
.aspire-result-marquee:has(.aspire-result-marquee-pause:checked) .aspire-result-marquee-track { animation-play-state: paused; }`;

/**
 * Client frame of `ResultCardMarquee`: the scrolling region, the track (the server-rendered lists
 * are `children`) and the pause toggle row (`footer` sits beside the toggle).
 *
 * - Normal motion: the CSS loop above (unchanged before hydration).
 * - `prefers-reduced-motion: reduce`: still plays once hydrated, as discrete instant steps of one
 *   card every `autoplayDelay(stepMs, true)` (≥ 8 s), wrapping from the end back to the first card.
 *   Pauses on mouse hover, keyboard focus in the strip, a hidden tab, when off screen and while
 *   the Pause toggle is checked. Any scroll (swipe, keys) restarts the full interval.
 * - The toggle is hidden under reduced motion only before hydration (nothing moves then), so the
 *   server markup is unchanged; afterwards it is always visible and a Pause sticks until unticked.
 */
export function ResultMarqueeFrame({
  className,
  count,
  regionLabel,
  pauseLabel,
  pauseText,
  loopSeconds,
  stepMs,
  footer,
  children,
}: {
  className?: string;
  /** Cards in the (announced) list. */
  count: number;
  /** Accessible name of the scrolling region (`results.cards.scrollLabel`). */
  regionLabel: string;
  /** Accessible name of the pause toggle (`results.cards.pauseLabel`). */
  pauseLabel: string;
  /** Visible text of the pause toggle (`results.cards.pause`). */
  pauseText: string;
  /** Duration of one full CSS loop (normal motion). */
  loopSeconds: number;
  /** Base time per card; the reduced-motion step interval is `autoplayDelay(stepMs, true)`. */
  stepMs: number;
  footer?: ReactNode;
  /** The announced list followed by its aria-hidden copy. */
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLInputElement>(null);
  const [paused, setPaused] = useState(false);
  const { hovered, focusWithin, noteKey, pointerHandlers, focusHandlers } = useInteractionPause();
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const pageHidden = usePageHidden();
  const inView = useInView(rootRef, count > 1);

  // Reduced motion: JS steps instead of the CSS loop.
  const stepping = hydrated && reducedMotion;
  const rotate =
    stepping && shouldAutoRotate({ count, playing: !paused, hovered, focusWithin, pageHidden, inView });
  // Normal motion: the CSS loop also stops while the tab is hidden or the strip is off screen.
  const idle = hydrated && (pageHidden || !inView);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!rotate || !viewport) return;
    const delay = autoplayDelay(stepMs, true);
    let timer = 0;
    function schedule() {
      window.clearTimeout(timer);
      timer = window.setTimeout(step, delay);
    }
    function step() {
      if (!viewport) return;
      const items = Array.from(viewport.querySelector("ul")?.children ?? []) as HTMLElement[];
      // `checked` covers a Pause ticked before hydration (no change event reached React then).
      const canMove = items.length > 1 && viewport.scrollWidth > viewport.clientWidth + 1;
      if (!toggleRef.current?.checked && canMove) {
        const rail = readRail(viewport, items);
        scrollRailTo(viewport, items, railNextIndex(rail.index, items.length, rail.atEnd), true);
      }
      schedule();
    }
    // Any scroll (a swipe, arrow keys, or the jump itself) restarts the full interval.
    viewport.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      window.clearTimeout(timer);
      viewport.removeEventListener("scroll", schedule);
    };
  }, [rotate, stepMs]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    noteKey(event.target);
  };

  return (
    <div
      ref={rootRef}
      className={cn("aspire-result-marquee min-w-0 max-w-full", className)}
      data-marquee-idle={idle ? "" : undefined}
      {...pointerHandlers}
    >
      <style href="aspire-result-marquee" precedence="default">
        {MARQUEE_CSS}
      </style>
      {/* Focusable so keyboard users can pause it (focus) or scroll it (reduced motion). */}
      <div
        ref={viewportRef}
        role="region"
        aria-label={regionLabel}
        tabIndex={0}
        className="overflow-hidden rounded-card focus-visible:-outline-offset-3 motion-reduce:overflow-x-auto motion-reduce:snap-x"
        onKeyDown={onKeyDown}
        {...focusHandlers}
      >
        <div
          className="aspire-result-marquee-track flex w-max py-0.5"
          style={{ "--marquee-duration": `${loopSeconds}s` } as CSSProperties}
        >
          {children}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label
          className={cn(
            "inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-control border border-[#b9cbe0] bg-white px-3 text-xs font-bold text-navy has-checked:border-navy has-checked:bg-navy has-checked:text-white has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue",
            // Nothing moves under reduced motion until hydration, so no dead control before it.
            !hydrated && "motion-reduce:hidden",
          )}
        >
          <input
            ref={toggleRef}
            type="checkbox"
            aria-label={pauseLabel}
            onChange={(event) => setPaused(event.currentTarget.checked)}
            className="aspire-result-marquee-pause sr-only"
          />
          <Pause aria-hidden="true" className="size-3.5" />
          <span aria-hidden="true">{pauseText}</span>
        </label>
        {footer}
      </div>
    </div>
  );
}
