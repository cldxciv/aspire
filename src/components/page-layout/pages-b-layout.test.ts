import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContactPage from "@/app/[lang]/(site)/contact/page";
import HostelsPage from "@/app/[lang]/(site)/hostels/page";
import ResourcesPage from "@/app/[lang]/(site)/resources/page";
import ToolsPage from "@/app/[lang]/(site)/tools/page";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import type { LayoutPageKey } from "@/lib/page-layout/registry";
import { applyLayoutAction, revisionOf } from "@/lib/page-layout/store";
import type { StoredEntry } from "@/lib/page-layout/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * Hostels, resources, contact and tools under the page layout (docs/page-layout-plan.md §12.4).
 * At the default layout each page keeps today's section order and white / surface tones in both
 * content modes; a published layout reorders and hides sections while the tones keep alternating;
 * sections that can't be hidden render even when a stored row says hidden; photo sides follow the
 * tone on contact and tools and stay fixed on hostels and resources (D8); without hostel details
 * the hostels page ignores the layout; the /tools hero card follows the layout, hidden tools
 * included (D10).
 */

// Whole pages render here (both locales and modes): allow for a loaded full run.
vi.setConfig({ testTimeout: 60_000 });

type PageName = "hostels" | "resources" | "contact" | "tools";
type Mode = "demo" | "prod";

const PAGES: Record<PageName, () => Promise<unknown>> = {
  hostels: HostelsPage,
  resources: ResourcesPage,
  contact: ContactPage,
  tools: ToolsPage,
};

/** Each page has at most one section without an id or aria-labelledby: it is named here. */
const UNLABELLED: Record<PageName, string> = { hostels: "?", resources: "?", contact: "details", tools: "note" };

const LOCALES = ["en", "hi"] as const;

async function render(page: PageName, locale: Locale, mode: Mode): Promise<string> {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", mode === "demo" ? "true" : "false");
  return withTestLang(locale, async () =>
    renderToStaticMarkup(
      createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, (await PAGES[page]()) as ReactNode),
    ),
  );
}

/** Top-level `<section>`s in document order with their own markup (none of these pages nests sections). */
function chunks(html: string, page: PageName): { label: string; tag: string; body: string }[] {
  const starts = [...html.matchAll(/<section\b[^>]*>/g)];
  return starts.map((match, i) => {
    const tag = match[0];
    const label = tag.match(/aria-labelledby="([^"]+)"/)?.[1] ?? tag.match(/\bid="([^"]+)"/)?.[1] ?? UNLABELLED[page];
    return { label, tag, body: html.slice(match.index, starts[i + 1]?.index ?? html.length) };
  });
}

/** "label:white|surface" per top-level section, in order. */
function sections(html: string, page: PageName): string[] {
  return chunks(html, page).map(({ label, tag }) => {
    const tone = /\bbg-white\b/.test(tag) ? "white" : /\bbg-surface\b/.test(tag) ? "surface" : "other";
    return `${label}:${tone}`;
  });
}

/** The photo side of a section's first media split (`order-1` = photo first = left). */
function sideOf(html: string, page: PageName, label: string): "left" | "right" | null {
  const chunk = chunks(html, page).find((c) => c.label === label);
  expect(chunk, label).toBeDefined();
  const figure = chunk!.body.match(/<figure\b[^>]*class="([^"]*)"/)?.[1] ?? "";
  const order = figure.match(/\b(?:md|lg):order-([12])\b/)?.[1];
  return order === "1" ? "left" : order === "2" ? "right" : null;
}

/** The /tools hero card's links: [href, label] in order. */
function heroCardLinks(html: string): string[] {
  const at = html.indexOf('data-hero="rich"');
  expect(at).toBeGreaterThan(-1);
  const start = html.lastIndexOf("<", at);
  const hero = html.slice(start, html.indexOf("<section", start));
  return [...hero.matchAll(/<li class="border-t[^"]*"><a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
}

const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

/** Saves a draft and publishes it, as the editor does (`actorId: null`: no account needed). */
function publish(page: LayoutPageKey, list: StoredEntry[]) {
  const db = getDb();
  const saved = applyLayoutAction(db, {
    page,
    action: "save_draft",
    revision: revisionOf(db, page),
    entries: list,
    actorId: null,
    now: Date.now(),
  });
  expect(saved).toMatchObject({ ok: true });
  const published = applyLayoutAction(db, {
    page,
    action: "publish",
    revision: revisionOf(db, page),
    actorId: null,
    now: Date.now(),
  });
  expect(published).toMatchObject({ ok: true });
}

/** Writes a published row directly, bypassing validation (e.g. a stored row from an older registry). */
function storeRaw(page: LayoutPageKey, list: StoredEntry[]) {
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

describe("hostels", () => {
  const DEMO_DEFAULT = [
    "hostels-intro-title:white",
    "hostels-campus-title:surface",
    "hostels-care-title:white",
    "hostels-rooms-title:surface",
    "hostels-day-title:white",
    "hostels-cta-title:surface",
  ];

  it.each(LOCALES)("%s, demo mode: today's order, tones and anchors", async (locale) => {
    const html = await render("hostels", locale, "demo");
    expect(sections(html, "hostels")).toEqual(DEMO_DEFAULT);
    expect(html).toContain('id="hostels-by-campus"');
    expect(html).toMatch(/\bid="hostel-[a-z0-9-]+"/);
    // Photo sides as before: intro right, care left.
    expect(sideOf(html, "hostels", "hostels-intro-title")).toBe("right");
    expect(sideOf(html, "hostels", "hostels-care-title")).toBe("left");
    // No preview banner for visitors.
    expect(html).not.toContain("page-layout-preview-title");
  });

  it.each(LOCALES)("%s, production mode (no hostel details): the empty section only", async (locale) => {
    expect(sections(await render("hostels", locale, "prod"), "hostels")).toEqual(["hostels-empty-title:white"]);
  });

  it("a published layout reorders and hides; tones alternate, photo sides stay fixed, the closing band stays last", async () => {
    publish("hostels", entries("care", "intro", "campuses", "-rooms", "day"));
    const html = await render("hostels", "en", "demo");
    expect(sections(html, "hostels")).toEqual([
      "hostels-care-title:white",
      "hostels-intro-title:surface",
      "hostels-campus-title:white",
      "hostels-day-title:surface",
      "hostels-cta-title:white",
    ]);
    expect(html).not.toContain('id="hostels-rooms-title"');
    expect(sideOf(html, "hostels", "hostels-care-title")).toBe("left");
    expect(sideOf(html, "hostels", "hostels-intro-title")).toBe("right");
  });

  it("sections that can't be hidden render even when a stored row says hidden", async () => {
    // The move proves the stored row is read; intro and campuses still render.
    storeRaw("hostels", entries("care", "-intro", "-campuses", "rooms", "day"));
    expect(sections(await render("hostels", "hi", "demo"), "hostels")).toEqual([
      "hostels-care-title:white",
      "hostels-intro-title:surface",
      "hostels-campus-title:white",
      "hostels-rooms-title:surface",
      "hostels-day-title:white",
      "hostels-cta-title:surface",
    ]);
  });

  it.each(LOCALES)("%s: without hostel details a stored layout is ignored", async (locale) => {
    const before = await render("hostels", locale, "prod");
    publish("hostels", entries("care", "intro", "campuses", "-rooms", "day"));
    expect(await render("hostels", locale, "prod")).toBe(before);
  });
});

describe("resources", () => {
  const DEMO_DEFAULT = [
    "resource-types-heading:white",
    "downloads-heading:surface",
    "articles-heading:white",
    "resources-results-heading:surface",
    "resources-cta-heading:white",
  ];

  it.each(LOCALES)("%s, demo mode: today's order, tones and anchors", async (locale) => {
    const html = await render("resources", locale, "demo");
    expect(sections(html, "resources")).toEqual(DEMO_DEFAULT);
    expect(html).toContain('id="downloads"');
    expect(html).toContain('id="articles"');
    expect(sideOf(html, "resources", "resource-types-heading")).toBe("left");
  });

  it.each(LOCALES)("%s, production mode: no downloads section, tones as today", async (locale) => {
    const html = await render("resources", locale, "prod");
    expect(sections(html, "resources")).toEqual([
      "resource-types-heading:white",
      "articles-heading:surface",
      "resources-results-heading:white",
      "resources-cta-heading:surface",
    ]);
    expect(html).not.toContain('id="downloads"');
  });

  describe("with a published layout (articles first, results hidden)", () => {
    const CUSTOM = entries("articles", "downloads", "types", "-results");

    it("demo mode: new order, tones alternate, the photo side stays fixed", async () => {
      publish("resources", CUSTOM);
      const html = await render("resources", "en", "demo");
      expect(sections(html, "resources")).toEqual([
        "articles-heading:white",
        "downloads-heading:surface",
        "resource-types-heading:white",
        "resources-cta-heading:surface",
      ]);
      expect(html).not.toContain('id="resources-results-heading"');
      // Fixed left even on a white band (a position-based side would put it on the right).
      expect(sideOf(html, "resources", "resource-types-heading")).toBe("left");
    });

    it("production mode (Hindi): the empty downloads slot takes no tone", async () => {
      publish("resources", CUSTOM);
      expect(sections(await render("resources", "hi", "prod"), "resources")).toEqual([
        "articles-heading:white",
        "resource-types-heading:surface",
        "resources-cta-heading:white",
      ]);
    });
  });

  it("sections that can't be hidden render even when a stored row says hidden", async () => {
    storeRaw("resources", entries("-articles", "types", "-downloads", "results"));
    expect(sections(await render("resources", "en", "demo"), "resources")).toEqual([
      "articles-heading:white",
      "resource-types-heading:surface",
      "downloads-heading:white",
      "resources-results-heading:surface",
      "resources-cta-heading:white",
    ]);
  });
});

describe("contact", () => {
  const DEMO_DEFAULT = ["contact-form:white", "details:surface", "contact-help-heading:white", "campus-desks-heading:surface"];

  it.each(LOCALES)("%s, demo mode: today's order, tones and photo sides", async (locale) => {
    const html = await render("contact", locale, "demo");
    expect(sections(html, "contact")).toEqual(DEMO_DEFAULT);
    expect(sideOf(html, "contact", "contact-form")).toBe("right");
    expect(sideOf(html, "contact", "details")).toBe("left");
  });

  it.each(LOCALES)("%s, production mode: no campus desks, tones as today", async (locale) => {
    expect(sections(await render("contact", locale, "prod"), "contact")).toEqual([
      "contact-form:white",
      "details:surface",
      "contact-help-heading:white",
    ]);
  });

  describe("with a published layout (details first, help hidden)", () => {
    const CUSTOM = entries("details", "form", "-help", "desks");

    it("demo mode: new order, tones alternate and the photos switch sides with the tone", async () => {
      publish("contact", CUSTOM);
      const html = await render("contact", "en", "demo");
      expect(sections(html, "contact")).toEqual(["details:white", "contact-form:surface", "campus-desks-heading:white"]);
      expect(html).not.toContain('id="contact-help-heading"');
      expect(sideOf(html, "contact", "details")).toBe("right");
      expect(sideOf(html, "contact", "contact-form")).toBe("left");
    });

    it("production mode (Hindi)", async () => {
      publish("contact", CUSTOM);
      expect(sections(await render("contact", "hi", "prod"), "contact")).toEqual(["details:white", "contact-form:surface"]);
    });
  });

  it("the enquiry form renders even when a stored row says hidden", async () => {
    storeRaw("contact", entries("details", "-form", "help", "desks"));
    expect(sections(await render("contact", "en", "demo"), "contact")).toEqual([
      "details:white",
      "contact-form:surface",
      "contact-help-heading:white",
      "campus-desks-heading:surface",
    ]);
  });
});

describe("tools", () => {
  const DEFAULT = [
    "rancho-app-card:white",
    "tool-predictor:white",
    "tool-mockTests:surface",
    "tool-ask:white",
    "tool-planner:surface",
    "note:white",
  ];
  const HREFS = { predictor: "/tools/predictor", mockTests: "/tools/mock-tests", ask: "/tools/ask", planner: "/tools/planner" };

  describe.each(["demo", "prod"] as const)("%s mode, default layout", (mode) => {
    it.each(LOCALES)("%s: today's order, tones, photo sides and hero card", async (locale) => {
      const html = await render("tools", locale, mode);
      expect(sections(html, "tools")).toEqual(DEFAULT);
      expect(sideOf(html, "tools", "tool-predictor")).toBe("right");
      expect(sideOf(html, "tools", "tool-mockTests")).toBe("left");
      expect(sideOf(html, "tools", "tool-ask")).toBe("right");
      expect(sideOf(html, "tools", "tool-planner")).toBe("left");
      const prefix = locale === "hi" ? "/hi" : "";
      expect(heroCardLinks(html)).toEqual(
        [HREFS.predictor, HREFS.mockTests, HREFS.ask, HREFS.planner].map((href) => `${prefix}${href}`),
      );
    });
  });

  it("a published layout reorders the sections and the hero card; a hidden tool stays in the card", async () => {
    publish("tools", entries("rancho", "planner", "-mockTests", "predictor", "ask"));
    const html = await render("tools", "hi", "demo");
    expect(sections(html, "tools")).toEqual([
      "rancho-app-card:white",
      "tool-planner:white",
      "tool-predictor:surface",
      "tool-ask:white",
      "note:surface",
    ]);
    expect(html).not.toContain('id="tool-mockTests"');
    expect(sideOf(html, "tools", "tool-planner")).toBe("right");
    expect(sideOf(html, "tools", "tool-predictor")).toBe("left");
    expect(sideOf(html, "tools", "tool-ask")).toBe("right");
    // The card follows the layout, the hidden mock tests included (their page still exists, D10).
    expect(heroCardLinks(html)).toEqual(
      [HREFS.planner, HREFS.mockTests, HREFS.predictor, HREFS.ask].map((href) => `/hi${href}`),
    );
    const t = messagesFor("hi", "tools");
    expect(html).toContain(t.items.mockTests.title);
  });

  it("the Rancho app card keeps its own white band and restarts the rhythm after it", async () => {
    publish("tools", entries("predictor", "rancho", "mockTests", "ask", "planner"));
    expect(sections(await render("tools", "en", "prod"), "tools")).toEqual([
      "tool-predictor:white",
      "rancho-app-card:white",
      "tool-mockTests:white",
      "tool-ask:surface",
      "tool-planner:white",
      "note:surface",
    ]);
  });
});
