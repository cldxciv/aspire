import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { EFFECTIVE_CENTRE_SQL, ENROLLED_AT_SQL, IMPORTED_SQL, REFERRER_WITH_ATTRIBUTION_SQL, TEST_LEAD_SQL, TOOL_SIGNUP_SQL } from "./console-sql";
import { scopedLeadWhere, type LeadScope } from "./leads";
import { int, text } from "./rows";

/**
 * Admin console Phase 1b — SQL for "your numbers": the dashboard's unlinked sub-lines, admissions,
 * targets, top sources and counsellor activity (docs/admin-phase-1b-plan.md
 * §5.A, §5.B, §5.G, §6.1–6.4; owner: 1B-NUMBERS). Numbers that link to the Enquiries list are NOT
 * counted here: they use CORE's `countForFilters` (the inbox's own query). Reads are plain SELECTs
 * (no transaction); the only write is `replaceTargets`, inside the caller's transaction.
 *
 * `P_all` (plan §6) = leads in the viewer's scope (`scopedLeadWhere`), test leads left out, erased
 * stubs INCLUDED. Every lead is `l`; `centre` keys are the effective centre (null = no centre yet).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** The programme buckets of admissions and targets: anything else (not sure, unknown) is `any`. */
const PROGRAM_BUCKET_SQL = "CASE WHEN l.program_interest IN ('jee','neet','foundation','integrated') THEN l.program_interest ELSE 'any' END";

/** When an enrolled lead was admitted: its last move to Enrolled, else its last update (epoch ms). */
const ADMITTED_AT_SQL = `COALESCE(${ENROLLED_AT_SQL}, l.updated_at)`;

/** `WHERE` parts of `P_all` for a scope. */
function pAll(scope: LeadScope): { where: string[]; values: SQLInputValue[] } {
  const scoped = scopedLeadWhere(scope);
  return { where: [scoped.sql, `NOT ${TEST_LEAD_SQL}`], values: [...scoped.values] };
}

/** Adds an effective-centre condition: a slug, `none` (no centre) or null (every centre). */
function centreCondition(centre: string | null, where: string[], values: SQLInputValue[]): void {
  if (centre === "none") where.push(`${EFFECTIVE_CENTRE_SQL} IS NULL`);
  else if (centre !== null) {
    where.push(`${EFFECTIVE_CENTRE_SQL} = ?`);
    values.push(centre);
  }
}

/** A `Map` from grouped rows (`centre` key, `n` count). */
function byCentre(rows: Record<string, unknown>[], key = "centre", count = "n"): Map<string | null, number> {
  const map = new Map<string | null, number>();
  for (const row of rows) map.set(row[key] === null || row[key] === undefined ? null : String(row[key]), Number(row[count] ?? 0));
  return map;
}

// ---------------------------------------------------------------------------------------------
// Centres and the dashboard's unlinked sub-lines

/** Distinct effective centres of `P_all` (null = some lead has no centre yet). */
export function effectiveCentresInScope(db: DatabaseSync, scope: LeadScope): (string | null)[] {
  const { where, values } = pAll(scope);
  return db
    .prepare(`SELECT DISTINCT ${EFFECTIVE_CENTRE_SQL} AS centre FROM crm_leads l WHERE ${where.join(" AND ")}`)
    .all(...values)
    .map((row) => text(row.centre));
}

/**
 * The week's sub-lines (plan §6.1 number 1b): of the LIVE leads in scope created since `from` (the
 * same set as the inbox's `created=week`), how many are free-tool sign-ups and how many imported,
 * per effective centre.
 */
export function weekSubLines(db: DatabaseSync, scope: LeadScope, from: number): Map<string | null, { toolSignups: number; imported: number }> {
  const scoped = scopedLeadWhere(scope);
  const rows = db
    .prepare(
      `SELECT ${EFFECTIVE_CENTRE_SQL} AS centre,
              SUM(CASE WHEN ${TOOL_SIGNUP_SQL} THEN 1 ELSE 0 END) AS signups,
              SUM(CASE WHEN ${IMPORTED_SQL} THEN 1 ELSE 0 END) AS imported
         FROM crm_leads l
        WHERE ${scoped.sql} AND l.erased_at IS NULL AND l.created_at >= ?
        GROUP BY centre`,
    )
    .all(...scoped.values, from);
  const map = new Map<string | null, { toolSignups: number; imported: number }>();
  for (const row of rows) map.set(text(row.centre), { toolSignups: Number(row.signups ?? 0), imported: Number(row.imported ?? 0) });
  return map;
}

/** "N more since erased" (plan §6.1): `P_all` erased stubs created since `from`, per effective centre. */
export function erasedSince(db: DatabaseSync, scope: LeadScope, from: number): Map<string | null, number> {
  const { where, values } = pAll(scope);
  return byCentre(
    db
      .prepare(`SELECT ${EFFECTIVE_CENTRE_SQL} AS centre, COUNT(*) AS n FROM crm_leads l WHERE ${where.join(" AND ")} AND l.erased_at IS NOT NULL AND l.created_at >= ? GROUP BY centre`)
      .all(...values, from),
  );
}

/** One `P_all` lead's non-personal origin (top sources), with its effective centre. */
export interface OriginRow {
  centre: string | null;
  source: string;
  tool: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/** `P_all` leads created in `[from, to)` with their origin (referrer host kept after erase). */
export function originRows(db: DatabaseSync, scope: LeadScope, from: number, to: number): OriginRow[] {
  const { where, values } = pAll(scope);
  return db
    .prepare(
      `SELECT ${EFFECTIVE_CENTRE_SQL} AS centre, l.source, l.tool, ${REFERRER_WITH_ATTRIBUTION_SQL} AS ref, l.utm_source, l.utm_medium, l.utm_campaign
         FROM crm_leads l LEFT JOIN crm_lead_attribution la ON la.lead_id = l.id
        WHERE ${where.join(" AND ")} AND l.created_at >= ? AND l.created_at < ?`,
    )
    .all(...values, from, to)
    .map((row) => ({
      centre: text(row.centre),
      source: String(row.source),
      tool: text(row.tool),
      referrer: text(row.ref),
      utmSource: text(row.utm_source),
      utmMedium: text(row.utm_medium),
      utmCampaign: text(row.utm_campaign),
    }));
}

// ---------------------------------------------------------------------------------------------
// Admissions (plan §6.1 number 4, §6.3): ONE condition for the dashboard and Admissions done

/** The session an admission is counted in: its key and bounds (epoch ms, IST). */
export interface AdmissionSession {
  key: string;
  fromMs: number;
  toMs: number;
}

/**
 * `P_all` leads currently enrolled whose admission session is `session`: the family's joining
 * session (`crm_lead_details.intake_session`) when staff set it, else the session of their last
 * move to Enrolled (or, without one, their last update). `centre`: slug, `none` or null (all).
 * Needs `LEFT JOIN crm_lead_details d ON d.lead_id = l.id`.
 */
function admissionWhere(scope: LeadScope, session: AdmissionSession, centre: string | null): { sql: string; values: SQLInputValue[] } {
  const { where, values } = pAll(scope);
  where.push("l.stage = 'enrolled'");
  where.push(`(d.intake_session = ? OR (d.intake_session IS NULL AND ${ADMITTED_AT_SQL} >= ? AND ${ADMITTED_AT_SQL} < ?))`);
  values.push(session.key, session.fromMs, session.toMs);
  centreCondition(centre, where, values);
  return { sql: where.join(" AND "), values };
}

const ADMISSION_FROM = "FROM crm_leads l LEFT JOIN crm_lead_details d ON d.lead_id = l.id";

/** Admissions of a session per effective centre (null = no centre yet). */
export function admissionCountsByCentre(db: DatabaseSync, scope: LeadScope, session: AdmissionSession): Map<string | null, number> {
  const { sql, values } = admissionWhere(scope, session, null);
  return byCentre(db.prepare(`SELECT ${EFFECTIVE_CENTRE_SQL} AS centre, COUNT(*) AS n ${ADMISSION_FROM} WHERE ${sql} GROUP BY centre`).all(...values));
}

/** Admissions of a session per effective centre × programme bucket. */
export function admissionCountsByCentreProgram(
  db: DatabaseSync,
  scope: LeadScope,
  session: AdmissionSession,
  centre: string | null,
): { centre: string | null; program: string; count: number }[] {
  const { sql, values } = admissionWhere(scope, session, centre);
  return db
    .prepare(`SELECT ${EFFECTIVE_CENTRE_SQL} AS centre, ${PROGRAM_BUCKET_SQL} AS program, COUNT(*) AS n ${ADMISSION_FROM} WHERE ${sql} GROUP BY centre, program`)
    .all(...values)
    .map((row) => ({ centre: text(row.centre), program: String(row.program), count: Number(row.n) }));
}

/** One admitted family (names are null for erased stubs). */
export interface AdmissionRow {
  id: string;
  studentName: string | null;
  contactName: string | null;
  guardianName: string | null;
  erasedAt: number | null;
  centre: string | null;
  programInterest: string | null;
  program: string;
  currentClass: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
  admittedAt: number;
  source: string;
  tool: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/** How many families `admissionRows` pages through. */
export function countAdmissions(db: DatabaseSync, scope: LeadScope, session: AdmissionSession, centre: string | null): number {
  const { sql, values } = admissionWhere(scope, session, centre);
  return Number(db.prepare(`SELECT COUNT(*) AS n ${ADMISSION_FROM} WHERE ${sql}`).get(...values)?.n ?? 0);
}

/** A page of admitted families, latest admission first. */
export function admissionRows(
  db: DatabaseSync,
  scope: LeadScope,
  session: AdmissionSession,
  centre: string | null,
  paging: { limit: number; offset: number },
): AdmissionRow[] {
  const { sql, values } = admissionWhere(scope, session, centre);
  return db
    .prepare(
      `SELECT l.id, l.student_name, l.contact_name, l.guardian_name, l.erased_at, ${EFFECTIVE_CENTRE_SQL} AS centre,
              l.program_interest, ${PROGRAM_BUCKET_SQL} AS program, l.current_class, l.assigned_to, u.display_name AS assignee_name,
              ${ADMITTED_AT_SQL} AS admitted_at, l.source, l.tool, ${REFERRER_WITH_ATTRIBUTION_SQL} AS ref,
              l.utm_source, l.utm_medium, l.utm_campaign
         ${ADMISSION_FROM}
         LEFT JOIN crm_lead_attribution la ON la.lead_id = l.id
         LEFT JOIN users u ON u.id = l.assigned_to
        WHERE ${sql}
        ORDER BY admitted_at DESC, l.id
        LIMIT ? OFFSET ?`,
    )
    .all(...values, paging.limit, paging.offset)
    .map((row) => ({
      id: String(row.id),
      studentName: text(row.student_name),
      contactName: text(row.contact_name),
      guardianName: text(row.guardian_name),
      erasedAt: int(row.erased_at),
      centre: text(row.centre),
      programInterest: text(row.program_interest),
      program: String(row.program),
      currentClass: text(row.current_class),
      assignedTo: text(row.assigned_to),
      assigneeName: text(row.assignee_name),
      admittedAt: Number(row.admitted_at),
      source: String(row.source),
      tool: text(row.tool),
      referrer: text(row.ref),
      utmSource: text(row.utm_source),
      utmMedium: text(row.utm_medium),
      utmCampaign: text(row.utm_campaign),
    }));
}

// ---------------------------------------------------------------------------------------------
// Targets (`crm_targets`; 1b writes and reads session periods only)

export interface TargetRow {
  centreSlug: string;
  program: string;
  metric: string;
  value: number;
  updatedAt: number;
  updatedBy: string | null;
}

/** Every target cell of a period. */
export function listTargetRows(db: DatabaseSync, period: string): TargetRow[] {
  return db
    .prepare("SELECT centre_slug, program, metric, value, updated_at, updated_by FROM crm_targets WHERE period = ? ORDER BY centre_slug, metric, program")
    .all(period)
    .map((row) => ({
      centreSlug: String(row.centre_slug),
      program: String(row.program),
      metric: String(row.metric),
      value: Number(row.value),
      updatedAt: Number(row.updated_at),
      updatedBy: text(row.updated_by),
    }));
}

/**
 * The period's latest change (the optimistic version of the targets page), or null: the newest of
 * its cells and of its save audit rows (`auditAction`, target = period). The audit rows keep the
 * version moving forward when a save deletes cells (a cleared metric leaves no cell behind).
 */
export function targetsLastChange(db: DatabaseSync, period: string, auditAction: string): { at: number; by: string | null } | null {
  const cell = db.prepare("SELECT updated_at AS at, updated_by AS by FROM crm_targets WHERE period = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1").get(period);
  const saved = db.prepare("SELECT created_at AS at, actor_id AS by FROM audit_log WHERE action = ? AND target = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(auditAction, period);
  const newest = [cell, saved].filter((row): row is NonNullable<typeof row> => row !== undefined).sort((a, b) => Number(b.at) - Number(a.at))[0];
  return newest ? { at: Number(newest.at), by: text(newest.by) } : null;
}

/** Replaces every cell of `period` × `metric` (inside the caller's transaction). */
export function replaceTargets(
  db: DatabaseSync,
  period: string,
  metric: string,
  cells: readonly { centreSlug: string; program: string; value: number }[],
  actorId: string | null,
  at: number,
): void {
  db.prepare("DELETE FROM crm_targets WHERE period = ? AND metric = ?").run(period, metric);
  const insert = db.prepare("INSERT INTO crm_targets (period, centre_slug, program, metric, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
  for (const cell of cells) insert.run(period, cell.centreSlug, cell.program, metric, cell.value, at, actorId);
}

/** Σ of a metric's targets per centre for a period (every programme); centres without a cell are absent. */
export function targetSumsByCentre(db: DatabaseSync, period: string, metric: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of db.prepare("SELECT centre_slug, SUM(value) AS total FROM crm_targets WHERE period = ? AND metric = ? GROUP BY centre_slug").all(period, metric)) {
    map.set(String(row.centre_slug), Number(row.total));
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Counsellor activity (plan §6.4)

export interface ActorActivity {
  actorId: string;
  calls: number;
  connected: number;
  whatsapps: number;
  followUps: number;
  activeDays: number;
}

/** Calls, connected calls, WhatsApps, follow-ups done and active IST days per actor, on leads in scope, in `[from, to)`. */
export function activityByActor(db: DatabaseSync, scope: LeadScope, from: number, to: number): ActorActivity[] {
  const scoped = scopedLeadWhere(scope);
  return db
    .prepare(
      `SELECT a.actor_id AS actor,
              SUM(CASE WHEN a.type = 'call' THEN 1 ELSE 0 END) AS calls,
              SUM(CASE WHEN a.type = 'call' AND json_extract(a.meta, '$.outcome') = 'connected' THEN 1 ELSE 0 END) AS connected,
              SUM(CASE WHEN a.type = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapps,
              SUM(CASE WHEN a.type = 'task_done' THEN 1 ELSE 0 END) AS follow_ups,
              COUNT(DISTINCT CASE WHEN a.type IN ('call', 'whatsapp') THEN CAST((a.at + ?) / 86400000 AS INTEGER) END) AS active_days
         FROM crm_activities a JOIN crm_leads l ON l.id = a.lead_id
        WHERE a.actor_id IS NOT NULL AND a.type IN ('call', 'whatsapp', 'task_done') AND a.at >= ? AND a.at < ? AND ${scoped.sql}
        GROUP BY a.actor_id`,
    )
    .all(IST_OFFSET_MS, from, to, ...scoped.values)
    .map((row) => ({
      actorId: String(row.actor),
      calls: Number(row.calls ?? 0),
      connected: Number(row.connected ?? 0),
      whatsapps: Number(row.whatsapps ?? 0),
      followUps: Number(row.follow_ups ?? 0),
      activeDays: Number(row.active_days ?? 0),
    }));
}

/** Open (not enrolled / lost), live leads in scope per assignee. */
export function openLeadsByAssignee(db: DatabaseSync, scope: LeadScope): Map<string, number> {
  const scoped = scopedLeadWhere(scope);
  const map = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT l.assigned_to AS person, COUNT(*) AS n FROM crm_leads l
        WHERE ${scoped.sql} AND l.assigned_to IS NOT NULL AND l.erased_at IS NULL AND l.stage NOT IN ('enrolled', 'lost')
        GROUP BY l.assigned_to`,
    )
    .all(...scoped.values)) {
    map.set(String(row.person), Number(row.n));
  }
  return map;
}

/** Enrolled `P_all` leads per assignee whose last move to Enrolled falls in `[from, to)`. */
export function admissionsByAssignee(db: DatabaseSync, scope: LeadScope, from: number, to: number): Map<string, number> {
  const { where, values } = pAll(scope);
  const map = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT l.assigned_to AS person, COUNT(*) AS n FROM crm_leads l
        WHERE ${where.join(" AND ")} AND l.stage = 'enrolled' AND l.assigned_to IS NOT NULL AND ${ENROLLED_AT_SQL} >= ? AND ${ENROLLED_AT_SQL} < ?
        GROUP BY l.assigned_to`,
    )
    .all(...values, from, to)) {
    map.set(String(row.person), Number(row.n));
  }
  return map;
}

/**
 * The audit rows of MCP tools that log contacts or finish follow-ups (src/lib/mcp/server.ts
 * `auditToolRow`: `mcp.<tool>`, target = the lead, `details.outcome` = `changed` when it wrote).
 * Not the `mcp.call` rows: those are written before dispatch for every call, refused ones too.
 */
const MCP_CONTACT_ACTIONS = ["mcp.log_lead_contact", "mcp.complete_lead_task"] as const;

/**
 * How many contacts / follow-ups the AI assistant access (MCP) actually logged for these accounts
 * in `[from, to)` on leads in `scope`: successful tool rows only (refused, failed or out-of-scope
 * calls never count), so the footnote appears only when a counted contact came from MCP.
 */
export function countMcpContactCalls(db: DatabaseSync, scope: LeadScope, actorIds: readonly string[], from: number, to: number): number {
  if (actorIds.length === 0) return 0;
  const ids = [...new Set(actorIds)].slice(0, 500);
  const scoped = scopedLeadWhere(scope);
  return Number(
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM audit_log al JOIN crm_leads l ON l.id = al.target
          WHERE al.action IN (${MCP_CONTACT_ACTIONS.map(() => "?").join(", ")}) AND json_extract(al.details, '$.outcome') = 'changed'
            AND al.created_at >= ? AND al.created_at < ? AND al.actor_id IN (${ids.map(() => "?").join(", ")}) AND ${scoped.sql}`,
      )
      .get(...MCP_CONTACT_ACTIONS, from, to, ...ids, ...scoped.values)?.n ?? 0,
  );
}

/** Members of these areas (lead routing `crm_area_members`). */
export function areaMemberIds(db: DatabaseSync, areaIds: readonly string[]): string[] {
  if (areaIds.length === 0) return [];
  return db
    .prepare(`SELECT DISTINCT user_id FROM crm_area_members WHERE area_id IN (${areaIds.map(() => "?").join(", ")}) ORDER BY user_id`)
    .all(...areaIds)
    .map((row) => String(row.user_id));
}
