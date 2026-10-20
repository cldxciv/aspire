import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage from "@/app/[lang]/(site)/about/page";
import AdmissionsPage from "@/app/[lang]/(site)/admissions/page";
import { ABOUT_HERO_IMAGES } from "@/components/about/hero-images";
import { ADMISSIONS_HERO_IMAGES } from "@/components/admissions/hero-images";
import { imageAltHi } from "@/content/hi/images";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * Hero carousels on /about and /admissions: 3–5 labelled stock photos in the PageHero, with alt text
 * in the page language, slide 1 at high priority, no result cards and no landscapes (D-031), the
 * same slides in preview and production, and no hero photo repeated elsewhere on the page.
 */

const HERO_PAGES: { name: string; render: () => Promise<React.ReactNode>; keys: readonly StockImageKey[] }[] = [
  { name: "about", render: () => AboutPage(), keys: ABOUT_HERO_IMAGES },
  { name: "admissions", render: () => AdmissionsPage(), keys: ADMISSIONS_HERO_IMAGES },
];

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

/** Two full-page renders per locale and mode on a loaded machine. */
const TIMEOUT = 30_000;

function withLocale(locale: Locale, child: React.ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, await page())));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** renderToStaticMarkup's attribute escaping. */
const attr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
const srcOf = (tag: string) => /\ssrc="([^"]*)"/.exec(tag)?.[1] ?? "";
const stockFile = (key: StockImageKey) => encodeURIComponent(stockImages[key].src);

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("hero slide lists", () => {
  it.each(HERO_PAGES)("$name: 3–5 distinct stock photos, no landscapes, every one with Hindi alt text", ({ keys }) => {
    expect(keys.length).toBeGreaterThanOrEqual(3);
    expect(keys.length).toBeLessThanOrEqual(5);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(LANDSCAPE_KEYS, key).not.toContain(key);
      expect(stockImages[key].src, key).toMatch(/^\/images\/stock\//);
      expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
    }
  });
});

describe.each(["true", "false"])("About / Admissions hero carousel (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(HERO_PAGES)(
    "$name: the PageHero shows the labelled stock slides in English and Hindi",
    async ({ name, render: page, keys }) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        const common = messagesFor(lang, "common");
        const at = `${name} ${lang}`;

        // The hero is everything before the first page section; the page's only carousel is in it.
        const heroEnd = html.indexOf("<section");
        expect(heroEnd, at).toBeGreaterThan(0);
        const hero = html.slice(0, heroEnd);
        const carousel = `aria-roledescription="${common.carousel.roleCarousel}"`;
        expect(count(html, carousel), at).toBe(1);
        expect(hero, at).toContain(carousel);
        expect(hero, at).toContain(`aria-label="${attr(common.carousel.label)}"`);
        expect(count(html, "<h1"), at).toBe(1);
        expect(hero, at).toContain("<h1");
        expect(count(hero, `aria-roledescription="${common.carousel.roleSlide}"`), at).toBe(keys.length);

        // One slide per key, in order, each labelled, alt text in the page language.
        const imgs = imgTags(hero);
        expect(imgs, at).toHaveLength(keys.length);
        keys.forEach((key, i) => {
          const image = stockImages[key];
          const alt = lang === "hi" ? imageAltHi[image.src] : image.alt;
          expect(srcOf(imgs[i]), `${at}: slide ${i + 1}`).toContain(stockFile(key));
          expect(imgs[i], `${at}: ${key}`).toContain(`alt="${attr(alt)}"`);
          if (lang === "hi") expect(imgs[i], `${at}: ${key}`).not.toContain(`alt="${attr(image.alt)}"`);
        });
        expect(count(hero, `>${common.labels.illustrativeStockPhoto}<`), at).toBe(keys.length);

        // Above the fold: slide 1 at high priority, the rest lazy.
        expect(imgs[0], at).toMatch(/fetchPriority="high"/i);
        expect(imgs[0], at).not.toContain('loading="lazy"');
        for (const tag of imgs.slice(1)) expect(tag, at).toContain('loading="lazy"');

        // Stock only: no result card in the hero (D-031: preview-only personal data).
        expect(hero, at).not.toContain("/api/result-cards/");

        // No hero photo appears again further down the page.
        for (const key of keys) {
          const uses = imgTags(html).filter((tag) => srcOf(tag).includes(stockFile(key)));
          expect(uses, `${at}: ${key}`).toHaveLength(1);
        }
      }
    },
    TIMEOUT,
  );
});
