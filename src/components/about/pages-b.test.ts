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
      expect(html).toContain(title);
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

  it("contact desks show region photos captioned as the region, never as the campus", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    for (const lang of ["en", "hi"] as const) {
      const t = messagesFor(lang, "contact");
      const html = await render(lang, () => ContactPage());
      expect(html).toContain(t.desks.regionNote.replace(/'/g, "&#x27;"));
      expect(html).toContain(lang === "en" ? "Shimla region" : "शिमला क्षेत्र");
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
