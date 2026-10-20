import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HostelsPage from "@/app/[lang]/(site)/hostels/page";
import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { HOSTEL_BODY_KEYS, HOSTEL_HERO_KEYS } from "./hostel-photos";

/**
 * /hostels hero carousel (shared ImageCarousel via PageHero `slides`): 3–5 residence-life stock
 * photos, each labelled and captioned as not an Aspire hostel, Hindi alt text on /hi, never a
 * landscape or a result card (D-031), and no photo twice on the page. Production (no verified
 * hostel details) shows the same stock slides above the empty state.
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

/** Whole pages render here (both locales and content modes): allow for a loaded full run. */
vi.setConfig({ testTimeout: 30_000 });

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(await HostelsPage()));
}

/** The hero carousel's markup: from its group root to the first page section. */
function heroCarousel(html: string, lang: Locale): string {
  const start = html.indexOf(`aria-roledescription="${messagesFor(lang, "common").carousel.roleCarousel}"`);
  expect(start, lang).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf("<section", start));
}

/** Stock file names (e.g. "bunk-bed-dorm-room.jpg") of every <img> in `html`, in order. */
function stockFiles(html: string): string[] {
  return [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
}

const file = (src: string) => src.split("/").pop()!;
const count = (html: string, needle: string) => html.split(needle).length - 1;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("hostel hero photos", () => {
  it("has 3–5 residence slides and never reuses a body photo", () => {
    expect(HOSTEL_HERO_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(HOSTEL_HERO_KEYS.length).toBeLessThanOrEqual(5);
    expect(new Set(HOSTEL_HERO_KEYS).size).toBe(HOSTEL_HERO_KEYS.length);
    expect(new Set(HOSTEL_BODY_KEYS).size).toBe(HOSTEL_BODY_KEYS.length);
    expect(HOSTEL_HERO_KEYS.filter((key) => HOSTEL_BODY_KEYS.includes(key))).toEqual([]);
    for (const key of HOSTEL_HERO_KEYS) expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
  });
});

describe.each(["true", "false"])("hostels page hero carousel (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(["en", "hi"] as const)("%s: labelled, captioned stock slides with localised alt text", async (lang) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    const html = await render(lang);
    const common = messagesFor(lang, "common");
    const t = messagesFor(lang, "hostels");
    const hero = heroCarousel(html, lang);

    expect((html.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(html).toContain(t.hero.title);
    expect(hero).toContain(`aria-label="${common.carousel.label}"`);
    expect(hero).toContain(`aria-roledescription="${common.carousel.roleSlide}"`);
    // Slides in order, each with its visible label, its caption and its alt text in the page language.
    expect(stockFiles(hero)).toEqual(HOSTEL_HERO_KEYS.map((key) => file(stockImages[key].src)));
    expect(count(hero, `>${common.labels.illustrativeStockPhoto}<`)).toBe(HOSTEL_HERO_KEYS.length);
    expect(count(hero, `>${t.hero.photoCaption}<`)).toBe(HOSTEL_HERO_KEYS.length);
    for (const key of HOSTEL_HERO_KEYS) {
      const { src, alt } = stockImages[key];
      const expected = lang === "hi" ? imageAltHi[src] : alt;
      expect(hero, `${lang} ${key}`).toContain(`alt="${expected}"`);
    }
    expect(hero.match(/fetchPriority="high"/gi)?.length).toBe(1);

    // Every photo on the page is a labelled stock photo, used once; the body ones keep their caption.
    const files = stockFiles(html);
    expect(files.length).toBe(count(html, "<img"));
    expect(count(html, `>${common.labels.illustrativeStockPhoto}<`)).toBe(files.length);
    expect(new Set(files).size, files.join(", ")).toBe(files.length);
    expect(html).toContain(t.stockCaption);
    if (placeholders === "false") expect(html).toContain(t.empty.title);

    // D-031: no landscape and never a result card beside a hostel or campus.
    for (const name of LANDSCAPE_FILES) expect(html, name).not.toContain(name);
    expect(html).not.toContain("/api/result-cards/");
  });
});

describe("hostels page body (preview)", () => {
  it("keeps the routine and the menu beside one photo", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang);
      const t = messagesFor(lang, "hostels");
      const day = /<section[^>]*aria-labelledby="hostels-day-title"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
      expect(day, lang).toContain(t.day.menuTitle);
      // The section's photo panel plus one split photo.
      expect(stockFiles(day), lang).toHaveLength(2);
    }
  });
});
