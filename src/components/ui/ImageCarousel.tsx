"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useEffect, useId, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { format } from "@/i18n/format";
import type { Messages } from "@/i18n/messages/types";
import { cn } from "@/lib/cn";
import {
  scrollTrackTo,
  useAutoplay,
  useFocusPause,
  useHydrated,
  useInView,
  usePageHidden,
  useReducedMotion,
  useScrollSettle,
} from "./carousel-env";
import {
  AUTOPLAY_MS,
  autoplayDelay,
  carouselAspectClass,
  carouselBoxRatio,
  carouselReducer,
  clampIndex,
  coverSizes,
  indexForKey,
  initialCarouselState,
  isPlaying,
  liveMode,
  nextIndex,
  prevIndex,
  settleAction,
  settledIndex,
  shouldAutoRotate,
  type CarouselAspect,
  type CarouselSlide,
  type PlayChoice,
} from "./carousel-utils";

export type { CarouselAspect, CarouselSlide } from "./carousel-utils";

/** `common.carousel` (pass `t.carousel`, or `carouselLabelsFor(locale)` from `./carousel-labels`). */
export type CarouselLabels = Messages<"common">["carousel"];

export type CarouselTone = "light" | "dark";

const DEFAULT_SIZES = "(min-width: 1200px) 560px, (min-width: 1024px) 46vw, 100vw";

/** More slides than this show a "3 of 12" counter instead of dots (5 × 32 px dots fit a 320 px phone). */
const MAX_DOTS = 5;

type ImageCarouselBase = {
  slides: CarouselSlide[];
  /** All strings, from `common.carousel` in the page locale. */
  labels: CarouselLabels;
  /**
   * Accessible name of the carousel group (default `labels.label`, "Photo gallery"). Give a second
   * carousel on the same page a distinct name, e.g. `${sectionTitle}: ${labels.label}`.
   */
  label?: string;
  /** Preload slide 1 at high fetch priority (above-the-fold heroes only). */
  priority?: boolean;
  /** Default true, on every device (reduced motion makes each step an instant swap instead). */
  autoPlay?: boolean;
  /** Autoplay interval (default `AUTOPLAY_MS`, 5000); never below 2000, and 5000 for a non-finite value. */
  intervalMs?: number;
  /** Control styling: `dark` = navy buttons + gold focus ring (dark heroes), `light` = white buttons + blue ring. */
  tone?: CarouselTone;
  /** Extra classes on the outer box, e.g. "rounded-card shadow-soft". */
  className?: string;
};

export type ImageCarouselProps = ImageCarouselBase &
  (
    | {
        /** Fixed aspect box (default 16/10). */
        aspect?: Exclude<CarouselAspect, "fill">;
        /** `next/image` sizes for the box (defaults to a half-width hero / split column). */
        sizes?: string;
        boxRatio?: undefined;
      }
    | {
        /** Absolutely fills a positioned parent (MediaSplit photo box, half-bleed column, band). */
        aspect: "fill";
        /** Required for `fill`: the parent's rendered width, e.g. "(min-width: 1024px) 50vw, 100vw". */
        sizes: string;
        /** The parent's width / height when it is fixed, so cover crops fetch a wide enough file. */
        boxRatio?: number;
      }
  );

/**
 * Accessible image carousel (WAI-ARIA APG carousel pattern) on a CSS scroll-snap track.
 *
 * - SSR renders every slide in a horizontally scrollable, snap-mandatory track, so swipe works
 *   without JavaScript. Without JS the track is keyboard-focusable and shows a scrollbar
 *   (`@media (scripting: none)`). The buttons, dots, autoplay and arrow keys render only after
 *   hydration, so no dead control is ever shown.
 * - Controls: pause / play first in the tab order (bottom right), previous / next (44 px), then the
 *   dots (a "3 of 12" counter instead when there are more than 5 slides). Arrow / Home / End keys
 *   work anywhere inside.
 * - Fixed aspect box (no layout shift); `aspect="fill"` absolutely fills a positioned parent and
 *   then requires `sizes`. The `21/9` band is 16/10 below `md`; `hero` (PageHero) is 4/3 on tablets
 *   (`md`) and 16/10 otherwise.
 * - Autoplay (default on, one slide every 5 s) runs on every device once hydrated. Under
 *   `prefers-reduced-motion` it still runs at the same pace, but each change is an instant swap (no
 *   smooth slide). Mouse hover, taps and clicks do not pause it. The visible pause / play button
 *   (WCAG 2.2.2) is the visitor's override and a Pause sticks until Play (Play moves on at once,
 *   then every 5 s); keyboard focus on a control (not the pause / play button itself) presses Pause
 *   for them (APG), so the button always shows the real state. It also rests while the tab is
 *   hidden or the carousel is fully off screen. A press on the track restarts the 5 s, so a step
 *   never lands in the middle of a swipe.
 *   The slide track is `aria-live="polite"` whenever it is not actually rotating, so Next /
 *   Previous / dots / keys are announced.
 * - The slide index in state is the source of truth: the timer advances it and the track is
 *   scrolled to it, so autoplay never waits for a scroll event. A swipe that comes to rest on
 *   another slide is adopted; a programmatic scroll that ends in the wrong place is redone.
 * - It is a named `role="group"` (not a landmark), so several carousels on a page are fine.
 * - `priority` preloads the FIRST slide only, at `fetchPriority="high"`; every other slide is lazy.
 * - One slide renders a plain static image (no controls); no slides render nothing.
 *
 * Image rules (D-018/D-019/D-031): licensed stock or approved assets only; give stock slides the
 * label "Illustrative stock photo" / "Illustration"; never a person photo beside a real name;
 * landscapes only in the home hero; never mix result cards with centre / campus / hostel photos.
 */
export function ImageCarousel(props: ImageCarouselProps) {
  const {
    slides,
    labels,
    label,
    aspect = "16/10",
    sizes = DEFAULT_SIZES,
    boxRatio,
    priority = false,
    autoPlay = true,
    intervalMs = AUTOPLAY_MS,
    tone = "dark",
    className,
  } = props;
  const count = slides.length;
  const baseId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  // The hydration run of the index → track effect leaves the track where it is.
  const trackSynced = useRef(false);
  const [{ index, moves }, dispatch] = useReducer(carouselReducer, initialCarouselState);
  // Presses on the track (finger, pen, mouse): each restarts the interval, so no step lands mid-swipe.
  const [presses, setPresses] = useState(0);
  const [choice, setChoice] = useState<PlayChoice>("auto");
  const hydrated = useHydrated();
  const reducedMotion = useReducedMotion();
  const pageHidden = usePageHidden();
  const multi = count > 1;
  // Pause while scrolled fully out of view (saves bandwidth and avoids off-screen motion).
  const inView = useInView(rootRef, multi);
  // Keyboard focus on a slide or control (not the pause / play button) presses Pause (APG).
  const focusPause = useFocusPause(() => setChoice("paused"));

  // `slides` can shrink after mount; never point past the end.
  const current = clampIndex(index, count);
  // Nothing rotates before hydration, so the server markup says "not playing" (live region on).
  // Reduced motion does not stop it: the track then jumps instantly, at the same interval.
  const playing = hydrated && isPlaying({ autoPlay, choice });
  const rotate = shouldAutoRotate({ count, playing, pageHidden, inView });

  /** A manual move (buttons, dots, keys, an adopted swipe): restarts the full interval. */
  const go = (target: number) => dispatch({ type: "go", index: target, count });

  // Autoplay: a self-repeating interval that advances the index; it never waits for the track to
  // report a scroll, so a lost or late scroll event cannot stop it. A manual move or a press on the
  // track restarts it (both counters only grow, so their sum changes whenever either does).
  useAutoplay(rotate, autoplayDelay(intervalMs), () => dispatch({ type: "step", count }), moves + presses);

  // Track → index, once a scroll comes to rest: adopt the visitor's swipe, redo a lost step.
  useScrollSettle(
    trackRef,
    hydrated && multi,
    (userGesture) => {
      const track = trackRef.current;
      if (!track) return;
      const settled = settledIndex(track.scrollLeft, track.clientWidth, count);
      if (settled === null) return;
      const action = settleAction({ settled, index: current, userGesture });
      if (action === "adopt") go(settled);
      // Instant, so a browser that keeps cutting smooth scrolls short cannot loop settle → resync.
      else if (action === "resync") scrollTrackTo(track, current, true);
    },
    () => setPresses((n) => n + 1),
  );

  // Index → track: every step, button, dot or key scrolls the track to the index (`moves` makes a
  // dot for the current slide re-align it too). An adopted swipe is already there: nothing moves.
  useEffect(() => {
    const track = trackRef.current;
    if (!hydrated || !track) return;
    // First run with a track (hydration, or slides growing from one): keep a swipe made before it
    // (useScrollSettle adopts it) instead of snapping back.
    if (!trackSynced.current) {
      trackSynced.current = true;
      return;
    }
    scrollTrackTo(track, current, reducedMotion);
  }, [current, moves, hydrated, reducedMotion, multi]);

  /** Pause / play. Play also moves on at once, so the press visibly resumes (then every 5 s). */
  const togglePlay = () => {
    if (playing) {
      setChoice("paused");
      return;
    }
    setChoice("playing");
    dispatch({ type: "step", count });
  };

  if (count === 0) return null;

  const box = aspect === "fill" ? boxRatio : carouselBoxRatio[aspect];
  const slideSizes = ({ width, height }: CarouselSlide["image"]) => coverSizes(sizes, width / height, box);
  const surface = tone === "dark" ? "dark" : "light";
  const pill = "rounded-md bg-navy/85 px-2 py-0.5 text-[11px] font-semibold text-white";
  // Caption text on its own navy backdrop: contrast never depends on the photo (WCAG 1.4.3).
  const captionText = "rounded-md bg-navy/85 px-2 py-0.5 box-decoration-clone";

  if (count === 1) {
    const [{ image, label: slideLabel, caption, position }] = slides;
    return (
      <figure className={cn("m-0 overflow-hidden bg-surface", carouselAspectClass[aspect], className)}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={slideSizes(image)}
          preload={priority}
          fetchPriority={priority ? "high" : undefined}
          className="object-cover"
          style={position ? { objectPosition: position } : undefined}
        />
        {caption && (
          <figcaption className="absolute inset-x-3 bottom-3 m-0 line-clamp-3 text-sm leading-relaxed font-semibold text-white">
            <span className={captionText}>{caption}</span>
          </figcaption>
        )}
        {slideLabel && <span className={cn("absolute top-2 left-2", pill)}>{slideLabel}</span>}
      </figure>
    );
  }

  const ringHalo = tone === "dark" ? "focus-visible:ring-2 focus-visible:ring-navy" : "focus-visible:ring-2 focus-visible:ring-white";
  const button = cn(
    "z-10 grid size-11 place-items-center rounded-full shadow-soft transition-colors",
    tone === "dark"
      ? "bg-navy/80 text-white ring-1 ring-white/25 hover:bg-navy"
      : "bg-white/90 text-navy ring-1 ring-navy/15 hover:bg-white",
    ringHalo,
  );
  const compact = count > MAX_DOTS;

  // Only the carousel keys act; any other key (Space, PageDown, arrows up / down) is left to the
  // page and never pauses rotation.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = indexForKey(event.key, current, count);
    if (target === null) return;
    event.preventDefault();
    go(target);
  };

  // Keyboard focus on a control (not the pause / play button) presses Pause (APG), so the button
  // shows "Play"; mouse hover never pauses (owner decision 2026-10-22).
  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription={labels.roleCarousel}
      aria-label={label ?? labels.label}
      data-surface={surface}
      className={cn("group/carousel isolate overflow-hidden bg-surface", carouselAspectClass[aspect], className)}
      onKeyDown={onKeyDown}
      onFocus={focusPause.onFocus}
      onBlur={focusPause.onBlur}
    >
      {hydrated && (
        // First in the tab order (APG), drawn bottom right.
        <button
          type="button"
          data-carousel-toggle=""
          aria-controls={`${baseId}-track`}
          aria-label={playing ? labels.pause : labels.play}
          onClick={togglePlay}
          className={cn(button, "absolute right-2 bottom-2")}
        >
          {playing ? <Pause aria-hidden="true" className="size-4" /> : <Play aria-hidden="true" className="size-4" />}
        </button>
      )}

      <div
        ref={trackRef}
        id={`${baseId}-track`}
        aria-live={liveMode(rotate)}
        // Focusable (arrow keys scroll) only without JS; after hydration the controls take over.
        tabIndex={hydrated ? -1 : 0}
        className="peer flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden noscript:[scrollbar-width:thin] noscript:[&::-webkit-scrollbar]:block noscript:[&::-webkit-scrollbar]:h-2"
      >
        {slides.map(({ image, label: slideLabel, caption, position }, i) => {
          const isFirst = i === 0;
          // Once hydrated, the shown slide and the next one load eagerly, so a step never lands on
          // a blank, still-lazy slide (the server markup keeps every other slide lazy).
          const eager = hydrated && (i === current || i === nextIndex(current, count));
          return (
            <div
              key={`${image.src}-${i}`}
              id={`${baseId}-slide-${i + 1}`}
              role="group"
              aria-roledescription={labels.roleSlide}
              aria-label={format(labels.slideOf, { n: i + 1, total: count })}
              // After hydration only the visible slide is exposed, so the live region announces changes.
              aria-hidden={hydrated && i !== current ? true : undefined}
              className="relative h-full w-full shrink-0 snap-start snap-always"
            >
              <Image
                src={image.src}
                alt={image.alt}
                fill
                sizes={slideSizes(image)}
                {...(isFirst && priority
                  ? { preload: true, fetchPriority: "high" as const }
                  : { loading: eager ? ("eager" as const) : ("lazy" as const) })}
                className="object-cover"
                style={position ? { objectPosition: position } : undefined}
                draggable={false}
              />
              {caption && (
                // Clear of the 44 px side buttons and the bottom control row; at most two lines.
                <p className="absolute inset-x-14 bottom-14 m-0 line-clamp-2 text-sm leading-relaxed font-semibold text-white">
                  <span className={captionText}>{caption}</span>
                </p>
              )}
              {slideLabel && <span className={cn("absolute top-2 left-2", pill)}>{slideLabel}</span>}
            </div>
          );
        })}
      </div>
      {/* Visible focus for the track while it is focusable (before hydration / without JS; slides
          would paint over its own outline). Gone once hydrated: a clicked photo then focuses the
          track, and a key press afterwards must not ring the whole carousel. */}
      {!hydrated && (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 hidden rounded-[inherit] ring-3 ring-inset peer-focus-visible:block",
            tone === "dark" ? "ring-gold" : "ring-blue",
          )}
        />
      )}

      {hydrated && (
        <>
          <button
            type="button"
            aria-controls={`${baseId}-track`}
            aria-label={labels.previous}
            onClick={() => go(prevIndex(current, count))}
            className={cn(button, "absolute top-1/2 left-2 -translate-y-1/2")}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-controls={`${baseId}-track`}
            aria-label={labels.next}
            onClick={() => go(nextIndex(current, count))}
            className={cn(button, "absolute top-1/2 right-2 -translate-y-1/2")}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>

          {/* px-12 keeps the centred dots clear of the 44 px pause / play button. */}
          <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex h-11 items-center justify-center px-12">
            {compact ? (
              <p
                aria-hidden="true"
                className={cn(
                  "m-0 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums",
                  tone === "dark" ? "bg-navy/80 text-white" : "bg-white/90 text-navy",
                )}
              >
                {format(labels.slideOf, { n: current + 1, total: count })}
              </p>
            ) : (
              <ul
                className={cn(
                  "pointer-events-auto relative isolate m-0 flex list-none items-center px-1",
                  "before:absolute before:inset-x-0 before:inset-y-2.5 before:-z-10 before:rounded-full",
                  tone === "dark" ? "before:bg-navy/70" : "before:bg-white/85",
                )}
              >
                {slides.map((_, i) => {
                  const isCurrent = i === current;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-controls={`${baseId}-slide-${i + 1}`}
                        aria-label={format(labels.goTo, { n: i + 1 })}
                        aria-current={isCurrent ? "true" : undefined}
                        onClick={() => go(i)}
                        className={cn("grid h-11 w-8 place-items-center rounded-full", ringHalo)}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "block h-2 rounded-full transition-all",
                            isCurrent
                              ? cn("w-4", tone === "dark" ? "bg-gold" : "bg-navy")
                              : cn("w-2", tone === "dark" ? "bg-white/70" : "bg-navy/60"),
                          )}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
