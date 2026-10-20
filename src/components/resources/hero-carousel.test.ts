import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ArticlePage from "@/app/[lang]/(site)/resources/[slug]/page";
import ResourcesPage from "@/app/[lang]/(site)/resources/page";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getArticle, getArticleSlugs, localizeImage } from "@/lib/data";
import type { Article, ArticleCategory } from "@/lib/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import {
  ARTICLE_FALLBACK_COVER,
  ARTICLE_HERO_EXTRAS,
  ARTICLE_PHOTO_FALLBACK,
  ARTICLE_STICKY_POOL,
  RESOURCES_HERO_KEYS,
  articlePagePhotos,
} from "./hero-slides";

/**
 * /resources and /resources/[slug] lead with a hero carousel (ImageCarousel via PageHero `slides`)
 * of labelled, licensed stock photos — never a landscape (D-031) or a result card — with Hindi alt
 * text on /hi, slide 1 preloaded, and no photo repeated anywhere on the page. Both content modes.
 */

const LANDSCAPE_KEYS: StockImageKey[] = [
  "himalayaHero",
  "himalayaBlueRidge",
  "mountainTrail",
  "shimlaPanorama",
  "dhauladharTriund",
  "kulluValley",
  "hamirpurHills",
  "hillRoadBarot",
];
const LANDSCAPE_SRCS = new Set<string>(LANDSCAPE_KEYS.map((key) => stockImages[key].src));
/** Rendering whole pages in both locales and modes; allow for a loaded machine. */
const TIMEOUT = 60_000;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await page())),
  );
}

function articleProps(slug: string, lang: Locale) {
  return { params: Promise.resolve({ lang, slug }) } as unknown as PageProps<"/[lang]/resources/[slug]">;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Decoded `/images/...` path of a rendered next/image tag (optimizer URL or plain src). */
function imgPath(tag: string): string | undefined {
  const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
  if (!src) return undefined;
  const url = /[?&]url=([^&]+)/.exec(src)?.[1];
  return decodeURIComponent(url ?? src);
}

type Slide = { tag: string; src?: string; alt?: string; body: string };

/** The hero carousel's slides, in order (`role="group"` + the localised slide role description). */
function heroSlidesOf(html: string, lang: Locale): Slide[] {
  const role = messagesFor(lang, "common").carousel.roleSlide;
  const re = new RegExp(`<div[^>]*aria-roledescription="${role}"[^>]*>(<img[^>]*>)([\\s\\S]*?)</div>`, "g");
  return [...html.matchAll(re)].map(([, tag, body]) => ({
    tag,
    src: imgPath(tag),
    alt: /\salt="([^"]*)"/.exec(tag)?.[1],
    body,
  }));
}

/** Every photo path on the page (any `<img>`), for the "never twice" rule. */
function allImagePaths(html: string): string[] {
  return [...html.matchAll(/<img[^>]*>/g)].map(([tag]) => imgPath(tag)).filter((src): src is string => Boolean(src));
}

/** Shared hero checks: one carousel, labelled localised slides, slide 1 preloaded, nothing repeated. */
function expectHeroCarousel(html: string, lang: Locale, expected: { src: string; alt: string }[], context: string) {
  const common = messagesFor(lang, "common");
  expect((html.match(/<h1[\s>]/g) ?? []).length, context).toBe(1);
  expect(html.split(`aria-roledescription="${common.carousel.roleCarousel}"`).length - 1, context).toBe(1);
  // The group keeps its localised accessible name (default "Photo gallery").
  expect(html, context).toContain(`aria-label="${escapeHtml(common.carousel.label)}"`);

  const slides = heroSlidesOf(html, lang);
  expect(slides.map((s) => s.src), context).toEqual(expected.map((e) => e.src));
  expect(slides.length, context).toBeGreaterThanOrEqual(3);
  expect(slides.length, context).toBeLessThanOrEqual(5);
  slides.forEach((slide, i) => {
    expect(slide.alt, `${context} slide ${i + 1}`).toBe(escapeHtml(expected[i].alt));
    if (lang === "hi") expect(slide.alt, `${context} slide ${i + 1}`).toMatch(/[ऀ-ॿ]{3,}/);
    expect(slide.body, `${context} slide ${i + 1}`).toContain(`>${common.labels.illustrativeStockPhoto}<`);
    expect(slide.src, context).toMatch(/^\/images\/stock\//);
    expect(LANDSCAPE_SRCS.has(slide.src!), `${context}: landscape ${slide.src}`).toBe(false);
    // Slide 1 is the LCP candidate; the rest load lazily.
    if (i === 0) expect(slide.tag.toLowerCase(), context).toContain('fetchpriority="high"');
    else expect(slide.tag, context).toContain('loading="lazy"');
  });

  const photos = allImagePaths(html).filter((src) => src.startsWith("/images/stock/"));
  expect(new Set(photos).size, `${context}: ${photos.join(", ")}`).toBe(photos.length);
  // Every stock photo on the page carries the visible label.
  expect(html.split(`>${common.labels.illustrativeStockPhoto}<`).length - 1, context).toBe(photos.length);
  for (const src of LANDSCAPE_SRCS) expect(html, context).not.toContain(encodeURIComponent(src));
}

describe("/resources hero carousel", () => {
  it.each(["true", "false"])(
    "shows the study-material slides in English and Hindi (SHOW_PLACEHOLDER_CONTENT=%s)",
    async (placeholders) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, () => ResourcesPage());
        const expected = RESOURCES_HERO_KEYS.map((key) => localizeImage(stockImages[key], lang));
        expectHeroCarousel(html, lang, expected, `resources ${lang} placeholders=${placeholders}`);
        // Result cards stay in the results band (preview only), never in the hero.
        for (const slide of heroSlidesOf(html, lang)) expect(slide.tag).not.toContain("/api/result-cards/");
        if (placeholders === "false") expect(html).not.toContain("/api/result-cards/");
      }
    },
    TIMEOUT,
  );
});

describe("/resources/[slug] hero carousel", () => {
  it.each(["true", "false"])(
    "leads with the article's cover, then unused category photos (SHOW_PLACEHOLDER_CONTENT=%s)",
    async (placeholders) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const slug of getArticleSlugs()) {
        for (const lang of ["en", "hi"] as const) {
          const article = await getArticle(slug, lang);
          if (!article) {
            // Placeholder articles are hidden in production: the page 404s instead.
            await expect(withTestLang(lang, () => ArticlePage(articleProps(slug, lang)))).rejects.toThrow();
            continue;
          }
          const html = await render(lang, () => ArticlePage(articleProps(slug, lang)));
          const context = `${slug} ${lang} placeholders=${placeholders}`;
          const slides = heroSlidesOf(html, lang);
          const cover = article.coverImage ?? localizeImage(stockImages[ARTICLE_FALLBACK_COVER], lang);
          expect(slides[0]?.src, context).toBe(cover.src);
          expect(slides.length, context).toBe(4);
          // Category photos (then neutral fallbacks) after the cover, in order of preference.
          const preferred: string[] = [...ARTICLE_HERO_EXTRAS[article.category], ...ARTICLE_PHOTO_FALLBACK].map((key) => stockImages[key].src);
          const rest = slides.slice(1).map((s) => s.src!);
          expect(rest.every((src) => preferred.includes(src)), `${context}: ${rest.join(", ")}`).toBe(true);
          expect(rest, context).toEqual([...rest].sort((a, b) => preferred.indexOf(a) - preferred.indexOf(b)));
          const expected = slides.map((s) =>
            s.src === cover.src ? cover : localizeImage(Object.values(stockImages).find((img) => img.src === s.src)!, lang),
          );
          expectHeroCarousel(html, lang, expected, context);
          // The sticky column keeps two pool photos beside the text (alt localised too).
          const pool: string[] = ARTICLE_STICKY_POOL.map((key) => stockImages[key].src);
          const sticky = allImagePaths(html).filter((src) => pool.includes(src));
          expect(sticky.length, context).toBe(2);
          expect(html, context).not.toContain("/api/result-cards/");
        }
      }
    },
    TIMEOUT,
  );
});

describe("articlePagePhotos", () => {
  const base = (over: Partial<Article>): Article => ({
    id: "a",
    slug: "a",
    title: "A",
    summary: "S",
    body: ["B"],
    category: "study-guidance",
    publishedAt: "2026-10-18",
    status: "published",
    ...over,
  });
  const categories = Object.keys(ARTICLE_HERO_EXTRAS) as ArticleCategory[];
  const usable = (Object.keys(stockImages) as StockImageKey[]).filter((key) => !LANDSCAPE_SRCS.has(stockImages[key].src));

  it("gives every category and cover 4 unique hero slides and 2 other sticky photos, even beside 3 related covers", () => {
    for (const category of categories) {
      for (const coverKey of [undefined, ...usable]) {
        // Worst cases: related covers that are the sticky column's or this category's first choices.
        const [e1, e2, e3] = ARTICLE_HERO_EXTRAS[category];
        const [p1, p2, p3] = ARTICLE_STICKY_POOL;
        for (const relatedKeys of [[e1, e2, e3], [p1, p2, p3]] as StockImageKey[][]) {
          const related = relatedKeys.map((key, i) => base({ id: `r${i}`, coverImage: stockImages[key] }));
          const article = base({ category, coverImage: coverKey ? stockImages[coverKey] : undefined });
          const { slides, sticky } = articlePagePhotos({ article, related, label: "Illustrative stock photo", locale: "en" });
          const context = `${category} / ${coverKey ?? "no cover"} / ${relatedKeys.join(",")}`;
          const heroSrcs = slides.map((s) => s.image.src);
          const stickySrcs = sticky.map((image) => image.src);
          const relatedSrcs = relatedKeys.map((key) => stockImages[key].src);

          expect(slides.length, context).toBe(4);
          expect(heroSrcs[0], context).toBe(stockImages[coverKey ?? ARTICLE_FALLBACK_COVER].src);
          for (const s of slides) expect(s.label, context).toBe("Illustrative stock photo");
          expect(sticky.every(Boolean), context).toBe(true);
          // No photo twice on the page: hero, sticky column and the hero's extras vs related thumbnails.
          const page = [...heroSrcs, ...stickySrcs];
          expect(new Set(page).size, context).toBe(page.length);
          for (const src of [...heroSrcs.slice(1), ...stickySrcs]) expect(relatedSrcs, context).not.toContain(src);
          for (const src of page) expect(LANDSCAPE_SRCS.has(src), context).toBe(false);
        }
      }
    }
  });

  it("localises the alt text of every photo it adds", () => {
    const { slides, sticky } = articlePagePhotos({ article: base({}), related: [], label: "x", locale: "hi" });
    expect(slides[0].image.src).toBe(stockImages[ARTICLE_FALLBACK_COVER].src);
    for (const image of [...slides.map((s) => s.image), ...sticky]) expect(image.alt).toMatch(/[ऀ-ॿ]{3,}/);
  });

  it("the /resources hero keys are 3–5 distinct non-landscape photos", () => {
    expect(RESOURCES_HERO_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(RESOURCES_HERO_KEYS.length).toBeLessThanOrEqual(5);
    expect(new Set(RESOURCES_HERO_KEYS).size).toBe(RESOURCES_HERO_KEYS.length);
    for (const key of RESOURCES_HERO_KEYS) expect(LANDSCAPE_KEYS).not.toContain(key);
  });
});
