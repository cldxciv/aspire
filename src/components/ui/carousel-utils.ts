/**
 * Pure helpers for `ImageCarousel`, the home `ResultRail` and the reduced-motion stepping of
 * `ResultCardMarquee` (client-safe, no React, no messages). Unit-tested in `carousel.test.ts`.
 *
 * Motion policy (owner decision, 2026-10-20): every carousel, rail and marquee autoplays by
 * default on every device, including under `prefers-reduced-motion: reduce` (many Windows PCs
 * report it because animations are switched off for performance). Reduced motion only changes HOW
 * it moves: discrete, instant steps instead of smooth scrolling or a continuous slide, and at least
 * `REDUCED_MOTION_MIN_DELAY` between steps. A visible pause / play control (WCAG 2.2.2) is always
 * there, and rotation pauses on mouse hover, keyboard focus inside, a hidden tab and when scrolled
 * out of view (APG carousel pattern).
 */
import type { ImageAsset } from "@/lib/types";

/**
 * One carousel slide. `label` is a visible pill ("Illustrative stock photo"); `caption` (keep it to
 * two short lines) sits on its own navy backdrop; `position` is the CSS `object-position` focal
 * point for the cover crop (e.g. "50% 30%" for a portrait photo in a landscape box).
 */
export type CarouselSlide = { image: ImageAsset; label?: string; caption?: string; position?: string };

export type CarouselAspect = "16/10" | "4/3" | "1/1" | "3/4" | "21/9" | "hero" | "fill";

/**
 * Tailwind classes for each aspect box; `fill` absolutely fills a positioned parent. The `21/9`
 * band is 16/10 below `md` so phones keep a usable height for the caption and controls. `hero` is
 * PageHero's media box: 16/10 stacked on phones, 4/3 beside the copy on tablets, 16/10 from `lg`.
 */
export const carouselAspectClass: Record<CarouselAspect, string> = {
  "16/10": "relative aspect-16/10",
  "4/3": "relative aspect-4/3",
  "1/1": "relative aspect-square",
  "3/4": "relative aspect-3/4",
  "21/9": "relative aspect-16/10 md:aspect-[21/9]",
  hero: "relative aspect-16/10 md:aspect-4/3 lg:aspect-16/10",
  fill: "absolute inset-0",
};

/** Width / height of each fixed box (the narrowest variant for the responsive `21/9` band and `hero`). */
export const carouselBoxRatio: Record<Exclude<CarouselAspect, "fill">, number> = {
  "16/10": 1.6,
  "4/3": 4 / 3,
  "1/1": 1,
  "3/4": 0.75,
  "21/9": 1.6,
  hero: 4 / 3,
};

/**
 * `sizes` for an `object-cover` image: when the photo is wider than its box, cover renders it
 * `imageRatio / boxRatio` times the box width, so every length in `sizes` is scaled by that factor
 * (as `calc()`). Unchanged when the factor is ~1 or less, or unknown.
 */
export function coverSizes(sizes: string, imageRatio: number, boxRatio: number | undefined): string {
  if (!boxRatio || !Number.isFinite(imageRatio) || imageRatio <= 0) return sizes;
  const factor = imageRatio / boxRatio;
  if (!Number.isFinite(factor) || factor <= 1.05) return sizes;
  return sizes
    .split(",")
    .map((entry) => entry.trim().replace(/(\d+(?:\.\d+)?(?:px|vw))$/, (len) => `calc(${len} * ${factor.toFixed(2)})`))
    .join(", ");
}

/** `index` clamped into `0 … count-1` (0 when empty), e.g. after `slides` shrinks. */
export function clampIndex(index: number, count: number): number {
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/** Shortest time between two automatic steps under `prefers-reduced-motion: reduce`. */
export const REDUCED_MOTION_MIN_DELAY = 8000;

/**
 * Autoplay delay: never below 2 s; a non-finite value (NaN from a bad prop) falls back to 6 s.
 * Under reduced motion the steps are instant jumps, so they come a little less often (≥ 8 s).
 */
export function autoplayDelay(intervalMs: number, reducedMotion = false): number {
  const delay = Number.isFinite(intervalMs) ? Math.max(intervalMs, 2000) : 6000;
  return reducedMotion ? Math.max(delay, REDUCED_MOTION_MIN_DELAY) : delay;
}

/** `scrollTo` behaviour for a step: smooth normally, an instant jump under reduced motion. */
export function scrollBehaviorFor(reducedMotion: boolean): ScrollBehavior {
  return reducedMotion ? "instant" : "smooth";
}

/** APG: the slide region is a polite live region except while it is actually auto-rotating. */
export function liveMode(rotating: boolean): "off" | "polite" {
  return rotating ? "off" : "polite";
}

/** Wraps any integer into `0 … count-1` (negative values wrap from the end). 0 when empty. */
export function wrapIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

/** The slide after `index`, wrapping from the last slide to the first. */
export function nextIndex(index: number, count: number): number {
  return wrapIndex(index + 1, count);
}

/** The slide before `index`, wrapping from the first slide to the last. */
export function prevIndex(index: number, count: number): number {
  return wrapIndex(index - 1, count);
}

/** What the visitor chose with the pause/play button; `auto` = not touched yet. */
export type PlayChoice = "auto" | "playing" | "paused";

/**
 * Whether the pause/play button shows the "playing" state (its label is then "Pause").
 * The visitor's explicit choice wins and sticks (a Pause stays paused until they press Play);
 * untouched, it follows `autoPlay`. Reduced motion does not stop autoplay: it only makes each step
 * an instant swap (`scrollBehaviorFor`) at a longer interval (`autoplayDelay`).
 */
export function isPlaying({ autoPlay, choice }: { autoPlay: boolean; choice: PlayChoice }): boolean {
  if (choice === "playing") return true;
  if (choice === "paused") return false;
  return autoPlay;
}

/**
 * Whether the carousel should advance on a timer right now: it must be playing, have 2+ slides,
 * and be visible, in view, not hovered and not holding keyboard focus (APG carousel pattern).
 * Reduced motion is deliberately not an input: it changes how a step looks, not whether it happens.
 */
export function shouldAutoRotate({
  count,
  playing,
  hovered = false,
  focusWithin = false,
  pageHidden = false,
  inView = true,
}: {
  count: number;
  playing: boolean;
  hovered?: boolean;
  focusWithin?: boolean;
  pageHidden?: boolean;
  inView?: boolean;
}): boolean {
  return count > 1 && playing && !hovered && !focusWithin && !pageHidden && inView;
}

/**
 * Index of the snap point nearest to `scrollLeft`. `starts` are the items' left edges measured from
 * the first item's left edge (so `starts[0]` is 0). 0 when there are no items.
 */
export function nearestIndex(starts: readonly number[], scrollLeft: number): number {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  starts.forEach((start, i) => {
    const distance = Math.abs(start - scrollLeft);
    if (distance < best) {
      best = distance;
      nearest = i;
    }
  });
  return nearest;
}

/** Whether a horizontal scroller is at its start / end (1 px tolerance for sub-pixel layouts). */
export function railEdges(scrollLeft: number, clientWidth: number, scrollWidth: number): { atStart: boolean; atEnd: boolean } {
  return { atStart: scrollLeft <= 1, atEnd: scrollLeft + clientWidth >= scrollWidth - 1 };
}

/**
 * Autoplay step of a scroll-snap rail that shows several items at once: the next item, or back to
 * the first once the rail is scrolled to its end (the last items are then all in view) or sits on
 * the last item.
 */
export function railNextIndex(index: number, count: number, atEnd: boolean): number {
  if (count <= 1) return 0;
  return atEnd || index >= count - 1 ? 0 : index + 1;
}

/** Index for an arrow / Home / End key, or `null` when the key is not a carousel key. */
export function indexForKey(key: string, index: number, count: number): number | null {
  switch (key) {
    case "ArrowRight":
      return nextIndex(index, count);
    case "ArrowLeft":
      return prevIndex(index, count);
    case "Home":
      return 0;
    case "End":
      return Math.max(count - 1, 0);
    default:
      return null;
  }
}
