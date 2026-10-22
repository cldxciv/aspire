import { describe, expect, it } from "vitest";

import { messagesFor } from "@/i18n/messages";
import { LAYOUT_PAGE_KEYS, movableKeys, type LayoutPageKey } from "@/lib/page-layout/registry";
import { defaultEntries } from "@/lib/page-layout/resolve";
import type { PageLayoutHistoryItem, PageLayoutStateView, StoredEntry } from "@/lib/page-layout/types";

import { layoutFailure } from "./editor-api";
import {
  apiIssueText,
  canReset,
  defaultStateViews,
  historySentence,
  isDirty,
  moveBlock,
  moveEntries,
  movedAnnouncement,
  pickerState,
  reasonText,
  toggleBlock,
  toggleEntries,
  toggledAnnouncement,
  totalRows,
} from "./editor-model";

const en = messagesFor("en", "layout");
const hi = messagesFor("hi", "layout");

const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));
const keysOf = (list: readonly StoredEntry[]) => list.map((entry) => (entry.hidden ? `-${entry.key}` : entry.key));
const indexOf = (list: readonly StoredEntry[], key: string) => list.findIndex((entry) => entry.key === key);

function state(page: LayoutPageKey, patch: Partial<PageLayoutStateView> = {}): PageLayoutStateView {
  return { ...defaultStateViews()[page], ...patch };
}

describe("move and toggle", () => {
  it("swaps with the neighbour and flips hidden, without mutating the input", () => {
    const list = defaultEntries("home");
    const frozen = JSON.stringify(list);
    expect(keysOf(moveEntries(list, indexOf(list, "tools"), "down")).slice(3, 5)).toEqual(["why", "tools"]);
    expect(keysOf(moveEntries(list, indexOf(list, "tools"), "up")).slice(2, 4)).toEqual(["tools", "programs"]);
    expect(keysOf(toggleEntries(list, indexOf(list, "why")))).toContain("-why");
    expect(JSON.stringify(list)).toBe(frozen);
    // Off either end: unchanged copy.
    expect(keysOf(moveEntries(list, 0, "up"))).toEqual(keysOf(list));
  });
});

describe("blocked controls (D14)", () => {
  it("at the top and at the bottom", () => {
    const list = defaultEntries("home");
    expect(moveBlock("home", list, 0, "up")).toEqual({ kind: "atTop" });
    expect(moveBlock("home", list, list.length - 1, "down")).toEqual({ kind: "atBottom" });
    expect(moveBlock("home", list, 0, "down")).toBeNull();
  });

  it("the homepage tools section can never become last among always-shown sections", () => {
    // tools just above life; below life only conditional sections.
    const list = entries("stats", "results", "programs", "why", "centres", "tools", "life", "voices", "impact", "resources");
    expect(moveBlock("home", list, indexOf(list, "tools"), "down")).toEqual({ kind: "notLast", key: "tools" });
    // Moving life above tools is blocked for the same reason.
    expect(moveBlock("home", list, indexOf(list, "life"), "up")).toEqual({ kind: "notLast", key: "tools" });
    // Hiding life would leave tools last too.
    expect(toggleBlock("home", list, indexOf(list, "life"))).toEqual({ kind: "notLast", key: "tools" });
    // Showing a hidden tools section at the bottom is blocked as well.
    const hiddenTools = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "-tools");
    expect(toggleBlock("home", hiddenTools, indexOf(hiddenTools, "tools"))).toEqual({ kind: "notLast", key: "tools" });
  });

  it("hiding the last always-shown section is blocked", () => {
    const list = entries("stats", "-results", "-programs", "-tools", "-why", "centres", "life", "voices", "impact", "resources");
    expect(toggleBlock("home", list, indexOf(list, "life"))).toEqual({ kind: "noneVisible" });
    expect(toggleBlock("home", list, indexOf(list, "why"))).toBeNull(); // showing is fine
  });

  it("a keep section cannot be hidden, with its reason", () => {
    const list = defaultEntries("admissions");
    expect(toggleBlock("admissions", list, indexOf(list, "enquiry"))).toEqual({ kind: "keep", keep: "linked" });
    expect(toggleBlock("results", defaultEntries("results"), indexOf(defaultEntries("results"), "archive"))).toEqual({
      kind: "keep",
      keep: "notice",
    });
    expect(toggleBlock("admissions", list, indexOf(list, "results"))).toBeNull();
  });

  it("reason texts in both languages", () => {
    for (const t of [en, hi]) {
      expect(reasonText(t, "home", { kind: "atTop" })).toBe(t.reasons.atTop);
      expect(reasonText(t, "home", { kind: "notLast", key: "tools" })).toContain(t.pages.home.sections.tools.label);
      expect(reasonText(t, "admissions", { kind: "keep", keep: "linked" })).toBe(t.keep.linked);
      expect(apiIssueText(t, "home", "not_last:tools")).toContain(t.pages.home.sections.tools.label);
      expect(apiIssueText(t, "admissions", "cannot_hide:enquiry")).toBe(t.keep.linked);
      expect(apiIssueText(t, "home", "none_visible")).toBe(t.reasons.noneVisible);
      expect(apiIssueText(t, "home", "no_draft")).toBe(t.errors.noDraft);
      expect(apiIssueText(t, "home", "duplicate:results")).toBe(t.errors.generic);
    }
  });
});

describe("dirty, picker and reset state", () => {
  it("dirty only when local edits differ from the saved order", () => {
    const s = state("home");
    expect(isDirty(s, undefined)).toBe(false);
    expect(isDirty(s, defaultEntries("home"))).toBe(false);
    expect(isDirty(s, toggleEntries(defaultEntries("home"), 1))).toBe(true);
    const withDraft = state("home", { draft: { sections: toggleEntries(defaultEntries("home"), 1), updatedAt: 1, updatedBy: null } });
    expect(isDirty(withDraft, toggleEntries(defaultEntries("home"), 1))).toBe(false);
  });

  it("picker marker priority: unsaved, draft, custom", () => {
    const changed = toggleEntries(defaultEntries("home"), 1);
    const custom = state("home", { published: { sections: changed, custom: true, updatedAt: 1, updatedBy: "Anu" } });
    expect(pickerState(state("home"), undefined)).toBeNull();
    expect(pickerState(custom, undefined)).toBe("custom");
    const drafted = { ...custom, draft: { sections: defaultEntries("home"), updatedAt: 2, updatedBy: null } };
    expect(pickerState(drafted, undefined)).toBe("draft");
    expect(pickerState(drafted, changed)).toBe("unsaved");
    expect(canReset(state("home"))).toBe(false);
    expect(canReset(custom)).toBe(true);
    expect(canReset(state("home", { draft: { sections: changed, updatedAt: 1, updatedBy: null } }))).toBe(true);
  });

  it("defaultStateViews: every page, revision 0, default order, no draft or history", () => {
    const views = defaultStateViews();
    expect(Object.keys(views)).toEqual([...LAYOUT_PAGE_KEYS]);
    for (const page of LAYOUT_PAGE_KEYS) {
      expect(views[page]).toEqual({
        page,
        revision: 0,
        published: { sections: defaultEntries(page), custom: false, updatedAt: null, updatedBy: null },
        draft: null,
        history: [],
      });
    }
  });
});

describe("announcements", () => {
  it("position counts the hero as 1; total counts every row", () => {
    expect(totalRows("home")).toBe(12);
    expect(totalRows("contact")).toBe(movableKeys("contact").length + 1);
    expect(movedAnnouncement(en, "home", "tools", 4)).toBe("Free student tools moved to position 6 of 12.");
    expect(movedAnnouncement(hi, "home", "tools", 4)).toBe("“मुफ़्त विद्यार्थी टूल्स” सेक्शन अब 12 में से स्थान 6 पर है।");
    expect(toggledAnnouncement(en, "home", "why", true)).toBe("Why Aspire will be hidden.");
    expect(toggledAnnouncement(hi, "home", "why", false)).toBe("“Aspire ही क्यों” सेक्शन दिखाया जाएगा।");
  });
});

describe("history sentences", () => {
  const before = defaultEntries("home");
  const after = toggleEntries(moveEntries(before, indexOf(before, "tools"), "down"), indexOf(before, "voices"));
  const item = (patch: Partial<PageLayoutHistoryItem>): PageLayoutHistoryItem => ({
    id: 1,
    action: "publish",
    actor: "Anu",
    at: 0,
    before,
    after,
    ...patch,
  });

  it("publish and save list what changed", () => {
    expect(historySentence(en, "home", item({}))).toBe(
      "Anu published: Free student tools moved from position 5 to 6; Voices from families hidden",
    );
    expect(historySentence(hi, "home", item({ action: "save_draft" }))).toBe(
      "Anu ने ड्राफ़्ट सहेजा: “मुफ़्त विद्यार्थी टूल्स” सेक्शन स्थान 5 से 6 पर गया; “परिवारों की बातें” सेक्शन छिपाया गया",
    );
    expect(historySentence(en, "home", item({ after: before }))).toBe("Anu published: no change to the order");
  });

  it("reset and discard name only the action; a deleted account is 'someone'", () => {
    expect(historySentence(en, "home", item({ action: "reset", after: null }))).toBe("Anu reset to the original order");
    expect(historySentence(en, "home", item({ action: "discard_draft", after: null, actor: null }))).toBe(
      "Someone discarded the draft",
    );
    expect(historySentence(hi, "home", item({ action: "reset", after: null, actor: null }))).toBe(
      "किसी व्यक्ति ने मूल क्रम वापस लगाया",
    );
  });
});

describe("API failures by status", () => {
  it("maps statuses to what the editor shows", () => {
    expect(layoutFailure(401, null)).toEqual({ ok: false, kind: "signedOut" });
    expect(layoutFailure(403, null)).toEqual({ ok: false, kind: "forbidden" });
    expect(layoutFailure(409, null)).toEqual({ ok: false, kind: "conflict" });
    expect(layoutFailure(429, null)).toEqual({ ok: false, kind: "rateLimited" });
    expect(layoutFailure(422, { fieldErrors: { sections: ["not_last:tools", 3] } })).toEqual({
      ok: false,
      kind: "invalid",
      issues: ["not_last:tools"],
    });
    expect(layoutFailure(422, { fieldErrors: { action: ["x"] } })).toEqual({ ok: false, kind: "generic" });
    expect(layoutFailure(500, null)).toEqual({ ok: false, kind: "generic" });
  });
});
