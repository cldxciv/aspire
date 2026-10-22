import "server-only";

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { getPublishedBlueprint } from "./blueprints";
import { generatePaper, type GeneratedPart } from "./generator";
import { packItems, unpackItems } from "./items-pack";
import { loadExamPool, weightsFor } from "./pool";
import { parseJson } from "./repo/json";
import { questionsByN } from "./repo/questions";
import { bankRevision } from "./settings";
import type { QbBlueprint, QbExam, QbPaperComposition, QbPoolItem, QbSlot } from "./types";
import { QB_SLOT_EXAM, QB_SLOTS } from "./types";

/**
 * Monthly ranked windows (owner: QB-CORE-B; §B9.4). One shared ranked paper per slot per IST month
 * (`month-YYYY-MM`). The first ranked request of a month generates the TEMPLATE inside a transaction
 * (the primary key guards against races) from the published blueprint, pinning its version. Ranked
 * templates allow only `difficulty_borrowed`; anything else leaves the window `unavailable`, retried
 * after the next bank revision. While a window is open its clusters are reserved: excluded from the
 * practice pools of the same exam.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export interface MonthWindow {
  windowId: string;
  startsAt: number;
  endsAt: number;
}

/** The IST calendar month containing `now`. */
export function istMonthWindow(now: number): MonthWindow {
  const ist = new Date(now + IST_OFFSET_MS);
  const year = ist.getUTCFullYear();
  const month = ist.getUTCMonth();
  const startsAt = Date.UTC(year, month, 1) - IST_OFFSET_MS;
  const endsAt = Date.UTC(year, month + 1, 1) - IST_OFFSET_MS - 1;
  return { windowId: `month-${year}-${String(month + 1).padStart(2, "0")}`, startsAt, endsAt };
}

/** "2026-11-01T00:00:00+05:30" */
export function istIso(ms: number): string {
  return `${new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 19)}+05:30`;
}

export interface WindowTemplate {
  slot: QbSlot;
  windowId: string;
  status: "open" | "unavailable" | "closed";
  blueprintId: string | null;
  blueprintVersion: number | null;
  seed: string | null;
  items: { n: number; version: number; section: number }[];
  composition: (QbPaperComposition & { hiOk?: boolean; parts?: { partId: string; durationMinutes: number; maxScore: number }[] }) | null;
  startsAt: number;
  endsAt: number;
  /** Bank revision at which an unavailable window was last tried. */
  triedAtRevision: number | null;
}

function mapWindow(row: Record<string, unknown>): WindowTemplate {
  const composition = parseJson<WindowTemplate["composition"] & { triedAtRevision?: number }>(row.composition, null as never);
  return {
    slot: row.slot as QbSlot,
    windowId: String(row.window_id),
    status: row.status as WindowTemplate["status"],
    blueprintId: row.blueprint_id === null ? null : String(row.blueprint_id),
    blueprintVersion: row.blueprint_version === null ? null : Number(row.blueprint_version),
    seed: row.seed === null ? null : String(row.seed),
    items: row.items instanceof Uint8Array ? unpackItems(row.items) : [],
    composition: composition ?? null,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    triedAtRevision: typeof composition?.triedAtRevision === "number" ? composition.triedAtRevision : null,
  };
}

export function getWindow(db: DatabaseSync, slot: QbSlot, windowId: string): WindowTemplate | null {
  const row = db.prepare("SELECT * FROM qb_windows WHERE slot = ? AND window_id = ?").get(slot, windowId);
  return row ? mapWindow(row) : null;
}

/** Section index in the blueprint's flattened section list. */
export function sectionIndexMap(blueprint: QbBlueprint): Map<string, number> {
  const map = new Map<string, number>();
  for (const part of blueprint.parts) for (const section of part.sections) map.set(section.id, map.size);
  return map;
}

export function packParts(blueprint: QbBlueprint, parts: readonly GeneratedPart[]): Uint8Array {
  const index = sectionIndexMap(blueprint);
  return packItems(parts.flatMap((p) => p.sections.flatMap((s) => s.items.map((item) => ({ n: item.n, version: item.version, section: index.get(s.sectionId)! })))));
}

function generateTemplate(db: DatabaseSync, blueprint: QbBlueprint, now: number, seed: string) {
  const pool = loadExamPool(db, blueprint.exam, now);
  const { weights, formatTargets } = weightsFor(db, blueprint, now);
  return generatePaper({
    blueprint,
    pool,
    weights,
    formatTargets,
    softExclude: new Set(),
    mode: "ranked_template",
    seed,
    language: "en",
    placeholderMode: false,
  });
}

/**
 * This month's window for a slot, creating (or retrying) the template when needed. Null when the slot
 * has no published blueprint with monthly ranking.
 */
export function getOrCreateWindow(db: DatabaseSync, slot: QbSlot, now: number): WindowTemplate | null {
  const blueprint = getPublishedBlueprint(db, slot);
  if (!blueprint || blueprint.ranked !== "monthly") return null;
  const month = istMonthWindow(now);
  const existing = getWindow(db, slot, month.windowId);
  const revision = bankRevision(db);
  if (existing && (existing.status !== "unavailable" || existing.triedAtRevision === revision)) return existing;

  db.exec("BEGIN IMMEDIATE");
  try {
    const current = getWindow(db, slot, month.windowId); // re-read inside the write lock
    if (current && (current.status !== "unavailable" || current.triedAtRevision === revision)) {
      db.exec("COMMIT");
      return current;
    }
    const seed = randomBytes(16).toString("hex");
    const result = generateTemplate(db, blueprint, now, seed);
    const items = result.ok ? packParts(blueprint, result.parts) : null;
    const composition = result.ok
      ? {
          ...result.composition,
          hiOk: result.parts.every((p) => p.sections.every((s) => s.items.every((i) => i.hiOk))),
          parts: result.parts.map((p) => ({ partId: p.partId, durationMinutes: p.durationMinutes, maxScore: p.maxScore })),
        }
      : { triedAtRevision: revision };
    db.prepare(
      `INSERT INTO qb_windows (slot, window_id, status, blueprint_id, blueprint_version, seed, items, composition, starts_at, ends_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (slot, window_id) DO UPDATE SET status = excluded.status, blueprint_id = excluded.blueprint_id,
         blueprint_version = excluded.blueprint_version, seed = excluded.seed, items = excluded.items, composition = excluded.composition
         WHERE qb_windows.status = 'unavailable'`,
    ).run(
      slot,
      month.windowId,
      result.ok ? "open" : "unavailable",
      blueprint.id,
      blueprint.version,
      seed,
      items,
      JSON.stringify(composition),
      month.startsAt,
      month.endsAt,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
  return getWindow(db, slot, month.windowId);
}

/** Closes windows whose month has ended (their reservations end with them). */
export function closeEndedWindows(db: DatabaseSync, now: number): number {
  return Number(db.prepare("UPDATE qb_windows SET status = 'closed' WHERE status <> 'closed' AND ends_at < ?").run(now).changes);
}

/** Clusters of the open ranked templates of an exam: practice pools must not use them. */
export function reservedClusters(db: DatabaseSync, exam: QbExam, now: number): Set<string> {
  const slots = QB_SLOTS.filter((slot) => QB_SLOT_EXAM[slot] === exam);
  const reserved = new Set<string>();
  for (const slot of slots) {
    const rows = db.prepare("SELECT * FROM qb_windows WHERE slot = ? AND status = 'open' AND ends_at >= ?").all(slot, now);
    for (const row of rows) {
      const window = mapWindow(row);
      const byN = questionsByN(db, window.items.map((i) => i.n));
      for (const item of window.items) {
        const q = byN.get(item.n);
        if (q) {
          reserved.add(q.clusterId ?? q.id);
          reserved.add(q.id);
        }
      }
    }
  }
  return reserved;
}

/**
 * The practice pool of an exam: the approved pool minus the clusters reserved by open ranked
 * templates. Students' papers, readiness and the staff previews all use it.
 */
export function practicePool(db: DatabaseSync, exam: QbExam, now: number): QbPoolItem[] {
  const pool = loadExamPool(db, exam, now);
  const reserved = reservedClusters(db, exam, now);
  if (reserved.size === 0) return pool;
  const reservedClustersResolved = new Set(pool.filter((i) => reserved.has(i.id)).map((i) => i.clusterId));
  return pool.filter((i) => !reserved.has(i.id) && !reservedClustersResolved.has(i.clusterId));
}

/**
 * Which ranked templates currently reserve clusters of an exam (open, unexpired windows with items),
 * for cache keys: it changes when a window opens, closes or ends.
 */
export function reservationKey(db: DatabaseSync, exam: QbExam, now: number): string {
  const slots = QB_SLOTS.filter((slot) => QB_SLOT_EXAM[slot] === exam);
  const keys: string[] = [];
  for (const slot of slots) {
    for (const row of db
      .prepare("SELECT window_id FROM qb_windows WHERE slot = ? AND status = 'open' AND ends_at >= ? AND items IS NOT NULL ORDER BY window_id")
      .all(slot, now)) {
      keys.push(`${slot}:${String(row.window_id)}`);
    }
  }
  return keys.join(",");
}

/** Ranked status of a slot this month (no generation: readiness answers before any template exists). */
export function rankedStatus(db: DatabaseSync, slot: QbSlot, now: number): { mode: "off" | "monthly"; available: boolean; windowId: string | null; closesAt: number | null } {
  const blueprint = getPublishedBlueprint(db, slot);
  if (!blueprint || blueprint.ranked !== "monthly") return { mode: "off", available: false, windowId: null, closesAt: null };
  const month = istMonthWindow(now);
  const window = getWindow(db, slot, month.windowId);
  return {
    mode: "monthly",
    available: window ? window.status === "open" : true,
    windowId: month.windowId,
    closesAt: month.endsAt,
  };
}

/** Windows of a slot that had a template (for the ranked boards), newest first. */
export function rankedWindowsFor(db: DatabaseSync, slot: QbSlot): { windowId: string; startsAt: number; endsAt: number; maxScore: number; status: WindowTemplate["status"] }[] {
  return db
    .prepare("SELECT * FROM qb_windows WHERE slot = ? AND items IS NOT NULL ORDER BY starts_at DESC")
    .all(slot)
    .map(mapWindow)
    .filter((w) => w.items.length > 0)
    .map((w) => ({
      windowId: w.windowId,
      startsAt: w.startsAt,
      endsAt: w.endsAt,
      maxScore: (w.composition?.parts ?? []).reduce((sum, p) => sum + p.maxScore, 0),
      status: w.status,
    }));
}
