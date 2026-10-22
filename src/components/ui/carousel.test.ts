import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import type { ImageAsset } from "@/lib/types";
import { isFocusRestore, isSidewaysInput, scrollTrackTo, startAutoplay, stepRail } from "./carousel-env";
import { carouselLabelsFor } from "./carousel-labels";
import {
  AUTOPLAY_MS,
  autoplayDelay,
  carouselAspectClass,
  carouselReducer,
  clampIndex,
  coverSizes,
  indexForKey,
  initialCarouselState,
  isPlaying,
  liveMode,
  nearestIndex,
  nextIndex,
  prevIndex,
  railEdges,
  railNextIndex,
  scrollBehaviorFor,
  settleAction,
  settledIndex,
  shouldAutoRotate,
  wrapIndex,
  type CarouselState,
  type CarouselSlide,
} from "./carousel-utils";
import { heroSlides } from "./hero-slides";
import { ImageCarousel, type ImageCarouselProps } from "./ImageCarousel";
import { MediaSplit } from "./MediaSplit";
import { PageHero } from "./PageHero";

const img = (n: number): ImageAsset => ({ src: `/images/stock/test-${n}.jpg`, alt: `Test photo ${n}`, width: 1600, height: 1000 });
const slides: CarouselSlide[] = [
  { image: img(1), label: "Illustrative stock photo", caption: "Morning class" },
  { image: img(2), label: "Illustrative stock photo" },
  { image: img(3) },
];
const labels = enCommon.carousel;

const render = (props: Partial<ImageCarouselProps> = {}) =>
  renderToStaticMarkup(createElement(ImageCarousel, { slides, labels, ...props } as ImageCarouselProps));

/** Every <img> tag in the markup, in order. */
const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
/** Every `<link rel="preload">` next/image hoists for `preload`. */
const preloads = (html: string) => html.match(/<link rel="preload"[^>]*>/g) ?? [];

// Optional: dump the markup for a manual look (CAROUSEL_DUMP=<dir>).
const dumpDir = process.env.CAROUSEL_DUMP;
const dump = (name: string, html: string) => dumpDir && writeFileSync(`${dumpDir}/${name}.html`, html);

describe("carousel helpers", () => {
  it("wraps indices in both directions", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(prevIndex(0, 3)).toBe(2);
    expect(prevIndex(1, 3)).toBe(0);
    expect(wrapIndex(-4, 3)).toBe(2);
    expect(wrapIndex(7, 3)).toBe(1);
    expect(wrapIndex(5, 0)).toBe(0);
  });

  it("maps arrow / Home / End keys and ignores others", () => {
    expect(indexForKey("ArrowRight", 2, 3)).toBe(0);
    expect(indexForKey("ArrowLeft", 0, 3)).toBe(2);
    expect(indexForKey("Home", 2, 3)).toBe(0);
    expect(indexForKey("End", 0, 3)).toBe(2);
    expect(indexForKey("Enter", 0, 3)).toBeNull();
    expect(indexForKey(" ", 0, 3)).toBeNull();
  });

  it("autoplays by default (reduced motion included: it has no say) and an explicit choice wins", () => {
    expect(isPlaying({ autoPlay: true, choice: "auto" })).toBe(true);
    expect(isPlaying({ autoPlay: false, choice: "auto" })).toBe(false);
    // A Pause sticks until Play, and Play works even where autoPlay is off.
    expect(isPlaying({ autoPlay: true, choice: "paused" })).toBe(false);
    expect(isPlaying({ autoPlay: false, choice: "playing" })).toBe(true);
    // Reduced motion is not an input of the play / rotate decision any more.
    expect(shouldAutoRotate({ count: 3, playing: isPlaying({ autoPlay: true, choice: "auto" }) })).toBe(true);
  });

  it("moves every 5 s (owner) and swaps instantly under reduced motion at the same pace", () => {
    expect(AUTOPLAY_MS).toBe(5000);
    expect(autoplayDelay()).toBe(5000);
    // `auto` is an instant jump on the tracks (no CSS scroll-behavior there) and every browser accepts it.
    expect(scrollBehaviorFor(true)).toBe("auto");
    expect(scrollBehaviorFor(false)).toBe("smooth");
    // No reduced-motion minimum any more (it used to stretch every step to 8 s).
    expect(autoplayDelay(4000)).toBe(4000);
    expect(autoplayDelay(12000)).toBe(12000);
  });

  it("steps a multi-card rail one card at a time and wraps from the end to the first card", () => {
    expect(nearestIndex([0, 300, 600, 900], 0)).toBe(0);
    expect(nearestIndex([0, 300, 600, 900], 320)).toBe(1);
    expect(nearestIndex([0, 300, 600, 900], 1200)).toBe(3);
    expect(nearestIndex([], 50)).toBe(0);
    expect(railEdges(0, 600, 1200)).toEqual({ atStart: true, atEnd: false });
    expect(railEdges(600, 600, 1200)).toEqual({ atStart: false, atEnd: true });
    // Sub-pixel layouts: within 1 px counts as the end.
    expect(railEdges(599.5, 600, 1200)).toEqual({ atStart: false, atEnd: true });
    expect(railEdges(0, 600, 600)).toEqual({ atStart: true, atEnd: true });
    expect(railNextIndex(0, 6, false)).toBe(1);
    expect(railNextIndex(4, 6, false)).toBe(5);
    // Scrolled to the end while several cards are in view: back to the first card.
    expect(railNextIndex(3, 6, true)).toBe(0);
    expect(railNextIndex(5, 6, false)).toBe(0);
    expect(railNextIndex(0, 1, false)).toBe(0);
    expect(railNextIndex(0, 0, false)).toBe(0);
  });

  it("rotates whenever it shows the playing state, 2+ slides, in a visible tab and on screen (hover is no input)", () => {
    expect(shouldAutoRotate({ count: 3, playing: true })).toBe(true);
    expect(shouldAutoRotate({ count: 1, playing: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: false })).toBe(false);
    // Only pauses nobody can see: a hidden tab, or the carousel fully off screen.
    expect(shouldAutoRotate({ count: 3, playing: true, pageHidden: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: true, inView: false })).toBe(false);
    // Mouse hover and keyboard focus are no inputs (the type has no such fields): hover never
    // pauses, and keyboard focus pauses by setting the visitor's choice to "paused", so the toggle
    // shows "Play" (APG) instead of a hidden pause behind a "Pause" label.
    const playingAfterKeyboardFocus = isPlaying({ autoPlay: true, choice: "paused" });
    expect(playingAfterKeyboardFocus).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: playingAfterKeyboardFocus })).toBe(false);
  });

  it("is a polite live region whenever it is not actually rotating (APG)", () => {
    expect(liveMode(shouldAutoRotate({ count: 3, playing: true }))).toBe("off");
    expect(liveMode(shouldAutoRotate({ count: 3, playing: false }))).toBe("polite");
    expect(liveMode(shouldAutoRotate({ count: 3, playing: true, inView: false }))).toBe("polite");
  });

  it("guards the autoplay delay and clamps a stale index", () => {
    expect(autoplayDelay(6000)).toBe(6000);
    expect(autoplayDelay(500)).toBe(2000);
    expect(autoplayDelay(Number.NaN)).toBe(5000);
    expect(autoplayDelay(Number.POSITIVE_INFINITY)).toBe(5000);
    expect(clampIndex(4, 3)).toBe(2);
    expect(clampIndex(-1, 3)).toBe(0);
    expect(clampIndex(2, 0)).toBe(0);
  });

  it("scales sizes for object-cover crops of wide photos in narrow boxes", () => {
    const s = "(min-width: 1200px) 560px, 100vw";
    expect(coverSizes(s, 1.6, 1.6)).toBe(s);
    expect(coverSizes(s, 1.5, 1.6)).toBe(s);
    expect(coverSizes(s, 1.5, undefined)).toBe(s);
    expect(coverSizes(s, 1.5, 0.75)).toBe("(min-width: 1200px) calc(560px * 2.00), calc(100vw * 2.00)");
  });

  it("has a fixed box for every aspect and an absolute fill", () => {
    expect(carouselAspectClass["16/10"]).toContain("aspect-16/10");
    expect(carouselAspectClass["21/9"]).toBe("relative aspect-16/10 md:aspect-[21/9]");
    // PageHero: 4:3 beside the copy on tablets, 16:10 stacked on phones and at 50/50 from lg.
    expect(carouselAspectClass.hero).toBe("relative aspect-16/10 md:aspect-4/3 lg:aspect-16/10");
    expect(carouselAspectClass.fill).toBe("absolute inset-0");
  });

  it("picks carousel strings by locale", () => {
    expect(carouselLabelsFor("hi")).toBe(hiCommon.carousel);
    expect(carouselLabelsFor("en")).toBe(enCommon.carousel);
  });

  it("builds hero slides with one label and Hindi alt text", () => {
    const built = heroSlides([img(1), img(2)], "Illustrative stock photo", "en");
    expect(built).toEqual([
      { image: img(1), label: "Illustrative stock photo" },
      { image: img(2), label: "Illustrative stock photo" },
    ]);
    expect(heroSlides([img(1)], undefined, "en")).toEqual([{ image: img(1) }]);

    const wb = stockImages.physicsWhiteboard;
    expect(imageAltHi[wb.src]).toBeTruthy();
    expect(heroSlides([wb], "x", "hi")[0].image.alt).toBe(imageAltHi[wb.src]);
    expect(heroSlides([wb], "x", "hi")[0].image.src).toBe(wb.src);
    expect(heroSlides([wb], "x", "en")[0].image.alt).toBe(wb.alt);
  });
});

/**
 * A scroller stand-in for node (no DOM here): `scrollTo` records each call and, with `moves`, jumps
 * there; it never fires a scroll or scrollend event.
 */
function fakeScroller({ clientWidth, scrollWidth, moves }: { clientWidth: number; scrollWidth: number; moves: boolean }) {
  const calls: number[] = [];
  const behaviors: (ScrollBehavior | undefined)[] = [];
  const el = {
    scrollLeft: 0,
    clientWidth,
    scrollWidth,
    scrollTo({ left = 0, behavior }: ScrollToOptions) {
      calls.push(left);
      behaviors.push(behavior);
      if (moves) el.scrollLeft = Math.min(Math.max(left, 0), scrollWidth - clientWidth);
    },
  };
  return { el, calls, behaviors, asElement: el as unknown as HTMLElement };
}

/** `n` rail cards `width` px apart (snap points), after the rail's 4 px start padding. */
const fakeItems = (n: number, width: number) =>
  Array.from({ length: n }, (_, i) => ({ offsetLeft: 4 + i * width }) as unknown as HTMLElement);

describe("autoplay never waits for a scroll event", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps advancing an ImageCarousel every 5 s over several intervals when the track never reports a scroll", () => {
    vi.useFakeTimers();
    // ImageCarousel's wiring: the interval dispatches "step" and the index → track effect scrolls
    // the track there. This track moves but never fires a scroll / scrollend event, which used to
    // leave the old one-shot timer un-armed for good while the button still said "Pause".
    const track = fakeScroller({ clientWidth: 600, scrollWidth: 1800, moves: true });
    let state: CarouselState = initialCarouselState;
    const shown: number[] = [];
    const stop = startAutoplay(autoplayDelay(), () => {
      state = carouselReducer(state, { type: "step", count: 3 });
      scrollTrackTo(track.asElement, state.index, false);
      shown.push(state.index);
    });
    vi.advanceTimersByTime(AUTOPLAY_MS - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual([1]);
    vi.advanceTimersByTime(AUTOPLAY_MS * 5);
    expect(shown).toEqual([1, 2, 0, 1, 2, 0]);
    expect(track.calls).toEqual([600, 1200, 0, 600, 1200, 0]);
    expect(track.behaviors.every((b) => b === "smooth")).toBe(true);
    expect(state.moves).toBe(0);
    // Pause (or a hidden tab, or off screen) stops the interval; nothing fires afterwards.
    stop();
    vi.advanceTimersByTime(AUTOPLAY_MS * 3);
    expect(shown).toHaveLength(6);
  });

  // The live-site freeze: the mouse resting on the photo or on the Pause / Play button stopped
  // rotation with no time limit while the button still said "Pause". Node has no DOM to hover, so
  // this source check is the guard (the browser pass confirms it on the real pages).
  it("never pauses on hover: no carousel, the results rail or the marquee wires a hover handler or the any-key pause", () => {
    for (const file of [
      "./ImageCarousel.tsx",
      "./carousel-env.ts",
      "../home/ResultRail.tsx",
      "../results/ResultMarqueeFrame.tsx",
    ]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      expect(source, file).not.toMatch(/on(Pointer|Mouse)(Enter|Leave|Over|Out)\b|"(pointer|mouse)(enter|leave|over|out)"/);
      // The old key handler that turned any key (Space, PageDown, ↓ after clicking a photo) into a pause.
      expect(source, file).not.toContain("noteKey");
    }
  });

  it("does not treat focus the browser restores after a tab switch as the visitor moving focus", () => {
    const photo = {} as EventTarget;
    const next = {} as EventTarget;
    // Window / tab blurred with the photo focused, then focus given back to it: not a pause.
    expect(isFocusRestore({ target: photo, relatedTarget: null }, photo)).toBe(true);
    // Focus moved by the visitor (Tab from another control, or onto a different element).
    expect(isFocusRestore({ target: photo, relatedTarget: next }, photo)).toBe(false);
    expect(isFocusRestore({ target: next, relatedTarget: null }, photo)).toBe(false);
    expect(isFocusRestore({ target: photo, relatedTarget: null }, null)).toBe(false);
  });

  it("counts only sideways input as the visitor moving a track (never a click, an up / down wheel or a page key)", () => {
    expect(isSidewaysInput({ type: "wheel", deltaX: 0 })).toBe(false);
    expect(isSidewaysInput({ type: "wheel", deltaX: 24 })).toBe(true);
    expect(isSidewaysInput({ type: "wheel", deltaX: 0, shiftKey: true })).toBe(true);
    for (const key of ["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Tab", "Enter"]) {
      expect(isSidewaysInput({ type: "keydown", key })).toBe(false);
    }
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End"]) expect(isSidewaysInput({ type: "keydown", key })).toBe(true);
    expect(isSidewaysInput({ type: "pointerdown" })).toBe(false);
  });

  it("keeps advancing the index even when every scroll is lost (the track never moves)", () => {
    vi.useFakeTimers();
    const track = fakeScroller({ clientWidth: 600, scrollWidth: 1800, moves: false });
    let state: CarouselState = initialCarouselState;
    const stop = startAutoplay(autoplayDelay(), () => {
      state = carouselReducer(state, { type: "step", count: 3 });
      scrollTrackTo(track.asElement, state.index, true);
    });
    vi.advanceTimersByTime(AUTOPLAY_MS * 4);
    // 0 → 1 → 2 → 0 → 1: the dots and counter follow the timer, and each step scrolls again
    // (slide 0 is skipped because this stuck track already sits there). Reduced motion: instant jumps.
    expect(state.index).toBe(1);
    expect(track.calls).toEqual([600, 1200, 600]);
    expect(track.behaviors).toEqual(["auto", "auto", "auto"]);
    stop();
  });

  it("adopts a swipe, redoes a cut-short step, and counts only manual moves", () => {
    expect(settledIndex(1210, 600, 3)).toBe(2);
    expect(settledIndex(250, 600, 3)).toBe(0);
    expect(settledIndex(5000, 600, 3)).toBe(2);
    expect(settledIndex(600, 0, 3)).toBeNull();
    expect(settleAction({ settled: 1, index: 1, userGesture: true })).toBe("none");
    expect(settleAction({ settled: 1, index: 1, userGesture: false })).toBe("none");
    expect(settleAction({ settled: 2, index: 1, userGesture: true })).toBe("adopt");
    // A programmatic step that the browser cancelled or cut short: scroll back to the index.
    expect(settleAction({ settled: 0, index: 1, userGesture: false })).toBe("resync");

    // Autoplay steps keep the interval running; a manual move (`moves`) restarts it.
    let state = carouselReducer(initialCarouselState, { type: "step", count: 3 });
    expect(state).toEqual({ index: 1, moves: 0 });
    state = carouselReducer(state, { type: "go", index: 2, count: 3 });
    expect(state).toEqual({ index: 2, moves: 1 });
    state = carouselReducer(state, { type: "step", count: 3 });
    expect(state).toEqual({ index: 0, moves: 1 });
    expect(carouselReducer(state, { type: "go", index: -1, count: 3 })).toEqual({ index: 2, moves: 2 });
    // Slides shrank under a stale index: the next step starts from the clamped one.
    expect(carouselReducer({ index: 7, moves: 0 }, { type: "step", count: 3 }).index).toBe(0);
  });

  it("only scrolls a track that has a width and is not already there", () => {
    const track = fakeScroller({ clientWidth: 600, scrollWidth: 1800, moves: true });
    track.el.scrollLeft = 1200.5;
    scrollTrackTo(track.asElement, 2, false);
    expect(track.calls).toEqual([]);
    const hidden = fakeScroller({ clientWidth: 0, scrollWidth: 0, moves: true });
    scrollTrackTo(hidden.asElement, 1, false);
    expect(hidden.calls).toEqual([]);
  });

  it("keeps stepping the result rail every 5 s from its live position, with no scroll events", () => {
    vi.useFakeTimers();
    // 5 cards 300 px apart in a 600 px rail: the last snap point is 900 (last two cards in view),
    // from where it wraps back to the first card.
    const rail = fakeScroller({ clientWidth: 600, scrollWidth: 1500, moves: true });
    const items = fakeItems(5, 300);
    const stop = startAutoplay(autoplayDelay(), () => stepRail(rail.asElement, items, false));
    vi.advanceTimersByTime(AUTOPLAY_MS * 5);
    expect(rail.calls).toEqual([300, 600, 900, 0, 300]);
    stop();
  });

  it("retries a rail step whose scroll was lost instead of stopping, and skips a rail that fits", () => {
    vi.useFakeTimers();
    const rail = fakeScroller({ clientWidth: 600, scrollWidth: 1500, moves: false });
    const items = fakeItems(5, 300);
    const stop = startAutoplay(autoplayDelay(), () => stepRail(rail.asElement, items, true));
    vi.advanceTimersByTime(AUTOPLAY_MS * 3);
    expect(rail.calls).toEqual([300, 300, 300]);
    expect(rail.behaviors).toEqual(["auto", "auto", "auto"]);
    stop();
    const fits = fakeScroller({ clientWidth: 1500, scrollWidth: 1500, moves: true });
    expect(stepRail(fits.asElement, items, false)).toBeNull();
    expect(stepRail(rail.asElement, items.slice(0, 1), false)).toBeNull();
  });
});

describe("ImageCarousel SSR markup", () => {
  it("follows the APG carousel pattern and renders every slide", () => {
    const html = render();
    dump("carousel", html);
    // A named group, not a region landmark (several carousels on one page stay valid).
    expect(html).toMatch(/^<div role="group" aria-roledescription="carousel" aria-label="Photo gallery"/);
    expect(html).not.toContain("<section");
    expect(html.match(/role="group"/g)).toHaveLength(4);
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="1 of 3"');
    expect(html).toContain('aria-label="3 of 3"');
    for (const n of [1, 2, 3]) expect(html).toContain(`alt="Test photo ${n}"`);
    expect(html.match(/Illustrative stock photo/g)).toHaveLength(2);
    expect(html).toContain("Morning class");
    // No slide is hidden from assistive tech or no-JS visitors before hydration.
    expect(html).not.toContain('aria-hidden="true" class="relative h-full');
    // Scroll-snap track: swipe works natively.
    expect(html).toContain("snap-x snap-mandatory overflow-x-auto");
  });

  it("keeps the server markup static: autoplay is on by default but nothing rotates before hydration", () => {
    // Default autoPlay and an explicit one render the same markup: the live region stays polite
    // (not "off") and there is no pause / play button until hydration.
    expect(render({ autoPlay: true })).toBe(render());
    expect(render()).not.toContain('aria-live="off"');
    expect(render()).not.toContain("data-carousel-toggle");
  });

  it("renders no dead controls before hydration; the track is focusable and scrollable without JS", () => {
    const html = render();
    // Previous / next, dots and pause / play are client-only (they cannot work before hydration).
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Previous photo");
    // Nothing rotates before hydration: the track is a polite live region, keyboard-focusable
    // with a visible focus overlay, and shows a scrollbar when scripting is off.
    expect(html).toMatch(/<div id="[^"]*-track" aria-live="polite" tabindex="0"/);
    expect(html).toContain("peer-focus-visible:block");
    expect(html).toContain("noscript:[scrollbar-width:thin]");
  });

  it("names the carousel with a custom label", () => {
    expect(render({ label: "Campus life: Photo gallery" })).toMatch(
      /^<div role="group"[^>]*aria-label="Campus life: Photo gallery"/,
    );
  });

  it("keeps captions on their own backdrop, clear of the side buttons", () => {
    expect(render()).toMatch(
      /<p class="absolute inset-x-14 bottom-14 m-0 line-clamp-2[^"]*"><span class="rounded-md bg-navy\/85[^"]*">Morning class<\/span><\/p>/,
    );
  });

  it("uses Hindi strings when given, including the role names", () => {
    const html = render({ labels: hiCommon.carousel });
    expect(html).toContain(`aria-label="${hiCommon.carousel.label}"`);
    expect(html).toContain('aria-label="3 में से 1"');
    expect(html).toMatch(/^<div role="group" aria-roledescription="कैरोसेल"/);
    expect(html.match(/aria-roledescription="स्लाइड"/g)).toHaveLength(3);
    expect(html).not.toMatch(/aria-roledescription="(carousel|slide)"/);
  });

  it("loads the first slide eagerly at high priority only with priority; every other slide is lazy", () => {
    const priorityHtml = render({ priority: true });
    expect(preloads(priorityHtml)).toHaveLength(1);
    expect(preloads(priorityHtml)[0]).toContain("test-1.jpg");
    expect(preloads(priorityHtml)[0]).toMatch(/fetchPriority="high"/i);
    expect(preloads(render())).toHaveLength(0);

    const withPriority = imgTags(priorityHtml);
    expect(withPriority).toHaveLength(3);
    expect(withPriority[0]).not.toContain('loading="lazy"');
    expect(withPriority[0]).toMatch(/fetchPriority="high"/i);
    expect(withPriority[1]).toContain('loading="lazy"');
    expect(withPriority[1]).not.toMatch(/fetchPriority/i);
    expect(withPriority[2]).toContain('loading="lazy"');

    const without = imgTags(render());
    for (const tag of without) expect(tag).toContain('loading="lazy"');
  });

  it("applies the aspect box, cover-aware sizes and tone", () => {
    expect(render({ aspect: "fill", sizes: "50vw" })).toMatch(/^<div role="group"[^>]*class="[^"]*absolute inset-0/);
    expect(render({ aspect: "21/9" })).toMatch(/^<div role="group"[^>]*class="[^"]*aspect-16\/10 md:aspect-\[21\/9\]/);
    // 1.6:1 photos in a 3/4 box render about 2.13x the box width under object-cover.
    expect(imgTags(render({ aspect: "3/4", sizes: "400px" }))[0]).toContain('sizes="calc(400px * 2.13)"');
    expect(imgTags(render({ aspect: "16/10", sizes: "400px" }))[0]).toContain('sizes="400px"');
    expect(render({ tone: "light" })).toContain('data-surface="light"');
    expect(render()).toContain('data-surface="dark"');
  });

  it("renders one slide as a static image without controls, and nothing for no slides", () => {
    const html = render({ slides: [slides[0]], priority: true });
    dump("single", html);
    expect(html).toMatch(/^(<link rel="preload"[^>]*>)?<figure/);
    expect(preloads(html)).toHaveLength(1);
    expect(html).not.toContain("aria-roledescription");
    expect(html).not.toContain("<button");
    expect(imgTags(html)).toHaveLength(1);
    expect(imgTags(html)[0]).not.toContain('loading="lazy"');
    expect(imgTags(html)[0]).toMatch(/fetchPriority="high"/i);
    expect(html).toContain("Illustrative stock photo");
    expect(html).toMatch(/<figcaption[^>]*><span class="rounded-md bg-navy\/85[^"]*">Morning class<\/span>/);

    expect(render({ slides: [] })).toBe("");
  });
});

describe("PageHero / MediaSplit integration", () => {
  it("renders a hero carousel with the strings of the homeHref locale, slide 1 preloaded", () => {
    const html = renderToStaticMarkup(createElement(PageHero, { title: "Programs", slides }));
    dump("hero", html);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html).toContain('aria-label="Photo gallery"');
    expect(html).toContain("aspect-16/10");
    expect(html).toContain("md:aspect-4/3");
    // Copy and media side by side from md (tablet audit R1).
    expect(html).toContain("md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]");
    expect(html).toContain("ring-white/15");
    expect(preloads(html)).toHaveLength(1);
    expect(preloads(html)[0]).toContain("test-1.jpg");
    expect(preloads(html)[0]).toMatch(/fetchPriority="high"/i);
    const tags = imgTags(html);
    expect(tags).toHaveLength(3);
    expect(tags[0]).not.toContain('loading="lazy"');
    expect(tags[1]).toContain('loading="lazy"');

    const hi = renderToStaticMarkup(createElement(PageHero, { title: "प्रोग्राम", homeHref: "/hi", slides }));
    expect(hi).toContain(`aria-label="${hiCommon.carousel.label}"`);
    expect(hi).toContain('aria-roledescription="कैरोसेल"');
  });

  it("keeps the single image hero unchanged, at high fetch priority", () => {
    const html = renderToStaticMarkup(
      createElement(PageHero, { title: "About", image: img(1), imageLabel: "Illustrative stock photo" }),
    );
    expect(html).not.toContain("aria-roledescription");
    expect(imgTags(html)).toHaveLength(1);
    expect(imgTags(html)[0]).toMatch(/fetchPriority="high"/i);
    expect(html).toContain('<figcaption class="absolute bottom-2 left-2');
    expect(html).toContain("aspect-16/10");
    expect(html).toContain("md:aspect-4/3");
  });

  it("puts a fill carousel in MediaSplit's photo box", () => {
    const html = renderToStaticMarkup(
      // A hook-free server component: call it directly (typed `children` without the no-children-prop lint).
      MediaSplit({ slides, locale: "hi", aspect: "3/4", carouselLabel: "जीवन", children: createElement("p", null, "Copy") }),
    );
    dump("split", html);
    expect(html).toContain("aspect-3/4");
    expect(html).toMatch(/<div role="group" aria-roledescription="कैरोसेल" aria-label="जीवन"[^>]*class="[^"]*absolute inset-0/);
    expect(html).toContain('data-surface="light"');
    // MediaSplit's box ratio reaches the cover-aware sizes.
    expect(imgTags(html)[0]).toContain("calc(560px * 2.13)");
  });
});
