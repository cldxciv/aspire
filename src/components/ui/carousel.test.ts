import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import enCommon from "@/i18n/messages/en/common";
import hiCommon from "@/i18n/messages/hi/common";
import type { ImageAsset } from "@/lib/types";
import { carouselLabelsFor } from "./carousel-labels";
import {
  autoplayDelay,
  carouselAspectClass,
  clampIndex,
  coverSizes,
  indexForKey,
  isPlaying,
  liveMode,
  nextIndex,
  prevIndex,
  shouldAutoRotate,
  wrapIndex,
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

  it("never autoplays by itself under prefers-reduced-motion, but honours an explicit Play", () => {
    expect(isPlaying({ autoPlay: true, choice: "auto", reducedMotion: false })).toBe(true);
    expect(isPlaying({ autoPlay: true, choice: "auto", reducedMotion: true })).toBe(false);
    expect(isPlaying({ autoPlay: false, choice: "auto", reducedMotion: false })).toBe(false);
    expect(isPlaying({ autoPlay: true, choice: "paused", reducedMotion: false })).toBe(false);
    expect(isPlaying({ autoPlay: false, choice: "playing", reducedMotion: true })).toBe(true);
  });

  it("rotates only when playing, 2+ slides, visible and not hovered / focused", () => {
    expect(shouldAutoRotate({ count: 3, playing: true })).toBe(true);
    expect(shouldAutoRotate({ count: 1, playing: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: false })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: true, hovered: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: true, focusWithin: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: true, pageHidden: true })).toBe(false);
    expect(shouldAutoRotate({ count: 3, playing: true, inView: false })).toBe(false);
  });

  it("is a polite live region whenever it is not actually rotating (APG)", () => {
    expect(liveMode(shouldAutoRotate({ count: 3, playing: true }))).toBe("off");
    // Paused by hover or keyboard focus while the visitor's choice is still "playing".
    expect(liveMode(shouldAutoRotate({ count: 3, playing: true, hovered: true }))).toBe("polite");
    expect(liveMode(shouldAutoRotate({ count: 3, playing: true, focusWithin: true }))).toBe("polite");
    expect(liveMode(shouldAutoRotate({ count: 3, playing: false }))).toBe("polite");
  });

  it("guards the autoplay delay and clamps a stale index", () => {
    expect(autoplayDelay(6000)).toBe(6000);
    expect(autoplayDelay(500)).toBe(2000);
    expect(autoplayDelay(Number.NaN)).toBe(6000);
    expect(autoplayDelay(Number.POSITIVE_INFINITY)).toBe(6000);
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
