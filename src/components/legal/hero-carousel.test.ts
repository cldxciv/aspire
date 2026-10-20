import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import PrivacyPage from "@/app/[lang]/(site)/privacy/page";
import TermsPage from "@/app/[lang]/(site)/terms/page";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localizeImage } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { LEGAL_PAGE_PHOTOS, type LegalPage } from "./hero-slides";

/**
 * /privacy and /terms lead with a hero carousel of calm desk / paper / book stock photos
 * (labelled, Hindi alt text on /hi, slide 1 preloaded), beside the draft document's sticky photo
 * column; no photo twice, no landscape (D-031), no result card (D-031), in both content modes.
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
const TIMEOUT = 60_000;

const PAGES: { name: LegalPage; render: () => Promise<React.ReactNode> }[] = [
  { name: "privacy", render: () => PrivacyPage() },
  { name: "terms", render: () => TermsPage() },
];

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await page())),
  );
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Decoded `/images/...` path of a rendered next/image tag. */
function imgPath(tag: string): string | undefined {
  const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
  if (!src) return undefined;
  return decodeURIComponent(/[?&]url=([^&]+)/.exec(src)?.[1] ?? src);
}

describe("legal page hero carousels", () => {
  it("each page has 3–5 distinct hero photos, none in its sticky column and no landscape", () => {
    for (const { hero, sticky } of Object.values(LEGAL_PAGE_PHOTOS)) {
      const heroKeys: readonly StockImageKey[] = hero;
      expect(heroKeys.length).toBeGreaterThanOrEqual(3);
      expect(heroKeys.length).toBeLessThanOrEqual(5);
      expect(new Set(heroKeys).size).toBe(heroKeys.length);
      for (const key of sticky) expect(heroKeys).not.toContain(key);
      for (const key of [...heroKeys, ...sticky]) expect(LANDSCAPE_KEYS).not.toContain(key);
    }
  });

  it.each(["true", "false"])(
    "privacy and terms render the carousel in English and Hindi (SHOW_PLACEHOLDER_CONTENT=%s)",
    async (placeholders) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const { name, render: page } of PAGES) {
        for (const lang of ["en", "hi"] as const) {
          const context = `${name} ${lang} placeholders=${placeholders}`;
          const common = messagesFor(lang, "common");
          const html = await render(lang, page);

          expect((html.match(/<h1[\s>]/g) ?? []).length, context).toBe(1);
          expect(html.split(`aria-roledescription="${common.carousel.roleCarousel}"`).length - 1, context).toBe(1);
          expect(html, context).toContain(`aria-label="${escapeHtml(common.carousel.label)}"`);

          const slideRe = new RegExp(
            `<div[^>]*aria-roledescription="${common.carousel.roleSlide}"[^>]*>(<img[^>]*>)([\\s\\S]*?)</div>`,
            "g",
          );
          const slides = [...html.matchAll(slideRe)].map(([, tag, body]) => ({ tag, body }));
          const expected = LEGAL_PAGE_PHOTOS[name].hero.map((key) => localizeImage(stockImages[key], lang));
          expect(slides.map((s) => imgPath(s.tag)), context).toEqual(expected.map((image) => image.src));
          slides.forEach(({ tag, body }, i) => {
            const alt = /\salt="([^"]*)"/.exec(tag)?.[1];
            expect(alt, `${context} slide ${i + 1}`).toBe(escapeHtml(expected[i].alt));
            if (lang === "hi") expect(alt, `${context} slide ${i + 1}`).toMatch(/[ऀ-ॿ]{3,}/);
            expect(body, `${context} slide ${i + 1}`).toContain(`>${common.labels.illustrativeStockPhoto}<`);
            if (i === 0) expect(tag.toLowerCase(), context).toContain('fetchpriority="high"');
            else expect(tag, context).toContain('loading="lazy"');
          });

          // The sticky column keeps its two photos; every stock photo appears once and is labelled.
          const photos = [...html.matchAll(/<img[^>]*>/g)]
            .map(([tag]) => imgPath(tag))
            .filter((src): src is string => Boolean(src?.startsWith("/images/stock/")));
          for (const key of LEGAL_PAGE_PHOTOS[name].sticky) expect(photos, context).toContain(stockImages[key].src);
          expect(new Set(photos).size, `${context}: ${photos.join(", ")}`).toBe(photos.length);
          expect(html.split(`>${common.labels.illustrativeStockPhoto}<`).length - 1, context).toBe(photos.length);

          expect(html, context).not.toContain("/api/result-cards/");
          for (const key of LANDSCAPE_KEYS) expect(html, context).not.toContain(encodeURIComponent(stockImages[key].src));
          // The draft banner still comes first in the document column.
          expect(html, context).toContain(messagesFor(lang, "legal").draft.title);
        }
      }
    },
    TIMEOUT,
  );
});
