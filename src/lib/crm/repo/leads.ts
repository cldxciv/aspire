import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { LeadStage, LostReason } from "../types";
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
}

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

export type LeadUpdate = Partial<Omit<LeadRow, "id" | "createdAt" | "assigneeName">>;

const SELECT = `
  SELECT l.*, u.display_name AS assignee_name
    FROM crm_leads l
    LEFT JOIN users u ON u.id = l.assigned_to`;

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

export type NewLead = Omit<LeadRow, "assigneeName" | "erasedAt" | "erasedBy">;

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

/** Record-level scope (D-038), already decided by the service layer. */
export type LeadScope =
  | { kind: "all" }
  | { kind: "assigned"; userId: string }
  | { kind: "centres"; userId: string; centreSlugs: readonly string[] };

export interface LeadQuery {
  scope: LeadScope;
  stage?: LeadStage | "open";
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
  sort?: "recent_activity" | "newest" | "oldest" | "due" | "name";
  limit: number;
  offset: number;
}

function scopeClause(scope: LeadScope, where: string[], values: SQLInputValue[]): void {
  if (scope.kind === "assigned") {
    where.push("l.assigned_to = ?");
    values.push(scope.userId);
  } else if (scope.kind === "centres") {
    const placeholders = scope.centreSlugs.map(() => "?").join(", ");
    where.push(`(l.assigned_to = ?${placeholders ? ` OR l.centre_slug IN (${placeholders})` : ""})`);
    values.push(scope.userId, ...scope.centreSlugs);
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
  if (query.centre === "none") where.push("l.centre_slug IS NULL");
  else if (query.centre) {
    where.push("l.centre_slug = ?");
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
