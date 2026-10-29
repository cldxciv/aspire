import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { EFFECTIVE_CENTRE_SQL } from "./console-sql";
import { int, text, type Row } from "./rows";

/**
 * SQL of the family record (docs/admin-phase-1b-plan.md §5.E, §5.F, §5.H, §6.5; owner: 1B-FAMILY;
 * D-037): `crm_lead_details`, `crm_duplicate_dismissals`, `crm_lost_reviews` and the read-only
 * queries over leads and their timeline. Never writes `crm_leads`, `crm_tasks` or `crm_activities`:
 * those changes go through the CRM services so their hooks (lead routing's first-call clock) fire.
 * Every lead query takes the viewer's scope as `scopedLeadWhere(…)` output (never a copy).
 */

/** `scopedLeadWhere(leadScopeFor(viewer))`: one SQL condition on `crm_leads l` plus its values. */
export interface ScopeSql {
  sql: string;
  values: SQLInputValue[];
}

// ---------------------------------------------------------------------------------------------
// More details (`crm_lead_details`, one row per lead)

export interface LeadDetailsRow {
  leadId: string;
  altPhoneE164: string | null;
  school: string | null;
  board: string | null;
  hostel: string | null;
  targetExam: string | null;
  targetYear: number | null;
  heardVia: string | null;
  referredBy: string | null;
  intakeSession: string | null;
  preferredTime: string | null;
  decisionMaker: string | null;
  updatedAt: number;
  updatedBy: string | null;
}

export type LeadDetailsValues = Omit<LeadDetailsRow, "leadId" | "updatedAt" | "updatedBy">;

function mapDetails(row: Row): LeadDetailsRow {
  return {
    leadId: String(row.lead_id),
    altPhoneE164: text(row.alt_phone_e164),
    school: text(row.school),
    board: text(row.board),
    hostel: text(row.hostel),
    targetExam: text(row.target_exam),
    targetYear: int(row.target_year),
    heardVia: text(row.heard_via),
    referredBy: text(row.referred_by),
    intakeSession: text(row.intake_session),
    preferredTime: text(row.preferred_time),
    decisionMaker: text(row.decision_maker),
    updatedAt: Number(row.updated_at),
    updatedBy: text(row.updated_by),
  };
}

export function findLeadDetailsRow(db: DatabaseSync, leadId: string): LeadDetailsRow | null {
  const row = db.prepare("SELECT * FROM crm_lead_details WHERE lead_id = ?").get(leadId);
  return row ? mapDetails(row) : null;
}

/** Writes every column of the lead's details row (insert or replace the values). */
export function upsertLeadDetails(db: DatabaseSync, leadId: string, values: LeadDetailsValues, actorId: string | null, now: number): void {
  db.prepare(
    `INSERT INTO crm_lead_details (lead_id, alt_phone_e164, school, board, hostel, target_exam, target_year, heard_via, referred_by,
                                   intake_session, preferred_time, decision_maker, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (lead_id) DO UPDATE SET
       alt_phone_e164 = excluded.alt_phone_e164, school = excluded.school, board = excluded.board, hostel = excluded.hostel,
       target_exam = excluded.target_exam, target_year = excluded.target_year, heard_via = excluded.heard_via,
       referred_by = excluded.referred_by, intake_session = excluded.intake_session, preferred_time = excluded.preferred_time,
       decision_maker = excluded.decision_maker, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(
    leadId,
    values.altPhoneE164,
    values.school,
    values.board,
    values.hostel,
    values.targetExam,
    values.targetYear,
    values.heardVia,
    values.referredBy,
    values.intakeSession,
    values.preferredTime,
    values.decisionMaker,
    now,
    actorId,
  );
}

// ---------------------------------------------------------------------------------------------
// Possible duplicates

/** A candidate lead (live, in the viewer's scope) with the fields the suggestion shows. */
export interface DuplicateCandidateRow {
  id: string;
  studentName: string | null;
  guardianName: string | null;
  contactName: string | null;
  phoneE164: string | null;
  altPhoneE164: string | null;
  currentClass: string | null;
  effectiveCentre: string | null;
  stage: string;
  assignedTo: string | null;
  assigneeName: string | null;
  createdAt: number;
}

const CANDIDATE_SELECT = `
  SELECT l.id, l.student_name, l.guardian_name, l.contact_name, l.phone_e164, d.alt_phone_e164, l.current_class,
         ${EFFECTIVE_CENTRE_SQL} AS effective_centre, l.stage, l.assigned_to, u.display_name AS assignee_name, l.created_at
    FROM crm_leads l
    LEFT JOIN crm_lead_details d ON d.lead_id = l.id
    LEFT JOIN users u ON u.id = l.assigned_to`;

/** Pairs marked "Not the same family" are never suggested again (either order). */
const NOT_DISMISSED = `NOT EXISTS (SELECT 1 FROM crm_duplicate_dismissals dd
  WHERE (dd.lead_a = l.id AND dd.lead_b = ?) OR (dd.lead_a = ? AND dd.lead_b = l.id))`;

/**
 * An enquiry already marked lost as a duplicate is settled, so it is not suggested on the other
 * family's page (otherwise the only way to hide it would be a false "Not the same family").
 */
const NOT_CLOSED_AS_DUPLICATE = "NOT (l.stage = 'lost' AND COALESCE(l.lost_reason, '') = 'duplicate')";

function mapCandidate(row: Row): DuplicateCandidateRow {
  return {
    id: String(row.id),
    studentName: text(row.student_name),
    guardianName: text(row.guardian_name),
    contactName: text(row.contact_name),
    phoneE164: text(row.phone_e164),
    altPhoneE164: text(row.alt_phone_e164),
    currentClass: text(row.current_class),
    effectiveCentre: text(row.effective_centre),
    stage: String(row.stage),
    assignedTo: text(row.assigned_to),
    assigneeName: text(row.assignee_name),
    createdAt: Number(row.created_at),
  };
}

/**
 * Rule (a): other live leads in scope, not dismissed with `leadId`, whose main number is this
 * lead's second number, whose second number is this lead's main number, or whose second number is
 * this lead's second number (non-null numbers only). Newest first.
 */
export function findPhoneDuplicateCandidates(
  db: DatabaseSync,
  input: { leadId: string; phone: string | null; altPhone: string | null },
  scope: ScopeSql,
  limit: number,
): DuplicateCandidateRow[] {
  const matches: string[] = [];
  const values: SQLInputValue[] = [];
  if (input.altPhone) {
    matches.push("l.phone_e164 = ?", "d.alt_phone_e164 = ?");
    values.push(input.altPhone, input.altPhone);
  }
  if (input.phone) {
    matches.push("d.alt_phone_e164 = ?");
    values.push(input.phone);
  }
  if (matches.length === 0) return [];
  return db
    .prepare(
      `${CANDIDATE_SELECT}
        WHERE l.id <> ? AND l.erased_at IS NULL AND ${NOT_CLOSED_AS_DUPLICATE} AND (${scope.sql}) AND (${matches.join(" OR ")}) AND ${NOT_DISMISSED}
        ORDER BY l.created_at DESC, l.id
        LIMIT ?`,
    )
    .all(input.leadId, ...scope.values, ...values, input.leadId, input.leadId, limit)
    .map(mapCandidate);
}

/**
 * Rule (b), first pass: other live leads in scope, not dismissed with `leadId`, with a student
 * name, the same class and the same (non-null) effective centre. The caller compares the
 * normalised names (NFKC, lower case, collapsed spaces), which SQLite cannot do. Newest first.
 */
export function findNameDuplicateCandidates(
  db: DatabaseSync,
  input: { leadId: string; currentClass: string; effectiveCentre: string },
  scope: ScopeSql,
  limit: number,
): { id: string; studentName: string }[] {
  return db
    .prepare(
      `SELECT l.id, l.student_name FROM crm_leads l
        WHERE l.id <> ? AND l.erased_at IS NULL AND ${NOT_CLOSED_AS_DUPLICATE} AND (${scope.sql}) AND l.student_name IS NOT NULL
          AND l.current_class = ? AND ${EFFECTIVE_CENTRE_SQL} = ? AND ${NOT_DISMISSED}
        ORDER BY l.created_at DESC, l.id
        LIMIT ?`,
    )
    .all(input.leadId, ...scope.values, input.currentClass, input.effectiveCentre, input.leadId, input.leadId, limit)
    .map((row) => ({ id: String(row.id), studentName: String(row.student_name) }));
}

/** The suggestion fields of the given leads (no scope check: the ids come from scoped queries). */
export function findDuplicateCandidatesByIds(db: DatabaseSync, ids: readonly string[]): DuplicateCandidateRow[] {
  if (ids.length === 0) return [];
  return db
    .prepare(`${CANDIDATE_SELECT} WHERE l.id IN (${ids.map(() => "?").join(", ")})`)
    .all(...ids)
    .map(mapCandidate);
}

/** "Not the same family" for the ordered pair (`a < b`). True when it was new. */
export function insertDuplicateDismissal(db: DatabaseSync, a: string, b: string, actorId: string | null, now: number): boolean {
  const [first, second] = a < b ? [a, b] : [b, a];
  const result = db
    .prepare("INSERT OR IGNORE INTO crm_duplicate_dismissals (lead_a, lead_b, dismissed_at, dismissed_by) VALUES (?, ?, ?, ?)")
    .run(first, second, now, actorId);
  return Number(result.changes) > 0;
}

export function isDuplicateDismissed(db: DatabaseSync, a: string, b: string): boolean {
  const [first, second] = a < b ? [a, b] : [b, a];
  return db.prepare("SELECT 1 AS hit FROM crm_duplicate_dismissals WHERE lead_a = ? AND lead_b = ?").get(first, second) !== undefined;
}

// ---------------------------------------------------------------------------------------------
// Lost review (§6.5): one event per `stage_change` INTO lost (a reason edit on a lost lead,
// `from = lost`, is not a new event), keyed by the activity's `at`.

const LOST_EVENT_WHERE = `a.type = 'stage_change' AND json_extract(a.meta, '$.to') = 'lost'
  AND COALESCE(json_extract(a.meta, '$.from'), '') <> 'lost'`;

/** Contacts strictly before the lost change (same instant: logged earlier). */
const BEFORE_EVENT = "(c.at < a.at OR (c.at = a.at AND c.id < a.id))";

export interface LostEventRow {
  activityId: number;
  leadId: string;
  lostAt: number;
  fromStage: string | null;
  reason: string | null;
  actorId: string | null;
  actorName: string | null;
  studentName: string | null;
  guardianName: string | null;
  contactName: string | null;
  leadCreatedAt: number;
  assignedTo: string | null;
  assigneeName: string | null;
  callsMade: number;
  lastOutcome: string | null;
}

function assigneeFilter(assignee: string | undefined, where: string[], values: SQLInputValue[]): void {
  if (assignee === "unassigned") where.push("l.assigned_to IS NULL");
  else if (assignee) {
    where.push("l.assigned_to = ?");
    values.push(assignee);
  }
}

/**
 * Lost events waiting for review: in [since, until], on live leads in scope that are lost NOW and
 * have no `crm_lost_reviews` row for that event. A lead lost twice (and still lost) gives two
 * events. Newest first, at most `limit`.
 */
export function listUnreviewedLostEvents(
  db: DatabaseSync,
  scope: ScopeSql,
  filter: { since: number; until: number; assignee?: string },
  limit: number,
): LostEventRow[] {
  const where = [LOST_EVENT_WHERE, "a.at >= ?", "a.at <= ?", "l.erased_at IS NULL", `(${scope.sql})`, "l.stage = 'lost'"];
  const values: SQLInputValue[] = [filter.since, filter.until, ...scope.values];
  where.push("NOT EXISTS (SELECT 1 FROM crm_lost_reviews r WHERE r.lead_id = a.lead_id AND r.lost_at = a.at)");
  assigneeFilter(filter.assignee, where, values);
  return db
    .prepare(
      `SELECT a.id AS activity_id, a.lead_id, a.at AS lost_at, json_extract(a.meta, '$.from') AS from_stage,
              json_extract(a.meta, '$.lostReason') AS reason, a.actor_id, ua.display_name AS actor_name,
              l.student_name, l.guardian_name, l.contact_name, l.created_at AS lead_created_at, l.assigned_to, u.display_name AS assignee_name,
              (SELECT COUNT(*) FROM crm_activities c WHERE c.lead_id = a.lead_id AND c.type = 'call' AND ${BEFORE_EVENT}) AS calls_made,
              (SELECT json_extract(c.meta, '$.outcome') FROM crm_activities c
                WHERE c.lead_id = a.lead_id AND c.type IN ('call', 'whatsapp') AND ${BEFORE_EVENT}
                ORDER BY c.at DESC, c.id DESC LIMIT 1) AS last_outcome
         FROM crm_activities a
         JOIN crm_leads l ON l.id = a.lead_id
         LEFT JOIN users ua ON ua.id = a.actor_id
         LEFT JOIN users u ON u.id = l.assigned_to
        WHERE ${where.join(" AND ")}
        ORDER BY a.at DESC, a.id DESC
        LIMIT ?`,
    )
    .all(...values, limit)
    .map((row) => ({
      activityId: Number(row.activity_id),
      leadId: String(row.lead_id),
      lostAt: Number(row.lost_at),
      fromStage: text(row.from_stage),
      reason: text(row.reason),
      actorId: text(row.actor_id),
      actorName: text(row.actor_name),
      studentName: text(row.student_name),
      guardianName: text(row.guardian_name),
      contactName: text(row.contact_name),
      leadCreatedAt: Number(row.lead_created_at),
      assignedTo: text(row.assigned_to),
      assigneeName: text(row.assignee_name),
      callsMade: Number(row.calls_made ?? 0),
      lastOutcome: text(row.last_outcome),
    }));
}

/**
 * How many events `listUnreviewedLostEvents` lists (no limit): the Needs attention "lost to review"
 * number must use this (or the same WHERE) so it equals the /crm/lost list it links to.
 */
export function countUnreviewedLostEvents(db: DatabaseSync, scope: ScopeSql, filter: { since: number; until: number; assignee?: string }): number {
  const where = [LOST_EVENT_WHERE, "a.at >= ?", "a.at <= ?", "l.erased_at IS NULL", `(${scope.sql})`, "l.stage = 'lost'"];
  const values: SQLInputValue[] = [filter.since, filter.until, ...scope.values];
  where.push("NOT EXISTS (SELECT 1 FROM crm_lost_reviews r WHERE r.lead_id = a.lead_id AND r.lost_at = a.at)");
  assigneeFilter(filter.assignee, where, values);
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM crm_activities a JOIN crm_leads l ON l.id = a.lead_id WHERE ${where.join(" AND ")}`).get(...values)?.n ?? 0);
}

/**
 * "Lost reasons by counsellor": every lost event in [since, until] on live leads in scope,
 * reviewed or not, reopened or not, counted by who marked it lost (null = the system) and reason.
 */
export function lostReasonCounts(
  db: DatabaseSync,
  scope: ScopeSql,
  filter: { since: number; until: number; assignee?: string },
): { actorId: string | null; actorName: string | null; reason: string; count: number }[] {
  const where = [LOST_EVENT_WHERE, "a.at >= ?", "a.at <= ?", "l.erased_at IS NULL", `(${scope.sql})`];
  const values: SQLInputValue[] = [filter.since, filter.until, ...scope.values];
  assigneeFilter(filter.assignee, where, values);
  return db
    .prepare(
      `SELECT a.actor_id, ua.display_name AS actor_name, COALESCE(json_extract(a.meta, '$.lostReason'), 'unspecified') AS reason, COUNT(*) AS n
         FROM crm_activities a
         JOIN crm_leads l ON l.id = a.lead_id
         LEFT JOIN users ua ON ua.id = a.actor_id
        WHERE ${where.join(" AND ")}
        GROUP BY a.actor_id, reason
        ORDER BY ua.display_name, a.actor_id, reason`,
    )
    .all(...values)
    .map((row) => ({ actorId: text(row.actor_id), actorName: text(row.actor_name), reason: String(row.reason), count: Number(row.n) }));
}

/**
 * Each given lead's own centre and routing area: what lead routing's `assignableMember` checks
 * (the "Assign to" choices on Reopen). No scope check: the ids come from the scoped review list.
 */
export function findLeadPlacements(db: DatabaseSync, ids: readonly string[]): Map<string, { centreSlug: string | null; areaId: string | null }> {
  const placements = new Map<string, { centreSlug: string | null; areaId: string | null }>();
  const unique = [...new Set(ids)];
  for (let start = 0; start < unique.length; start += 500) {
    const chunk = unique.slice(start, start + 500);
    const rows = db
      .prepare(
        `SELECT l.id, l.centre_slug, r.area_id FROM crm_leads l LEFT JOIN crm_lead_routing r ON r.lead_id = l.id
          WHERE l.id IN (${chunk.map(() => "?").join(", ")})`,
      )
      .all(...chunk);
    for (const row of rows) placements.set(String(row.id), { centreSlug: text(row.centre_slug), areaId: text(row.area_id) });
  }
  return placements;
}

/** The lead's lost change at exactly `lostAt` (the newest one at that instant), or null. */
export function findLostEvent(db: DatabaseSync, leadId: string, lostAt: number): { fromStage: string | null; reason: string | null } | null {
  const row = db
    .prepare(
      `SELECT json_extract(a.meta, '$.from') AS from_stage, json_extract(a.meta, '$.lostReason') AS reason
         FROM crm_activities a
        WHERE a.lead_id = ? AND a.at = ? AND ${LOST_EVENT_WHERE}
        ORDER BY a.id DESC LIMIT 1`,
    )
    .get(leadId, lostAt);
  return row ? { fromStage: text(row.from_stage), reason: text(row.reason) } : null;
}

export function isLostEventReviewed(db: DatabaseSync, leadId: string, lostAt: number): boolean {
  return db.prepare("SELECT 1 AS hit FROM crm_lost_reviews WHERE lead_id = ? AND lost_at = ?").get(leadId, lostAt) !== undefined;
}

/** Records a review of one lost event. False when that event was already reviewed. */
export function insertLostReview(
  db: DatabaseSync,
  input: { leadId: string; lostAt: number; decision: "kept" | "reopened"; actorId: string | null; now: number },
): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO crm_lost_reviews (lead_id, lost_at, decision, reviewed_at, reviewed_by) VALUES (?, ?, ?, ?, ?)")
    .run(input.leadId, input.lostAt, input.decision, input.now, input.actorId);
  return Number(result.changes) > 0;
}
