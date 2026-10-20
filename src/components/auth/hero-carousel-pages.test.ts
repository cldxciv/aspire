import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "@/app/[lang]/(site)/forgot-password/page";
import LoginPage from "@/app/[lang]/(site)/login/page";
import ToolsPage from "@/app/[lang]/(site)/tools/page";
import { stockImages, type StockImageKey } from "@/content/images";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { localizeImage } from "@/lib/data";
import { setTestLang, withTestLang } from "@/test/root-params-stub";
import { AuthSplit } from "./AuthSplit";

/**
 * Hero carousels on /login, /forgot-password and the /tools hub (en + hi, both content modes):
 * one h1, one named carousel whose slides are labelled stock photos with alt text in the page
 * locale, slide 1 at high fetch priority, no photo twice on a page, no landscapes (D-031), and
 * no person photo beside the login card, which can show a signed-in visitor's real name (D-019).
 */

// The login card reads the session cookie under <Suspense>; the hero does not depend on it.
vi.mock("@/lib/auth/page-session", () => ({ getPageSession: async () => null }));

const LANDSCAPES: StockImageKey[] = [
  "himalayaHero",
  "himalayaBlueRidge",
  "mountainTrail",
  "shimlaPanorama",
  "dhauladharTriund",
  "kulluValley",
  "hamirpurHills",
  "hillRoadBarot",
];

const loginProps = { params: Promise.resolve({ lang: "en" }), searchParams: Promise.resolve({}) } as unknown as PageProps<"/[lang]/login">;

const PAGES: { name: string; render: () => Promise<ReactNode>; hero: StockImageKey[] }[] = [
  {
    name: "login",
    render: () => LoginPage(loginProps),
    hero: ["deskLampEvening", "libraryAisle", "stethoscopeTextbooks", "pocketWatchWorksheet"],
  },
  {
    name: "forgot-password",
    render: () => ForgotPasswordPage(),
    hero: ["mentoringConversation", "signingForm", "studyThroughWindow", "booksAndNotebook"],
  },
  {
    name: "tools",
    render: () => ToolsPage(),
    hero: ["laptopStudy", "studyThroughWindow", "physicsWhiteboard", "mathsNotebook"],
  },
];

function withLocale(locale: Locale, child: ReactNode) {
  return createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child);
}

async function render(lang: Locale, page: () => Promise<ReactNode>): Promise<string> {
  return withTestLang(lang, async () => renderToStaticMarkup(withLocale(lang, await page())));
}

function count(html: string, needle: string | RegExp): number {
  return typeof needle === "string" ? html.split(needle).length - 1 : (html.match(needle) ?? []).length;
}

const fileOf = (key: StockImageKey) => stockImages[key].src.replace("/images/stock/", "");
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

/** The `<img>` of each carousel slide, in order. */
function slideImages(html: string, roleSlide: string): { file: string; alt: string; tag: string }[] {
  return html
    .split(`aria-roledescription="${roleSlide}"`)
    .slice(1)
    .map((chunk) => {
      const tag = /<img\b[^>]*>/.exec(chunk)?.[0] ?? "";
      return { tag, alt: attr(tag, "alt") ?? "", file: /%2Fimages%2Fstock%2F([^"&]+)/.exec(tag)?.[1] ?? "" };
    });
}

/** HTML-escaped the way React escapes attribute values. */
const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
});

describe.each(["true", "false"])("hero carousels (SHOW_PLACEHOLDER_CONTENT=%s)", (placeholders) => {
  it.each(PAGES)("$name: one named carousel of labelled, localised stock slides", async ({ render: page, hero }) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", placeholders);
    for (const lang of ["en", "hi"] as const) {
      const html = await render(lang, page);
      const { carousel, labels } = messagesFor(lang, "common");

      expect(count(html, /<h1[\s>]/g), lang).toBe(1);
      expect(count(html, `aria-roledescription="${carousel.roleCarousel}"`), lang).toBe(1);
      expect(html).toContain(`role="group" aria-roledescription="${carousel.roleCarousel}" aria-label="${carousel.label}"`);

      const slides = slideImages(html, carousel.roleSlide);
      expect(slides.map((s) => s.file), lang).toEqual(hero.map(fileOf));
      expect(slides.map((s) => s.alt), lang).toEqual(hero.map((key) => escapeAttr(localizeImage(stockImages[key], lang).alt)));
      if (lang === "hi") for (const s of slides) expect(s.alt).toMatch(/[ऀ-ॿ]{3,}/);
      // Slide 1 is the LCP candidate; the rest load lazily.
      expect(slides[0].tag).toMatch(/fetchPriority="high"/i);
      for (const s of slides.slice(1)) expect(s.tag).toContain('loading="lazy"');

      // Every stock photo on the page carries the visible label, and none appears twice.
      const files = [...html.matchAll(/<img[^>]*src="[^"]*%2Fimages%2Fstock%2F([^"&]+)/g)].map((m) => m[1]);
      expect(files.length, lang).toBeGreaterThan(hero.length);
      expect(count(html, `>${labels.illustrativeStockPhoto}<`), lang).toBe(files.length);
      expect(new Set(files).size, `${lang}: ${files.join(", ")}`).toBe(files.length);
      for (const key of LANDSCAPES) expect(files, key).not.toContain(fileOf(key));

      if (lang === "hi") {
        for (const english of ["Illustrative stock photo", "Photo gallery", 'aria-roledescription="carousel"', 'aria-roledescription="slide"']) {
          expect(html, english).not.toContain(english.startsWith("aria") ? english : `>${english}<`);
        }
      }
    }
  });
});

describe("login hero", () => {
  it("shows no people beside the card that can carry a signed-in name", () => {
    for (const key of PAGES[0].hero) {
      expect(stockImages[key].alt, key).not.toMatch(/\b(person|people|persons|student|students|hands?|girl|boy|teacher|man|woman|someone)\b/i);
    }
  });

  it("keeps the safety note under the carousel, never over its controls", async () => {
    const html = await render("en", PAGES[0].render);
    const t = messagesFor("en", "auth");
    const carouselAt = html.indexOf('aria-roledescription="carousel"');
    const noteAt = html.indexOf(t.login.safety.title);
    expect(carouselAt).toBeGreaterThan(-1);
    expect(noteAt).toBeGreaterThan(carouselAt);
    // The first dark surface after the carousel is the note box.
    const noteBox = /<div data-surface="dark" class="([^"]*)"/.exec(html.slice(carouselAt))?.[1] ?? "";
    expect(noteBox).toContain("bg-navy");
    expect(noteBox).not.toMatch(/\babsolute\b/);
  });
});

describe("AuthSplit", () => {
  it("still renders a single labelled photo without carousel controls", () => {
    const image = localizeImage(stockImages.deskLampEvening, "hi");
    const html = renderToStaticMarkup(
      createElement(
        AuthSplit,
        // `children` is the third argument; the cast only satisfies the required prop's type.
        { title: "शीर्षक", image, imageLabel: "उदाहरण के लिए स्टॉक फ़ोटो" } as ComponentProps<typeof AuthSplit>,
        createElement("p", null, "card"),
      ),
    );
    expect(count(html, /<h1[\s>]/g)).toBe(1);
    expect(html).toContain(`alt="${image.alt}"`);
    expect(html).toContain(">उदाहरण के लिए स्टॉक फ़ोटो<");
    expect(html).not.toContain("aria-roledescription");
    expect(html).toMatch(/fetchPriority="high"/i);
  });
});
