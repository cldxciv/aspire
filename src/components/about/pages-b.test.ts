import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import AboutPage from "@/app/[lang]/(site)/about/page";
import AdmissionsPage from "@/app/[lang]/(site)/admissions/page";
import ContactPage from "@/app/[lang]/(site)/contact/page";
import SiteError from "@/app/[lang]/(site)/error";
import HostelsPage from "@/app/[lang]/(site)/hostels/page";
import PrivacyPage from "@/app/[lang]/(site)/privacy/page";
import ArticlePage from "@/app/[lang]/(site)/resources/[slug]/page";
import ResourcesPage from "@/app/[lang]/(site)/resources/page";
import TermsPage from "@/app/[lang]/(site)/terms/page";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getArticleSlugs, getInstituteProfile } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * PAGES-B pages (about, hostels, admissions, contact, resources + article, privacy, terms, error)
 * in both locales (D-028) and both content modes (D-005): localised copy and links, one h1,
 * labelled stock photos (D-030), DEMO labels only with placeholder content, no faculty info.
 */

function articleProps(slug: string, lang: Locale = "en") {
  return { params: Promise.resolve({ lang, slug }) } as unknown as PageProps<"/[lang]/resources/[slug]">;
}

const [firstArticleSlug] = getArticleSlugs();

const PAGES: { name: string; ns: "about" | "hostels" | "admissions" | "contact" | "resources" | "legal"; render: (lang: Locale) => Promise<React.ReactNode> }[] = [
  { name: "about", ns: "about", render: () => AboutPage() },
  { name: "hostels", ns: "hostels", render: () => HostelsPage() },
  { name: "admissions", ns: "admissions", render: () => AdmissionsPage() },
  { name: "contact", ns: "contact", render: () => ContactPage() },
  { name: "resources", ns: "resources", render: () => ResourcesPage() },
  { name: "privacy", ns: "legal", render: () => PrivacyPage() },
  { name: "terms", ns: "legal", render: () => TermsPage() },
];

/** The client locale context the root layout provides (EnquiryForm and error.tsx read it with useLocale()). */
function withLocale(locale: Locale, child: React.ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

/** Renders a page as the root layout would: `[lang]` root param + LocaleProvider. */
async function render(lang: Locale, page: (lang: Locale) => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, await page(lang))));
}

function count(html: string, needle: string | RegExp): number {
  return typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;
}

/** Internal hrefs that are not in-page anchors, API/asset paths or external links. */
function pageLinks(html: string): string[] {
  return [...html.matchAll(/href="(\/[^"]*)"/g)]
    .map((m) => m[1])
    .filter((href) => !/^\/(?:_next|images|assets|api)\//.test(href));
}

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe.each(["true", "false"])("PAGES-B pages (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(PAGES)("$name renders in English and Hindi with localised copy, links and labelled photos", async ({ render: page }) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang, page);
      const common = messagesFor(lang, "common");
      const text = html.replace(/<[^>]+>/g, " ");

      expect(count(html, /<h1[\s>]/g), lang).toBe(1);
      expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);
      // Breadcrumb home link and every other internal link stay in the page's locale.
      for (const href of pageLinks(html)) {
        if (lang === "hi") expect(href, href).toMatch(/^\/hi(?:[/?#]|$)/);
        else expect(href, href).not.toMatch(/^\/hi(?:[/?#]|$)/);
      }
      // D-030: a hero photo plus at least one more, each stock photo carrying the visible label.
      const stock = count(html, /<img[^>]*src="[^"]*%2Fimages%2Fstock%2F/g);
      expect(stock, lang).toBeGreaterThanOrEqual(2);
      expect(count(html, `>${common.labels.illustrativeStockPhoto}<`), lang).toBe(stock);
      // ...and no photo is used twice on one page.
      const files = [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
      expect(files.length, lang).toBe(stock);
      expect(new Set(files).size, `${lang}: ${files.join(", ")}`).toBe(files.length);
      // Faculty information was removed site-wide (2026-10-20).
      expect(html).not.toMatch(/href="(?:\/hi)?\/faculty/);
      expect(html).not.toContain("Raman Sharma");

      if (lang === "hi") expect(text).toMatch(/[ऀ-ॿ]{3,}/);
      if (placeholders === "false") {
        expect(html).not.toContain(`>${common.labels.demo}<`);
        expect(html).not.toContain(`>${common.labels.demoPending}<`);
      }
    }
  });
});

describe("PAGES-B Hindi specifics", () => {
  it("each page uses its Hindi hero title and no English UI labels", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const titles: [() => Promise<React.ReactNode>, string][] = [
      [() => AboutPage(), messagesFor("hi", "about").hero.title],
      [() => HostelsPage(), messagesFor("hi", "hostels").hero.title],
      [() => AdmissionsPage(), messagesFor("hi", "admissions").hero.title],
      [() => ContactPage(), messagesFor("hi", "contact").hero.title],
      [() => ResourcesPage(), messagesFor("hi", "resources").hero.title],
      [() => PrivacyPage(), messagesFor("hi", "legal").privacy.hero.title],
      [() => TermsPage(), messagesFor("hi", "legal").terms.hero.title],
    ];
    for (const [page, title] of titles) {
      const html = await render("hi", page);
      // Visible text: a rich hero sets part of the title in its own <span> (gold / underlined phrase).
      expect(html.replace(/<[^>]*>/g, "")).toContain(title);
      for (const english of ["Illustrative stock photo", "Demo · pending verification", "To be confirmed", "Enquire now"]) {
        expect(html).not.toContain(`>${english}<`);
      }
    }
  });

  it("admissions finds the scholarship milestone by its tag in Hindi and localises the centre options", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const profile = await getInstituteProfile("hi");
    const boh = profile?.milestones.filter((m) => m.tag === "BOH") ?? [];
    expect(boh.length).toBeGreaterThan(0);
    const html = await render("hi", () => AdmissionsPage());
    for (const milestone of boh) expect(html).toContain(milestone.title);
    expect(html).toContain(messagesFor("hi", "admissions").scholarships.title);
    expect(html).toContain("(उपलब्धता की पुष्टि करें)");
    expect(html).not.toContain("(verify availability)");
  });

  it("article page is localised and unknown slugs still 404", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const t = messagesFor("hi", "resources");
    const html = await render("hi", () => ArticlePage(articleProps(firstArticleSlug, "hi")));
    expect(html).toContain(t.article.allResources);
    expect(html).toMatch(/प्रकाशित: <time dateTime="\d{4}-\d{2}-\d{2}">\d{1,2} [ऀ-ॿ]+ \d{4}<\/time>/);
    expect(html).toContain('href="/hi/resources"');
    await expect(withTestLang("hi", () => ArticlePage(articleProps("no-such-article", "hi")))).rejects.toThrow();
  });

  it("legal pages keep the localised draft banner and 'to be confirmed' markers", async () => {
    const t = messagesFor("hi", "legal");
    for (const page of [() => PrivacyPage(), () => TermsPage()]) {
      const html = await render("hi", page);
      expect(html).toContain(t.draft.title);
      expect(count(html, `>${t.tbc}<`)).toBeGreaterThan(1);
    }
    const privacy = await render("hi", () => PrivacyPage());
    expect(privacy).toContain('href="/hi/admissions"');
    expect(privacy).toContain('href="/hi/contact"');
  });

  it("legal pages keep an index linking to every numbered section", async () => {
    for (const lang of ["en", "hi"] as const) {
      const t = messagesFor(lang, "legal");
      for (const page of [() => PrivacyPage(), () => TermsPage()]) {
        const html = await render(lang, page);
        const nav = /<nav aria-labelledby="legal-toc-heading"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? "";
        expect(nav).toContain(t.toc);
        const anchors = [...nav.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
        expect(anchors.length).toBeGreaterThan(3);
        for (const id of anchors) expect(html).toContain(`id="${id}"`);
        // The draft banner comes before the first section.
        expect(html.indexOf(t.draft.title)).toBeLessThan(html.indexOf(`id="${anchors[0]}"`));
      }
    }
  });

  it("contact desks show labelled study photos with the 'not Aspire's campuses' note, never a region caption", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const lang of ["en", "hi"] as const) {
      const t = messagesFor(lang, "contact");
      const html = await render(lang, () => ContactPage());
      const desks = /<section[^>]*id="campus-desks"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
      expect(desks, lang).toContain(t.desks.photoNote.replace(/'/g, "&#x27;"));
      expect(count(desks, /<img[^>]*src="[^"]*%2Fimages%2Fstock%2F/g), lang).toBe(4);
      expect(html).not.toContain(lang === "en" ? "Shimla region" : "शिमला क्षेत्र");
      expect(html).not.toMatch(/(?:centre|campus|परिसर|केंद्र)<\/figcaption>/i);
    }
  });

  it("resources keeps every download in the page, the rest behind a native disclosure", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const profile = await getInstituteProfile("hi");
    const downloads = profile?.downloads ?? [];
    expect(downloads.length).toBeGreaterThan(3);
    const html = await render("hi", () => ResourcesPage());
    const t = messagesFor("hi", "resources");
    expect(html).toContain("<details");
    expect(html).toContain(t.downloads.showAll.replace("{count}", String(downloads.length)));
    for (const item of downloads) expect(html).toContain(item.title.replace(/&/g, "&amp;"));
  });

  it("the error boundary follows the client locale", () => {
    const renderError = (locale: Locale) =>
      renderToStaticMarkup(withLocale(locale, createElement(SiteError, { error: new Error("x"), retry: () => {} })));
    const hi = renderError("hi");
    expect(hi).toContain(messagesFor("hi", "common").errorPage.title);
    expect(hi).toContain('href="/hi"');
    const en = renderError("en");
    expect(en).toContain("We couldn&#x27;t load this page");
    expect(en).toContain('href="/"');
    expect(en).not.toContain("x</");
  });
});

/**
 * D-031 (owner request 2026-10-20: "previous results instead of nature images"): no landscape on
 * any of these pages (only the homepage hero keeps one); result cards in general sections only —
 * never on contact (campus desks), hostels or the legal pages; in production no result card at all
 * and a labelled non-nature stock photo in every results slot.
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
const LANDSCAPE_FILES = [
  ...LANDSCAPE_KEYS.map((key) => stockImages[key].src.split("/").pop()!.replace(/\.\w+$/, "")),
  "hero-mountains",
  "himachal-landscape",
  "bg-mountain-",
];
const RESULT_CARD_URL = "/api/result-cards/";
/** These tests render all seven pages in both locales; allow for a loaded machine. */
const RENDER_ALL_TIMEOUT = 30_000;
const stockFile = (key: StockImageKey) => encodeURIComponent(stockImages[key].src);

/** Pages with a results slot, and the fallback photo(s) each slot shows in production. */
const RESULT_PAGES: Record<string, StockImageKey[]> = {
  about: ["graduateSilhouette", "notebookPlanning"],
  admissions: ["studentsTakingNotes"],
  resources: ["graduateSilhouette"],
};

describe("D-031 previous results instead of nature images", () => {
  it.each(["true", "false"])("no landscape photo on any PAGES-B page (SHOW_PLACEHOLDER_CONTENT=%s)", async (placeholders) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    for (const { name, render: page } of PAGES) {
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        for (const file of LANDSCAPE_FILES) expect(html, `${name} ${lang}: ${file}`).not.toContain(file);
      }
    }
  }, RENDER_ALL_TIMEOUT);

  it("preview: result cards on About, Admissions and Resources only, each card once per page", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const { name, render: page } of PAGES) {
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        // Marquee duplicates for the seamless loop have an empty alt; count the labelled cards only.
        const cards = [...html.matchAll(/<img[^>]*>/g)]
          .map(([tag]) => ({ alt: /\salt="([^"]*)"/.exec(tag)?.[1], src: /\ssrc="\/api\/result-cards\/([^"]+)"/.exec(tag)?.[1] }))
          .filter((img) => img.src && img.alt)
          .map((img) => img.src);
        if (!(name in RESULT_PAGES)) {
          expect(html, `${name} ${lang}`).not.toContain(RESULT_CARD_URL);
          continue;
        }
        expect(cards.length, `${name} ${lang}`).toBeGreaterThanOrEqual(11);
        expect(new Set(cards).size, `${name} ${lang}: a card is repeated`).toBe(cards.length);
        // Both tracks, DEMO-badged placeholders, the "See all results" link and no fallback photo.
        expect(html).toContain(">JEE ");
        expect(html).toContain(">NEET ");
        expect(html).toContain(`>${messagesFor(lang, "common").labels.demo}<`);
        expect(html).toContain(`href="${lang === "hi" ? "/hi" : ""}/results"`);
        for (const key of RESULT_PAGES[name]) expect(html, `${name} ${lang}: ${key}`).not.toContain(stockFile(key));
      }
    }
  }, RENDER_ALL_TIMEOUT);

  it("production: no result card anywhere, a labelled stock photo in every results slot", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    for (const { name, render: page } of PAGES) {
      for (const lang of ["en", "hi"] as const) {
        const html = await render(lang, page);
        expect(html, `${name} ${lang}`).not.toContain(RESULT_CARD_URL);
        for (const key of RESULT_PAGES[name] ?? []) expect(html, `${name} ${lang}: ${key}`).toContain(stockFile(key));
      }
    }
  }, RENDER_ALL_TIMEOUT);
});
