import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/[lang]/(site)/page";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { applyLayoutAction, revisionOf } from "@/lib/page-layout/store";
import type { StoredEntry } from "@/lib/page-layout/types";
import { withTestLang } from "@/test/root-params-stub";

/**
 * The homepage under the page layout (docs/page-layout-plan.md §12.1): at the default layout the
 * section order and white / surface tones are exactly today's; a published layout reorders and
 * hides sections while the tones keep alternating and the closing band stays last.
 */

// Whole pages render here (both locales and modes): allow for a loaded full run.
vi.setConfig({ testTimeout: 60_000 });

/** Sections that bring their own background (no white / surface tone of their own). */
const OWN = new Set(["home-hero-title", "home-stats-title", "home-centres-title", "home-cta-title"]);

/** Top-level sections in document order: "label" or "label:white|surface" for toned ones. */
function sections(html: string): string[] {
  return [...html.matchAll(/<section\b[^>]*>/g)].map(([tag]) => {
    const label = tag.match(/aria-labelledby="([^"]+)"/)?.[1] ?? tag.match(/\bid="([^"]+)"/)?.[1] ?? "?";
    if (OWN.has(label)) return label;
    const tone = /\bbg-white\b/.test(tag) ? "white" : /\bbg-surface\b/.test(tag) ? "surface" : "other";
    return `${label}:${tone}`;
  });
}

async function renderHome(locale: "en" | "hi", mode: "demo" | "prod"): Promise<string> {
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", mode === "demo" ? "true" : "false");
  return withTestLang(locale, async () => renderToStaticMarkup(await HomePage()));
}

function publish(sectionsInOrder: StoredEntry[]) {
  const db = getDb();
  const saved = applyLayoutAction(db, {
    page: "home",
    action: "save_draft",
    revision: revisionOf(db, "home"),
    entries: sectionsInOrder,
    actorId: null,
    now: Date.now(),
  });
  expect(saved.ok).toBe(true);
  const published = applyLayoutAction(db, {
    page: "home",
    action: "publish",
    revision: revisionOf(db, "home"),
    actorId: null,
    now: Date.now(),
  });
  expect(published.ok).toBe(true);
}

const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

beforeEach(() => {
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("homepage at the default layout", () => {
  it.each(["en", "hi"] as const)("%s, demo mode: today's order and tones", async (locale) => {
    expect(sections(await renderHome(locale, "demo"))).toEqual([
      "home-hero-title",
      "home-stats-title",
      "home-results-title:white",
      "home-programs-title:surface",
      "home-tools-title:white",
      "home-approach-title:surface",
      "home-centres-title",
      "home-life-title:white",
      "home-voices-title:surface",
      "home-impact-title:white",
      "home-resources-title:surface",
      "home-cta-title",
    ]);
  });

  it.each(["en", "hi"] as const)("%s, production mode: today's order and tones", async (locale) => {
    const html = await renderHome(locale, "prod");
    expect(sections(html)).toEqual([
      "home-hero-title",
      "home-results-title:white",
      "home-programs-title:surface",
      "home-tools-title:white",
      "home-approach-title:surface",
      "home-life-title:white",
      "home-cta-title",
    ]);
    // No preview banner for visitors.
    expect(html).not.toContain("page-layout-preview-title");
  });
});

describe("homepage with a published custom layout", () => {
  // Programs before results, "why" hidden, tools moved below the centres (still above student life).
  const CUSTOM = entries("stats", "programs", "results", "-why", "centres", "tools", "life", "voices", "impact", "resources");

  it("demo mode: new order, hidden section absent, tones alternate, closing band last", async () => {
    publish(CUSTOM);
    const html = await renderHome("en", "demo");
    expect(sections(html)).toEqual([
      "home-hero-title",
      "home-stats-title",
      "home-programs-title:white",
      "home-results-title:surface",
      "home-centres-title",
      "home-tools-title:white",
      "home-life-title:surface",
      "home-voices-title:white",
      "home-impact-title:surface",
      "home-resources-title:white",
      "home-cta-title",
    ]);
    expect(html).not.toContain('aria-labelledby="home-approach-title"');
  });

  it("production mode (Hindi): empty sections still take no tone", async () => {
    publish(CUSTOM);
    expect(sections(await renderHome("hi", "prod"))).toEqual([
      "home-hero-title",
      "home-programs-title:white",
      "home-results-title:surface",
      "home-tools-title:white",
      "home-life-title:surface",
      "home-cta-title",
    ]);
  });
});
