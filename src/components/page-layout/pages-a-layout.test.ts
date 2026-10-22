import { createElement, type FunctionComponent, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AboutPage from "@/app/[lang]/(site)/about/page";
import AdmissionsPage from "@/app/[lang]/(site)/admissions/page";
import CentresPage from "@/app/[lang]/(site)/centres/page";
import ProgramsPage from "@/app/[lang]/(site)/programs/page";
import ResultsPage from "@/app/[lang]/(site)/results/page";
import { LocaleProvider } from "@/i18n/client";
import { messagesFor } from "@/i18n/messages";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import type { LayoutPageKey } from "@/lib/page-layout/registry";
import { applyLayoutAction, revisionOf } from "@/lib/page-layout/store";
import type { StoredEntry } from "@/lib/page-layout/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * PAGES-A under the page layout (docs/page-layout-plan.md §12.3): about, admissions, programs,
 * results and centres. At the default layout each page keeps today's section order and white /
 * surface tones in both content modes; a published layout moves and hides sections while the tones
 * keep alternating (and, on the D8 pages, the photo sides follow); a `keep` section stored as
 * hidden still renders; on /results the demo / verified notice sits in the first of stories /
 * archive (D9) and the laurel only on a white rankers section.
 */

// Whole pages render here (both locales and modes): allow for a loaded full run.
vi.setConfig({ testTimeout: 60_000 });

type Locale = "en" | "hi";
type Mode = "demo" | "prod";
type PageA = Extract<LayoutPageKey, "about" | "admissions" | "programs" | "results" | "centres">;

const RENDER: Record<PageA, () => Promise<ReactElement>> = {
  about: () => AboutPage(),
  admissions: () => AdmissionsPage(),
  programs: () => ProgramsPage(),
  results: () => ResultsPage(),
  centres: () => CentresPage(),
};

/** Each section's marker in the HTML (its `aria-labelledby`, else `id`) → its layout key. */
const MARKERS: Record<PageA, Record<string, string>> = {
  about: {
    "story-heading": "story",
    "mission-heading": "mission",
    "approach-heading": "approach",
    "values-heading": "values",
    "about-results-heading": "results",
    "journey-heading": "journey",
    "explore-heading": "explore",
    "spaces-heading": "spaces",
    "about-cta-heading": "cta",
  },
  admissions: {
    // The enquiry section has no label of its own: it is the one holding the #enquiry card.
    enquiry: "enquiry",
    "next-steps-heading": "next",
    "admissions-results-heading": "results",
    "scholarships-heading": "scholarships",
    "admission-downloads-heading": "downloads",
    "admissions-faqs-heading": "faqs",
  },
  programs: {
    "programs-title": "directory",
    "programs-tracks-title": "tracks",
    "programs-guide-title": "guide",
    "programs-cta-title": "cta",
  },
  results: {
    "results-stories-title": "stories",
    "results-archive-title": "archive",
    "results-rankers-title": "rankers",
    "results-method-title": "method",
    "results-cta-title": "cta",
  },
  centres: {
    "centre-directory-title": "directory",
    "centre-districts-title": "districts",
    "centres-cta-title": "cta",
  },
};

interface Block {
  key: string;
  tone: "white" | "surface" | "other";
  /** The section's HTML up to the next top-level section (none of these pages nests sections). */
  html: string;
}

/** The page's sections after the hero (heroes are not `<section>`s), in document order. */
function blocks(html: string, page: PageA): Block[] {
  const tags = [...html.matchAll(/<section\b[^>]*>/g)];
  return tags.map((match, i) => {
    const tag = match[0];
    const start = match.index ?? 0;
    const body = html.slice(start, tags[i + 1]?.index ?? html.length);
    const marker =
      tag.match(/aria-labelledby="([^"]+)"/)?.[1] ??
      tag.match(/\bid="([^"]+)"/)?.[1] ??
      (body.includes('id="enquiry"') ? "enquiry" : "?");
    const tone = /\bbg-white\b/.test(tag) ? "white" : /\bbg-surface\b/.test(tag) ? "surface" : "other";
    return { key: MARKERS[page][marker] ?? `?${marker}`, tone, html: body };
  });
}

/** "key:tone" for every section after the hero. */
const sections = (html: string, page: PageA) => blocks(html, page).map(({ key, tone }) => `${key}:${tone}`);

const block = (html: string, page: PageA, key: string) => blocks(html, page).find((b) => b.key === key);

/** renderToStaticMarkup's text escaping. */
const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Photo side of a split (FillMediaSplit figure or StickyMediaLayout column): order 1 = left. */
function photoSide(sectionHtml: string): "left" | "right" | null {
  const order =
    sectionHtml.match(/<figure class="relative m-0 (?:md|lg):order-([12])/)?.[1] ??
    sectionHtml.match(/class="relative max-lg:hidden lg:order-([12])"/)?.[1];
  return order === "1" ? "left" : order === "2" ? "right" : null;
}

/** Tones must alternate white, surface, white… from the first section (no own-background sections here). */
function expectAlternating(html: string, page: PageA) {
  const tones = blocks(html, page).map((b) => b.tone);
  expect(tones).toEqual(tones.map((_, i) => (i % 2 === 0 ? "white" : "surface")));
}

const Provider = LocaleProvider as FunctionComponent<{ locale: Locale; children?: ReactNode }>;

async function render(page: PageA, locale: Locale, mode: Mode): Promise<string> {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", mode === "demo" ? "true" : "false");
  return withTestLang(locale, async () =>
    renderToStaticMarkup(createElement(Provider, { locale }, await RENDER[page]())),
  );
}

/** "-key" = hidden. */
const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

/** Publishes a layout the way the editor does: save a draft, then publish it. */
function publish(page: PageA, list: StoredEntry[]) {
  const db = getDb();
  const saved = applyLayoutAction(db, {
    page,
    action: "save_draft",
    revision: revisionOf(db, page),
    entries: list,
    actorId: null,
    now: Date.now(),
  });
  expect(saved.ok).toBe(true);
  const published = applyLayoutAction(db, {
    page,
    action: "publish",
    revision: revisionOf(db, page),
    actorId: null,
    now: Date.now(),
  });
  expect(published.ok).toBe(true);
}

/** Writes a published row directly, bypassing validation (a layout the API would refuse). */
function storeRaw(page: PageA, list: StoredEntry[]) {
  getDb()
    .prepare(
      "INSERT INTO page_layout_state (page, stage, sections, updated_at, updated_by) VALUES (?, 'published', ?, ?, NULL)",
    )
    .run(page, JSON.stringify(list), Date.now());
}

beforeEach(() => {
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  setTestLang("en");
  resetDatabaseForTests();
});

// ---------------------------------------------------------------------------------------------
// Default layout: today's order and tones, both locales and modes.

const DEFAULTS: Record<PageA, Record<Mode, string[]>> = {
  about: {
    demo: [
      "story:white",
      "mission:surface",
      "approach:white",
      "values:surface",
      "results:white",
      "journey:surface",
      "explore:white",
      "spaces:surface",
      "cta:white",
    ],
    prod: ["story:white", "approach:surface", "values:white", "results:surface", "explore:white", "spaces:surface", "cta:white"],
  },
  admissions: {
    demo: ["enquiry:white", "next:surface", "results:white", "scholarships:surface", "downloads:white", "faqs:surface"],
    prod: ["enquiry:white", "next:surface", "results:white", "faqs:surface"],
  },
  programs: {
    demo: ["directory:white", "tracks:surface", "guide:white", "cta:surface"],
    prod: ["directory:white", "tracks:surface", "guide:white", "cta:surface"],
  },
  results: {
    demo: ["stories:white", "archive:surface", "rankers:white", "method:surface", "cta:white"],
    prod: ["archive:white", "method:surface", "cta:white"],
  },
  centres: {
    demo: ["directory:white", "districts:surface", "cta:white"],
    prod: ["directory:white", "districts:surface", "cta:white"],
  },
};

describe.each(Object.keys(DEFAULTS) as PageA[])("/%s at the default layout", (page) => {
  it.each([
    ["en", "demo"],
    ["en", "prod"],
    ["hi", "demo"],
    ["hi", "prod"],
  ] as const)("%s, %s mode: today's order and tones, no preview banner", async (locale, mode) => {
    const html = await render(page, locale, mode);
    expect(sections(html, page)).toEqual(DEFAULTS[page][mode]);
    expect(html).not.toContain("page-layout-preview-title");
  });
});

describe("photo sides at the default layout (D8: they follow position on about, admissions, results)", () => {
  it("about alternates right / left from the story", async () => {
    const html = await render("about", "en", "demo");
    expect(["story", "mission", "approach", "values"].map((key) => photoSide(block(html, "about", key)!.html))).toEqual([
      "right",
      "left",
      "right",
      "left",
    ]);
  });

  it("admissions: the form's photo on the right, next steps on the left", async () => {
    const html = await render("admissions", "en", "prod");
    expect(photoSide(block(html, "admissions", "enquiry")!.html)).toBe("right");
    expect(photoSide(block(html, "admissions", "next")!.html)).toBe("left");
  });
});

// ---------------------------------------------------------------------------------------------
// A published custom layout: a move plus a hide.

describe("published custom layouts (a move plus a hide)", () => {
  it("/about: results first, learning spaces hidden; tones and photo sides follow position", async () => {
    publish("about", entries("results", "story", "mission", "approach", "values", "journey", "explore", "-spaces"));
    const demo = await render("about", "en", "demo");
    expect(sections(demo, "about")).toEqual([
      "results:white",
      "story:surface",
      "mission:white",
      "approach:surface",
      "values:white",
      "journey:surface",
      "explore:white",
      "cta:surface",
    ]);
    expect(demo).not.toContain('aria-labelledby="spaces-heading"');
    expect(photoSide(block(demo, "about", "story")!.html)).toBe("left");
    expect(photoSide(block(demo, "about", "mission")!.html)).toBe("right");

    const prod = await render("about", "hi", "prod");
    expect(sections(prod, "about")).toEqual([
      "results:white",
      "story:surface",
      "approach:white",
      "values:surface",
      "explore:white",
      "cta:surface",
    ]);
  });

  it("/admissions: FAQs moved up under the form, results hidden; no closing band to pin", async () => {
    publish("admissions", entries("enquiry", "faqs", "next", "-results", "scholarships", "downloads"));
    const demo = await render("admissions", "en", "demo");
    expect(sections(demo, "admissions")).toEqual([
      "enquiry:white",
      "faqs:surface",
      "next:white",
      "scholarships:surface",
      "downloads:white",
    ]);
    expect(demo).not.toContain('aria-labelledby="admissions-results-heading"');
    // Anchors other pages link to are still there.
    expect(demo).toContain('id="enquiry"');
    expect(demo).toContain('id="next-steps"');
    expect(demo).toContain('id="faqs"');
    expect(photoSide(block(demo, "admissions", "next")!.html)).toBe("right");

    const prod = await render("admissions", "hi", "prod");
    expect(sections(prod, "admissions")).toEqual(["enquiry:white", "faqs:surface", "next:white"]);
  });

  it("/programs: the page guide first, tracks hidden; the closing CTA stays last", async () => {
    publish("programs", entries("guide", "directory", "-tracks"));
    for (const [locale, mode] of [
      ["en", "demo"],
      ["hi", "prod"],
    ] as const) {
      const html = await render("programs", locale, mode);
      expect(sections(html, "programs")).toEqual(["guide:white", "directory:surface", "cta:white"]);
      expect(html).not.toContain('aria-labelledby="programs-tracks-title"');
    }
  });

  it("/results: method first, rankers hidden; the notice stays with the stories", async () => {
    publish("results", entries("method", "stories", "archive", "-rankers"));
    const t = messagesFor("en", "results");
    const demo = await render("results", "en", "demo");
    expect(sections(demo, "results")).toEqual(["method:white", "stories:surface", "archive:white", "cta:surface"]);
    expect(demo).not.toContain('aria-labelledby="results-rankers-title"');
    expect(block(demo, "results", "stories")!.html).toContain(esc(t.notices.demoTitle));
    expect(block(demo, "results", "archive")!.html).not.toContain(esc(t.notices.demoTitle));
    expect(photoSide(block(demo, "results", "archive")!.html)).toBe("right");

    const prod = await render("results", "hi", "prod");
    expect(sections(prod, "results")).toEqual(["method:white", "archive:surface", "cta:white"]);
    expectAlternating(prod, "results");
  });

  it("/centres: districts moved above the directory", async () => {
    publish("centres", entries("districts", "directory"));
    const html = await render("centres", "en", "demo");
    expect(sections(html, "centres")).toEqual(["districts:white", "directory:surface", "cta:white"]);
  });

  it("/centres: districts hidden", async () => {
    publish("centres", entries("directory", "-districts"));
    const html = await render("centres", "hi", "prod");
    expect(sections(html, "centres")).toEqual(["directory:white", "cta:surface"]);
    expect(html).not.toContain('aria-labelledby="centre-districts-title"');
  });
});

// ---------------------------------------------------------------------------------------------
// `keep` sections can't be hidden, even by a stored row the API would have refused.

describe("a keep section stored as hidden still renders", () => {
  it.each([
    ["admissions", entries("-enquiry", "-next", "results", "scholarships", "downloads", "-faqs")],
    ["programs", entries("-directory", "tracks", "guide")],
    ["results", entries("stories", "-archive", "rankers", "method")],
    ["centres", entries("-directory", "districts")],
  ] as const)("/%s", async (page, stored) => {
    storeRaw(page, stored);
    const html = await render(page, "en", "demo");
    expect(sections(html, page)).toEqual(DEFAULTS[page].demo);
  });
});

// ---------------------------------------------------------------------------------------------
// /results: the demo / verified notice (D9) and the laurel.

describe("/results notice and laurel", () => {
  it.each(["en", "hi"] as const)("%s: hiding the stories moves the notice into the archive", async (locale) => {
    const t = messagesFor(locale, "results");
    const before = await render("results", locale, "demo");
    expect(block(before, "results", "stories")!.html).toContain(esc(t.notices.demoTitle));
    expect(block(before, "results", "archive")!.html).not.toContain(esc(t.notices.demoTitle));

    publish("results", entries("-stories", "archive", "rankers", "method"));
    const html = await render("results", locale, "demo");
    expect(sections(html, "results")).toEqual(["archive:white", "rankers:surface", "method:white", "cta:surface"]);
    expect(block(html, "results", "archive")!.html).toContain(esc(t.notices.demoTitle));
    expect(html.split(esc(t.notices.demoTitle)).length - 1).toBe(1);
  });

  it("archive above the stories: the notice goes to the archive; the stories lose its top gap; laurel only on white", async () => {
    const t = messagesFor("en", "results");
    const laurel = "laurel-wreath";
    expect(block(await render("results", "en", "demo"), "results", "rankers")!.html).toContain(laurel);

    publish("results", entries("archive", "rankers", "stories", "method"));
    const html = await render("results", "en", "demo");
    expect(sections(html, "results")).toEqual([
      "archive:white",
      "rankers:surface",
      "stories:white",
      "method:surface",
      "cta:white",
    ]);
    const stories = block(html, "results", "stories")!.html;
    expect(block(html, "results", "archive")!.html).toContain(esc(t.notices.demoTitle));
    expect(stories).not.toContain(esc(t.notices.demoTitle));
    expect(stories).not.toContain("mt-12 md:mt-14");
    // The rankers section is now surface: no laurel (it has a white background).
    expect(block(html, "results", "rankers")!.html).not.toContain(laurel);
    expect(html).not.toContain(laurel);
  });
});
