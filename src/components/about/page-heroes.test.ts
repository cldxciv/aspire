import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage from "@/app/[lang]/(site)/about/page";
import AdmissionsPage from "@/app/[lang]/(site)/admissions/page";
import {
  ABOUT_HERO_PHOTOS,
  ABOUT_PROOF_STAT_IDS,
  ADMISSIONS_HERO_PHOTOS,
  ADMISSIONS_PROOF_STAT_IDS,
} from "@/components/about/hero-images";
import { mixedResultCards } from "@/components/about/result-cards";
import { imageAltHi } from "@/content/hi/images";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getCentres, getStats } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * /about and /admissions heroes (2026-10-22 redesign, design A · "proof up front"): eyebrow pill,
 * headline with a gold phrase, lead, two calls to action, up to three proof figures and a photo
 * collage with a result card and a corner chip (About: "Ask Rancho"; Admissions: B's "Next batch"
 * card). Both pages are static server HTML (no client island in these heroes).
 *
 * Honesty: every figure and the result card come from the data (DEMO-badged placeholders in
 * preview, absent in production), the "Next batch" card shows only the centres' districts (no
 * date, seats or fees exist in the data), no "[…]" slot ever renders, and in production the hero
 * shows no number at all. Photos: labelled stock, alt text in the page language, never repeated
 * further down the page, no landscapes (D-031).
 */

type PageCase = {
  name: "about" | "admissions";
  render: () => Promise<React.ReactNode>;
  photos: readonly StockImageKey[];
  statIds: readonly string[];
};

const PAGES: PageCase[] = [
  { name: "about", render: () => AboutPage(), photos: ABOUT_HERO_PHOTOS, statIds: ABOUT_PROOF_STAT_IDS },
  { name: "admissions", render: () => AdmissionsPage(), photos: ADMISSIONS_HERO_PHOTOS, statIds: ADMISSIONS_PROOF_STAT_IDS },
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

/** Full-page renders in both locales on a loaded machine. */
const TIMEOUT = 30_000;

function withLocale(locale: Locale, child: React.ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, await page())));
}

const count = (html: string, needle: string) => html.split(needle).length - 1;
/** renderToStaticMarkup's attribute / text escaping. */
const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Visible text: style blocks (Rancho's SVG keyframes) and tags removed, entities decoded, whitespace collapsed. */
const text = (html: string) =>
  html
    .replace(/<style\b[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
const srcOf = (tag: string) => /\ssrc="([^"]*)"/.exec(tag)?.[1] ?? "";
const stockFile = (key: StockImageKey) => encodeURIComponent(stockImages[key].src);
const prefixFor = (lang: Locale) => (lang === "hi" ? "/hi" : "");

/** The rich hero: everything before the first page section. */
function heroOf(html: string, at: string): string {
  const end = html.indexOf("<section");
  expect(end, at).toBeGreaterThan(0);
  const hero = html.slice(0, end);
  expect(hero, at).toContain('data-hero="rich"');
  return hero;
}

/** The link whose href is `href` (first match), as markup. */
function linkTo(html: string, href: string): string {
  return new RegExp(`<a[^>]*href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>[\\s\\S]*?</a>`).exec(html)?.[0] ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("hero photo lists", () => {
  it.each(PAGES)("$name: two distinct stock photos, no landscapes, each with Hindi alt text", ({ photos }) => {
    expect(photos).toHaveLength(2);
    expect(new Set(photos).size).toBe(2);
    for (const key of photos) {
      expect(LANDSCAPE_KEYS, key).not.toContain(key);
      expect(stockImages[key].src, key).toMatch(/^\/images\/stock\//);
      expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
    }
  });
});

describe.each(["true", "false"])("About / Admissions hero, design A (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(PAGES)(
    "$name: headline, actions and labelled collage in English and Hindi",
    async ({ name, render: page, photos }) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        const at = `${name} ${lang}`;
        const hero = heroOf(html, at);
        const common = messagesFor(lang, "common");
        const t = messagesFor(lang, name).hero;
        const prefix = prefixFor(lang);

        // The page's only h1, in the hero: the full title, with the highlight phrase set in gold.
        expect(count(html, "<h1"), at).toBe(1);
        const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(hero)?.[1] ?? "";
        expect(text(h1).trim(), at).toBe(t.title);
        expect(t.title, at).toContain(t.highlight);
        expect(h1, at).toContain(`<span class="text-gold">${esc(t.highlight)}</span>`);

        // Eyebrow pill, lead, breadcrumb (Home in the page's locale, then the current page).
        expect(text(hero), at).toContain(t.eyebrow);
        expect(text(hero), at).toContain(t.lead);
        expect(hero, at).toContain(`href="${prefix || "/"}"`);
        expect(hero, at).toContain(`aria-current="page">${esc(t.crumb)}<`);

        // Two calls to action (real links), and the chip / card in the collage's corner.
        if (name === "about") {
          const about = messagesFor(lang, "about").hero;
          expect(text(linkTo(hero, `${prefix}/admissions#enquiry`)), at).toContain(about.primaryCta);
          expect(text(linkTo(hero, `${prefix}/results`)), at).toContain(about.secondaryCta);
          const chip = linkTo(hero, `${prefix}/tools/ask`);
          expect(text(chip), at).toContain(about.rancho.title);
          expect(text(chip), at).toContain(about.rancho.action);
        } else {
          const admissions = messagesFor(lang, "admissions").hero;
          const enquiryLinks = [...hero.matchAll(/<a[^>]*href="#enquiry"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => text(m[1]).trim());
          expect(enquiryLinks, at).toEqual([admissions.primaryCta, admissions.batch.action]);
          expect(text(linkTo(hero, "#next-steps")), at).toContain(admissions.secondaryCta);
          // Both anchors exist on the page.
          expect(html, at).toContain('id="enquiry"');
          expect(html, at).toContain('id="next-steps"');
          // B's "Next batch" card replaces the Rancho chip; it never shows a date, seats or fees.
          expect(text(hero), at).toContain(admissions.batch.eyebrow);
          expect(hero, at).not.toContain("/tools/ask");
        }

        // No carousel any more: two labelled stock photos, alt in the page language, the first one
        // preloaded at high priority (the hero's LCP image).
        expect(hero, at).not.toContain(`aria-roledescription="${common.carousel.roleCarousel}"`);
        const stock = imgTags(hero).filter((tag) => srcOf(tag).includes("%2Fimages%2Fstock%2F"));
        expect(stock, at).toHaveLength(photos.length);
        photos.forEach((key, i) => {
          const image = stockImages[key];
          const alt = lang === "hi" ? imageAltHi[image.src] : image.alt;
          expect(srcOf(stock[i]), `${at}: photo ${i + 1}`).toContain(stockFile(key));
          expect(stock[i], `${at}: ${key}`).toContain(`alt="${esc(alt)}"`);
        });
        expect(stock[0], at).toMatch(/fetchPriority="high"/i);
        // Only the LCP photo is prioritised: the small collage photo loads lazily.
        expect(stock[1], at).toContain('loading="lazy"');
        expect(stock[1], at).not.toMatch(/fetchPriority="high"/i);
        expect(count(hero, `>${common.labels.illustrativeStockPhoto}<`), at).toBe(photos.length);
        // No hero photo appears again further down the page.
        for (const key of photos) {
          const uses = imgTags(html).filter((tag) => srcOf(tag).includes(stockFile(key)));
          expect(uses, `${at}: ${key}`).toHaveLength(1);
        }

        // Never an owner-to-fill "[…]" slot.
        expect(text(hero), at).not.toMatch(/\[[^\]]*\]/);
        expect(text(hero), at).not.toMatch(/\b(undefined|NaN|null)\b/);

        if (lang === "hi") {
          expect(text(h1), at).toMatch(/[ऀ-ॿ]{3,}/);
          for (const english of ["Illustrative stock photo", "Aspire result", "Next batch", "Ask Rancho", "Aspire in numbers", "Demo"]) {
            expect(hero, `${at}: ${english}`).not.toContain(`>${english}<`);
          }
          expect(hero, at).not.toContain('aria-label="Aspire in numbers"');
        }
      }
    },
    TIMEOUT,
  );
});

describe("About / Admissions hero facts come from the data", () => {
  it.each(PAGES)(
    "$name (preview): DEMO-badged proof figures, a result card and centres exactly as the data states them",
    async ({ name, render: page, statIds }) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        const at = `${name} ${lang}`;
        const hero = heroOf(html, at);
        const common = messagesFor(lang, "common");
        const t = messagesFor(lang, name).hero;
        const allowed: string[] = [];

        // Proof figures: the chosen stats, values and labels verbatim, each DEMO-badged.
        const stats = await getStats(undefined, lang);
        const list = new RegExp(`<ul aria-label="${esc(t.statsLabel)}"[^>]*>([\\s\\S]*?)</ul>`).exec(hero)?.[1] ?? "";
        expect(list, at).not.toBe("");
        for (const id of statIds) {
          const stat = stats.find((s) => s.id === id);
          expect(stat, `${at}: ${id}`).toBeDefined();
          expect(text(list), `${at}: ${id}`).toContain(`${stat!.value} ${stat!.label}`);
          allowed.push(stat!.value, stat!.label);
        }
        expect(count(list, `>${common.labels.demo}<`), at).toBe(statIds.length);

        // One result card from the consent-checked accessor (D-031), the page's first, shown once.
        const [card] = await mixedResultCards(lang, 1);
        expect(card, at).toBeDefined();
        const cardImgs = imgTags(hero).filter((tag) => srcOf(tag).startsWith("/api/result-cards/"));
        expect(cardImgs.map(srcOf), at).toEqual([card.photo.src]);
        expect(cardImgs[0], at).toContain(`alt="${esc(card.photo.alt)}"`);
        expect(text(hero), at).toContain(card.name);
        expect(text(hero), at).toContain(t.resultBadge);
        expect(count(html, `src="${card.photo.src}"`), `${at}: the hero card repeats further down`).toBe(1);
        allowed.push(card.name, card.label, card.institute ?? "");

        if (name === "admissions") {
          // "Next batch": the visible centres' districts, DEMO-badged; nothing else.
          const a = messagesFor(lang, "admissions").hero.batch;
          const districts = [...new Set((await getCentres(undefined, lang)).map((c) => c.district))];
          expect(districts.length, at).toBeGreaterThan(0);
          expect(text(hero), at).toContain(`${a.centres} ${districts.join(" · ")}`);
          allowed.push(...districts);
        }

        // Every number in the hero is one of those facts (nothing estimated or invented).
        let rest = text(hero);
        for (const fact of allowed.filter(Boolean).sort((x, y) => y.length - x.length)) rest = rest.split(fact).join(" ");
        expect(rest, at).not.toMatch(/\d/);
      }
    },
    TIMEOUT,
  );

  it.each(PAGES)(
    "$name (production): no figure, result card, DEMO label or number in the hero; copy and actions stay",
    async ({ name, render: page }) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        const at = `${name} ${lang}`;
        const hero = heroOf(html, at);
        const common = messagesFor(lang, "common");
        const t = messagesFor(lang, name).hero;

        expect(hero, at).not.toContain(`aria-label="${esc(t.statsLabel)}"`);
        expect(hero, at).not.toContain("/api/result-cards/");
        expect(hero, at).not.toContain(t.resultBadge);
        expect(hero, at).not.toContain(`>${common.labels.demo}<`);
        expect(hero, at).not.toContain(`>${common.labels.demoPending}<`);
        expect(text(hero), at).not.toMatch(/\d/);
        expect(text(hero), at).toContain(t.title);

        if (name === "admissions") {
          const a = messagesFor(lang, "admissions").hero.batch;
          // No centre is published yet: the card keeps its eyebrow and action, without rows.
          expect(text(hero), at).toContain(a.eyebrow);
          expect(text(hero), at).toContain(a.action);
          expect(hero, at).not.toContain(`>${a.centres}<`);
        } else {
          expect(text(hero), at).toContain(messagesFor(lang, "about").hero.rancho.action);
        }
      }
    },
    TIMEOUT,
  );
});
