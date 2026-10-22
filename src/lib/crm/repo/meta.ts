import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { META_INBOX_STATUSES, type MetaInboxStatus, type MetaInboxVia } from "../lead-ops-types";
import { int, text, type Row } from "./rows";

/**
 * `crm_meta_inbox` — SQL only (owner: LR-META; docs/lead-routing-plan.md §12, §18.2–18.5). The
 * inbox holds Meta lead IDS waiting to be fetched (never answers, never Graph text): one row per
 * `leadgen_id`, claimed with an atomic per-row lease, retried with backoff, kept 30 / 90 days.
 * `last_error` is always a fixed code.
 */

export interface InboxRow {
  leadgenId: string;
  pageId: string | null;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
  metaCreatedAt: number | null;
  via: MetaInboxVia;
  status: MetaInboxStatus;
  attempts: number;
  nextAttemptAt: number;
  leaseUntil: number | null;
  lastError: string | null;
  leadId: string | null;
  receivedAt: number;
  processedAt: number | null;
}

const COLUMNS =
  "leadgen_id, page_id, form_id, ad_id, adgroup_id, meta_created_at, via, status, attempts, next_attempt_at, lease_until, last_error, lead_id, received_at, processed_at";

function toRow(row: Row): InboxRow {
  return {
    leadgenId: String(row.leadgen_id),
    pageId: text(row.page_id),
    formId: text(row.form_id),
    adId: text(row.ad_id),
    adgroupId: text(row.adgroup_id),
    metaCreatedAt: int(row.meta_created_at),
    via: String(row.via) as MetaInboxVia,
    status: String(row.status) as MetaInboxStatus,
    attempts: Number(row.attempts),
    nextAttemptAt: Number(row.next_attempt_at),
    leaseUntil: int(row.lease_until),
    lastError: text(row.last_error),
    leadId: text(row.lead_id),
    receivedAt: Number(row.received_at),
    processedAt: int(row.processed_at),
  };
}

/** Adds a lead id (INSERT OR IGNORE: a redelivery never makes a second row). True = inserted. */
export function insertInboxRow(
  db: DatabaseSync,
  input: {
    leadgenId: string;
    pageId?: string | null;
    formId?: string | null;
    adId?: string | null;
    adgroupId?: string | null;
    metaCreatedAt?: number | null;
    via: MetaInboxVia;
    status: "pending" | "held";
    now: number;
  },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO crm_meta_inbox
         (leadgen_id, page_id, form_id, ad_id, adgroup_id, meta_created_at, via, status, attempts, next_attempt_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      input.leadgenId,
      input.pageId ?? null,
      input.formId ?? null,
      input.adId ?? null,
      input.adgroupId ?? null,
      input.metaCreatedAt ?? null,
      input.via,
      input.status,
      input.now,
      input.now,
    );
  return Number(result.changes) > 0;
}

export function findInboxRow(db: DatabaseSync, leadgenId: string): InboxRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM crm_meta_inbox WHERE leadgen_id = ?`).get(leadgenId);
  return row ? toRow(row) : null;
}

/** Ids due now: pending ones whose time has come, and processing ones whose lease ran out. Oldest first. */
export function listDueInboxIds(db: DatabaseSync, now: number, limit: number): string[] {
  return db
    .prepare(
      `SELECT leadgen_id FROM crm_meta_inbox
       WHERE ((status = 'pending' AND next_attempt_at <= ?) OR (status = 'processing' AND lease_until < ?))
       ORDER BY next_attempt_at, received_at, leadgen_id LIMIT ?`,
    )
    .all(now, now, limit)
    .map((row) => String(row.leadgen_id));
}

/**
 * Atomic per-row lease (§18.3): only one worker wins a row. A stale `processing` row (lease ran
 * out: the worker died) can be claimed again. True = this caller holds the row until `now + leaseMs`.
 */
export function claimInboxRow(db: DatabaseSync, leadgenId: string, now: number, leaseMs: number): boolean {
  const result = db
    .prepare(
      `UPDATE crm_meta_inbox SET status = 'processing', lease_until = ?
       WHERE leadgen_id = ?
         AND (status = 'pending' OR (status = 'processing' AND lease_until < ?))
         AND next_attempt_at <= ?`,
    )
    .run(now + leaseMs, leadgenId, now, now);
  return Number(result.changes) > 0;
}

/** Final state (imported, duplicate, test, failed, unavailable, ignored). Releases the lease. */
export function finishInboxRow(
  db: DatabaseSync,
  leadgenId: string,
  input: { status: Exclude<MetaInboxStatus, "pending" | "held" | "processing">; leadId?: string | null; lastError?: string | null; attempts?: number; now: number },
): void {
  db.prepare(
    `UPDATE crm_meta_inbox SET status = ?, lead_id = COALESCE(?, lead_id), last_error = ?, attempts = COALESCE(?, attempts),
       lease_until = NULL, processed_at = ?
     WHERE leadgen_id = ?`,
  ).run(input.status, input.leadId ?? null, input.lastError ?? null, input.attempts ?? null, input.now, leadgenId);
}

/** Back to `pending` for a later try (`attempts` = the new count). Releases the lease. */
export function rescheduleInboxRow(db: DatabaseSync, leadgenId: string, input: { attempts: number; nextAttemptAt: number; lastError: string }): void {
  db.prepare("UPDATE crm_meta_inbox SET status = 'pending', attempts = ?, next_attempt_at = ?, last_error = ?, lease_until = NULL WHERE leadgen_id = ?").run(
    input.attempts,
    input.nextAttemptAt,
    input.lastError,
    leadgenId,
  );
}

/** Back to `pending` without counting an attempt (the queue paused; nothing was the item's fault). */
export function releaseInboxRow(db: DatabaseSync, leadgenId: string, input: { nextAttemptAt: number; lastError: string | null }): void {
  db.prepare("UPDATE crm_meta_inbox SET status = 'pending', next_attempt_at = ?, last_error = ?, lease_until = NULL WHERE leadgen_id = ?").run(
    input.nextAttemptAt,
    input.lastError,
    leadgenId,
  );
}

/** Held ids (the integration was not ready when they arrived) become pending now. Returns how many. */
export function releaseHeldRows(db: DatabaseSync, now: number): number {
  return Number(db.prepare("UPDATE crm_meta_inbox SET status = 'pending', next_attempt_at = ? WHERE status = 'held'").run(now).changes);
}

/** "Retry failed": failed items start again (attempts reset). Returns how many. */
export function retryFailedRows(db: DatabaseSync, now: number): number {
  return Number(
    db
      .prepare("UPDATE crm_meta_inbox SET status = 'pending', attempts = 0, next_attempt_at = ?, last_error = NULL, processed_at = NULL WHERE status = 'failed'")
      .run(now).changes,
  );
}

/** Rows per status (every status present, zero when none). */
export function countInboxByStatus(db: DatabaseSync): Record<MetaInboxStatus, number> {
  const counts = Object.fromEntries(META_INBOX_STATUSES.map((status) => [status, 0])) as Record<MetaInboxStatus, number>;
  for (const row of db.prepare("SELECT status, COUNT(*) AS n FROM crm_meta_inbox GROUP BY status").all()) {
    const status = String(row.status) as MetaInboxStatus;
    if (status in counts) counts[status] = Number(row.n);
  }
  return counts;
}

/** The super admin's inbox list (ids and fixed codes only), newest first. */
export function listInboxRows(db: DatabaseSync, input: { statuses?: readonly MetaInboxStatus[]; limit: number }): InboxRow[] {
  const statuses = input.statuses ?? [];
  const where = statuses.length > 0 ? `WHERE status IN (${statuses.map(() => "?").join(", ")})` : "";
  return db
    .prepare(`SELECT ${COLUMNS} FROM crm_meta_inbox ${where} ORDER BY received_at DESC, leadgen_id DESC LIMIT ?`)
    .all(...statuses, input.limit)
    .map(toRow);
}

/** Whether a lead id is already waiting / done in the inbox. */
export function hasInboxRow(db: DatabaseSync, leadgenId: string): boolean {
  return db.prepare("SELECT 1 AS one FROM crm_meta_inbox WHERE leadgen_id = ?").get(leadgenId) !== undefined;
}

/** Housekeeping: deletes finished rows of `statuses` processed before `before`. Returns how many. */
export function deleteInboxRowsBefore(db: DatabaseSync, statuses: readonly MetaInboxStatus[], before: number): number {
  if (statuses.length === 0) return 0;
  return Number(
    db
      .prepare(`DELETE FROM crm_meta_inbox WHERE status IN (${statuses.map(() => "?").join(", ")}) AND processed_at IS NOT NULL AND processed_at < ?`)
      .run(...statuses, before).changes,
  );
}

/**
 * Leads captured in Meta test mode (§18.7, A14) whose first test submission is older than `before`
 * and that are not erased yet. Only leads whose EVERY submission / staff entry is a test one: a
 * real family's lead is never picked, even if a test number happens to match it.
 */
export function listExpiredTestLeadIds(db: DatabaseSync, before: number, limit = 50): string[] {
  return db
    .prepare(
      `SELECT l.id AS id FROM crm_leads l
       WHERE l.erased_at IS NULL
         AND EXISTS (SELECT 1 FROM crm_activities a WHERE a.lead_id = l.id AND a.type = 'submission' AND json_extract(a.meta, '$.test') = 1 AND a.at < ?)
         AND NOT EXISTS (
           SELECT 1 FROM crm_activities a WHERE a.lead_id = l.id AND a.type IN ('submission', 'created')
             AND COALESCE(json_extract(a.meta, '$.test'), 0) <> 1)
       ORDER BY l.created_at LIMIT ?`,
    )
    .all(before, limit)
    .map((row) => String(row.id));
}
