import { afterEach, describe, expect, it, vi } from "vitest";

import { movableKeys } from "./registry";
import {
  defaultEntries,
  defaultPageLayout,
  describeChanges,
  layoutIssues,
  normalizeEntries,
  resolvePageLayout,
  sameOrder,
  validateEntries,
} from "./resolve";
import type { StoredEntry } from "./types";

/** Entries from keys; a leading "-" marks a hidden entry. */
const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

const keysOf = (list: readonly StoredEntry[]) => list.map((entry) => (entry.hidden ? `-${entry.key}` : entry.key));

const HOME = ["stats", "results", "programs", "tools", "why", "centres", "life", "voices", "impact", "resources"];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeEntries", () => {
  it("null gives the default order, all visible", () => {
    expect(keysOf(normalizeEntries("home", null))).toEqual(HOME);
    expect(normalizeEntries("home", null)).toEqual(defaultEntries("home"));
    expect(keysOf(normalizeEntries("contact", undefined))).toEqual(["form", "details", "help", "desks"]);
  });

  it("drops unknown keys, pinned keys and repeats (the first occurrence wins)", () => {
    const stored = entries("hero", "results", "nope", "stats", "-results", "cta", ...HOME);
    expect(keysOf(normalizeEntries("home", stored))).toEqual([
      "results",
      "stats",
      "programs",
      "tools",
      "why",
      "centres",
      "life",
      "voices",
      "impact",
      "resources",
    ]);
  });

  it("skips malformed items without throwing", () => {
    const stored = [null, { key: 5 }, { key: "why", hidden: "yes" }] as unknown as StoredEntry[];
    const out = normalizeEntries("home", stored);
    expect(out.find((entry) => entry.key === "why")).toEqual({ key: "why", hidden: false });
    expect(out).toHaveLength(HOME.length);
  });

  it("inserts a missing key after its nearest preceding default sibling", () => {
    // Stored before `voices` existed: it goes back right after `life`.
    const withoutVoices = HOME.filter((key) => key !== "voices");
    const moved = ["life", ...withoutVoices.filter((key) => key !== "life")];
    expect(keysOf(normalizeEntries("home", entries(...moved)))).toEqual([
      "life",
      "voices",
      "stats",
      "results",
      "programs",
      "tools",
      "why",
      "centres",
      "impact",
      "resources",
    ]);
  });

  it("keeps consecutive missing keys in their default order; a missing first key goes first", () => {
    const stored = entries("resources", "results", "programs", "tools", "why", "centres", "life");
    expect(keysOf(normalizeEntries("home", stored))).toEqual([
      "stats",
      "resources",
      "results",
      "programs",
      "tools",
      "why",
      "centres",
      "life",
      "voices",
      "impact",
    ]);
  });

  it("forces non-hideable sections visible", () => {
    const stored = entries("-enquiry", "-next", "-results", "scholarships", "downloads", "-faqs");
    expect(keysOf(normalizeEntries("admissions", stored))).toEqual([
      "enquiry",
      "next",
      "-results",
      "scholarships",
      "downloads",
      "faqs",
    ]);
  });
});

describe("layoutIssues", () => {
  it("not_last: tools last among the visible sections on home", () => {
    const list = entries("stats", "results", "programs", "why", "centres", "life", "-voices", "-impact", "-resources", "tools");
    expect(layoutIssues("home", list)).toEqual([{ code: "not_last", key: "tools" }]);
    const hiddenAfter = entries("stats", "results", "programs", "tools", "-why", "centres", "-life", "voices", "impact", "resources");
    expect(layoutIssues("home", hiddenAfter)).toEqual([{ code: "not_last", key: "tools" }]);
  });

  it("not_last: tools followed only by conditional sections", () => {
    const list = entries("stats", "results", "programs", "why", "centres", "life", "tools", "voices", "impact", "resources");
    expect(layoutIssues("home", list)).toEqual([{ code: "not_last", key: "tools" }]);
  });

  it("a hidden tools section can't break not_last", () => {
    const list = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "-tools");
    expect(layoutIssues("home", list)).toEqual([]);
  });

  it("none_visible when only conditional sections are visible (D13)", () => {
    const list = entries("stats", "-results", "-programs", "-tools", "-why", "centres", "-life", "voices", "impact", "resources");
    expect(layoutIssues("home", list)).toEqual([{ code: "none_visible" }]);
  });
});

describe("validateEntries", () => {
  it("reports duplicates and non-hideable hides on the submitted list", () => {
    const result = validateEntries("admissions", entries("-enquiry", "next", "results", "results", "faqs", "results"));
    expect(result).toEqual({ ok: false, issues: ["cannot_hide:enquiry", "duplicate:results"] });
  });

  it("adds the rule codes found on the normalised list", () => {
    const tail = validateEntries("home", entries("stats", "results", "programs", "why", "centres", "life", "tools", "voices", "impact", "resources"));
    expect(tail).toEqual({ ok: false, issues: ["not_last:tools"] });
    const empty = validateEntries("home", entries("-results", "-programs", "-tools", "-why", "-life"));
    expect(empty).toEqual({ ok: false, issues: ["none_visible"] });
  });

  it("ignores unknown, pinned and missing keys", () => {
    const result = validateEntries("home", entries("nope", "-hero", "-cta", "programs", "results"));
    expect(result.ok).toBe(true);
    // Each missing key follows its default-order predecessor: tools … resources come after programs.
    if (result.ok) {
      expect(keysOf(result.entries)).toEqual([
        "stats",
        "programs",
        "tools",
        "why",
        "centres",
        "life",
        "voices",
        "impact",
        "resources",
        "results",
      ]);
    }
  });

  it("accepts a valid move plus hide", () => {
    const result = validateEntries("home", entries("stats", "programs", "results", "-why", "centres", "tools", "life", "voices", "impact", "resources"));
    expect(result.ok).toBe(true);
  });
});

describe("resolvePageLayout", () => {
  it("order = the visible movable keys, then the pinned-last key", () => {
    const layout = resolvePageLayout("home", entries("results", "-stats", "programs"), { source: "published" });
    expect(layout.order).toEqual(["results", "programs", "tools", "why", "centres", "life", "voices", "impact", "resources", "cta"]);
    expect(layout.entries[1]).toEqual({ key: "stats", hidden: true });
    expect(layout.source).toBe("published");
    expect(layout.preview).toBeNull();
  });

  it("a page without a pinned-last section ends with its last visible section", () => {
    const layout = resolvePageLayout("contact", entries("help", "form", "-details", "desks"), {
      source: "draft",
      preview: { hasDraft: true },
    });
    expect(layout.order).toEqual(["help", "form", "desks"]);
    expect(layout.preview).toEqual({ hasDraft: true });
  });

  it("defaultPageLayout is the registry order", () => {
    const layout = defaultPageLayout("tools");
    expect(layout).toEqual({
      page: "tools",
      entries: defaultEntries("tools"),
      order: [...movableKeys("tools"), "note"],
      source: "default",
      preview: null,
    });
  });

  it("a stored layout that breaks a rule falls back to the default, and logs it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stored = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "tools");
    const layout = resolvePageLayout("home", stored, { source: "published" });
    expect(layout.entries).toEqual(defaultEntries("home"));
    expect(layout.source).toBe("default");
    expect(warn).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(warn.mock.calls[0][0]));
    expect(line).toMatchObject({ event: "page_layout", action: "resolve", outcome: "fallback" });
  });

  it("a draft that breaks a rule falls back and the preview no longer claims a draft", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const stored = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "tools");
    const layout = resolvePageLayout("home", stored, { source: "draft", preview: { hasDraft: true } });
    expect(layout.entries).toEqual(defaultEntries("home"));
    expect(layout.source).toBe("default");
    expect(layout.preview).toEqual({ hasDraft: false });
  });
});

describe("describeChanges and sameOrder", () => {
  it("a single move is one moved entry; positions count the hero as 1", () => {
    const before = defaultEntries("home");
    const after = entries("stats", "results", "programs", "why", "centres", "tools", "life", "voices", "impact", "resources");
    expect(describeChanges(before, after)).toEqual({
      moved: [{ key: "tools", from: 5, to: 7 }],
      hidden: [],
      shown: [],
    });
  });

  it("reports hidden and shown sections (hidden entries keep their position)", () => {
    const before = entries("stats", "-results", "programs", "tools", "why", "centres", "life", "voices", "impact", "resources");
    const after = entries("stats", "results", "programs", "tools", "-why", "centres", "life", "voices", "impact", "resources");
    expect(describeChanges(before, after)).toEqual({ moved: [], hidden: ["why"], shown: ["results"] });
    expect(describeChanges(before, before)).toEqual({ moved: [], hidden: [], shown: [] });
  });

  it("sameOrder compares keys, order and hidden flags", () => {
    expect(sameOrder(defaultEntries("home"), normalizeEntries("home", null))).toBe(true);
    expect(sameOrder(entries("a", "b"), entries("b", "a"))).toBe(false);
    expect(sameOrder(entries("a", "b"), entries("a", "-b"))).toBe(false);
    expect(sameOrder(entries("a"), entries("a", "b"))).toBe(false);
  });
});
