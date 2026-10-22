import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResultsPage from "@/app/[lang]/(site)/results/page";
import { pickRibbonCards, ribbonYears } from "@/components/hero";
import { RESULT_CARD_PATH } from "@/content/results";
import { LocaleProvider } from "@/i18n/client";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { getRankerYearCounts, getResultCards, type RankerYearCount } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * /results hero (2026-10-22 redesign, C · results ribbon): the gold-phrase headline, the newest
 * year's rankers-list count, one call to action and the `ResultsRibbon` island with its server
 * default (the newest year's cards). Production (no visible result card): the same copy beside
 * the labelled stock photo, no ribbon, no count, nothing invented. Both locales.
 */

type Locale = "en" | "hi";

/** Lets one test replace the year counts (everything else in @/lib/data stays real). */
const override = vi.hoisted(() => ({ counts: null as RankerYearCount[] | null }));
vi.mock("@/lib/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/data")>();
  return {
    ...actual,
    getRankerYearCounts: (...args: Parameters<typeof actual.getRankerYearCounts>) =>
      override.counts ? Promise.resolve(override.counts) : actual.getRankerYearCounts(...args),
  };
});

// Whole pages render here (both locales): allow for a loaded run.
vi.setConfig({ testTimeout: 30_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
  override.counts = null;
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;
async function render(locale: Locale, page: () => Promise<ReactElement>): Promise<string> {
  return withTestLang(locale, async () => renderToStaticMarkup(createElement(Provider, { locale }, await page())));
}

/** HTML-escapes text the way React does in markup. */
const esc = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
/** Visible text (tags removed, entities decoded, spaces collapsed). */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const count = (html: string, needle: string) => html.split(needle).length - 1;

/** The rich hero panel: from its opening tag to the first section after it. */
function heroOf(html: string): string {
  const start = html.lastIndexOf("<", html.indexOf('data-hero="rich"'));
  expect(start, "rich hero").toBeGreaterThanOrEqual(0);
  const end = html.indexOf("<section", start);
  return html.slice(start, end < 0 ? undefined : end);
}

/** The ribbon's scrolling row (labelled region → end of its list). */
function ribbonRowOf(html: string, listLabel: string): string {
  const start = html.indexOf(`role="region" aria-label="${esc(listLabel)}"`);
  expect(start, "ribbon region").toBeGreaterThanOrEqual(0);
  return html.slice(start, html.indexOf("</ul>", start));
}

function h1Of(html: string): string {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  expect(match, "h1").not.toBeNull();
  return match?.[1] ?? "";
}

/** The count rule (spec): both exams when both have entries, else the one that has; none → no sentence. */
function expectedCounts(row: RankerYearCount, t: { both: string; one: string; single: string }): string | null {
  if (row.jee > 0 && row.neet > 0) return format(t.both, { year: row.year, jee: row.jee, neet: row.neet });
  const [exam, n] = row.jee > 0 ? ["JEE", row.jee] : ["NEET", row.neet];
  if (n === 0) return null;
  return n === 1 ? format(t.single, { year: row.year, exam }) : format(t.one, { year: row.year, exam, count: n });
}

const ctaPattern = (locale: Locale, label: string) =>
  new RegExp(`<a[^>]*href="${locale === "hi" ? "/hi" : ""}/admissions#enquiry"[^>]*>${esc(label)}<svg[^>]*aria-hidden="true"`);
/** The opening tag of the hero's call to action. */
const ctaTag = (hero: string, locale: Locale) =>
  hero.match(new RegExp(`<a[^>]*href="${locale === "hi" ? "/hi" : ""}/admissions#enquiry"[^>]*>`))?.[0] ?? "";

describe.each(["en", "hi"] as const)("results hero, preview content (%s)", (locale) => {
  it("headline with the gold phrase, the newest year's count, one action and the ribbon's server default", async () => {
    preview();
    const t = messagesFor(locale, "results");
    const common = messagesFor(locale, "common");
    const html = await render(locale, () => ResultsPage());
    const hero = heroOf(html);

    // The page's only <h1>: the whole title, its gold phrase in a span.
    expect(count(html, "<h1")).toBe(1);
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(text(h1Of(html))).toBe(t.hero.title);
    expect(h1Of(html)).toContain(`<span class="text-gold">${esc(t.hero.highlight)}</span>`);
    expect(hero).toContain('aria-current="page"');
    expect(hero).toContain(`>${esc(t.crumb)}<`);

    // One call to action, in the page's language: white over the ribbon (the gold control there is
    // the pressed year pill), full width on phones.
    expect(hero).toMatch(ctaPattern(locale, t.hero.cta));
    expect(count(hero, "<a ")).toBe(2); // breadcrumb Home + the action
    expect(ctaTag(hero, locale)).toContain("bg-white!");
    expect(ctaTag(hero, locale)).toMatch(/\bw-full\b.*\bsm:w-auto\b/);

    // The count sentence comes from getRankerYearCounts() for the ribbon's (newest) year, DEMO-labelled.
    const ribbon = pickRibbonCards(await getResultCards(undefined, locale));
    const newest = ribbonYears(ribbon)[0];
    expect(newest).toBeGreaterThan(2000);
    const row = (await getRankerYearCounts()).find((r) => r.year === newest);
    expect(row, "the newest ribbon year is in the rankers list").toBeDefined();
    if (!row) return;
    const sentence = expectedCounts(row, t.hero.counts);
    expect(sentence).not.toBeNull();
    expect(row.placeholder).toBe(true);
    expect(hero).toContain(`<p class="m-0">${esc(sentence ?? "")} <span`);
    expect(hero).toContain(`>${esc(common.labels.demo)}<`);
    expect(hero).toContain(esc(t.hero.lead));

    // Ribbon island, server render: year pills (newest pressed), labelled row with the newest year's cards.
    const r = t.hero.ribbon;
    expect(hero).toContain(`role="group" aria-label="${esc(r.yearGroup)}"`);
    expect(hero).toMatch(new RegExp(`aria-pressed="true"[^>]*>${newest}<`));
    // The last pill names how many years the ribbon holds (its newest years, not the whole archive).
    const allYears = format(r.allYears, { count: ribbonYears(ribbon).length });
    expect(allYears).not.toContain("{");
    expect(hero).toContain(`>${esc(allYears)}<`);
    expect(hero).toContain(`>${esc(r.hint)}<`);
    const row0 = ribbonRowOf(hero, r.listLabel);
    const defaultCards = ribbon.filter((card) => card.year === newest);
    expect(count(row0, "<li")).toBe(defaultCards.length);
    for (const card of defaultCards) {
      expect(row0).toContain(`src="${card.photo.src}"`);
      expect(row0).toContain(`>${esc(card.name)}<`);
    }
    // Name, college and exam are printed beside each image, so the images are decorative (read once).
    const images = row0.match(/<img\b[^>]*>/g) ?? [];
    expect(images).toHaveLength(defaultCards.length);
    for (const image of images) expect(image).toContain('alt=""');
    // Nothing moves or can be pressed before hydration.
    expect(hero).not.toContain("data-carousel-toggle");

    // The ribbon replaces the photo and the old moving strip under the hero.
    expect(html).not.toContain("graduate-silhouette");
    expect(html).not.toContain('id="results-cards-title"');
    expect(html).not.toContain(esc(t.cards.scrollLabel));

    // No card twice: the ribbon's cards (every year) never reappear in the mosaics.
    for (const card of ribbon) {
      expect(count(html, `src="${card.photo.src}"`), card.id).toBe(card.year === newest ? 1 : 0);
    }

    // Nothing invented or left as a slot.
    expect(text(hero)).not.toMatch(/\[[^\]]*\]/);
    expect(text(hero)).not.toMatch(/\b(undefined|NaN|null)\b/);
  });
});

describe.each(["en", "hi"] as const)("results hero, production content (%s)", (locale) => {
  it("the same headline and action beside the labelled stock photo: no ribbon, no count, no card", async () => {
    production();
    const t = messagesFor(locale, "results");
    const common = messagesFor(locale, "common");
    const html = await render(locale, () => ResultsPage());
    const hero = heroOf(html);

    expect(count(html, "<h1")).toBe(1);
    expect(text(h1Of(html))).toBe(t.hero.title);
    expect(h1Of(html)).toContain(`<span class="text-gold">${esc(t.hero.highlight)}</span>`);
    expect(hero).toMatch(ctaPattern(locale, t.hero.cta));
    expect(ctaTag(hero, locale)).not.toContain("bg-white!"); // the kit's gold primary beside the photo
    expect(hero).toContain(esc(t.hero.lead));

    // Fallback: the graduate-silhouette stock photo with its visible label.
    expect(hero).toContain("graduate-silhouette");
    expect(hero).toContain(`<figcaption`);
    expect(hero).toContain(`>${esc(common.labels.illustrativeStockPhoto)}</figcaption>`);

    // No ribbon, no count, no result card, no DEMO label, no slot.
    expect(hero).not.toContain(esc(t.hero.ribbon.listLabel));
    expect(hero).not.toContain(esc(t.hero.ribbon.yearGroup));
    expect(hero).not.toContain("aria-pressed");
    expect(text(hero)).not.toContain(locale === "hi" ? "रैंकर सूची में" : "rankers list has");
    expect(html).not.toContain(RESULT_CARD_PATH);
    expect(html).not.toContain(`>${esc(common.labels.demo)}<`);
    expect(text(hero)).not.toMatch(/\[[^\]]*\]/);
    expect(text(hero)).not.toMatch(/\b(undefined|NaN|null)\b/);
  });
});

describe("results hero in Hindi", () => {
  it("shows none of the English hero strings", async () => {
    preview();
    const en = messagesFor("en", "results").hero;
    const hero = heroOf(await render("hi", () => ResultsPage()));
    const years = ribbonYears(pickRibbonCards(await getResultCards(undefined, "hi"))).length;
    const allYears = format(en.ribbon.allYears, { count: years });
    for (const english of [en.title, en.highlight, en.cta, en.lead, en.ribbon.hint, en.ribbon.listLabel, en.ribbon.yearGroup, allYears]) {
      expect(hero, english).not.toContain(esc(english));
    }
    expect(hero).not.toContain("rankers list has");
  });
});

describe("results hero count sentence (data edge cases)", () => {
  const newestRibbonYear = async () => ribbonYears(pickRibbonCards(await getResultCards()))[0];

  it("names only the exam that has entries, singular for one entry, DEMO only for placeholder counts", async () => {
    preview();
    const t = messagesFor("en", "results").hero.counts;
    const year = await newestRibbonYear();

    override.counts = [{ year, jee: 12, neet: 30, placeholder: false }];
    let hero = heroOf(await render("en", () => ResultsPage()));
    expect(hero).toContain(`<p class="m-0">${esc(format(t.both, { year, jee: 12, neet: 30 }))}</p>`);

    override.counts = [{ year, jee: 0, neet: 7, placeholder: false }];
    hero = heroOf(await render("en", () => ResultsPage()));
    expect(hero).toContain(`<p class="m-0">${esc(format(t.one, { year, exam: "NEET", count: 7 }))}</p>`);

    override.counts = [{ year, jee: 1, neet: 0, placeholder: true }];
    hero = heroOf(await render("en", () => ResultsPage()));
    expect(hero).toContain(`${esc(format(t.single, { year, exam: "JEE" }))} <span`);
  });

  it("omits the sentence when the ribbon's year has no entries (never another year's figures)", async () => {
    preview();
    const year = await newestRibbonYear();
    override.counts = [
      { year: year - 1, jee: 5, neet: 5, placeholder: true },
      { year, jee: 0, neet: 0, placeholder: true },
    ];
    const hero = heroOf(await render("en", () => ResultsPage()));
    expect(hero).not.toContain("rankers list has");
    expect(hero).toContain(esc(messagesFor("en", "results").hero.lead));
  });
});
