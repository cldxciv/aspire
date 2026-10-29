import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { ClockReason } from "../lead-ops-types";
import type { LeadStage, LostReason } from "../types";
import { EFFECTIVE_CENTRE_SQL, NEVER_CONTACTED_SQL, TOOL_SIGNUP_SQL } from "./console-sql";
import { escapeLike, int, stringArray, text, type Row } from "./rows";

/** `crm_leads` access. Epoch-ms times; the services turn rows into API shapes. */

export interface LeadRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  stage: LeadStage;
  furthestStage: LeadStage;
  lostReason: LostReason | null;
  assignedTo: string | null;
  assigneeName: string | null;
  centreSlug: string | null;
  programInterest: string | null;
  currentClass: string | null;
  source: string;
  tool: string | null;
  page: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  studentName: string | null;
  guardianName: string | null;
  contactName: string | null;
  phoneE164: string | null;
  email: string | null;
  message: string | null;
  consentTextVersion: string | null;
  consentAt: number | null;
  staffEdited: string[];
  submissionCount: number;
  lastActivityAt: number;
  nextTaskDueAt: number | null;
  erasedAt: number | null;
  erasedBy: string | null;
  /**
   * Lead routing (docs/lead-routing-plan.md §13.5): the routing area (`crm_lead_routing.area_id`).
   * REQUIRED, so every `canSeeLead` caller passes it; null = no area (or not routed yet).
   */
  areaId: string | null;
  /** The routing area's names (null without an area). */
  areaNameEn: string | null;
  areaNameHi: string | null;
  /**
   * Admin console 1b (§4.3): the routing area's default centre (null without one). The lead's
   * effective centre is `centreSlug ?? areaDefaultCentre`, the same as `EFFECTIVE_CENTRE_SQL`.
   */
  areaDefaultCentre: string | null;
  /** The open first-call clock (`crm_sla_clocks`, at most one per lead), or null. */
  openClock: OpenClockFacts | null;
}

/** Times (epoch ms) of a lead's open first-call clock, read with the lead. */
export interface OpenClockFacts {
  reason: ClockReason;
  startedAt: number;
  dueAt: number;
  tier1At: number | null;
  tier2At: number | null;
}

/** Fields read from other tables: never inserted or updated through `crm_leads`. */
type JoinedFields = "assigneeName" | "areaId" | "areaNameEn" | "areaNameHi" | "areaDefaultCentre" | "openClock";

/** Writable columns (camelCase → SQL column). Anything else can never reach an UPDATE. */
const COLUMN: Readonly<Record<string, string>> = {
  updatedAt: "updated_at",
  stage: "stage",
  furthestStage: "furthest_stage",
  lostReason: "lost_reason",
  assignedTo: "assigned_to",
  centreSlug: "centre_slug",
  programInterest: "program_interest",
  currentClass: "current_class",
  source: "source",
  tool: "tool",
  page: "page",
  referrer: "referrer",
  utmSource: "utm_source",
  utmMedium: "utm_medium",
  utmCampaign: "utm_campaign",
  utmTerm: "utm_term",
  utmContent: "utm_content",
  studentName: "student_name",
  guardianName: "guardian_name",
  contactName: "contact_name",
  phoneE164: "phone_e164",
  email: "email",
  message: "message",
  consentTextVersion: "consent_text_version",
  consentAt: "consent_at",
  staffEdited: "staff_edited",
  submissionCount: "submission_count",
  lastActivityAt: "last_activity_at",
  nextTaskDueAt: "next_task_due_at",
  erasedAt: "erased_at",
  erasedBy: "erased_by",
};

export type LeadUpdate = Partial<Omit<LeadRow, "id" | "createdAt" | JoinedFields>>;

/**
 * The shared lead SELECT: the lead, its assignee's name, its routing area (`crm_lead_routing` has
 * one row per lead) and its open clock (the partial unique index allows one open clock per lead),
 * so the joins never multiply rows.
 */
const SELECT = `
  SELECT l.*, u.display_name AS assignee_name,
         r.area_id AS routing_area_id, ar.name_en AS routing_area_name_en, ar.name_hi AS routing_area_name_hi,
         ar.default_centre_slug AS routing_area_default_centre,
         c.reason AS clock_reason, c.started_at AS clock_started_at, c.due_at AS clock_due_at,
         c.tier1_at AS clock_tier1_at, c.tier2_at AS clock_tier2_at
    FROM crm_leads l
    LEFT JOIN users u ON u.id = l.assigned_to
    LEFT JOIN crm_lead_routing r ON r.lead_id = l.id
    LEFT JOIN crm_areas ar ON ar.id = r.area_id
    LEFT JOIN crm_sla_clocks c ON c.lead_id = l.id AND c.resolved_at IS NULL`;

function mapClock(row: Row): OpenClockFacts | null {
  if (row.clock_due_at === null || row.clock_due_at === undefined) return null;
  const reason = String(row.clock_reason);
  return {
    reason: reason === "reopened" || reason === "import" ? reason : "new",
    startedAt: Number(row.clock_started_at),
    dueAt: Number(row.clock_due_at),
    tier1At: int(row.clock_tier1_at),
    tier2At: int(row.clock_tier2_at),
  };
}

function mapLead(row: Row): LeadRow {
  return {
    id: String(row.id),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    stage: String(row.stage) as LeadStage,
    furthestStage: String(row.furthest_stage) as LeadStage,
    lostReason: text(row.lost_reason) as LostReason | null,
    assignedTo: text(row.assigned_to),
    assigneeName: text(row.assignee_name),
    centreSlug: text(row.centre_slug),
    programInterest: text(row.program_interest),
    currentClass: text(row.current_class),
    source: String(row.source),
    tool: text(row.tool),
    page: text(row.page),
    referrer: text(row.referrer),
    utmSource: text(row.utm_source),
    utmMedium: text(row.utm_medium),
    utmCampaign: text(row.utm_campaign),
    utmTerm: text(row.utm_term),
    utmContent: text(row.utm_content),
    studentName: text(row.student_name),
    guardianName: text(row.guardian_name),
    contactName: text(row.contact_name),
    phoneE164: text(row.phone_e164),
    email: text(row.email),
    message: text(row.message),
    consentTextVersion: text(row.consent_text_version),
    consentAt: int(row.consent_at),
    staffEdited: stringArray(row.staff_edited),
    submissionCount: Number(row.submission_count ?? 0),
    lastActivityAt: Number(row.last_activity_at),
    nextTaskDueAt: int(row.next_task_due_at),
    erasedAt: int(row.erased_at),
    erasedBy: text(row.erased_by),
    areaId: text(row.routing_area_id),
    areaNameEn: text(row.routing_area_name_en),
    areaNameHi: text(row.routing_area_name_hi),
    areaDefaultCentre: text(row.routing_area_default_centre),
    openClock: mapClock(row),
  };
}

export function findLeadById(db: DatabaseSync, id: string): LeadRow | null {
  const row = db.prepare(`${SELECT} WHERE l.id = ?`).get(id);
  return row ? mapLead(row) : null;
}

export function findLeadByPhone(db: DatabaseSync, phoneE164: string): LeadRow | null {
  const row = db.prepare(`${SELECT} WHERE l.phone_e164 = ?`).get(phoneE164);
  return row ? mapLead(row) : null;
}

export type NewLead = Omit<LeadRow, JoinedFields | "erasedAt" | "erasedBy">;

export function insertLead(db: DatabaseSync, lead: NewLead): void {
  const columns: string[] = ["id", "created_at"];
  const values: SQLInputValue[] = [lead.id, lead.createdAt];
  for (const [key, column] of Object.entries(COLUMN)) {
    const value = (lead as unknown as Record<string, unknown>)[key];
    if (value === undefined) continue;
    columns.push(column);
    values.push(toSql(value));
  }
  db.prepare(`INSERT INTO crm_leads (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`).run(
    ...values,
  );
}

function toSql(value: unknown): SQLInputValue {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  throw new Error("crm_leads: unsupported column value");
}

/** Updates whitelisted columns. Returns true when the row exists. */
export function updateLead(db: DatabaseSync, id: string, update: LeadUpdate): boolean {
  const sets: string[] = [];
  const values: SQLInputValue[] = [];
  for (const [key, value] of Object.entries(update)) {
    const column = COLUMN[key];
    if (!column || value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(toSql(value));
  }
  if (sets.length === 0) return findLeadById(db, id) !== null;
  const result = db.prepare(`UPDATE crm_leads SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
  return Number(result.changes) > 0;
}

// ---------------------------------------------------------------------------
// Scoped queries (inbox, reports, export)
// ---------------------------------------------------------------------------

/**
 * Record-level scope (D-038), already decided by the service layer. `areas` (explicit manager
 * scope, H2): leads assigned to them, leads routed to one of `areaIds` (through EXISTS, so it works
 * in every query without a join, M1), and leads whose centre belongs to those areas
 * (`centreSlugs`). Zero areas and zero centres = only the leads assigned to them.
 */
export type LeadScope =
  | { kind: "all" }
  | { kind: "assigned"; userId: string }
  | { kind: "centres"; userId: string; centreSlugs: readonly string[] }
  | { kind: "areas"; userId: string; areaIds: readonly string[]; centreSlugs: readonly string[] };

/** Inbox `sla` filter, with the request time it is evaluated at. */
export interface SlaQueryFilter {
  kind: "open" | "overdue" | "escalated";
  now: number;
}

export interface LeadQuery {
  scope: LeadScope;
  stage?: LeadStage | "open";
  /** The lead's EFFECTIVE centre (its centre, else its routing area's default centre); `none` = neither. */
  centre?: string | "none";
  program?: string;
  source?: string;
  /** A user id, or "unassigned". */
  assignee?: string;
  dueBefore?: number;
  dueFrom?: number;
  nameContains?: string;
  phoneEndsWith?: string;
  createdFrom?: number;
  createdTo?: number;
  includeErased?: boolean;
  /** An area id, `none` (no area, not a tool sign-up) or `tool_signups` (no area, every arrival a tool sign-up). */
  area?: string;
  sla?: SlaQueryFilter;
  /** Admin console 1b (§4.3): no call or WhatsApp logged yet (`contact=none`). */
  neverContacted?: boolean;
  /** Admin console 1b (§4.3): leave out free-tool sign-ups in any area (`signups=hide`). */
  excludeToolSignups?: boolean;
  sort?: "recent_activity" | "newest" | "oldest" | "due" | "name";
  limit: number;
  offset: number;
}

/** A query without paging or order (counts, `countForFilters`). */
export type LeadCountQuery = Omit<LeadQuery, "limit" | "offset" | "sort">;

/** The record-level scope as SQL on `crm_leads l` (also used by repo/sla.ts and the dashboard). */
export function scopeClause(scope: LeadScope, where: string[], values: SQLInputValue[]): void {
  if (scope.kind === "assigned") {
    where.push("l.assigned_to = ?");
    values.push(scope.userId);
  } else if (scope.kind === "centres") {
    const placeholders = scope.centreSlugs.map(() => "?").join(", ");
    where.push(`(l.assigned_to = ?${placeholders ? ` OR l.centre_slug IN (${placeholders})` : ""})`);
    values.push(scope.userId, ...scope.centreSlugs);
  } else if (scope.kind === "areas") {
    const parts = ["l.assigned_to = ?"];
    values.push(scope.userId);
    if (scope.areaIds.length > 0) {
      const marks = scope.areaIds.map(() => "?").join(", ");
      parts.push(`EXISTS (SELECT 1 FROM crm_lead_routing sr WHERE sr.lead_id = l.id AND sr.area_id IN (${marks}))`);
      values.push(...scope.areaIds);
    }
    if (scope.centreSlugs.length > 0) {
      parts.push(`l.centre_slug IN (${scope.centreSlugs.map(() => "?").join(", ")})`);
      values.push(...scope.centreSlugs);
    }
    where.push(`(${parts.join(" OR ")})`);
  }
}

/**
 * The record-level scope as one SQL condition on `crm_leads l` (admin console 1b, §4.2): `1=1` for
 * `all`. Console queries use only this (or the inbox query builder), never a copy of the scope logic.
 */
export function scopedLeadWhere(scope: LeadScope): { sql: string; values: SQLInputValue[] } {
  const where: string[] = [];
  const values: SQLInputValue[] = [];
  scopeClause(scope, where, values);
  return { sql: where.length > 0 ? where.join(" AND ") : "1=1", values };
}

/** `area` filter as SQL on `crm_leads l`: an area id, `none` or `tool_signups` (also used by repo/sla.ts). */
export function areaClause(area: string, where: string[], values: SQLInputValue[]): void {
  if (area === "none") {
    where.push(
      "NOT EXISTS (SELECT 1 FROM crm_lead_routing fr WHERE fr.lead_id = l.id AND (fr.area_id IS NOT NULL OR fr.gate_only = 1))",
    );
  } else if (area === "tool_signups") {
    where.push("EXISTS (SELECT 1 FROM crm_lead_routing fr WHERE fr.lead_id = l.id AND fr.area_id IS NULL AND fr.gate_only = 1)");
  } else {
    where.push("EXISTS (SELECT 1 FROM crm_lead_routing fr WHERE fr.lead_id = l.id AND fr.area_id = ?)");
    values.push(area);
  }
}

function slaClause(sla: SlaQueryFilter, where: string[], values: SQLInputValue[]): void {
  const open = "SELECT 1 FROM crm_sla_clocks fc WHERE fc.lead_id = l.id AND fc.resolved_at IS NULL";
  if (sla.kind === "open") {
    where.push(`EXISTS (${open})`);
  } else if (sla.kind === "overdue") {
    where.push(`EXISTS (${open} AND (fc.due_at <= ? OR fc.tier1_at <= ?))`);
    values.push(sla.now, sla.now);
  } else {
    where.push(`EXISTS (${open} AND fc.tier2_at <= ?)`);
    values.push(sla.now);
  }
}

function whereFor(query: Omit<LeadQuery, "limit" | "offset" | "sort">): { sql: string; values: SQLInputValue[] } {
  const where: string[] = [];
  const values: SQLInputValue[] = [];
  scopeClause(query.scope, where, values);
  if (!query.includeErased) where.push("l.erased_at IS NULL");
  if (query.stage === "open") where.push("l.stage NOT IN ('enrolled', 'lost')");
  else if (query.stage) {
    where.push("l.stage = ?");
    values.push(query.stage);
  }
  // Admin console 1b (§4.3): the centre filter compares the EFFECTIVE centre, so an area-routed
  // enquiry without a chosen centre shows under its area's centre (scope rules are unchanged).
  if (query.centre === "none") where.push(`${EFFECTIVE_CENTRE_SQL} IS NULL`);
  else if (query.centre) {
    where.push(`${EFFECTIVE_CENTRE_SQL} = ?`);
    values.push(query.centre);
  }
  if (query.program) {
    where.push("l.program_interest = ?");
    values.push(query.program);
  }
  if (query.source) {
    where.push("l.source = ?");
    values.push(query.source);
  }
  if (query.assignee === "unassigned") where.push("l.assigned_to IS NULL");
  else if (query.assignee) {
    where.push("l.assigned_to = ?");
    values.push(query.assignee);
  }
  if (query.dueFrom !== undefined) {
    where.push("l.next_task_due_at >= ?");
    values.push(query.dueFrom);
  }
  if (query.dueBefore !== undefined) {
    where.push("l.next_task_due_at < ?");
    values.push(query.dueBefore);
  }
  if (query.createdFrom !== undefined) {
    where.push("l.created_at >= ?");
    values.push(query.createdFrom);
  }
  if (query.createdTo !== undefined) {
    where.push("l.created_at < ?");
    values.push(query.createdTo);
  }
  if (query.nameContains) {
    const pattern = `%${escapeLike(query.nameContains.toLowerCase())}%`;
    where.push(
      "(lower(l.student_name) LIKE ? ESCAPE '\\' OR lower(l.guardian_name) LIKE ? ESCAPE '\\' OR lower(l.contact_name) LIKE ? ESCAPE '\\')",
    );
    values.push(pattern, pattern, pattern);
  }
  if (query.phoneEndsWith) {
    where.push("l.phone_e164 LIKE ? ESCAPE '\\'");
    values.push(`%${escapeLike(query.phoneEndsWith)}`);
  }
  if (query.area) areaClause(query.area, where, values);
  if (query.sla) slaClause(query.sla, where, values);
  if (query.neverContacted) where.push(NEVER_CONTACTED_SQL);
  if (query.excludeToolSignups) where.push(`NOT ${TOOL_SIGNUP_SQL}`);
  return { sql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "", values };
}

const ORDER: Readonly<Record<NonNullable<LeadQuery["sort"]>, string>> = {
  recent_activity: "l.last_activity_at DESC, l.id",
  newest: "l.created_at DESC, l.id",
  oldest: "l.created_at ASC, l.id",
  due: "l.next_task_due_at IS NULL, l.next_task_due_at ASC, l.last_activity_at DESC, l.id",
  name: "lower(COALESCE(l.student_name, l.contact_name, l.guardian_name, '')) ASC, l.id",
};

export function queryLeads(db: DatabaseSync, query: LeadQuery): { rows: LeadRow[]; total: number } {
  const { sql, values } = whereFor(query);
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM crm_leads l ${sql}`).get(...values)?.n ?? 0);
  const rows = db
    .prepare(`${SELECT} ${sql} ORDER BY ${ORDER[query.sort ?? "recent_activity"]} LIMIT ? OFFSET ?`)
    .all(...values, query.limit, query.offset)
    .map(mapLead);
  return { rows, total };
}

/**
 * How many leads match a query: the same WHERE as the inbox (`queryLeads`), so a number counted
 * here equals the list total for the same filters (admin console 1b, §4.2, §10.2).
 */
export function countLeads(db: DatabaseSync, query: LeadCountQuery): number {
  const { sql, values } = whereFor(query);
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM crm_leads l ${sql}`).get(...values)?.n ?? 0);
}

/**
 * `countLeads` split by the effective centre (`by: "centre"`) or the assignee (`by: "assignee"`);
 * `key: null` = no centre / unassigned. Largest group first, then by key.
 */
export function countLeadsGrouped(db: DatabaseSync, query: LeadCountQuery, by: "centre" | "assignee"): { key: string | null; count: number }[] {
  const { sql, values } = whereFor(query);
  const group = by === "centre" ? EFFECTIVE_CENTRE_SQL : "l.assigned_to";
  return db
    .prepare(`SELECT ${group} AS group_key, COUNT(*) AS n FROM crm_leads l ${sql} GROUP BY group_key ORDER BY n DESC, group_key`)
    .all(...values)
    .map((row) => ({ key: text(row.group_key), count: Number(row.n) }));
}

/** Lightweight rows for reports: no personal fields. */
export interface LeadStatRow {
  tool: string | null;
  stage: LeadStage;
  furthestStage: LeadStage;
  lostReason: string | null;
  source: string;
  centreSlug: string | null;
  programInterest: string | null;
  assignedTo: string | null;
  assigneeName: string | null;
}

export function leadStats(db: DatabaseSync, scope: LeadScope, from: number, to: number): LeadStatRow[] {
  const { sql, values } = whereFor({ scope, createdFrom: from, createdTo: to, includeErased: true });
  return db
    .prepare(
      `SELECT l.tool, l.stage, l.furthest_stage, l.lost_reason, l.source, l.centre_slug, l.program_interest, l.assigned_to,
              u.display_name AS assignee_name
         FROM crm_leads l LEFT JOIN users u ON u.id = l.assigned_to ${sql}`,
    )
    .all(...values)
    .map((row) => ({
      tool: text(row.tool),
      stage: String(row.stage) as LeadStage,
      furthestStage: String(row.furthest_stage) as LeadStage,
      lostReason: text(row.lost_reason),
      source: String(row.source),
      centreSlug: text(row.centre_slug),
      programInterest: text(row.program_interest),
      assignedTo: text(row.assigned_to),
      assigneeName: text(row.assignee_name),
    }));
}

/**
 * Lead gate forms per Asia/Kolkata day (reports, plan §3 "daily count of gate leads"): `submission`
 * activities in [from, to) whose consent version matches `versionLike` (a SQL LIKE pattern), scoped
 * like the inbox, erased stubs included (their submissions keep the version). A form that created
 * its lead (same instant) is a new family; any other is a family already on file. `dayStart` is the
 * IST day number (days since 1970-01-01 IST). Newest day first.
 */
export function gateSubmissionsByDay(
  db: DatabaseSync,
  scope: LeadScope,
  from: number,
  to: number,
  versionLike: string,
  istOffsetMs: number,
): { istDay: number; newFamilies: number; knownFamilies: number }[] {
  const where: string[] = [
    "a.type = 'submission'",
    "a.at >= ?",
    "a.at < ?",
    "json_extract(a.meta, '$.consentTextVersion') LIKE ?",
  ];
  const values: SQLInputValue[] = [from, to, versionLike];
  scopeClause(scope, where, values);
  return db
    .prepare(
      `SELECT CAST((a.at + ?) / 86400000 AS INTEGER) AS ist_day,
              SUM(CASE WHEN a.at = l.created_at THEN 1 ELSE 0 END) AS new_families,
              SUM(CASE WHEN a.at = l.created_at THEN 0 ELSE 1 END) AS known_families
         FROM crm_activities a JOIN crm_leads l ON l.id = a.lead_id
        WHERE ${where.join(" AND ")}
        GROUP BY ist_day
        ORDER BY ist_day DESC`,
    )
    .all(istOffsetMs, ...values)
    .map((row) => ({ istDay: Number(row.ist_day), newFamilies: Number(row.new_families), knownFamilies: Number(row.known_families) }));
}

/** Open (not enrolled / lost / erased) leads per assignee. */
export function openLeadCounts(db: DatabaseSync): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db
    .prepare(
      `SELECT assigned_to, COUNT(*) AS n FROM crm_leads
        WHERE assigned_to IS NOT NULL AND erased_at IS NULL AND stage NOT IN ('enrolled', 'lost')
        GROUP BY assigned_to`,
    )
    .all()) {
    counts.set(String(row.assigned_to), Number(row.n));
  }
  return counts;
}
