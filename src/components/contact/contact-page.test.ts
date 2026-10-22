import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ContactPage from "@/app/[lang]/(site)/contact/page";
import { HP_DISTRICTS, districtName, findDistrict } from "@/components/hero";
import { stockImages } from "@/content/images";
import { imageAltHi } from "@/content/hi/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { messagesFor } from "@/i18n/messages";
import { getCentres, getContactDetails, localizeImage } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { CONTACT_BODY_KEYS, CONTACT_HERO_KEYS } from "./contact-photos";

/**
 * /contact hero (E · centre finder, 2026-10-22 hero redesign), en + hi, both content modes:
 * the headline with its gold phrase and a district select whose server render shows the head
 * campus's district, its centre and the ways to reach it from the contact data — Call (the campus
 * desk's number), WhatsApp (the institute's chat link, new tab) and Directions only when a record
 * has a link — beside the illustrative map. Production (no publishable centres or details): the
 * headline, "Send an enquiry" (the form below) and two labelled stock photos. Never a landscape or
 * a result card (D-031), no photo twice, nothing invented.
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

/** Whole pages render here (both locales and content modes): allow for a loaded machine. */
vi.setConfig({ testTimeout: 60_000 });

async function render(lang: Locale): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(
      createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await ContactPage()),
    ),
  );
}

/** The rich hero's markup: from its panel to the first page section. */
function heroOf(html: string): string {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf("<section", start));
}

/** Stock file names (e.g. "signing-form-pen-hands.jpg") of every <img> in `html`, in order. */
function stockFiles(html: string): string[] {
  return [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
}

const file = (src: string) => src.split("/").pop()!;
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe("contact hero photos", () => {
  it("are two distinct stock photos the body never reuses, each with Hindi alt text", () => {
    expect(CONTACT_HERO_KEYS).toHaveLength(2);
    expect(new Set(CONTACT_HERO_KEYS).size).toBe(CONTACT_HERO_KEYS.length);
    expect(CONTACT_HERO_KEYS.filter((key) => CONTACT_BODY_KEYS.includes(key))).toEqual([]);
    for (const key of CONTACT_HERO_KEYS) expect(imageAltHi[stockImages[key].src], key).toBeTruthy();
  });
});

describe.each(["en", "hi"] as const)("contact hero (%s)", (lang) => {
  const t = messagesFor(lang, "contact");
  const tc = messagesFor(lang, "centres");
  const common = messagesFor(lang, "common");

  it("preview: the district finder with the chosen centre's call, WhatsApp and (when given) directions", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang);
    const hero = heroOf(html);
    const [centres, details] = await Promise.all([getCentres(undefined, lang), getContactDetails(lang)]);
    const hq = centres.find((centre) => centre.isHeadquarters)!;
    const hqDistrict = findDistrict(hq.district)!;
    const desk = details!.campusContacts.find((contact) => contact.centreSlug === hq.slug)!;

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(hero).toContain(`<span class="text-gold">${escapeHtml(t.hero.highlight)}</span>`);
    expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim()).toBe(t.hero.title);
    expect(hero).toContain(escapeHtml(t.hero.finderLead));

    // District select (12 districts), the head campus's district selected in the server HTML.
    expect(hero).toMatch(new RegExp(`<label for="[^"]+"[^>]*>${escapeHtml(tc.finder.district)}</label>`));
    expect(count(hero, "<option ")).toBe(HP_DISTRICTS.length);
    expect(hero).toContain(`<option value="${hqDistrict.id}" selected="">`);
    expect(hero).toContain(escapeHtml(format(tc.finder.centreFor, { district: districtName(hqDistrict, lang) })));
    expect(hero).toContain(escapeHtml(hq.name));

    // Contact actions from the data: the desk's phone, the institute's WhatsApp in a new tab.
    expect(hero).toContain(`href="tel:${desk.phone!.tel}"`);
    expect(hero).toContain(`href="${details!.whatsapp.url}"`);
    expect(hero).toMatch(/href="https:\/\/wa\.me\/[^"]+" [^>]*target="_blank" rel="noopener noreferrer"/);
    expect(hero).toContain(`> ${escapeHtml(common.labels.opensInNewTab)}<`);
    expect(hero).toContain(`>${escapeHtml(tc.card.call)}<`);
    expect(hero).toContain(`>${escapeHtml(tc.finder.whatsapp)}<`);
    // Directions only where a record has a link (none does today); no centre-page link on /contact.
    const withDirections = centres.filter((centre) => centre.directionsUrl);
    if (withDirections.length === 0) expect(hero).not.toContain(`>${escapeHtml(tc.card.directions)}<`);
    expect(hero).not.toContain(`>${escapeHtml(tc.finder.page)}<`);
    expect(hero).toContain(`>${common.labels.demo}<`);

    // Map instead of a photo; no "Send an enquiry" in the hero while the finder shows.
    expect(count(hero, 'role="img"')).toBe(1);
    expect(hero).toContain(`>${escapeHtml(tc.finder.mapNote)}<`);
    expect(hero).not.toContain("<img");
    expect(hero).not.toContain('href="#contact-form"');
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
    expect(textOf(hero)).not.toMatch(/\b(undefined|NaN|null)\b/);
    if (lang === "hi") {
      const en = messagesFor("en", "contact");
      const enCentres = messagesFor("en", "centres");
      for (const english of [en.hero.finderLead, enCentres.finder.district, enCentres.card.call, "(opens in a new tab)"]) {
        expect(hero, english).not.toContain(escapeHtml(english));
      }
    }
  });

  it("production: the headline, Send an enquiry and two labelled stock photos", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await render(lang);
    const hero = heroOf(html);

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain(escapeHtml(t.hero.lead));
    expect(hero).toMatch(new RegExp(`href="#contact-form"[^>]*>${escapeHtml(t.form.title)}<`));
    expect(html).toContain('id="contact-form"');
    // The collage: the hero photos in order, each labelled, alt text in the page's language, the first preloaded.
    expect(stockFiles(hero)).toEqual(CONTACT_HERO_KEYS.map((key) => file(stockImages[key].src)));
    expect(count(hero, `>${escapeHtml(common.labels.illustrativeStockPhoto)}<`)).toBe(CONTACT_HERO_KEYS.length);
    for (const key of CONTACT_HERO_KEYS) {
      expect(hero, key).toContain(`alt="${escapeHtml(localizeImage(stockImages[key], lang).alt)}"`);
    }
    expect(count(hero, /fetchPriority="high"/gi)).toBe(1);
    // Nothing unverified: no finder, no phone or WhatsApp, no DEMO label.
    expect(hero).not.toContain("<select");
    expect(hero).not.toContain("tel:");
    expect(hero).not.toContain("wa.me");
    expect(html).not.toContain(`>${common.labels.demo}<`);
  });

  it.each(["true", "false"])("never a landscape or a result card, every photo labelled and used once (placeholders=%s)", async (flag) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    const html = await render(lang);
    for (const name of LANDSCAPE_FILES) expect(html, name).not.toContain(name);
    expect(html).not.toContain("/api/result-cards/");
    const files = stockFiles(html);
    expect(new Set(files).size, files.join(", ")).toBe(files.length);
    expect(count(html, `>${escapeHtml(common.labels.illustrativeStockPhoto)}<`)).toBe(files.length);
  });
});
