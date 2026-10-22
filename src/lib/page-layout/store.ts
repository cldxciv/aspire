import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { exceptionCode } from "@/lib/auth/log";
import { recordAudit } from "@/lib/db/audit";
import { getDb, withTransaction } from "@/lib/db/connection";

import { pageLayoutLog } from "./log";
import { LAYOUT_PAGE_KEYS, type LayoutPageKey } from "./registry";
import { defaultEntries, describeChanges, normalizeEntries, sameOrder, validateEntries } from "./resolve";
import {
  LAYOUT_ACTIONS,
  type LayoutAction,
  type LayoutSource,
  type PageLayoutHistoryItem,
  type PageLayoutStateView,
  type StoredEntry,
} from "./types";

/**
 * Page-layout storage (docs/page-layout-plan.md §5, D3, D4, D11). Server-only.
 * Tables: src/lib/db/features/page-layout.ts. Every write goes through `applyLayoutAction`.
 */

export type LayoutStage = "draft" | "published";

/** Stored JSON → entries. Invalid JSON or a non-array counts as missing; malformed items are skipped. */
function parseEntries(raw: unknown): StoredEntry[] | null {
  if (typeof raw !== "string") return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(value)) return null;
  return value.flatMap((item: unknown) => {
    if (item === null || typeof item !== "object") return [];
    const { key, hidden } = item as { key?: unknown; hidden?: unknown };
    return typeof key === "string" ? [{ key, hidden: hidden === true }] : [];
  });
}

const toJson = (entries: readonly StoredEntry[]) =>
  JSON.stringify(entries.map(({ key, hidden }) => ({ key, hidden })));

export function readStage(db: DatabaseSync, page: LayoutPageKey, stage: LayoutStage): StoredEntry[] | null {
  const row = db.prepare("SELECT sections FROM page_layout_state WHERE page = ? AND stage = ?").get(page, stage);
  return row ? parseEntries(row.sections) : null;
}

/** The page's revision: its newest history id, 0 when it was never changed. */
export function revisionOf(db: DatabaseSync, page: LayoutPageKey): number {
  const row = db.prepare("SELECT COALESCE(MAX(id), 0) AS revision FROM page_layout_history WHERE page = ?").get(page);
  return Number(row?.revision ?? 0);
}

export type LayoutRead =
  | { ok: true; entries: StoredEntry[] | null; source: LayoutSource; hasDraft: boolean }
  | { ok: false };

/**
 * What a page renders: the published row, or in preview the draft (falling back to the published
 * row). Never throws: on any error it logs a fixed code and returns `{ ok: false }` (the loader
 * then renders the default order with a short cache life). `db` is for tests.
 */
export function readLayoutForRender(page: LayoutPageKey, preview: boolean, db?: DatabaseSync): LayoutRead {
  try {
    const conn = db ?? getDb();
    if (preview) {
      const draft = readStage(conn, page, "draft");
      if (draft) return { ok: true, entries: draft, source: "draft", hasDraft: true };
    }
    const published = readStage(conn, page, "published");
    return published
      ? { ok: true, entries: published, source: "published", hasDraft: false }
      : { ok: true, entries: null, source: "default", hasDraft: false };
  } catch (error) {
    pageLayoutLog("read", "error", exceptionCode(error));
    return { ok: false };
  }
}

interface StateRow {
  stage: unknown;
  sections: unknown;
  updated_at: unknown;
  display_name: unknown;
}

const nameOf = (value: unknown): string | null => (value === null || value === undefined ? null : String(value));

function historyAction(value: unknown): LayoutAction {
  const action = String(value) as LayoutAction;
  return LAYOUT_ACTIONS.includes(action) ? action : "save_draft";
}

/** One page's state for the editor; sections normalised against the current registry. */
export function getPageLayoutState(db: DatabaseSync, page: LayoutPageKey, historyLimit = 20): PageLayoutStateView {
  const rows = db
    .prepare(
      `SELECT s.stage, s.sections, s.updated_at, u.display_name
         FROM page_layout_state s LEFT JOIN users u ON u.id = s.updated_by
        WHERE s.page = ?`,
    )
    .all(page) as unknown as StateRow[];
  const byStage = (stage: LayoutStage) => {
    const row = rows.find((candidate) => candidate.stage === stage);
    const entries = row ? parseEntries(row.sections) : null;
    return row && entries ? { row, entries } : null;
  };
  const published = byStage("published");
  const draft = byStage("draft");

  const limit = Math.max(1, Math.min(200, Math.trunc(historyLimit)));
  const history: PageLayoutHistoryItem[] = db
    .prepare(
      `SELECT h.id, h.action, h.before_sections, h.after_sections, h.created_at, u.display_name
         FROM page_layout_history h LEFT JOIN users u ON u.id = h.actor_id
        WHERE h.page = ? ORDER BY h.id DESC LIMIT ?`,
    )
    .all(page, limit)
    .map((row) => ({
      id: Number(row.id),
      action: historyAction(row.action),
      actor: nameOf(row.display_name),
      at: Number(row.created_at),
      before: normalizeEntries(page, parseEntries(row.before_sections)),
      after: row.after_sections === null ? null : normalizeEntries(page, parseEntries(row.after_sections)),
    }));

  return {
    page,
    revision: revisionOf(db, page),
    published: published
      ? {
          sections: normalizeEntries(page, published.entries),
          custom: true,
          updatedAt: Number(published.row.updated_at),
          updatedBy: nameOf(published.row.display_name),
        }
      : { sections: defaultEntries(page), custom: false, updatedAt: null, updatedBy: null },
    draft: draft
      ? {
          sections: normalizeEntries(page, draft.entries),
          updatedAt: Number(draft.row.updated_at),
          updatedBy: nameOf(draft.row.display_name),
        }
      : null,
    history,
  };
}

/** Every page's state (the editor's initial data). */
export function listPageLayoutStates(db: DatabaseSync): Record<LayoutPageKey, PageLayoutStateView> {
  return Object.fromEntries(LAYOUT_PAGE_KEYS.map((page) => [page, getPageLayoutState(db, page)])) as Record<
    LayoutPageKey,
    PageLayoutStateView
  >;
}

export type ApplyLayoutResult =
  | { ok: true; state: PageLayoutStateView }
  | { ok: false; error: "conflict" }
  | { ok: false; error: "invalid"; issues: string[] }
  | { ok: false; error: "no_draft" };

export interface ApplyLayoutInput {
  page: LayoutPageKey;
  action: LayoutAction;
  /** The revision the editor last saw (`PageLayoutStateView.revision`). */
  revision: number;
  /** Required for `save_draft`. */
  entries?: readonly StoredEntry[];
  actorId: string | null;
  now: number;
}

function upsertStage(
  db: DatabaseSync,
  page: LayoutPageKey,
  stage: LayoutStage,
  entries: readonly StoredEntry[],
  actorId: string | null,
  now: number,
): void {
  db.prepare(
    `INSERT INTO page_layout_state (page, stage, sections, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (page, stage) DO UPDATE SET sections = excluded.sections, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).run(page, stage, toJson(entries), now, actorId);
}

function deleteStage(db: DatabaseSync, page: LayoutPageKey, stage: LayoutStage): void {
  db.prepare("DELETE FROM page_layout_state WHERE page = ? AND stage = ?").run(page, stage);
}

/** "results,programs,-why,tools": the order with hidden keys prefixed by "-" (audit detail, D11). */
function orderDetail(entries: readonly StoredEntry[]): string {
  return entries.map((entry) => (entry.hidden ? `-${entry.key}` : entry.key)).join(",");
}

/**
 * The single write path (D3, D4, D11), in one BEGIN IMMEDIATE transaction:
 * revision check → action → history row → audit row → the new state.
 * - save_draft: validate, upsert the draft.
 * - discard_draft: needs a draft; delete it.
 * - publish: needs a draft; re-validate it, make it live (the default order deletes the published
 *   row instead, so the page is default again), delete the draft.
 * - reset: delete both rows (allowed when nothing is stored; still writes history).
 */
export function applyLayoutAction(db: DatabaseSync, input: ApplyLayoutInput): ApplyLayoutResult {
  const { page, action, actorId, now } = input;
  return withTransaction(db, (): ApplyLayoutResult => {
    if (revisionOf(db, page) !== input.revision) return { ok: false, error: "conflict" };

    const storedDraft = readStage(db, page, "draft");
    const live = normalizeEntries(page, readStage(db, page, "published"));
    let before: StoredEntry[];
    let after: StoredEntry[] | null;
    /** The live order once the action is done (counts for actions whose `after` is null). */
    let compareTo: StoredEntry[];
    let order: string | undefined;

    switch (action) {
      case "save_draft": {
        const result = validateEntries(page, input.entries ?? []);
        if (!result.ok) return { ok: false, error: "invalid", issues: result.issues };
        before = storedDraft ? normalizeEntries(page, storedDraft) : live;
        after = result.entries;
        compareTo = after;
        order = orderDetail(after);
        upsertStage(db, page, "draft", after, actorId, now);
        break;
      }
      case "discard_draft": {
        if (!storedDraft) return { ok: false, error: "no_draft" };
        before = normalizeEntries(page, storedDraft);
        after = null;
        compareTo = live;
        deleteStage(db, page, "draft");
        break;
      }
      case "publish": {
        if (!storedDraft) return { ok: false, error: "no_draft" };
        const result = validateEntries(page, normalizeEntries(page, storedDraft));
        if (!result.ok) return { ok: false, error: "invalid", issues: result.issues };
        before = live;
        after = result.entries;
        compareTo = after;
        if (sameOrder(after, defaultEntries(page))) {
          deleteStage(db, page, "published");
          order = "default";
        } else {
          upsertStage(db, page, "published", after, actorId, now);
          order = orderDetail(after);
        }
        deleteStage(db, page, "draft");
        break;
      }
      case "reset": {
        before = live;
        after = null;
        compareTo = defaultEntries(page);
        order = "default";
        deleteStage(db, page, "draft");
        deleteStage(db, page, "published");
        break;
      }
      default: {
        const unknown: never = action;
        throw new Error(`applyLayoutAction: unknown action ${String(unknown)}`);
      }
    }

    const inserted = db
      .prepare(
        `INSERT INTO page_layout_history (page, action, before_sections, after_sections, actor_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(page, action, toJson(before), after ? toJson(after) : null, actorId, now);
    const revision = Number(inserted.lastInsertRowid);

    const changes = describeChanges(before, compareTo);
    recordAudit(db, {
      actorId,
      action: `layout.${action}`,
      target: `page-layout:${page}`,
      details: {
        page,
        revision,
        moved: changes.moved.length,
        hidden: changes.hidden.length,
        shown: changes.shown.length,
        ...(order === undefined ? {} : { order }),
      },
      now,
    });

    return { ok: true, state: getPageLayoutState(db, page) };
  });
}
