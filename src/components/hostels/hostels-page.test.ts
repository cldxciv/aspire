import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import HostelsPage from "@/app/[lang]/(site)/hostels/page";
import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getCentres, getHostelInfo, localizeImage } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { HOSTEL_BODY_KEYS, HOSTEL_HERO_KEYS } from "./hostel-photos";

/**
 * /hostels hero (B · Himalayan editorial, 2026-10-22 hero redesign), en + hi, both content modes:
 * ridge art, gold-capitals eyebrow, the headline with its gold underline and the page's main
 * action (ask about accommodation). With hostel details (preview) a white card lists only what the
 * data says — campuses with hostels, girls' residency campuses — and links to the per-campus
 * section; without them (production) two labelled residence stock photos captioned as not an
 * Aspire hostel. Never a landscape or a result card (D-031), no photo twice, nothing invented.
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
vi.setConfig({ testTimeout: 60_000 });

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(await HostelsPage()));
}

/** The rich hero's markup: from its panel to the first page section. */
function heroOf(html: string): string {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf("<section", start));
}

/** Stock file names (e.g. "bunk-bed-dorm-room.jpg") of every <img> in `html`, in order. */
function stockFiles(html: string): string[] {
  return [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
}

const file = (src: string) => src.split("/").pop()!;
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("hostel hero photos", () => {
  it("are two distinct residence photos the body never reuses, each with Hindi alt text", () => {
    expect(HOSTEL_HERO_KEYS).toHaveLength(2);
    expect(new Set(HOSTEL_HERO_KEYS).size).toBe(HOSTEL_HERO_KEYS.length);
    expect(new Set(HOSTEL_BODY_KEYS).size).toBe(HOSTEL_BODY_KEYS.length);
    expect(HOSTEL_HERO_KEYS.filter((key) => HOSTEL_BODY_KEYS.includes(key))).toEqual([]);
    for (const key of HOSTEL_HERO_KEYS) expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
  });
});

describe.each(["en", "hi"] as const)("hostels hero (%s)", (lang) => {
  const t = messagesFor(lang, "hostels");
  const common = messagesFor(lang, "common");
  const prefix = lang === "hi" ? "/hi" : "";

  it("preview: editorial frame, the main action and a card of the hostel data's own facts", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang);
    const hero = heroOf(html);
    const [info, centres] = await Promise.all([getHostelInfo(lang), getCentres(undefined, lang)]);
    const name = new Map(centres.map((centre) => [centre.slug, centre.name]));

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain('data-hero-art="ridges"');
    expect(hero).toContain(`>${escapeHtml(t.hero.eyebrow)}<`);
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim()).toBe(t.hero.title);
    // The highlight is underlined with the gold stroke (an inline SVG background), not recoloured.
    expect(hero).toMatch(new RegExp(`<span[^>]*style="background-image:url[^"]*"[^>]*>${escapeHtml(t.hero.highlight)}</span>`));
    expect(hero).toContain(escapeHtml(t.hero.lead));
    expect(hero).toMatch(new RegExp(`href="${prefix}/admissions#enquiry"[^>]*>${escapeHtml(t.hero.ask)}<`));

    // The card: campuses with hostels and the girls' residency campuses, as the data lists them.
    const campusNames = info!.campuses.map((campus) => name.get(campus.centreSlug)!).join(" · ");
    const girlsNames = info!.girlsResidency.centreSlugs.map((slug) => name.get(slug)!).join(" · ");
    expect(hero).toContain(`>${escapeHtml(t.heroCard.eyebrow)}<`);
    expect(hero).toContain(`<dt class="text-muted">${escapeHtml(t.heroCard.campuses)}</dt>`);
    expect(hero).toContain(`>${escapeHtml(campusNames)}</dd>`);
    expect(hero).toContain(`<dt class="text-muted">${escapeHtml(t.care.girlsTitle)}</dt>`);
    expect(hero).toContain(`>${escapeHtml(girlsNames)}</dd>`);
    expect(hero).toMatch(new RegExp(`href="#hostels-by-campus"[^>]*>${escapeHtml(t.hero.byCampus)}<`));
    expect(html).toContain('id="hostels-by-campus"');
    expect(hero).toMatch(new RegExp(`href="${prefix}/centres"[^>]*>${escapeHtml(t.cta.secondary)}<`));
    // Placeholder hostel data keeps its DEMO label; no capacity, fee or room figure in the hero.
    expect(hero).toContain(`>${common.labels.demo}<`);
    for (const block of info!.campuses.flatMap((campus) => campus.blocks)) {
      if (block.capacity) expect(hero).not.toContain(escapeHtml(block.capacity));
    }
    expect(hero).not.toContain("<img");
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
    expect(textOf(hero)).not.toMatch(/\b(undefined|NaN|null)\b/);
    if (lang === "hi") {
      const en = messagesFor("en", "hostels");
      for (const english of [en.hero.title, en.hero.eyebrow, en.heroCard.eyebrow, en.heroCard.campuses, en.hero.ask]) {
        expect(hero, english).not.toContain(escapeHtml(english));
      }
    }
  });

  it("production: the main action and two labelled residence photos instead of the card", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await render(lang);
    const hero = heroOf(html);

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain('data-hero-art="ridges"');
    expect(hero).toContain(escapeHtml(t.hero.emptyLead));
    expect(hero).toMatch(new RegExp(`href="${prefix}/admissions#enquiry"[^>]*>${escapeHtml(t.hero.ask)}<`));
    expect(stockFiles(hero)).toEqual(HOSTEL_HERO_KEYS.map((key) => file(stockImages[key].src)));
    for (const key of HOSTEL_HERO_KEYS) {
      expect(hero, key).toContain(`alt="${escapeHtml(localizeImage(stockImages[key], lang).alt)}"`);
    }
    expect(count(hero, `>${escapeHtml(common.labels.illustrativeStockPhoto)}<`)).toBe(HOSTEL_HERO_KEYS.length);
    expect(count(hero, `>${escapeHtml(t.hero.photoCaption)}<`)).toBe(1);
    expect(count(hero, /fetchPriority="high"/gi)).toBe(1);
    expect(hero).not.toContain(escapeHtml(t.heroCard.eyebrow));
    expect(html).toContain(escapeHtml(t.empty.title));
    expect(html).not.toContain(`>${common.labels.demo}<`);
    expect(html).not.toContain(`>${common.labels.demoPending}<`);
  });

  it.each(["true", "false"])("every photo is a labelled stock photo used once, never a landscape or a result card (placeholders=%s)", async (flag) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    const html = await render(lang);
    const files = stockFiles(html);
    expect(files.length).toBe(count(html, "<img"));
    expect(count(html, `>${escapeHtml(common.labels.illustrativeStockPhoto)}<`)).toBe(files.length);
    expect(new Set(files).size, files.join(", ")).toBe(files.length);
    expect(html).toContain(escapeHtml(t.stockCaption));
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
