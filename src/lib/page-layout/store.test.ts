import { DatabaseSync } from "node:sqlite";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listAudit } from "@/lib/db/audit";
import { getDb, resetDatabaseForTests } from "@/lib/db/connection";
import { insertUser } from "@/lib/db/users";

import { LAYOUT_PAGE_KEYS } from "./registry";
import { defaultEntries } from "./resolve";
import {
  applyLayoutAction,
  getPageLayoutState,
  listPageLayoutStates,
  readLayoutForRender,
  readStage,
  revisionOf,
  type ApplyLayoutInput,
} from "./store";
import type { StoredEntry } from "./types";

const NOW = 1_790_000_000_000;

/** Entries from keys; a leading "-" marks a hidden entry. */
const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));
const keysOf = (list: readonly StoredEntry[] | null) =>
  list === null ? null : list.map((entry) => (entry.hidden ? `-${entry.key}` : entry.key));

const DRAFT_1 = entries("stats", "programs", "results", "tools", "why", "centres", "life", "voices", "impact", "resources");
const DRAFT_2 = entries("stats", "programs", "results", "-why", "centres", "tools", "life", "voices", "impact", "resources");
const DRAFT_3 = entries("stats", "results", "programs", "tools", "why", "centres", "life", "-voices", "impact", "resources");

function admin(loginId: string, displayName: string) {
  return insertUser(getDb(), {
    role: "admin",
    loginId,
    displayName,
    passwordHash: "scrypt$test",
    mustChangePassword: false,
    now: NOW,
  });
}

/** applyLayoutAction on the shared test DB at the page's current revision. */
function act(input: Omit<ApplyLayoutInput, "revision" | "now"> & { revision?: number; now?: number }) {
  const db = getDb();
  return applyLayoutAction(db, { revision: revisionOf(db, input.page), now: NOW, ...input });
}

beforeEach(() => {
  resetDatabaseForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetDatabaseForTests();
});

describe("applyLayoutAction", () => {
  it("first save_draft at revision 0 creates a draft and a revision ≥ 1", () => {
    const db = getDb();
    expect(revisionOf(db, "home")).toBe(0);
    const result = applyLayoutAction(db, { page: "home", action: "save_draft", revision: 0, entries: DRAFT_1, actorId: null, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.revision).toBeGreaterThanOrEqual(1);
    expect(result.state.draft?.sections).toEqual(DRAFT_1);
    expect(result.state.draft?.updatedAt).toBe(NOW);
    expect(result.state.published).toEqual({ sections: defaultEntries("home"), custom: false, updatedAt: null, updatedBy: null });
    expect(readStage(db, "home", "published")).toBeNull();
    // Other pages are untouched.
    expect(revisionOf(db, "about")).toBe(0);
  });

  it("a stale revision is a conflict and changes nothing", () => {
    expect(act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: null }).ok).toBe(true);
    const db = getDb();
    const stale = applyLayoutAction(db, { page: "home", action: "save_draft", revision: 0, entries: DRAFT_2, actorId: null, now: NOW });
    expect(stale).toEqual({ ok: false, error: "conflict" });
    expect(readStage(db, "home", "draft")).toEqual(DRAFT_1);
    expect(applyLayoutAction(db, { page: "home", action: "publish", revision: 99, actorId: null, now: NOW })).toEqual({
      ok: false,
      error: "conflict",
    });
  });

  it("publish and discard_draft without a draft give no_draft", () => {
    expect(act({ page: "home", action: "publish", actorId: null })).toEqual({ ok: false, error: "no_draft" });
    expect(act({ page: "home", action: "discard_draft", actorId: null })).toEqual({ ok: false, error: "no_draft" });
    expect(revisionOf(getDb(), "home")).toBe(0);
  });

  it("save_draft rejects a layout that breaks a rule, with the issue codes", () => {
    const bad = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "tools");
    expect(act({ page: "home", action: "save_draft", entries: bad, actorId: null })).toEqual({
      ok: false,
      error: "invalid",
      issues: ["not_last:tools"],
    });
    expect(act({ page: "admissions", action: "save_draft", entries: entries("-enquiry"), actorId: null })).toEqual({
      ok: false,
      error: "invalid",
      issues: ["cannot_hide:enquiry"],
    });
    expect(readStage(getDb(), "home", "draft")).toBeNull();
  });

  it("save_draft stores the normalised list (unknown keys dropped, missing keys inserted)", () => {
    const result = act({ page: "contact", action: "save_draft", entries: entries("nope", "help", "form"), actorId: null });
    expect(result.ok).toBe(true);
    // Default: form, details, help, desks. details follows form; desks follows its predecessor help.
    expect(keysOf(readStage(getDb(), "contact", "draft"))).toEqual(["help", "desks", "form", "details"]);
  });

  it("publish copies the draft to published and clears the draft", () => {
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: null });
    const result = act({ page: "home", action: "publish", actorId: null, now: NOW + 5 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const db = getDb();
    expect(readStage(db, "home", "published")).toEqual(DRAFT_2);
    expect(readStage(db, "home", "draft")).toBeNull();
    expect(result.state.published).toMatchObject({ sections: DRAFT_2, custom: true, updatedAt: NOW + 5 });
    expect(result.state.draft).toBeNull();
  });

  it("publishing the default order deletes the published row (custom: false)", () => {
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "save_draft", entries: defaultEntries("home"), actorId: null });
    const result = act({ page: "home", action: "publish", actorId: null });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readStage(getDb(), "home", "published")).toBeNull();
    expect(result.state.published.custom).toBe(false);
    expect(result.state.published.sections).toEqual(defaultEntries("home"));
  });

  it("publish re-validates the stored draft", () => {
    const db = getDb();
    const bad = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "tools");
    db.prepare("INSERT INTO page_layout_state (page, stage, sections, updated_at, updated_by) VALUES ('home', 'draft', ?, ?, NULL)").run(
      JSON.stringify(bad),
      NOW,
    );
    expect(act({ page: "home", action: "publish", actorId: null })).toEqual({ ok: false, error: "invalid", issues: ["not_last:tools"] });
    expect(readStage(db, "home", "published")).toBeNull();
  });

  it("discard_draft deletes the draft only", () => {
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: null });
    const result = act({ page: "home", action: "discard_draft", actorId: null });
    expect(result.ok).toBe(true);
    const db = getDb();
    expect(readStage(db, "home", "draft")).toBeNull();
    expect(readStage(db, "home", "published")).toEqual(DRAFT_1);
  });

  it("reset deletes both rows, and works (with history) when nothing is stored", () => {
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: null });
    const result = act({ page: "home", action: "reset", actorId: null });
    expect(result.ok).toBe(true);
    const db = getDb();
    expect(readStage(db, "home", "draft")).toBeNull();
    expect(readStage(db, "home", "published")).toBeNull();

    const before = revisionOf(db, "about");
    const empty = act({ page: "about", action: "reset", actorId: null });
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.state.revision).toBeGreaterThan(before);
      expect(empty.state.history).toHaveLength(1);
      expect(empty.state.history[0]).toMatchObject({ action: "reset", after: null, before: defaultEntries("about") });
    }
  });
});

describe("history and audit", () => {
  it("records before/after per the §5 table, newest first, with display names", () => {
    const anu = admin("anu.admin", "Anu Admin");
    const ravi = admin("ravi.admin", "Ravi Admin");
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: anu.id, now: NOW + 1 });
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: anu.id, now: NOW + 2 });
    act({ page: "home", action: "publish", actorId: ravi.id, now: NOW + 3 });
    act({ page: "home", action: "save_draft", entries: DRAFT_3, actorId: ravi.id, now: NOW + 4 });
    act({ page: "home", action: "discard_draft", actorId: anu.id, now: NOW + 5 });
    act({ page: "home", action: "reset", actorId: ravi.id, now: NOW + 6 });

    const db = getDb();
    let state = getPageLayoutState(db, "home");
    const rows = state.history.map((item) => ({
      action: item.action,
      actor: item.actor,
      at: item.at,
      before: keysOf(item.before),
      after: keysOf(item.after),
    }));
    const DEFAULT = keysOf(defaultEntries("home"));
    expect(rows).toEqual([
      { action: "reset", actor: "Ravi Admin", at: NOW + 6, before: keysOf(DRAFT_2), after: null },
      { action: "discard_draft", actor: "Anu Admin", at: NOW + 5, before: keysOf(DRAFT_3), after: null },
      { action: "save_draft", actor: "Ravi Admin", at: NOW + 4, before: keysOf(DRAFT_2), after: keysOf(DRAFT_3) },
      { action: "publish", actor: "Ravi Admin", at: NOW + 3, before: DEFAULT, after: keysOf(DRAFT_2) },
      { action: "save_draft", actor: "Anu Admin", at: NOW + 2, before: keysOf(DRAFT_1), after: keysOf(DRAFT_2) },
      { action: "save_draft", actor: "Anu Admin", at: NOW + 1, before: DEFAULT, after: keysOf(DRAFT_1) },
    ]);
    expect(state.revision).toBe(state.history[0].id);
    expect(getPageLayoutState(db, "home", 2).history).toHaveLength(2);

    // A deleted account: names become null (ON DELETE SET NULL), the rows stay.
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: ravi.id, now: NOW + 7 });
    db.prepare("DELETE FROM users WHERE id = ?").run(ravi.id);
    state = getPageLayoutState(db, "home");
    expect(state.draft).toMatchObject({ updatedBy: null, updatedAt: NOW + 7 });
    expect(state.history[0].actor).toBeNull();
    expect(state.history.find((item) => item.action === "discard_draft")?.actor).toBe("Anu Admin");
    expect(state.history).toHaveLength(7);
  });

  it("shows who published the live order", () => {
    const anu = admin("anu.admin", "Anu Admin");
    act({ page: "results", action: "save_draft", entries: entries("archive", "stories", "rankers", "method"), actorId: anu.id });
    const result = act({ page: "results", action: "publish", actorId: anu.id, now: NOW + 9 });
    expect(result.ok && result.state.published).toEqual({
      sections: entries("archive", "stories", "rankers", "method"),
      custom: true,
      updatedAt: NOW + 9,
      updatedBy: "Anu Admin",
    });
  });

  it("writes one layout.* audit row per change with flat details", () => {
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "save_draft", entries: DRAFT_3, actorId: null });
    act({ page: "home", action: "discard_draft", actorId: null });
    act({ page: "home", action: "save_draft", entries: defaultEntries("home"), actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "reset", actorId: null });

    const db = getDb();
    const audit = listAudit(db, { limit: 50, target: "page-layout:home" }).reverse();
    expect(audit.map((entry) => entry.action)).toEqual([
      "layout.save_draft",
      "layout.publish",
      "layout.save_draft",
      "layout.discard_draft",
      "layout.save_draft",
      "layout.publish",
      "layout.reset",
    ]);
    for (const entry of audit) {
      expect(entry.target).toBe("page-layout:home");
      expect(entry.actorId).toBeNull();
      expect(entry.details.page).toBe("home");
      for (const key of ["revision", "moved", "hidden", "shown"]) expect(typeof entry.details[key], key).toBe("number");
      for (const value of Object.values(entry.details)) expect(["string", "number"]).toContain(typeof value);
    }
    const [save, publish, , discard, , publishDefault, reset] = audit;
    // DRAFT_2: programs/results swapped and tools moved down (2 moves), why hidden.
    expect(save.details).toEqual({
      page: "home",
      revision: 1,
      moved: 2,
      hidden: 1,
      shown: 0,
      order: "stats,programs,results,-why,centres,tools,life,voices,impact,resources",
    });
    expect(publish.details).toMatchObject({ revision: 2, order: "stats,programs,results,-why,centres,tools,life,voices,impact,resources" });
    // Discard: compared with the live order after it; no order detail.
    expect(discard.details).toMatchObject({ revision: 4 });
    expect(discard.details.order).toBeUndefined();
    expect(publishDefault.details).toMatchObject({ order: "default", moved: 2, hidden: 0, shown: 1 });
    expect(reset.details).toMatchObject({ order: "default", moved: 0, hidden: 0, shown: 0, revision: 7 });
    expect(listAudit(db, { limit: 50 }).every((entry) => entry.action.startsWith("layout."))).toBe(true);
  });
});

describe("reads", () => {
  it("treats a corrupt JSON row as missing", () => {
    const db = getDb();
    const insert = db.prepare("INSERT INTO page_layout_state (page, stage, sections, updated_at, updated_by) VALUES (?, ?, ?, ?, NULL)");
    insert.run("home", "published", "{not json", NOW);
    insert.run("about", "published", '{"key":"story"}', NOW);
    insert.run("about", "draft", "[1, null, {\"key\": \"journey\", \"hidden\": true}]", NOW);
    expect(readStage(db, "home", "published")).toBeNull();
    expect(readStage(db, "about", "published")).toBeNull();
    expect(readStage(db, "about", "draft")).toEqual([{ key: "journey", hidden: true }]);
    expect(readLayoutForRender("home", false)).toEqual({ ok: true, entries: null, source: "default", hasDraft: false });
    const state = getPageLayoutState(db, "home");
    expect(state.published).toEqual({ sections: defaultEntries("home"), custom: false, updatedAt: null, updatedBy: null });
  });

  it("readLayoutForRender: published for visitors; the draft (else published) in preview", () => {
    expect(readLayoutForRender("home", true)).toEqual({ ok: true, entries: null, source: "default", hasDraft: false });
    act({ page: "home", action: "save_draft", entries: DRAFT_1, actorId: null });
    act({ page: "home", action: "publish", actorId: null });
    act({ page: "home", action: "save_draft", entries: DRAFT_2, actorId: null });
    expect(readLayoutForRender("home", false)).toEqual({ ok: true, entries: DRAFT_1, source: "published", hasDraft: false });
    expect(readLayoutForRender("home", true)).toEqual({ ok: true, entries: DRAFT_2, source: "draft", hasDraft: true });
    act({ page: "home", action: "discard_draft", actorId: null });
    expect(readLayoutForRender("home", true)).toEqual({ ok: true, entries: DRAFT_1, source: "published", hasDraft: false });
  });

  it("readLayoutForRender returns { ok: false } and logs a fixed code when the query throws", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const closed = new DatabaseSync(":memory:");
    closed.close();
    expect(readLayoutForRender("home", false, closed)).toEqual({ ok: false });
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0][0]));
    expect(line).toMatchObject({ event: "page_layout", action: "read", outcome: "error" });
    expect(line.reason).toMatch(/^exception_/);
  });

  it("listPageLayoutStates covers every page", () => {
    act({ page: "tools", action: "save_draft", entries: entries("rancho", "planner", "predictor", "mockTests", "ask"), actorId: null });
    const states = listPageLayoutStates(getDb());
    expect(Object.keys(states)).toEqual([...LAYOUT_PAGE_KEYS]);
    expect(states.tools.draft?.sections.map((entry) => entry.key)).toEqual(["rancho", "planner", "predictor", "mockTests", "ask"]);
    expect(states.home).toMatchObject({ page: "home", revision: 0, draft: null, history: [] });
  });
});
