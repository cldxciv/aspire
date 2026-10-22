import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { ClockReason } from "../lead-ops-types";
import { areaClause, scopeClause, type LeadScope } from "./leads";
import { int, text, type Row } from "./rows";
import { mapClockRow, type ClockRow } from "./sla-core";

/**
 * First-call clock SQL owned by LR-SLA (docs/lead-routing-plan.md §15, §16): clock counters,
 * policy recompute, the assignment history behind "who held the lead at due time" (A10), the
 * queues and counts behind the alert strip, and the scope / area clauses the dashboard shares.
 * Row access shared with CORE (insert / resolve / close) is in ./sla-core.ts.
 *
 * Read paths never write and never open a transaction.
 */

const CLOCK_COLUMNS = `id, lead_id, reason, source, started_at, due_at, tier1_at, tier2_at, policy_version, resolved_at, resolution,
  first_attempt_at, first_attempt_by, first_attempt_channel, assignee_at_due, work_ms, met, attempts, retries_created, reached_at`;

export function findClockById(db: DatabaseSync, id: number): ClockRow | null {
  const row = db.prepare(`SELECT ${CLOCK_COLUMNS} FROM crm_sla_clocks WHERE id = ?`).get(id);
  return row ? mapClockRow(row) : null;
}

/** One more contact attempt on a clock (after the first; `resolveClock` counts the first). */
export function bumpClockAttempts(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE crm_sla_clocks SET attempts = attempts + 1 WHERE id = ?").run(id);
}

/** First "reached the family" time (A6); kept once set. True when this call set it. */
export function markClockReached(db: DatabaseSync, id: number, at: number): boolean {
  return Number(db.prepare("UPDATE crm_sla_clocks SET reached_at = ? WHERE id = ? AND reached_at IS NULL").run(at, id).changes) > 0;
}

export function bumpClockRetries(db: DatabaseSync, id: number): void {
  db.prepare("UPDATE crm_sla_clocks SET retries_created = retries_created + 1 WHERE id = ?").run(id);
}

export interface OpenClockTimes {
  id: number;
  startedAt: number;
  dueAt: number;
  tier1At: number | null;
  tier2At: number | null;
  policyVersion: number;
}

export function listOpenClockTimes(db: DatabaseSync): OpenClockTimes[] {
  return db
    .prepare("SELECT id, started_at, due_at, tier1_at, tier2_at, policy_version FROM crm_sla_clocks WHERE resolved_at IS NULL ORDER BY id")
    .all()
    .map((row) => ({
      id: Number(row.id),
      startedAt: Number(row.started_at),
      dueAt: Number(row.due_at),
      tier1At: int(row.tier1_at),
      tier2At: int(row.tier2_at),
      policyVersion: Number(row.policy_version),
    }));
}

export function updateClockTimes(
  db: DatabaseSync,
  id: number,
  times: { dueAt: number; tier1At: number | null; tier2At: number | null; policyVersion: number },
): void {
  db.prepare("UPDATE crm_sla_clocks SET due_at = ?, tier1_at = ?, tier2_at = ?, policy_version = ? WHERE id = ? AND resolved_at IS NULL").run(
    times.dueAt,
    times.tier1At,
    times.tier2At,
    times.policyVersion,
    id,
  );
}

// ---------------------------------------------------------------------------------------------
// Assignment history (A10)

/** The latest `assignment` entry at or before `at`: `found` with its `to` (null = moved to the queue). */
export function lastAssignmentAtOrBefore(db: DatabaseSync, leadId: string, at: number): { found: boolean; to: string | null } {
  const row = db
    .prepare(
      `SELECT json_extract(meta, '$.to') AS to_id FROM crm_activities
        WHERE lead_id = ? AND type = 'assignment' AND at <= ? ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .get(leadId, at);
  return row ? { found: true, to: text(row.to_id) } : { found: false, to: null };
}

/** The earliest `assignment` entry of a lead: `found` with its `from` (who held the lead before it). */
export function earliestAssignment(db: DatabaseSync, leadId: string): { found: boolean; from: string | null } {
  const row = db
    .prepare(`SELECT json_extract(meta, '$.from') AS from_id FROM crm_activities WHERE lead_id = ? AND type = 'assignment' ORDER BY at ASC, id ASC LIMIT 1`)
    .get(leadId);
  return row ? { found: true, from: text(row.from_id) } : { found: false, from: null };
}

// ---------------------------------------------------------------------------------------------
// Scope and lead filters (shared with ./dashboard.ts)

/**
 * The record-level scope as SQL on `crm_leads l`: CORE's own `scopeClause` from repo/leads.ts, so
 * the SLA views, the dashboard and the inbox can never drift apart (the parity test "scope SQL
 * matches CORE's inbox" in src/lib/crm/sla/sla.test.ts still guards it).
 */
export function scopeWhere(scope: LeadScope, where: string[], values: SQLInputValue[]): void {
  scopeClause(scope, where, values);
}

/** Lead filters the SLA views and the dashboard combine (all optional, all ANDed). */
export interface LeadFilter {
  scope?: LeadScope;
  /** A user id, or `unassigned`. */
  assignee?: string;
  /** Routing area in this list (an empty list matches nothing). */
  areaIn?: readonly string[];
  /**
   * `none` = no area and not a tool sign-up (the super admin's Unassigned queue); `tool_signups` =
   * no area, every arrival a tool sign-up; `no_area` = either.
   */
  areaKind?: "none" | "tool_signups" | "no_area";
}

export function leadFilterWhere(filter: LeadFilter, where: string[], values: SQLInputValue[]): void {
  where.push("l.erased_at IS NULL");
  if (filter.scope) scopeWhere(filter.scope, where, values);
  if (filter.assignee === "unassigned") where.push("l.assigned_to IS NULL");
  else if (filter.assignee) {
    where.push("l.assigned_to = ?");
    values.push(filter.assignee);
  }
  if (filter.areaIn) {
    if (filter.areaIn.length === 0) where.push("0");
    else {
      where.push(`EXISTS (SELECT 1 FROM crm_lead_routing ar WHERE ar.lead_id = l.id AND ar.area_id IN (${filter.areaIn.map(() => "?").join(", ")}))`);
      values.push(...filter.areaIn);
    }
  }
  if (filter.areaKind === "none" || filter.areaKind === "tool_signups") {
    areaClause(filter.areaKind, where, values);
  } else if (filter.areaKind === "no_area") {
    where.push("NOT EXISTS (SELECT 1 FROM crm_lead_routing ar WHERE ar.lead_id = l.id AND ar.area_id IS NOT NULL)");
  }
}

// ---------------------------------------------------------------------------------------------
// Open clocks with their leads (queues, summary, dashboard "now")

export interface OpenClockLeadRow {
  clockId: number;
  leadId: string;
  reason: ClockReason;
  source: string;
  startedAt: number;
  dueAt: number;
  tier1At: number | null;
  tier2At: number | null;
  studentName: string | null;
  contactName: string | null;
  guardianName: string | null;
  phoneE164: string | null;
  centreSlug: string | null;
  areaId: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
}

export interface OpenClockQuery extends LeadFilter {
  /** Late at this time: past due, or past the area-head step. */
  lateAt?: number;
  /** Late at this time OR nobody assigned. */
  lateOrUnassignedAt?: number;
  /** Past the super-admin step at this time. */
  escalatedAt?: number;
  /** Past the area-head step at this time (tier 1 alerted). */
  tier1At?: number;
  limit: number;
}

function mapOpenClockLead(row: Row): OpenClockLeadRow {
  const reason = String(row.reason);
  return {
    clockId: Number(row.clock_id),
    leadId: String(row.lead_id),
    reason: reason === "reopened" || reason === "import" ? reason : "new",
    source: String(row.source),
    startedAt: Number(row.started_at),
    dueAt: Number(row.due_at),
    tier1At: int(row.tier1_at),
    tier2At: int(row.tier2_at),
    studentName: text(row.student_name),
    contactName: text(row.contact_name),
    guardianName: text(row.guardian_name),
    phoneE164: text(row.phone_e164),
    centreSlug: text(row.centre_slug),
    areaId: text(row.area_id),
    assignedTo: text(row.assigned_to),
    assigneeName: text(row.assignee_name),
  };
}

/** Open clocks (on live leads) matching `query`, earliest due first, with the total count. */
export function queryOpenClocks(db: DatabaseSync, query: OpenClockQuery): { rows: OpenClockLeadRow[]; total: number } {
  const where: string[] = ["c.resolved_at IS NULL"];
  const values: SQLInputValue[] = [];
  leadFilterWhere(query, where, values);
  if (query.lateAt !== undefined) {
    where.push("(c.due_at <= ? OR c.tier1_at <= ?)");
    values.push(query.lateAt, query.lateAt);
  }
  if (query.lateOrUnassignedAt !== undefined) {
    where.push("(c.due_at <= ? OR c.tier1_at <= ? OR l.assigned_to IS NULL)");
    values.push(query.lateOrUnassignedAt, query.lateOrUnassignedAt);
  }
  if (query.escalatedAt !== undefined) {
    where.push("c.tier2_at <= ?");
    values.push(query.escalatedAt);
  }
  if (query.tier1At !== undefined) {
    where.push("c.tier1_at <= ?");
    values.push(query.tier1At);
  }
  const sql = `FROM crm_sla_clocks c JOIN crm_leads l ON l.id = c.lead_id WHERE ${where.join(" AND ")}`;
  const total = Number(db.prepare(`SELECT COUNT(*) AS n ${sql}`).get(...values)?.n ?? 0);
  const rows = db
    .prepare(
      `SELECT c.id AS clock_id, c.lead_id, c.reason, c.source, c.started_at, c.due_at, c.tier1_at, c.tier2_at,
              l.student_name, l.contact_name, l.guardian_name, l.phone_e164, l.centre_slug, l.assigned_to,
              (SELECT area_id FROM crm_lead_routing WHERE lead_id = l.id) AS area_id,
              (SELECT display_name FROM users WHERE id = l.assigned_to) AS assignee_name
         ${sql} ORDER BY c.due_at ASC, c.id ASC LIMIT ?`,
    )
    .all(...values, query.limit)
    .map(mapOpenClockLead);
  return { rows, total };
}

// ---------------------------------------------------------------------------------------------
// Open, unassigned leads (queues without a clock)

const OPEN_UNASSIGNED = "l.erased_at IS NULL AND l.stage NOT IN ('enrolled', 'lost') AND l.assigned_to IS NULL";

/** Open leads nobody holds, per routing area (only areas with at least one). */
export function countOpenUnassignedByArea(db: DatabaseSync, filter: LeadFilter = {}): Map<string, number> {
  const where: string[] = [OPEN_UNASSIGNED, "r.area_id IS NOT NULL"];
  const values: SQLInputValue[] = [];
  leadFilterWhere({ ...filter, assignee: undefined }, where, values);
  const counts = new Map<string, number>();
  for (const row of db
    .prepare(`SELECT r.area_id, COUNT(*) AS n FROM crm_leads l JOIN crm_lead_routing r ON r.lead_id = l.id WHERE ${where.join(" AND ")} GROUP BY r.area_id`)
    .all(...values)) {
    counts.set(String(row.area_id), Number(row.n));
  }
  return counts;
}

/** Open leads nobody holds in the super admin's queues: no area (`none`) or tool sign-ups. */
export function countOpenUnassigned(db: DatabaseSync, areaKind: "none" | "tool_signups"): number {
  const where: string[] = [OPEN_UNASSIGNED];
  const values: SQLInputValue[] = [];
  leadFilterWhere({ areaKind }, where, values);
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM crm_leads l WHERE ${where.join(" AND ")}`).get(...values)?.n ?? 0);
}

// ---------------------------------------------------------------------------------------------
// Areas: who gets the tier-1 alert (§15)

export interface AreaAlertInfo {
  id: string;
  nameEn: string;
  nameHi: string;
  active: boolean;
  /** An active head (manager on an enabled staff account) is a member. */
  hasHead: boolean;
  /** The area that owns this area's serving centre (null = none / itself). */
  servingAreaId: string | null;
}

export function listAreaAlertInfo(db: DatabaseSync): AreaAlertInfo[] {
  return db
    .prepare(
      `SELECT a.id, a.name_en, a.name_hi, a.active,
              EXISTS (SELECT 1 FROM crm_area_members hm
                        JOIN crm_staff hs ON hs.user_id = hm.user_id AND hs.crm_role = 'manager' AND hs.active = 1
                        JOIN users hu ON hu.id = hm.user_id AND hu.disabled = 0 AND hu.role = 'staff'
                       WHERE hm.area_id = a.id) AS has_head,
              (SELECT ac.area_id FROM crm_area_centres ac WHERE ac.centre_slug = a.default_centre_slug) AS serving_area_id
         FROM crm_areas a ORDER BY a.position, a.id`,
    )
    .all()
    .map((row) => {
      const serving = text(row.serving_area_id);
      return {
        id: String(row.id),
        nameEn: String(row.name_en),
        nameHi: String(row.name_hi),
        active: Number(row.active) === 1,
        hasHead: Number(row.has_head) === 1,
        servingAreaId: serving === String(row.id) ? null : serving,
      };
    });
}

// ---------------------------------------------------------------------------------------------
// Retry tasks, staff, Meta counts

/** Open system "Call again" tasks of `userId` due by `now` (on live leads). */
export function countRetriesDue(db: DatabaseSync, userId: string, title: string, now: number): number {
  return Number(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM crm_tasks t JOIN crm_leads l ON l.id = t.lead_id
          WHERE t.assignee_id = ? AND t.done_at IS NULL AND t.created_by IS NULL AND t.title = ? AND t.due_at <= ? AND l.erased_at IS NULL`,
      )
      .get(userId, title, now)?.n ?? 0,
  );
}

export interface AwayStaffRow {
  userId: string;
  name: string;
  awayUntil: number;
}

/** Staff marked away at `now` (enabled accounts with an active membership), soonest back first. */
export function listAwayStaff(db: DatabaseSync, now: number): AwayStaffRow[] {
  return db
    .prepare(
      `SELECT a.user_id, a.away_until, u.display_name FROM crm_staff_availability a
         JOIN users u ON u.id = a.user_id AND u.disabled = 0
         JOIN crm_staff s ON s.user_id = a.user_id AND s.active = 1
        WHERE a.away_until > ? ORDER BY a.away_until, u.display_name COLLATE NOCASE`,
    )
    .all(now)
    .map((row) => ({ userId: String(row.user_id), name: String(row.display_name), awayUntil: Number(row.away_until) }));
}

/** Members (any role) of any of `areaIds`. */
export function listMemberIdsOfAreas(db: DatabaseSync, areaIds: readonly string[]): Set<string> {
  if (areaIds.length === 0) return new Set();
  return new Set(
    db
      .prepare(`SELECT DISTINCT user_id FROM crm_area_members WHERE area_id IN (${areaIds.map(() => "?").join(", ")})`)
      .all(...areaIds)
      .map((row) => String(row.user_id)),
  );
}
