import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { int, text, type Row } from "./rows";

/**
 * `crm_wa_templates` SQL (docs/admin-phase-1b-plan.md §3, §5.D; owner: 1B-CALLS; D-037). Staff
 * WhatsApp templates: the text only pre-fills a wa.me link; the system never sends (D-041).
 * Writes use the optimistic `version` lock (`WHERE version = ?`).
 */

export type TemplateStatusValue = "draft" | "approved" | "retired";
export type TemplateBodyColumn = "body_en" | "body_hi" | "body_hinglish";

export interface TemplateRow {
  key: string;
  context: string;
  position: number;
  status: TemplateStatusValue;
  bodyEn: string;
  bodyHi: string;
  bodyHinglish: string;
  version: number;
  seeded: boolean;
  createdAt: number;
  updatedAt: number;
  updatedBy: string | null;
  approvedAt: number | null;
  approvedBy: string | null;
  approvedByName: string | null;
}

const SELECT = `
  SELECT t.*, u.display_name AS approved_by_name
    FROM crm_wa_templates t LEFT JOIN users u ON u.id = t.approved_by`;

function statusOf(value: unknown): TemplateStatusValue {
  return value === "approved" || value === "retired" ? value : "draft";
}

function mapTemplate(row: Row): TemplateRow {
  return {
    key: String(row.key),
    context: String(row.context),
    position: Number(row.position),
    status: statusOf(row.status),
    bodyEn: String(row.body_en),
    bodyHi: String(row.body_hi),
    bodyHinglish: String(row.body_hinglish),
    version: Number(row.version),
    seeded: Number(row.seeded) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    updatedBy: text(row.updated_by),
    approvedAt: int(row.approved_at),
    approvedBy: text(row.approved_by),
    approvedByName: text(row.approved_by_name),
  };
}

/** Every stored key (lock-free; the seeding check). */
export function listTemplateKeys(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT key FROM crm_wa_templates")
    .all()
    .map((row) => String(row.key));
}

/** Seeds one draft if the key is missing (`INSERT OR IGNORE`). Returns true when a row was added. */
export function insertTemplateIfMissing(
  db: DatabaseSync,
  input: { key: string; context: string; position: number; bodyEn: string; bodyHi: string; bodyHinglish: string; now: number },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO crm_wa_templates
         (key, context, position, status, body_en, body_hi, body_hinglish, version, seeded, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, 1, 1, ?, ?)`,
    )
    .run(input.key, input.context, input.position, input.bodyEn, input.bodyHi, input.bodyHinglish, input.now, input.now);
  return Number(result.changes) > 0;
}

/** Templates by context and / or status, in page order (context, position, key). */
export function listTemplateRows(db: DatabaseSync, filter: { context?: string; status?: TemplateStatusValue } = {}): TemplateRow[] {
  const where: string[] = [];
  const values: SQLInputValue[] = [];
  if (filter.context !== undefined) {
    where.push("t.context = ?");
    values.push(filter.context);
  }
  if (filter.status !== undefined) {
    where.push("t.status = ?");
    values.push(filter.status);
  }
  return db
    .prepare(`${SELECT}${where.length > 0 ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY t.context, t.position, t.key`)
    .all(...values)
    .map(mapTemplate);
}

export function findTemplateRow(db: DatabaseSync, key: string): TemplateRow | null {
  const row = db.prepare(`${SELECT} WHERE t.key = ?`).get(key);
  return row ? mapTemplate(row) : null;
}

/**
 * Replaces one language's body (version + 1, no longer an untouched seed). `toDraft` sends an
 * approved template back for approval. Returns false when the version did not match.
 */
export function updateTemplateBody(
  db: DatabaseSync,
  input: { key: string; column: TemplateBodyColumn; body: string; expectedVersion: number; toDraft: boolean; actorId: string; now: number },
): boolean {
  const draft = input.toDraft ? ", status = 'draft', approved_at = NULL, approved_by = NULL" : "";
  const result = db
    .prepare(
      `UPDATE crm_wa_templates
          SET ${input.column} = ?, version = version + 1, seeded = 0, updated_at = ?, updated_by = ?${draft}
        WHERE key = ? AND version = ?`,
    )
    .run(input.body, input.now, input.actorId, input.key, input.expectedVersion);
  return Number(result.changes) > 0;
}

/** Sets the status (version + 1); `approved` records who and when, any other status clears it. */
export function updateTemplateStatus(
  db: DatabaseSync,
  input: { key: string; status: TemplateStatusValue; expectedVersion: number; actorId: string; now: number },
): boolean {
  const approved = input.status === "approved";
  const result = db
    .prepare(
      `UPDATE crm_wa_templates
          SET status = ?, version = version + 1, updated_at = ?, updated_by = ?, approved_at = ?, approved_by = ?
        WHERE key = ? AND version = ?`,
    )
    .run(input.status, input.now, input.actorId, approved ? input.now : null, approved ? input.actorId : null, input.key, input.expectedVersion);
  return Number(result.changes) > 0;
}
