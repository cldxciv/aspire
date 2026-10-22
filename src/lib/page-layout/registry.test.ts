import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { isPortalApiPath } from "@/lib/auth/paths";

import { PAGE_LAYOUT_TAG, pageLayoutTag } from "./loader";
import {
  LAYOUT_PAGE_KEYS,
  LAYOUT_PAGES,
  PAGE_LAYOUT_ADMIN_PATH,
  PAGE_LAYOUT_API,
  PAGE_LAYOUT_PREVIEW_EXIT_PATH,
  PAGE_LAYOUT_PREVIEW_PATH,
  SECTION_KEY_PATTERN,
  isHideable,
  isLayoutPageKey,
  movableKeys,
  pageSections,
  pinnedLastKey,
  sectionDef,
} from "./registry";
import { defaultEntries, layoutIssues } from "./resolve";

const LOCALES = ["en", "hi"] as const;

/** "a.b.c" → value for every leaf. */
function leaves(value: unknown, prefix = ""): Map<string, unknown> {
  const out = new Map<string, unknown>();
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, leaf] of leaves(child, prefix ? `${prefix}.${key}` : key)) out.set(path, leaf);
    }
  } else {
    out.set(prefix, value);
  }
  return out;
}

describe("page layout registry", () => {
  it("lists the 10 pages, in the same order as LAYOUT_PAGES", () => {
    expect([...LAYOUT_PAGE_KEYS]).toEqual(Object.keys(LAYOUT_PAGES));
    expect(LAYOUT_PAGE_KEYS).toHaveLength(10);
    expect(isLayoutPageKey("home")).toBe(true);
    expect(isLayoutPageKey("tools")).toBe(true);
    expect(isLayoutPageKey("programs/jee")).toBe(false);
    expect(isLayoutPageKey(undefined)).toBe(false);
    expect(isLayoutPageKey("constructor")).toBe(false);
  });

  it.each(LAYOUT_PAGE_KEYS)("%s: keys are unique and well formed; hero first, at most one pin last (placed last)", (page) => {
    const sections = pageSections(page);
    const keys = sections.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(SECTION_KEY_PATTERN);

    expect(sections[0]).toMatchObject({ key: "hero", pin: "first" });
    expect(sections.filter((def) => def.pin === "first")).toHaveLength(1);

    const last = sections.filter((def) => def.pin === "last");
    expect(last.length).toBeLessThanOrEqual(1);
    if (last.length === 1) expect(sections.at(-1)).toBe(last[0]);
    expect(pinnedLastKey(page)).toBe(last[0]?.key ?? null);

    expect(movableKeys(page)).toEqual(keys.filter((key) => key !== "hero" && key !== pinnedLastKey(page)));
    expect(movableKeys(page).length).toBeGreaterThan(0);
  });

  it.each(LAYOUT_PAGE_KEYS)("%s: the default order breaks no rule", (page) => {
    expect(layoutIssues(page, defaultEntries(page))).toEqual([]);
  });

  it("knows which sections are hideable", () => {
    expect(isHideable(sectionDef("home", "hero")!)).toBe(false);
    expect(isHideable(sectionDef("home", "cta")!)).toBe(false);
    expect(isHideable(sectionDef("home", "tools")!)).toBe(true);
    expect(isHideable(sectionDef("admissions", "enquiry")!)).toBe(false);
    expect(isHideable(sectionDef("results", "archive")!)).toBe(false);
    expect(isHideable(sectionDef("programs", "directory")!)).toBe(false);
    expect(sectionDef("home", "nope")).toBeUndefined();
    // Admissions and contact have no closing band (D1).
    expect(pinnedLastKey("admissions")).toBeNull();
    expect(pinnedLastKey("contact")).toBeNull();
    expect(pinnedLastKey("tools")).toBe("note");
  });

  it("keeps the homepage's own rules: tools never last, own-background bands", () => {
    expect(sectionDef("home", "tools")?.notLast).toBe(true);
    expect(LAYOUT_PAGE_KEYS.flatMap((page) => pageSections(page).filter((def) => def.notLast))).toHaveLength(1);
    expect(
      pageSections("home")
        .filter((def) => def.background === "own")
        .map((def) => def.key),
    ).toEqual(["stats", "centres", "cta"]);
  });

  it.each(LOCALES)("%s: every section has a label; conditional sections (only) have a hint; keep reasons exist", (locale) => {
    const t = messagesFor(locale, "layout");
    expect(Object.keys(t.pages)).toEqual([...LAYOUT_PAGE_KEYS]);
    for (const page of LAYOUT_PAGE_KEYS) {
      const messages = t.pages[page].sections as Record<string, { label: string; hint?: string }>;
      expect(Object.keys(messages), page).toEqual(pageSections(page).map((def) => def.key));
      expect(t.pages[page].name.trim(), page).not.toBe("");
      for (const def of pageSections(page)) {
        const entry = messages[def.key];
        expect(entry?.label.trim(), `${page}.${def.key}`).toBeTruthy();
        if (def.conditional) expect(entry?.hint?.trim(), `${page}.${def.key} hint`).toMatch(/[.।]$/);
        else expect(entry?.hint, `${page}.${def.key} has no hint`).toBeUndefined();
        if (def.keep) expect(t.keep[def.keep].trim(), `${page}.${def.key} keep`).not.toBe("");
      }
    }
    expect(t.pages.hostels.note.trim()).not.toBe("");
  });

  it("layout messages: Hindi has exactly the English keys, non-empty, with the same placeholders", () => {
    const en = leaves(messagesFor("en", "layout"));
    const hi = leaves(messagesFor("hi", "layout"));
    expect([...hi.keys()].sort()).toEqual([...en.keys()].sort());
    const placeholders = (text: unknown) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const [key, value] of hi) {
      expect(typeof value, key).toBe("string");
      expect((value as string).trim(), key).not.toBe("");
      expect(placeholders(value), key).toEqual(placeholders(en.get(key)));
    }
  });

  it("Hindi sentences that agree with a section quote it and agree with “सेक्शन” (plan §11)", () => {
    const t = messagesFor("hi", "layout");
    for (const text of [
      t.reasons.notLast,
      t.announce.moved,
      t.announce.hidden,
      t.announce.shown,
      t.history.moved,
      t.history.hid,
      t.history.showed,
    ]) {
      expect(text).toContain("“{section}” सेक्शन");
    }
    expect(t.history.someone).toBe("किसी व्यक्ति");
  });

  it("tags fit Next's 256-character limit", () => {
    expect(PAGE_LAYOUT_TAG.length).toBeLessThanOrEqual(256);
    for (const page of LAYOUT_PAGE_KEYS) {
      expect(pageLayoutTag(page)).toBe(`page-layout:${page}`);
      expect(pageLayoutTag(page).length).toBeLessThanOrEqual(256);
    }
  });

  it("paths are absolute; the exit route is outside the portal API (D6)", () => {
    for (const page of LAYOUT_PAGE_KEYS) expect(LAYOUT_PAGES[page].path).toMatch(/^\//);
    for (const path of [PAGE_LAYOUT_ADMIN_PATH, PAGE_LAYOUT_API, PAGE_LAYOUT_PREVIEW_PATH, PAGE_LAYOUT_PREVIEW_EXIT_PATH]) {
      expect(path).toMatch(/^\//);
    }
    expect(isPortalApiPath(PAGE_LAYOUT_API)).toBe(true);
    expect(isPortalApiPath(PAGE_LAYOUT_PREVIEW_PATH)).toBe(true);
    expect(isPortalApiPath(PAGE_LAYOUT_PREVIEW_EXIT_PATH)).toBe(false);
    expect(new Set(LAYOUT_PAGE_KEYS.map((page) => LAYOUT_PAGES[page].path)).size).toBe(10);
  });
});
