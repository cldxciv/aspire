import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CentresPage from "@/app/[lang]/(site)/centres/page";
import { HP_DISTRICTS, districtName, findDistrict } from "@/components/hero";
import { stockImages } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { getCentres, localizeImage } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * /centres hero (E · centre finder, 2026-10-22 hero redesign), en + hi, both content modes:
 * the headline with its gold phrase, a labelled select of Himachal's 12 districts whose server
 * render already shows the head campus's district, its centre card (name, address · phone, See
 * centre details → the directory card, Call) and the illustrative map with a pin per centre.
 * Production (no visible centres): the headline, two calls to action and a labelled stock photo.
 * Every fact from the centre records; nothing invented, no "[…]" slots.
 */

/** Whole pages render here (both locales and content modes): allow for a loaded machine. */
vi.setConfig({ testTimeout: 60_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await CentresPage())),
  );
}

/** The rich hero's markup: from its panel to the first page section. */
function heroOf(html: string): string {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf("<section", start));
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
/** Visible text only, so Tailwind's `text-[13px]` never reads as a "[…]" slot. */
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const reEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A link to `href` whose text starts with `label`. */
const linkTo = (href: string, label: string) => new RegExp(`href="${reEscape(href)}"[^>]*>${reEscape(escapeHtml(label))}<`);
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;

describe.each(["en", "hi"] as const)("centres hero (%s)", (lang) => {
  const t = messagesFor(lang, "centres");
  const common = messagesFor(lang, "common");
  const prefix = lang === "hi" ? "/hi" : "";

  it("preview: the district finder, server-rendered on the head campus's district", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang);
    const hero = heroOf(html);
    const centres = await getCentres(undefined, lang);
    const hq = centres.find((centre) => centre.isHeadquarters)!;
    const hqDistrict = findDistrict(hq.district)!;

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    // Headline with the gold phrase taken from the title itself.
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(hero).toContain(`<span class="text-gold">${escapeHtml(t.hero.highlight)}</span>`);
    expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim()).toBe(t.hero.title);
    expect(hero).toContain(escapeHtml(t.hero.finderLead));
    expect(hero).not.toContain(escapeHtml(t.hero.lead));

    // Labelled select of the 12 districts; the head campus's district selected in the server HTML.
    const selectId = /<label for="([^"]+)"[^>]*>([^<]*)<\/label>/.exec(hero);
    expect(selectId?.[2]).toBe(escapeHtml(t.finder.district));
    expect(hero).toContain(`<select id="${selectId?.[1]}"`);
    expect(count(hero, "<option ")).toBe(HP_DISTRICTS.length);
    expect(hero).toContain(`<option value="${hqDistrict.id}" selected="">`);
    expect(count(hero, 'selected=""')).toBe(1);

    // The card: that district's centre with the record's address, phone, details link and Call.
    expect(hero).toContain(escapeHtml(format(t.finder.centreFor, { district: districtName(hqDistrict, lang) })));
    expect(hero).toContain(escapeHtml(hq.name));
    expect(hero).toContain(escapeHtml(hq.address!));
    expect(hero).toContain(`href="tel:${hq.phone!.replace(/[^\d+]/g, "")}"`);
    expect(hero).toContain(`href="${prefix}/centres#${hq.slug}"`);
    expect(hero).toContain(`>${escapeHtml(t.finder.page)}<`);
    expect(hero).toContain(`>${escapeHtml(t.card.call)}<`);
    expect(hero).toContain(`>${escapeHtml(t.card.headCampus)}<`);
    // Placeholder records keep their DEMO label; no WhatsApp or directions on this page.
    expect(hero).toContain(`>${common.labels.demo}<`);
    expect(hero).not.toContain("wa.me");
    // The directory card the details link points to exists.
    expect(html).toContain(`id="${hq.slug}"`);

    // Illustrative map: one named image, a pin per centre (the selected one marked), visible caption.
    expect(count(hero, 'role="img"')).toBe(1);
    expect(hero).toContain(`role="img" aria-label="${escapeHtml(format(t.finder.mapLabel, { count: centres.length, names: "" }))}`);
    for (const centre of centres) expect(hero).toContain(`data-pin="${centre.slug}"`);
    expect(hero).toContain(`data-pin="${hq.slug}" data-selected="true"`);
    expect(hero).toContain(`>${escapeHtml(t.finder.mapNote)}<`);

    // No hero photo beside the map, nothing invented, every link in the page's locale.
    expect(hero).not.toContain("<img");
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
    expect(textOf(hero)).not.toMatch(/\b(undefined|NaN|null)\b/);
    for (const [, href] of hero.matchAll(/href="(\/[^"]*)"/g)) {
      if (lang === "hi") expect(href).toMatch(/^\/hi(?:[/?#]|$)/);
      else expect(href).not.toMatch(/^\/hi(?:[/?#]|$)/);
    }
    if (lang === "hi") {
      const en = messagesFor("en", "centres");
      for (const english of [en.hero.title, en.hero.finderLead, en.finder.district, en.finder.page, en.finder.mapNote]) {
        expect(hero, english).not.toContain(escapeHtml(english));
      }
    }
  });

  it("production: headline, two calls to action and a labelled stock photo, no finder", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await render(lang);
    const hero = heroOf(html);
    const photo = localizeImage(stockImages.teacherChalkboard, lang);

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain(`<span class="text-gold">${escapeHtml(t.hero.highlight)}</span>`);
    expect(hero).toContain(escapeHtml(t.hero.lead));
    expect(hero).toMatch(linkTo(`${prefix}/admissions#enquiry`, t.help.primary));
    expect(hero).toMatch(linkTo(`${prefix}/contact`, t.help.secondary));
    // One labelled stock photo, preloaded (the LCP image), alt text in the page's language.
    expect(count(hero, "<img")).toBe(1);
    expect(hero).toContain(`alt="${escapeHtml(photo.alt)}"`);
    expect(hero).toContain(encodeURIComponent(photo.src));
    expect(hero).toMatch(/fetchPriority="high"/i);
    expect(hero).toContain(`>${escapeHtml(common.labels.illustrativeStockPhoto)}<`);
    // No finder, map, centre or DEMO label without verified centres.
    expect(hero).not.toContain("<select");
    expect(hero).not.toContain('role="img"');
    expect(hero).not.toContain(`>${common.labels.demo}<`);
    expect(html).toContain(escapeHtml(t.directory.emptyTitle));
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
  });
});
