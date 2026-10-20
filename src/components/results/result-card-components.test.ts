import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaSplit } from "@/components/ui";
import { stockImages } from "@/content/images";
import { RESULT_CARD_PATH } from "@/content/results";
import { messagesFor } from "@/i18n/messages";
import { getResultCards } from "@/lib/data";
import { ResultCardMarquee } from "./ResultCardMarquee";
import { ResultCardMosaic } from "./ResultCardMosaic";

afterEach(() => {
  vi.unstubAllEnvs();
});

const preview = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
const production = () => vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");

const count = (html: string, needle: string) => html.split(needle).length - 1;
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");
const en = messagesFor("en", "results").cards;
const hi = messagesFor("hi", "results").cards;

describe("ResultCardMosaic — preview (placeholder content shown)", () => {
  it("renders a labelled list of cards with exam chips, DEMO badges and a See-all tile", async () => {
    preview();
    const html = renderToStaticMarkup(await ResultCardMosaic({ locale: "en", variant: "3x3" }));
    expect(html).toContain(`<ul aria-label="${attr(en.listLabel)}"`);
    expect(count(html, "<li")).toBe(9);
    expect(count(html, `src="${RESULT_CARD_PATH}`)).toBe(8);
    expect(count(html, ">Demo<")).toBe(8);
    expect(count(html, 'loading="lazy"')).toBe(8);
    expect(html).toContain('href="/results"');
    expect(html).toContain(en.seeAll);
    const [first] = await getResultCards({ limit: 1 });
    expect(html).toContain(`alt="${attr(first.photo.alt)}"`);
    expect(html).toContain(`>${first.label}<`);
    // Phones show 2 × 3 cells: cards 6–8 are hidden below `sm`, the See-all tile always shows.
    expect(count(html, "max-sm:hidden")).toBe(3);
  });

  it("supports every variant, fill mode, eager loading, filters and hiding the link", async () => {
    preview();
    const cells = { "2x3": 6, "3x3": 9, "4x2": 8, "4x3": 12, "6x2": 12 } as const;
    for (const [variant, n] of Object.entries(cells)) {
      const html = renderToStaticMarkup(await ResultCardMosaic({ locale: "en", variant: variant as keyof typeof cells }));
      expect(count(html, "<li"), variant).toBe(n);
    }
    const fill = renderToStaticMarkup(await ResultCardMosaic({ locale: "en", variant: "4x3", fill: true, eager: true }));
    expect(fill).toContain("absolute inset-0");
    expect(fill).toContain("grid-cols-4 grid-rows-3");
    expect(fill).not.toContain("max-sm:hidden");
    expect(count(fill, 'loading="eager"')).toBe(11);
    const noLink = renderToStaticMarkup(await ResultCardMosaic({ locale: "en", variant: "2x3", seeAllHref: null, exam: "NEET" }));
    expect(noLink).not.toContain("<a ");
    expect(count(noLink, `src="${RESULT_CARD_PATH}`)).toBe(6);
    expect(count(noLink, ">NEET ")).toBe(6);
    const headed = renderToStaticMarkup(await ResultCardMosaic({ locale: "en", heading: "h2" }));
    expect(headed).toContain(`<h2 class="font-serif text-2xl font-bold text-navy">${en.title}</h2>`);
  });

  it("localises the link, strings and alt text in Hindi", async () => {
    preview();
    const html = renderToStaticMarkup(await ResultCardMosaic({ locale: "hi", variant: "2x3" }));
    expect(html).toContain('href="/hi/results"');
    expect(html).toContain(hi.seeAll);
    expect(html).toContain(`aria-label="${attr(hi.listLabel)}"`);
    expect(html).toContain("का परिणाम कार्ड");
    expect(html).toContain(`>${messagesFor("hi", "common").labels.demo}<`);
  });

  it("drops into MediaSplit's photo box through `media`", async () => {
    preview();
    const media = await ResultCardMosaic({ locale: "en", fill: true, fallbackImage: stockImages.studentsTakingNotes });
    const html = renderToStaticMarkup(
      createElement(
        MediaSplit,
        { image: stockImages.studentsTakingNotes, imageLabel: "Illustrative stock photo", aspect: "1/1", media } as ComponentProps<typeof MediaSplit>,
        "Text",
      ),
    );
    expect(html).toContain(RESULT_CARD_PATH);
    expect(html).not.toContain(stockImages.studentsTakingNotes.src.split("/").pop());
    expect(html).not.toContain("Illustrative stock photo");
  });
});

describe("ResultCardMosaic / ResultCardMarquee — production (no visible cards)", () => {
  it("renders the fallback, the fallback photo or nothing — never a result card", async () => {
    production();
    const fallback = createElement("p", null, "current photo");
    expect(renderToStaticMarkup(await ResultCardMosaic({ locale: "en", fallback }))).toBe("<p>current photo</p>");
    expect(renderToStaticMarkup(await ResultCardMarquee({ locale: "en", fallback }))).toBe("<p>current photo</p>");
    const photo = renderToStaticMarkup(
      await ResultCardMosaic({ locale: "en", fill: true, fallbackImage: stockImages.studentsTakingNotes, fallbackImageLabel: "Illustrative stock photo" }),
    );
    expect(photo).toContain("students-taking-notes-class.jpg");
    expect(photo).toContain("Illustrative stock photo");
    expect(photo).not.toContain(RESULT_CARD_PATH);
    expect(renderToStaticMarkup(await ResultCardMosaic({ locale: "hi", variant: "4x2" }))).toBe("");
    expect(renderToStaticMarkup(await ResultCardMarquee({ locale: "en" }))).toBe("");
  });
});

describe("ResultCardMarquee — preview", () => {
  it("renders one announced list plus a hidden copy, a pause toggle and the See-all link", async () => {
    preview();
    const html = renderToStaticMarkup(await ResultCardMarquee({ locale: "en", limit: 6 }));
    expect(html).toContain(`aria-label="${attr(en.scrollLabel)}"`);
    expect(html).toContain('tabindex="0"');
    expect(count(html, `<ul aria-label="${attr(en.listLabel)}"`)).toBe(1);
    expect(count(html, '<ul aria-hidden="true"')).toBe(1);
    expect(count(html, `src="${RESULT_CARD_PATH}`)).toBe(12);
    expect(count(html, 'alt=""')).toBe(6);
    expect(html).toContain(`aria-label="${attr(en.pauseLabel)}"`);
    expect(en.pauseLabel).toContain(en.pause);
    expect(hi.pauseLabel).toContain(hi.pause);
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toContain("motion-reduce:hidden");
    expect(html).toContain('href="/results"');
  });
});
