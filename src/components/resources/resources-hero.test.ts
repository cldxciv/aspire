import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ArticlePage from "@/app/[lang]/(site)/resources/[slug]/page";
import ResourcesPage from "@/app/[lang]/(site)/resources/page";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getArticle, getArticleSlugs, getArticles, getInstituteProfile, localizeImage } from "@/lib/data";
import type { Article, ArticleCategory } from "@/lib/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { ARTICLE_FALLBACK_COVER, ARTICLE_STICKY_POOL, articlePagePhotos } from "./article-photos";
import { formatIsoDate } from "./format";

/**
 * /resources and /resources/[slug] heroes (B · Himalayan editorial frame, 2026-10-22 hero
 * redesign), en + hi, both content modes. /resources: ridge art, eyebrow, the headline with its
 * gold underline, "Read the articles" (+ "See downloads" when there are downloads) and a white
 * card with the newest visible article — DEMO while it is a placeholder, no card without one. An
 * article page: its category, title, summary, the enquiry action and its own cover photo (labelled,
 * preloaded). Never a landscape or a result card in a hero (D-031), no photo twice, nothing invented.
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
const LANDSCAPE_SRCS = new Set<string>(LANDSCAPE_KEYS.map((key) => stockImages[key].src));

/** Whole pages render here (both locales and content modes): allow for a loaded machine. */
vi.setConfig({ testTimeout: 60_000 });

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

async function render(lang: Locale, page: () => Promise<React.ReactNode>): Promise<string> {
  return withTestLang(lang, async () =>
    renderToStaticMarkup(createElement(LocaleProvider, { locale: lang } as ComponentProps<typeof LocaleProvider>, await page())),
  );
}

function articleProps(slug: string, lang: Locale) {
  return { params: Promise.resolve({ lang, slug }) } as unknown as PageProps<"/[lang]/resources/[slug]">;
}

/** The rich hero's markup: from its panel to the first page section. */
function heroOf(html: string): string {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  return html.slice(start, html.indexOf("<section", start));
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const reEscape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A link to `href` whose text starts with `label`. */
const linkTo = (href: string, label: string) => new RegExp(`href="${reEscape(href)}"[^>]*>${reEscape(escapeHtml(label))}<`);
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const count = (html: string, needle: string | RegExp) =>
  typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;

/** Decoded `/images/...` path of a rendered next/image tag (optimizer URL or plain src). */
function imgPath(tag: string): string | undefined {
  const src = /\ssrc="([^"]+)"/.exec(tag)?.[1];
  if (!src) return undefined;
  const url = /[?&]url=([^&]+)/.exec(src)?.[1];
  return decodeURIComponent(url ?? src);
}

/** Every photo path in `html` (any `<img>`), in order. */
function imagePaths(html: string): string[] {
  return [...html.matchAll(/<img[^>]*>/g)].map(([tag]) => imgPath(tag)).filter((src): src is string => Boolean(src));
}

/** Page-wide photo rules: every stock photo once, each with the visible label, never a landscape. */
function expectPhotoRules(html: string, lang: Locale, context: string) {
  const label = messagesFor(lang, "common").labels.illustrativeStockPhoto;
  const photos = imagePaths(html).filter((src) => src.startsWith("/images/stock/"));
  expect(new Set(photos).size, `${context}: ${photos.join(", ")}`).toBe(photos.length);
  expect(count(html, `>${escapeHtml(label)}<`), context).toBe(photos.length);
  for (const src of photos) expect(LANDSCAPE_SRCS.has(src), `${context}: landscape ${src}`).toBe(false);
}

describe.each(["en", "hi"] as const)("/resources hero (%s)", (lang) => {
  const t = messagesFor(lang, "resources");
  const common = messagesFor(lang, "common");
  const prefix = lang === "hi" ? "/hi" : "";

  it("preview: editorial frame, the main actions and the newest article's card", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
    const html = await render(lang, () => ResourcesPage());
    const hero = heroOf(html);
    const [latest] = await getArticles(lang);
    const downloads = (await getInstituteProfile(lang))?.downloads ?? [];

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(hero).toContain('data-hero-art="ridges"');
    expect(hero).toContain(`>${escapeHtml(t.hero.eyebrow)}<`);
    expect(t.hero.title).toContain(t.hero.highlight);
    expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim()).toBe(t.hero.title);
    expect(hero).toMatch(new RegExp(`<span[^>]*style="background-image:url[^"]*"[^>]*>${reEscape(escapeHtml(t.hero.highlight))}</span>`));
    expect(hero).toMatch(linkTo("#articles", t.hero.articles));
    expect(html).toContain('id="articles"');
    expect(downloads.length).toBeGreaterThan(0);
    expect(hero).toMatch(linkTo("#downloads", t.categories.downloads.action));
    expect(html).toContain('id="downloads"');

    // The card: the newest article as the data has it (title, category, date) and a link to it.
    expect(latest).toBeTruthy();
    expect(hero).toContain(`>${escapeHtml(t.latest.eyebrow)}<`);
    expect(hero).toContain(`>${escapeHtml(latest.title)}</p>`);
    expect(hero).toContain(`>${escapeHtml(t.card.categories[latest.category])}</dd>`);
    expect(hero).toContain(`>${escapeHtml(formatIsoDate(latest.publishedAt, t.card.months))}</dd>`);
    expect(hero).toMatch(linkTo(`${prefix}/resources/${latest.slug}`, t.latest.read));
    expect(hero).toContain(`>${common.labels.demo}<`);

    // No photo or result card in the hero; the page's photos follow the rules.
    expect(hero).not.toContain("<img");
    expect(hero).not.toContain("/api/result-cards/");
    expect(textOf(hero)).not.toMatch(/\[[^\]]*\]/);
    expectPhotoRules(html, lang, `resources ${lang}`);
    if (lang === "hi") {
      const en = messagesFor("en", "resources");
      for (const english of [en.hero.eyebrow, en.hero.articles, en.latest.eyebrow, en.latest.read]) {
        expect(hero, english).not.toContain(escapeHtml(english));
      }
    }
  });

  it("production: one main action that leads somewhere real — no downloads, no article card, no DEMO label", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const html = await render(lang, () => ResourcesPage());
    const hero = heroOf(html);
    const articles = await getArticles(lang);

    expect(count(html, /<h1[\s>]/g)).toBe(1);
    if (articles.length > 0) {
      expect(hero).toMatch(linkTo("#articles", t.hero.articles));
    } else {
      // No published article: never promise "Read the articles" over an empty list.
      expect(hero).not.toContain('href="#articles"');
      expect(hero).not.toContain(escapeHtml(t.hero.articles));
      expect(hero).toMatch(linkTo(`${prefix}/contact`, t.articles.emptyAction));
    }
    expect(hero).not.toContain('href="#downloads"');
    expect(hero).not.toContain(escapeHtml(t.latest.eyebrow));
    expect(hero).not.toContain("<img");
    expect(html).not.toContain(`>${common.labels.demo}<`);
    expect(html).not.toContain("/api/result-cards/");
    expectPhotoRules(html, lang, `resources ${lang} production`);
  });
});

describe("/resources/[slug] hero", () => {
  it.each(["true", "false"])(
    "category, title, summary, the enquiry action and the article's own cover (SHOW_PLACEHOLDER_CONTENT=%s)",
    async (placeholders) => {
      vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
      for (const slug of getArticleSlugs()) {
        for (const lang of ["en", "hi"] as const) {
          const article = await getArticle(slug, lang);
          if (!article) {
            // Placeholder articles are hidden in production: the page 404s instead.
            await expect(withTestLang(lang, () => ArticlePage(articleProps(slug, lang)))).rejects.toThrow();
            continue;
          }
          const t = messagesFor(lang, "resources");
          const label = messagesFor(lang, "common").labels.illustrativeStockPhoto;
          const prefix = lang === "hi" ? "/hi" : "";
          const context = `${slug} ${lang} placeholders=${placeholders}`;
          const html = await render(lang, () => ArticlePage(articleProps(slug, lang)));
          const hero = heroOf(html);

          expect(count(html, /<h1[\s>]/g), context).toBe(1);
          expect(hero, context).toContain('data-hero-art="ridges"');
          expect(hero, context).toContain(`>${escapeHtml(t.card.categories[article.category])}<`);
          expect(textOf(/<h1[\s\S]*?<\/h1>/.exec(hero)![0]).trim(), context).toBe(textOf(escapeHtml(article.title)).trim());
          expect(hero, context).toContain(escapeHtml(article.summary));
          expect(hero, context).toMatch(linkTo(`${prefix}/admissions#enquiry`, t.article.enquire));
          expect(hero, context).toContain(`href="${prefix}/resources"`);

          // One hero photo: the article's cover (else the neutral fallback), labelled and preloaded.
          const cover = article.coverImage ?? localizeImage(stockImages[ARTICLE_FALLBACK_COVER], lang);
          expect(imagePaths(hero), context).toEqual([cover.src]);
          expect(hero, context).toContain(`alt="${escapeHtml(cover.alt)}"`);
          if (lang === "hi") expect(cover.alt, context).toMatch(/[ऀ-ॿ]{3,}/);
          expect(count(hero, `>${escapeHtml(label)}<`), context).toBe(1);
          expect(hero, context).toMatch(/fetchPriority="high"/i);
          // The sticky column keeps two pool photos beside the text; nothing repeats on the page.
          const pool: string[] = ARTICLE_STICKY_POOL.map((key) => stockImages[key].src);
          expect(imagePaths(html).filter((src) => pool.includes(src)).length, context).toBe(2);
          expect(html, context).not.toContain("/api/result-cards/");
          expectPhotoRules(html, lang, context);
        }
      }
    },
    120_000,
  );
});

describe("articlePagePhotos", () => {
  const base = (over: Partial<Article>): Article => ({
    id: "a",
    slug: "a",
    title: "A",
    summary: "S",
    body: ["B"],
    category: "study-guidance",
    publishedAt: "2026-10-18",
    status: "published",
    ...over,
  });
  const categories: ArticleCategory[] = ["study-guidance", "exam-updates", "news", "admissions"];
  const usable = (Object.keys(stockImages) as StockImageKey[]).filter((key) => !LANDSCAPE_SRCS.has(stockImages[key].src));

  it("keeps the cover for the hero and two other photos for the sticky column, even beside 3 related covers", () => {
    for (const category of categories) {
      for (const coverKey of [undefined, ...usable]) {
        // Worst case: related covers that are the sticky column's first choices.
        const [p1, p2, p3] = ARTICLE_STICKY_POOL;
        const related = [p1, p2, p3].map((key, i) => base({ id: `r${i}`, coverImage: stockImages[key] }));
        const article = base({ category, coverImage: coverKey ? stockImages[coverKey] : undefined });
        const { cover, sticky } = articlePagePhotos({ article, related, locale: "en" });
        const context = `${category} / ${coverKey ?? "no cover"}`;
        const relatedSrcs = related.map((item) => item.coverImage!.src);

        expect(cover.src, context).toBe(stockImages[coverKey ?? ARTICLE_FALLBACK_COVER].src);
        expect(sticky.every(Boolean), context).toBe(true);
        const page = [cover.src, ...sticky.map((image) => image.src)];
        expect(new Set(page).size, context).toBe(page.length);
        for (const image of sticky) expect(relatedSrcs, context).not.toContain(image.src);
        for (const src of page) expect(LANDSCAPE_SRCS.has(src), context).toBe(false);
      }
    }
  });

  it("localises the alt text of every photo it adds", () => {
    const { cover, sticky } = articlePagePhotos({ article: base({}), related: [], locale: "hi" });
    expect(cover.src).toBe(stockImages[ARTICLE_FALLBACK_COVER].src);
    for (const image of [cover, ...sticky]) expect(image.alt).toMatch(/[ऀ-ॿ]{3,}/);
  });
});
