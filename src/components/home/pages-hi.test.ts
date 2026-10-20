import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import CentresPage from "@/app/[lang]/(site)/centres/page";
import HomePage from "@/app/[lang]/(site)/page";
import ProgramPage from "@/app/[lang]/(site)/programs/[slug]/page";
import ProgramsPage from "@/app/[lang]/(site)/programs/page";
import ResultsPage from "@/app/[lang]/(site)/results/page";
import { LocaleProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import { getPrograms } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * PAGES-A pages in Hindi (D-028): Hindi copy, Hindi links, English quotes marked lang="en",
 * and none of the English UI strings of the page's own namespaces.
 */

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

function programProps(slug: string) {
  return {
    params: Promise.resolve({ lang: "hi", slug }),
    searchParams: Promise.resolve({}),
  } as unknown as PageProps<"/[lang]/programs/[slug]">;
}

/** Every internal <a href> must stay in Hindi (assets, API, fragments and external links excepted). */
function nonHindiLinks(html: string): string[] {
  const hrefs = [...html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  return hrefs.filter(
    (href) =>
      href.startsWith("/") &&
      !/^\/hi(?:[/?#]|$)/.test(href) &&
      !/^\/(?:api|images|assets)\//.test(href),
  );
}

/** Renders a page as the [lang] layout would: root param "hi" plus the client LocaleProvider. */
const Provider = LocaleProvider as FunctionComponent<{ locale: "en" | "hi"; children?: ReactNode }>;
async function renderHi(page: () => Promise<ReactElement>): Promise<string> {
  return withTestLang("hi", async () => renderToStaticMarkup(createElement(Provider, { locale: "hi" }, await page())));
}

const en = {
  home: messagesFor("en", "home"),
  programs: messagesFor("en", "programs"),
  results: messagesFor("en", "results"),
  centres: messagesFor("en", "centres"),
  forms: messagesFor("en", "forms"),
};
const hi = {
  home: messagesFor("hi", "home"),
  programs: messagesFor("hi", "programs"),
  results: messagesFor("hi", "results"),
  centres: messagesFor("hi", "centres"),
};

describe("PAGES-A pages in Hindi (preview content)", () => {
  it("home: Hindi hero, sections and form; Hindi links; quotes marked English", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHi(() => HomePage());
    expect(html).toContain(hi.home.hero.titleLine2);
    expect(html).toContain(hi.home.programs.title);
    expect(html).toContain(messagesFor("hi", "forms").hero.title);
    for (const english of [
      en.home.hero.titleLine2,
      en.home.hero.lead,
      en.home.results.title,
      en.home.programs.title,
      en.home.why.title,
      en.home.life.title,
      en.home.voices.title,
      en.home.cta.title,
      en.forms.hero.title,
      en.forms.hero.next,
      ">Demo<",
      ">Illustration<",
    ]) {
      expect(html, english).not.toContain(english);
    }
    expect(nonHindiLinks(html)).toEqual([]);
    expect(html).toMatch(/<blockquote lang="en"/);
  });

  it("programs list and detail: Hindi copy, track photos labelled, Hindi links", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const list = await renderHi(() => ProgramsPage());
    expect(list).toContain(hi.programs.list.heroTitle);
    expect(list).toContain(hi.programs.list.tracksTitle);
    for (const english of [en.programs.list.heroTitle, en.programs.list.directoryTitle, en.programs.card.facts.batchSize, "Learn more"]) {
      expect(list, english).not.toContain(english);
    }
    expect(nonHindiLinks(list)).toEqual([]);

    const [program] = await getPrograms(undefined, "hi");
    const detail = await renderHi(() => ProgramPage(programProps(program.slug)));
    expect(detail).toContain(hi.programs.detail.overview);
    expect(detail).toContain(hi.programs.schedule.title);
    for (const english of [en.programs.detail.overview, en.programs.schedule.title, "Demo · pending verification", "Illustrative stock photo"]) {
      expect(detail, english).not.toContain(english);
    }
    expect(nonHindiLinks(detail)).toEqual([]);
    // No photo appears twice on a program page.
    const sources = [...detail.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => decodeURIComponent(m[1]).replace(/&amp;.*$/, ""));
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("results: Hindi copy, English quotes marked, no person photo, Hindi links", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHi(() => ResultsPage());
    expect(html).toContain(hi.results.hero.title);
    expect(html).toContain(hi.results.rankers.title);
    for (const english of [en.results.hero.title, en.results.rankers.title, en.results.method.title, "Name withheld", "Showing 24 of"]) {
      expect(html, english).not.toContain(english);
    }
    expect(html).toMatch(/<blockquote lang="en"/);
    expect(nonHindiLinks(html)).toEqual([]);
  });

  it("centres: Hindi copy, regions captioned as regions, Hindi links", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await renderHi(() => CentresPage());
    expect(html).toContain(hi.centres.hero.title);
    expect(html).toContain(hi.centres.regions.shimla);
    for (const english of [en.centres.hero.title, en.centres.directory.title, en.centres.card.contact, "Illustrative image"]) {
      expect(html, english).not.toContain(english);
    }
    expect(nonHindiLinks(html)).toEqual([]);
  });
});

describe("PAGES-A pages in Hindi (production: placeholders hidden)", () => {
  it("render Hindi empty states without DEMO labels", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const [home, programs, results, centres] = await Promise.all([
      renderHi(() => HomePage()),
      renderHi(() => ProgramsPage()),
      renderHi(() => ResultsPage()),
      renderHi(() => CentresPage()),
    ]);
    expect(programs).toContain(hi.programs.list.emptyTitle);
    expect(results).toContain(hi.results.notices.verifiedTitle);
    expect(centres).toContain(hi.centres.directory.emptyTitle);
    for (const html of [home, programs, results, centres]) {
      expect(html).not.toContain(">डेमो<");
      expect(nonHindiLinks(html)).toEqual([]);
    }
  });
});
