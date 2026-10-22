import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ClockReason, ClockResolution, FirstAttemptChannel } from "../lead-ops-types";
import { int, text, type Row } from "./rows";

/**
 * `crm_sla_clocks` core access (owner: LR-CORE; docs/lead-routing-plan.md §12, §15). One open clock
 * per lead at most (partial unique index). The clock policy (when to start, due / tier maths,
 * retries, views) is LR-SLA's (src/lib/crm/sla/**, src/lib/crm/repo/sla.ts); this file is the
 * shared row access both sides use.
 */

export interface ClockRow {
  id: number;
  leadId: string;
  reason: ClockReason;
  source: string;
  startedAt: number;
  dueAt: number;
  tier1At: number | null;
  tier2At: number | null;
  policyVersion: number;
  resolvedAt: number | null;
  resolution: ClockResolution | null;
  firstAttemptAt: number | null;
  firstAttemptBy: string | null;
  firstAttemptChannel: FirstAttemptChannel | null;
  assigneeAtDue: string | null;
  workMs: number | null;
  met: boolean | null;
  attempts: number;
  retriesCreated: number;
  reachedAt: number | null;
}

const COLUMNS = `id, lead_id, reason, source, started_at, due_at, tier1_at, tier2_at, policy_version, resolved_at, resolution,
  first_attempt_at, first_attempt_by, first_attempt_channel, assignee_at_due, work_ms, met, attempts, retries_created, reached_at`;

export function mapClockRow(row: Row): ClockRow {
  const met = int(row.met);
  return {
    id: Number(row.id),
    leadId: String(row.lead_id),
    reason: String(row.reason) as ClockReason,
    source: String(row.source),
    startedAt: Number(row.started_at),
    dueAt: Number(row.due_at),
    tier1At: int(row.tier1_at),
    tier2At: int(row.tier2_at),
    policyVersion: Number(row.policy_version),
    resolvedAt: int(row.resolved_at),
    resolution: text(row.resolution) as ClockResolution | null,
    firstAttemptAt: int(row.first_attempt_at),
    firstAttemptBy: text(row.first_attempt_by),
    firstAttemptChannel: text(row.first_attempt_channel) as FirstAttemptChannel | null,
    assigneeAtDue: text(row.assignee_at_due),
    workMs: int(row.work_ms),
    met: met === null ? null : met === 1,
    attempts: Number(row.attempts ?? 0),
    retriesCreated: Number(row.retries_created ?? 0),
    reachedAt: int(row.reached_at),
  };
}

/** The lead's open clock, or null. */
export function findOpenClock(db: DatabaseSync, leadId: string): ClockRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM crm_sla_clocks WHERE lead_id = ? AND resolved_at IS NULL`).get(leadId);
  return row ? mapClockRow(row) : null;
}

/** The lead's latest clock (open or resolved), or null. */
export function findLatestClock(db: DatabaseSync, leadId: string): ClockRow | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM crm_sla_clocks WHERE lead_id = ? ORDER BY started_at DESC, id DESC LIMIT 1`).get(leadId);
  return row ? mapClockRow(row) : null;
}

/** Whether the lead ever had a clock. */
export function hasAnyClock(db: DatabaseSync, leadId: string): boolean {
  return db.prepare("SELECT 1 AS ok FROM crm_sla_clocks WHERE lead_id = ? LIMIT 1").get(leadId) !== undefined;
}

/**
 * Starts a clock (fails with a constraint error if one is already open: callers check first).
 * Returns the new row id.
 */
export function insertClock(
  db: DatabaseSync,
  input: {
    leadId: string;
    reason: ClockReason;
    source: string;
    startedAt: number;
    dueAt: number;
    tier1At: number | null;
    tier2At: number | null;
    policyVersion: number;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO crm_sla_clocks (lead_id, reason, source, started_at, due_at, tier1_at, tier2_at, policy_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.leadId, input.reason, input.source, input.startedAt, input.dueAt, input.tier1At, input.tier2At, input.policyVersion);
  return Number(result.lastInsertRowid);
}

/** Resolves an open clock by the first qualifying attempt (§15). Returns false when it was not open. */
export function resolveClock(
  db: DatabaseSync,
  clockId: number,
  input: {
    at: number;
    by: string | null;
    channel: FirstAttemptChannel;
    assigneeAtDue: string | null;
    workMs: number;
    met: boolean;
  },
): boolean {
  const result = db
    .prepare(
      `UPDATE crm_sla_clocks
          SET resolved_at = ?, resolution = 'attempt', first_attempt_at = ?, first_attempt_by = ?, first_attempt_channel = ?,
              assignee_at_due = ?, work_ms = ?, met = ?, attempts = attempts + 1
        WHERE id = ? AND resolved_at IS NULL`,
    )
    .run(input.at, input.at, input.by, input.channel, input.assigneeAtDue, input.workMs, input.met ? 1 : 0, clockId);
  return Number(result.changes) > 0;
}

/** Closes the lead's open clock without an attempt (`closed` on lost, `erased` on erase). */
export function closeClock(db: DatabaseSync, leadId: string, resolution: "closed" | "erased", at: number): boolean {
  const result = db
    .prepare("UPDATE crm_sla_clocks SET resolved_at = ?, resolution = ? WHERE lead_id = ? AND resolved_at IS NULL")
    .run(at, resolution, leadId);
  return Number(result.changes) > 0;
}

/** Open first-call clocks per assignee of the lead (load-aware picking, A5). */
export function openClockCountsByAssignee(db: DatabaseSync): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT l.assigned_to AS user_id, COUNT(*) AS n
         FROM crm_sla_clocks c JOIN crm_leads l ON l.id = c.lead_id
        WHERE c.resolved_at IS NULL AND l.assigned_to IS NOT NULL AND l.erased_at IS NULL
        GROUP BY l.assigned_to`,
    )
    .all()) {
    counts.set(String(row.user_id), Number(row.n));
  }
  return counts;
}
