import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { QbImportEstimate, QbImportKind, QbImportMeta, QbImportStatus } from "@/lib/qb/types";

import type { CallUsage } from "./client";
import type { ImportItemStatus, ImportMode, ImportOptions, ItemOutput, PageMark, PatternSnapshot, UsageTotals } from "./types";
import { EMPTY_USAGE } from "./types";

/**
 * Rows of `qb_imports` and `qb_import_items` (schema: QB-CORE-A, src/lib/db/features/qb.ts;
 * docs/question-bank-plan.md §B4). Only QB-IMPORT writes these tables.
 */

export interface BatchRef {
  id: string;
  submittedAt: number;
  endedAt: number | null;
}

export interface ImportRecord {
  id: string;
  kind: QbImportKind;
  status: QbImportStatus;
  mode: ImportMode;
  fileName: string;
  fileSize: number;
  fileSha256: string;
  tempPath: string | null;
  fileDeletedAt: number | null;
  pages: number | null;
  rows: number | null;
  encrypted: boolean;
  meta: QbImportMeta;
  options: ImportOptions;
  model: string | null;
  effort: string | null;
  estimate: QbImportEstimate | null;
  usage: UsageTotals;
  batchIds: BatchRef[];
  pageMarks: PageMark[];
  patternSnapshot: PatternSnapshot | null;
  progressDone: number;
  progressTotal: number;
  draftsCreated: number;
  error: string | null;
  pauseReason: string | null;
  runnerId: string | null;
  leaseUntil: number | null;
  licenceAckBy: string;
  licenceAckAt: number;
  licenceNote: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface ItemRecord {
  importId: string;
  seq: number;
  pageFrom: number | null;
  pageTo: number | null;
  customId: string | null;
  status: ImportItemStatus;
  attempts: number;
  model: string | null;
  stopReason: string | null;
  output: ItemOutput | null;
  usage: CallUsage;
  usd: number;
  finishedAt: number | null;
  error: string | null;
}

function json<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type Row = Record<string, unknown>;

function toRecord(row: Row): ImportRecord {
  return {
    id: String(row.id),
    kind: row.kind as QbImportKind,
    status: row.status as QbImportStatus,
    mode: row.mode as ImportMode,
    fileName: String(row.file_name),
    fileSize: Number(row.file_size),
    fileSha256: String(row.file_sha256),
    tempPath: (row.temp_path as string | null) ?? null,
    fileDeletedAt: (row.file_deleted_at as number | null) ?? null,
    pages: (row.pages as number | null) ?? null,
    rows: (row.rows as number | null) ?? null,
    encrypted: Number(row.encrypted) === 1,
    meta: json<QbImportMeta>(row.meta, { sourceKind: "aspire", language: "en" }),
    options: json<ImportOptions>(row.options, {}),
    model: (row.model as string | null) ?? null,
    effort: (row.effort as string | null) ?? null,
    estimate: json<QbImportEstimate | null>(row.estimate, null),
    usage: { ...EMPTY_USAGE, ...json<Partial<UsageTotals>>(row.usage, {}) },
    batchIds: json<BatchRef[]>(row.batch_ids, []),
    pageMarks: json<PageMark[]>(row.page_marks, []),
    patternSnapshot: json<PatternSnapshot | null>(row.pattern_snapshot, null),
    progressDone: Number(row.progress_done ?? 0),
    progressTotal: Number(row.progress_total ?? 0),
    draftsCreated: Number(row.drafts_created ?? 0),
    error: (row.error as string | null) ?? null,
    pauseReason: (row.pause_reason as string | null) ?? null,
    runnerId: (row.runner_id as string | null) ?? null,
    leaseUntil: (row.lease_until as number | null) ?? null,
    licenceAckBy: String(row.licence_ack_by),
    licenceAckAt: Number(row.licence_ack_at),
    licenceNote: (row.licence_note as string | null) ?? null,
    createdBy: String(row.created_by),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function toItem(row: Row): ItemRecord {
  return {
    importId: String(row.import_id),
    seq: Number(row.seq),
    pageFrom: (row.page_from as number | null) ?? null,
    pageTo: (row.page_to as number | null) ?? null,
    customId: (row.custom_id as string | null) ?? null,
    status: row.status as ImportItemStatus,
    attempts: Number(row.attempts ?? 0),
    model: (row.model as string | null) ?? null,
    stopReason: (row.stop_reason as string | null) ?? null,
    output: json<ItemOutput | null>(row.output, null),
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, ...json<Partial<CallUsage>>(row.usage, {}) },
    usd: Number(row.usd ?? 0),
    finishedAt: (row.finished_at as number | null) ?? null,
    error: (row.error as string | null) ?? null,
  };
}

export function insertImport(
  db: DatabaseSync,
  record: Omit<ImportRecord, "runnerId" | "leaseUntil" | "fileDeletedAt" | "progressDone" | "draftsCreated" | "error" | "pauseReason" | "batchIds" | "pageMarks" | "patternSnapshot" | "usage">,
): void {
  db.prepare(
    `INSERT INTO qb_imports (id, kind, status, mode, file_name, file_size, file_sha256, temp_path, pages, rows, encrypted,
       meta, options, model, effort, estimate, usage, batch_ids, page_marks, progress_done, progress_total, drafts_created,
       licence_ack_by, licence_ack_at, licence_note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '[]', '[]', 0, ?, 0, ?, ?, ?, ?, ?, ?)`,
  ).run(
    record.id,
    record.kind,
    record.status,
    record.mode,
    record.fileName,
    record.fileSize,
    record.fileSha256,
    record.tempPath,
    record.pages,
    record.rows,
    record.encrypted ? 1 : 0,
    JSON.stringify(record.meta),
    JSON.stringify(record.options),
    record.model,
    record.effort,
    record.estimate ? JSON.stringify(record.estimate) : null,
    record.progressTotal,
    record.licenceAckBy,
    record.licenceAckAt,
    record.licenceNote,
    record.createdBy,
    record.createdAt,
    record.updatedAt,
  );
}

export function getImport(db: DatabaseSync, id: string): ImportRecord | null {
  const row = db.prepare("SELECT * FROM qb_imports WHERE id = ?").get(id) as Row | undefined;
  return row ? toRecord(row) : null;
}

export function listImports(db: DatabaseSync, limit = 50): ImportRecord[] {
  return (db.prepare("SELECT * FROM qb_imports ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(toRecord);
}

export function importsWithSha(db: DatabaseSync, sha256: string): ImportRecord[] {
  return (db.prepare("SELECT * FROM qb_imports WHERE file_sha256 = ?").all(sha256) as Row[]).map(toRecord);
}

/** Imports of a kind (for paper-identity checks: booklets, duplicates). */
export function importsOfKind(db: DatabaseSync, kinds: readonly QbImportKind[]): ImportRecord[] {
  const placeholders = kinds.map(() => "?").join(", ");
  return (db.prepare(`SELECT * FROM qb_imports WHERE kind IN (${placeholders}) ORDER BY created_at`).all(...kinds) as Row[]).map(toRecord);
}

type Patch = Partial<{
  status: QbImportStatus;
  mode: ImportMode;
  tempPath: string | null;
  fileDeletedAt: number | null;
  options: ImportOptions;
  estimate: QbImportEstimate | null;
  usage: UsageTotals;
  batchIds: BatchRef[];
  pageMarks: PageMark[];
  patternSnapshot: PatternSnapshot | null;
  progressDone: number;
  progressTotal: number;
  draftsCreated: number;
  error: string | null;
  pauseReason: string | null;
  model: string | null;
}>;

const COLUMNS: Record<keyof Patch, [string, (value: never) => unknown]> = {
  status: ["status", (v: string) => v],
  mode: ["mode", (v: string) => v],
  tempPath: ["temp_path", (v: string | null) => v],
  fileDeletedAt: ["file_deleted_at", (v: number | null) => v],
  options: ["options", (v: ImportOptions) => JSON.stringify(v)],
  estimate: ["estimate", (v: QbImportEstimate | null) => (v ? JSON.stringify(v) : null)],
  usage: ["usage", (v: UsageTotals) => JSON.stringify(v)],
  batchIds: ["batch_ids", (v: BatchRef[]) => JSON.stringify(v)],
  pageMarks: ["page_marks", (v: PageMark[]) => JSON.stringify(v)],
  patternSnapshot: ["pattern_snapshot", (v: PatternSnapshot | null) => (v ? JSON.stringify(v) : null)],
  progressDone: ["progress_done", (v: number) => v],
  progressTotal: ["progress_total", (v: number) => v],
  draftsCreated: ["drafts_created", (v: number) => v],
  error: ["error", (v: string | null) => v],
  pauseReason: ["pause_reason", (v: string | null) => v],
  model: ["model", (v: string | null) => v],
};

/**
 * Updates the given fields (and `updated_at`). With `whereStatus`, only when the job is still in
 * one of those states (compare-and-set); returns whether a row changed.
 */
export function updateImport(db: DatabaseSync, id: string, patch: Patch, now: number, whereStatus?: readonly QbImportStatus[]): boolean {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof Patch, unknown][]) {
    if (value === undefined) continue;
    const [column, encode] = COLUMNS[key];
    sets.push(`${column} = ?`);
    values.push((encode as (v: unknown) => unknown)(value));
  }
  sets.push("updated_at = ?");
  values.push(now);
  let sql = `UPDATE qb_imports SET ${sets.join(", ")} WHERE id = ?`;
  values.push(id);
  if (whereStatus && whereStatus.length > 0) {
    sql += ` AND status IN (${whereStatus.map(() => "?").join(", ")})`;
    values.push(...whereStatus);
  }
  const result = db.prepare(sql).run(...(values as (string | number | null)[]));
  return Number(result.changes) === 1;
}

export function insertItems(db: DatabaseSync, importId: string, items: readonly { seq: number; pageFrom: number | null; pageTo: number | null }[]): void {
  const statement = db.prepare("INSERT OR IGNORE INTO qb_import_items (import_id, seq, page_from, page_to, status) VALUES (?, ?, ?, ?, 'pending')");
  for (const item of items) statement.run(importId, item.seq, item.pageFrom, item.pageTo);
}

export function listItems(db: DatabaseSync, importId: string): ItemRecord[] {
  return (db.prepare("SELECT * FROM qb_import_items WHERE import_id = ? ORDER BY seq").all(importId) as Row[]).map(toItem);
}

export function getItem(db: DatabaseSync, importId: string, seq: number): ItemRecord | null {
  const row = db.prepare("SELECT * FROM qb_import_items WHERE import_id = ? AND seq = ?").get(importId, seq) as Row | undefined;
  return row ? toItem(row) : null;
}

type ItemPatch = Partial<{
  status: ImportItemStatus;
  attempts: number;
  customId: string | null;
  model: string | null;
  stopReason: string | null;
  output: ItemOutput | null;
  usage: CallUsage;
  usd: number;
  finishedAt: number | null;
  error: string | null;
}>;

const ITEM_COLUMNS: Record<keyof ItemPatch, [string, (value: never) => unknown]> = {
  status: ["status", (v: string) => v],
  attempts: ["attempts", (v: number) => v],
  customId: ["custom_id", (v: string | null) => v],
  model: ["model", (v: string | null) => v],
  stopReason: ["stop_reason", (v: string | null) => v],
  output: ["output", (v: ItemOutput | null) => (v ? JSON.stringify(v) : null)],
  usage: ["usage", (v: CallUsage) => JSON.stringify(v)],
  usd: ["usd", (v: number) => v],
  finishedAt: ["finished_at", (v: number | null) => v],
  error: ["error", (v: string | null) => v],
};

export function updateItem(db: DatabaseSync, importId: string, seq: number, patch: ItemPatch): void {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as [keyof ItemPatch, unknown][]) {
    if (value === undefined) continue;
    const [column, encode] = ITEM_COLUMNS[key];
    sets.push(`${column} = ?`);
    values.push((encode as (v: unknown) => unknown)(value));
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE qb_import_items SET ${sets.join(", ")} WHERE import_id = ? AND seq = ?`).run(...(values as (string | number | null)[]), importId, seq);
}

export function itemCounts(db: DatabaseSync, importId: string): Record<ImportItemStatus, number> {
  const counts: Record<ImportItemStatus, number> = { pending: 0, submitted: 0, running: 0, done: 0, failed: 0, refused: 0 };
  for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM qb_import_items WHERE import_id = ? GROUP BY status").all(importId) as Row[]) {
    counts[row.status as ImportItemStatus] = Number(row.n);
  }
  return counts;
}

/**
 * Spend since `since` (epoch ms) over every import: finished calls plus the reservation of batch
 * requests still in flight (their `usd` holds the estimate until the result is ingested).
 */
export function spentSince(db: DatabaseSync, since: number): number {
  const row = db.prepare("SELECT COALESCE(SUM(usd), 0) AS total FROM qb_import_items WHERE finished_at >= ?").get(since) as Row;
  return Number(row.total ?? 0);
}

/** Wipes every item output of an import (close: the extracted text is deleted, usage kept). */
export function wipeOutputs(db: DatabaseSync, importId: string): void {
  db.prepare("UPDATE qb_import_items SET output = NULL WHERE import_id = ?").run(importId);
}

export function addUsageTotals(totals: UsageTotals, usage: CallUsage, usd: number, calls = 1): UsageTotals {
  return {
    inputTokens: totals.inputTokens + usage.inputTokens,
    outputTokens: totals.outputTokens + usage.outputTokens,
    cacheReadTokens: totals.cacheReadTokens + usage.cacheReadTokens,
    cacheWriteTokens: totals.cacheWriteTokens + usage.cacheWriteTokens,
    usd: Math.round((totals.usd + usd) * 1e6) / 1e6,
    calls: totals.calls + calls,
  };
}
