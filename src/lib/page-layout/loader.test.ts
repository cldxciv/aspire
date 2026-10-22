import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, resetDatabaseForTests } from "@/lib/db/connection";

import { PAGE_LAYOUT_TAG, pageLayoutTag } from "./registry";
import { defaultPageLayout } from "./resolve";
import { applyLayoutAction, revisionOf } from "./store";
import type { StoredEntry } from "./types";

/**
 * getPageLayout's branches (docs/page-layout-plan.md §6, D7, D15): the build never opens the
 * database (the image ships without .data/), the runtime read is tagged per page, a failed read
 * gets a short cache life, and Draft Mode renders the draft. The Next cache / request APIs are
 * stubbed; "in Next" is selected by re-importing the loader with NODE_ENV other than "test".
 */

const next = vi.hoisted(() => ({
  draft: false,
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  draftMode: vi.fn(),
}));

vi.mock("next/cache", () => ({ cacheLife: next.cacheLife, cacheTag: next.cacheTag }));
vi.mock("next/headers", () => ({ draftMode: next.draftMode }));
vi.mock("./store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./store")>();
  return { ...actual, readLayoutForRender: vi.fn(actual.readLayoutForRender) };
});

const NOW = 1_790_000_000_000;

const entries = (...keys: string[]): StoredEntry[] =>
  keys.map((key) => (key.startsWith("-") ? { key: key.slice(1), hidden: true } : { key, hidden: false }));

const PUBLISHED = entries("stats", "programs", "results", "tools", "why", "centres", "life", "voices", "impact", "resources");
const DRAFT = entries("stats", "programs", "results", "-why", "centres", "tools", "life", "voices", "impact", "resources");

function saveDraft(list: StoredEntry[]) {
  const db = getDb();
  const result = applyLayoutAction(db, {
    page: "home",
    action: "save_draft",
    revision: revisionOf(db, "home"),
    entries: list,
    actorId: null,
    now: NOW,
  });
  expect(result.ok).toBe(true);
}

function publish(list: StoredEntry[]) {
  saveDraft(list);
  const db = getDb();
  const result = applyLayoutAction(db, { page: "home", action: "publish", revision: revisionOf(db, "home"), actorId: null, now: NOW });
  expect(result.ok).toBe(true);
}

/** A fresh loader (and the store instance it uses); `inNext` decides its IN_NEXT at import time. */
async function load(inNext: boolean) {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", inNext ? "production" : "test");
  const loader = await import("./loader");
  const store = await import("./store");
  vi.stubEnv("NODE_ENV", "test");
  return { getPageLayout: loader.getPageLayout, readLayoutForRender: vi.mocked(store.readLayoutForRender) };
}

beforeEach(() => {
  // Never the real .data/ file, whatever NODE_ENV a test imports the loader under.
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("NEXT_PHASE", "");
  next.draft = false;
  next.cacheLife.mockReset();
  next.cacheTag.mockReset();
  next.draftMode.mockReset().mockImplementation(async () => ({ isEnabled: next.draft }));
  resetDatabaseForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetDatabaseForTests();
});

describe("getPageLayout during next build", () => {
  it.each([false, true])("never reads the database and returns the default order (in Next: %s)", async (inNext) => {
    publish(PUBLISHED);
    const { getPageLayout, readLayoutForRender } = await load(inNext);
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(await getPageLayout("home")).toEqual(defaultPageLayout("home"));
    expect(readLayoutForRender).not.toHaveBeenCalled();
    expect(next.draftMode).not.toHaveBeenCalled();
    if (inNext) {
      expect(next.cacheLife).toHaveBeenCalledTimes(1);
      expect(next.cacheLife).not.toHaveBeenCalledWith("max");
      expect(next.cacheTag).toHaveBeenCalledWith(pageLayoutTag("home"), PAGE_LAYOUT_TAG);
    } else {
      expect(next.cacheLife).not.toHaveBeenCalled();
    }
  });
});

describe("getPageLayout at runtime", () => {
  it("renders the published layout, cached for good and tagged per page", async () => {
    publish(PUBLISHED);
    saveDraft(DRAFT);
    const { getPageLayout, readLayoutForRender } = await load(true);
    const layout = await getPageLayout("home");
    expect(layout.entries).toEqual(PUBLISHED);
    expect(layout.source).toBe("published");
    expect(layout.preview).toBeNull();
    expect(readLayoutForRender).toHaveBeenCalledWith("home", false);
    expect(next.cacheLife).toHaveBeenCalledTimes(1);
    expect(next.cacheLife).toHaveBeenCalledWith("max");
    expect(next.cacheTag).toHaveBeenCalledWith(pageLayoutTag("home"), PAGE_LAYOUT_TAG);
  });

  it("a failed read renders the default order with a short cache life", async () => {
    const { getPageLayout, readLayoutForRender } = await load(true);
    readLayoutForRender.mockReturnValueOnce({ ok: false });
    expect(await getPageLayout("home")).toEqual(defaultPageLayout("home"));
    expect(next.cacheLife).toHaveBeenCalledTimes(1);
    expect(next.cacheLife).toHaveBeenCalledWith("minutes");
  });

  it("outside Next (vitest) it skips the cache calls and Draft Mode", async () => {
    publish(PUBLISHED);
    const { getPageLayout } = await load(false);
    const layout = await getPageLayout("home");
    expect(layout.entries).toEqual(PUBLISHED);
    expect(next.cacheLife).not.toHaveBeenCalled();
    expect(next.cacheTag).not.toHaveBeenCalled();
    expect(next.draftMode).not.toHaveBeenCalled();
  });
});

describe("getPageLayout in Draft Mode (a super admin's preview)", () => {
  it("renders the saved draft", async () => {
    publish(PUBLISHED);
    saveDraft(DRAFT);
    next.draft = true;
    const { getPageLayout, readLayoutForRender } = await load(true);
    const layout = await getPageLayout("home");
    expect(readLayoutForRender).toHaveBeenCalledWith("home", true);
    expect(layout.entries).toEqual(DRAFT);
    expect(layout.source).toBe("draft");
    expect(layout.preview).toEqual({ hasDraft: true });
  });

  it("without a draft it renders the published layout and says there is no draft", async () => {
    publish(PUBLISHED);
    next.draft = true;
    const { getPageLayout } = await load(true);
    const layout = await getPageLayout("home");
    expect(layout.entries).toEqual(PUBLISHED);
    expect(layout.source).toBe("published");
    expect(layout.preview).toEqual({ hasDraft: false });
  });

  it("a stored draft that breaks a rule shows the default order, and the banner does not claim a draft", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const toolsLast = entries("stats", "results", "programs", "why", "centres", "life", "voices", "impact", "resources", "tools");
    getDb()
      .prepare("INSERT INTO page_layout_state (page, stage, sections, updated_at, updated_by) VALUES (?, ?, ?, ?, NULL)")
      .run("home", "draft", JSON.stringify(toolsLast), NOW);
    next.draft = true;
    const { getPageLayout } = await load(true);
    const layout = await getPageLayout("home");
    expect(layout.entries).toEqual(defaultPageLayout("home").entries);
    expect(layout.source).toBe("default");
    expect(layout.preview).toEqual({ hasDraft: false });
  });
});
