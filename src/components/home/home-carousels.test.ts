import { createElement, type FunctionComponent, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/[lang]/(site)/page";
import { imageAltHi } from "@/content/hi/images";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { HOME_CTA_SLIDES, HOME_LIFE_SLIDES, HOME_PROGRAMS_SLIDES } from "./home-carousels";

/**
 * Homepage carousels (owner request 2026-10-20): programs (half-bleed) and student life (band) in
 * both content modes, plus the closing band in production (preview shows the result-card marquee
 * there). Labelled stock photos only, alt text in the page language, lazy (all below the fold), no
 * landscape outside the hero (D-031) and no photo twice on the page in either mode.
 */

vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

const LANDSCAPE_FILES = [
  "himalaya-dhauladhar-ridge-hero",
  "himalaya-blue-ridge",
  "mountain-ridge-trail-snow-peaks",
  "shimla-hill-town-panorama",
  "dhauladhar-peaks-triund-dharamshala",
  "kullu-valley-solang-snow-range",
  "hamirpur-hills-dhauladhar-morning",
  "winding-hill-road-barot",
  "hero-mountains",
  "himachal-landscape",
  "bg-mountain",
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
const LISTS = { programs: HOME_PROGRAMS_SLIDES, life: HOME_LIFE_SLIDES, cta: HOME_CTA_SLIDES };

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
async function renderHome(lang: Locale): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(createElement(Provider, { locale: lang }, await HomePage())));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;
const attr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
/** The original file of an <img>: next/image's `url=` parameter, or the plain src. */
function fileOf(tag: string): string {
  const src = (/\ssrc="([^"]*)"/.exec(tag)?.[1] ?? "").replace(/&amp;/g, "&");
  const url = /[?&]url=([^&]*)/.exec(src)?.[1];
  return url ? decodeURIComponent(url) : src;
}
/** Markup of the carousel group named `label`: its root <div> up to its closing focus-ring span. */
function carouselHtml(html: string, label: string): string {
  const start = html.indexOf(`aria-label="${attr(label)}"`);
  expect(start, label).toBeGreaterThan(-1);
  const end = html.indexOf("peer-focus-visible:block", start);
  expect(end, label).toBeGreaterThan(start);
  return html.slice(html.lastIndexOf("<div", start), end);
}

describe("homepage carousel slide lists", () => {
  it("3–5 distinct stock photos each, disjoint, no landscapes, Hindi alt text for every one", () => {
    const all = Object.values(LISTS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const [name, keys] of Object.entries(LISTS)) {
      expect(keys.length, name).toBeGreaterThanOrEqual(3);
      expect(keys.length, name).toBeLessThanOrEqual(5);
      for (const key of keys) {
        expect(LANDSCAPE_KEYS, key).not.toContain(key);
        expect(stockImages[key].src, key).toMatch(/^\/images\/stock\//);
        expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
      }
    }
  });
});

describe.each([
  { mode: "preview", placeholders: "true", lists: ["programs", "life"] as const },
  { mode: "production", placeholders: "false", lists: ["programs", "life", "cta"] as const },
])("homepage carousels ($mode)", ({ placeholders, lists }) => {
  it.each(["en", "hi"] as const)("%s: labelled lazy stock carousels, no photo twice, no landscape after the hero", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    const html = await renderHome(lang);
    const common = messagesFor(lang, "common");
    const home = messagesFor(lang, "home");

    expect(count(html, `aria-roledescription="${common.carousel.roleCarousel}"`)).toBe(lists.length);
    const names = {
      programs: `${home.programs.eyebrow}: ${common.carousel.label}`,
      life: `${home.life.eyebrow}: ${common.carousel.label}`,
      cta: common.carousel.label,
    };
    for (const name of lists) {
      const keys = LISTS[name];
      const carousel = carouselHtml(html, names[name]);
      const imgs = imgTags(carousel);
      expect(imgs, name).toHaveLength(keys.length);
      expect(count(carousel, `aria-roledescription="${common.carousel.roleSlide}"`), name).toBe(keys.length);
      keys.forEach((key, i) => {
        const image = stockImages[key];
        const alt = lang === "hi" ? imageAltHi[image.src] : image.alt;
        expect(fileOf(imgs[i]), `${name} ${i + 1}`).toBe(image.src);
        expect(imgs[i], `${name} ${key}`).toContain(`alt="${attr(alt)}"`);
        expect(imgs[i], `${name} ${key}`).toContain('loading="lazy"');
        expect(imgs[i], `${name} ${key}`).not.toMatch(/fetchPriority="high"/i);
      });
      expect(count(carousel, `>${common.labels.illustrativeStockPhoto}<`), name).toBe(keys.length);
    }
    // Lists not shown in this mode are not on the page at all.
    for (const name of Object.keys(LISTS) as (keyof typeof LISTS)[]) {
      if ((lists as readonly string[]).includes(name)) continue;
      for (const key of LISTS[name]) expect(html, key).not.toContain(encodeURIComponent(stockImages[key].src));
    }

    // No photo twice (result-card mosaics render a hidden second layout by design; the quote mark is an icon).
    const files = imgTags(html)
      .map(fileOf)
      .filter((file) => !file.startsWith("/api/result-cards/") && !file.includes("quote-icon"));
    const repeated = files.filter((file, i) => files.indexOf(file) !== i);
    expect(repeated).toEqual([]);

    // The only landscape is the hero's.
    const heroEnd = html.indexOf('aria-labelledby="home-results-title"');
    expect(heroEnd).toBeGreaterThan(0);
    for (const file of LANDSCAPE_FILES) expect(html.slice(heroEnd), file).not.toContain(file);
  });
});
