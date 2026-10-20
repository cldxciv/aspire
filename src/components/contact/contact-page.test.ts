import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContactPage from "@/app/[lang]/(site)/contact/page";
import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { CONTACT_BODY_KEYS, CONTACT_HERO_KEYS } from "./contact-photos";

/**
 * /contact hero carousel (shared ImageCarousel via PageHero `slides`): 3–5 study / desk / form stock
 * photos, each labelled, Hindi alt text on /hi, never a landscape or a result card (D-031), and no
 * photo twice on the page — in preview and in production.
 */

const LANDSCAPE_FILES = [
  "himalaya-dhauladhar-ridge-hero",
  "himalaya-blue-ridge",
  "mountain-ridge-trail-snow-peaks",
  "shimla-hill-town-panorama",
  "dhauladhar-peaks-triund-dharamshala",
  "kullu-valley-solang-snow-range",
  "hamirpur-hills-dhauladhar-morning",
  "winding-hill-road-barot",
];

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(
      createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await ContactPage()),
    ),
  );
}

/** The hero carousel's markup: from its group root to the first page section. */
function heroCarousel(html: string, lang: Locale): string {
  const start = html.indexOf(`aria-roledescription="${messagesFor(lang, "common").carousel.roleCarousel}"`);
  expect(start, lang).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("<section", start));
}

/** Stock file names (e.g. "signing-form-pen-hands.jpg") of every <img> in `html`, in order. */
function stockFiles(html: string): string[] {
  return [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
}

const file = (src: string) => src.split("/").pop()!;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("contact hero photos", () => {
  it("has 3–5 hero slides and never reuses a body photo", () => {
    expect(CONTACT_HERO_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(CONTACT_HERO_KEYS.length).toBeLessThanOrEqual(5);
    expect(new Set(CONTACT_HERO_KEYS).size).toBe(CONTACT_HERO_KEYS.length);
    expect(CONTACT_HERO_KEYS.filter((key) => CONTACT_BODY_KEYS.includes(key))).toEqual([]);
    for (const key of CONTACT_HERO_KEYS) expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
  });
});

describe.each(["true", "false"])("contact page hero carousel (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(["en", "hi"] as const)("%s: labelled stock slides with localised alt text and controls", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    const html = await render(lang);
    const common = messagesFor(lang, "common");
    const hero = heroCarousel(html, lang);

    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(hero).toContain(`aria-label="${common.carousel.label}"`);
    expect(hero).toContain(`aria-roledescription="${common.carousel.roleSlide}"`);
    // Slides in order, each with its visible label and its alt text in the page language.
    expect(stockFiles(hero)).toEqual(CONTACT_HERO_KEYS.map((key) => file(stockImages[key].src)));
    expect(hero.split(`>${common.labels.illustrativeStockPhoto}<`).length - 1).toBe(CONTACT_HERO_KEYS.length);
    for (const key of CONTACT_HERO_KEYS) {
      const { src, alt } = stockImages[key];
      const expected = lang === "hi" ? imageAltHi[src] : alt;
      expect(hero, `${lang} ${key}`).toContain(`alt="${expected}"`);
    }
    // Slide 1 is preloaded; the rest load lazily.
    expect(hero.match(/fetchPriority="high"/gi)?.length).toBe(1);

    // D-031: no landscape and no result card anywhere on the page; every photo once.
    for (const name of LANDSCAPE_FILES) expect(html, name).not.toContain(name);
    expect(html).not.toContain("/api/result-cards/");
    const files = stockFiles(html);
    expect(new Set(files).size, files.join(", ")).toBe(files.length);
  });
});
