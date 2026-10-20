import "server-only";

import { getDb } from "@/lib/db/connection";

import { CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, leadScopeFor, ok } from "./access";
import { buildLeadQuery, leadDisplayName } from "./leads";
import { canonicalTool, csvLine, DAY_MS, IST_OFFSET_MS, toIso } from "./pure";
import { gateSubmissionsByDay, leadStats, queryLeads, type LeadStatRow } from "./repo/leads";
import {
  FUNNEL_STAGES,
  GATE_CONSENT_VERSION_LIKE,
  LEAD_STAGES,
  stageOrdinal,
  type CrmResult,
  type CrmViewer,
  type FunnelCount,
  type FunnelReport,
  type GateDayCount,
  type LeadFilters,
  type LeadStage,
} from "./types";

/** Funnel report and CSV export (D-040, D-042). Both see only the viewer's leads (D-038). */

export const DEFAULT_REPORT_DAYS = 30;
export const MAX_REPORT_DAYS = 3 * 366;

function emptyCount(key: string): FunnelCount {
  return { key, total: 0, contacted: 0, enrolled: 0, lost: 0 };
}

function tally(count: FunnelCount, row: LeadStatRow): void {
  count.total += 1;
  if (stageOrdinal(row.furthestStage) >= stageOrdinal("contacted")) count.contacted += 1;
  if (row.stage === "enrolled") count.enrolled += 1;
  if (row.stage === "lost") count.lost += 1;
}

function grouped(rows: readonly LeadStatRow[], keyOf: (row: LeadStatRow) => string): FunnelCount[] {
  const groups = new Map<string, FunnelCount>();
  for (const row of rows) {
    const key = keyOf(row);
    const count = groups.get(key) ?? emptyCount(key);
    tally(count, row);
    groups.set(key, count);
  }
  return [...groups.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

const rate = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 10000) / 10000);

/**
 * Funnel for leads created in [from, to): current stage counts, how many ever reached each stage,
 * breakdowns by source / centre / program / counsellor, lost reasons and conversion. Erased stubs
 * count (D-042). Keys `none` / `unassigned` stand for a missing centre / program / assignee.
 * `gateDaily`: lead-gate forms per IST day in the same range (see `gateDailyCounts`).
 */
export function funnelReport(viewer: CrmViewer, range: { from: number; to: number }): FunnelReport {
  const db = getDb();
  const rows = leadStats(db, leadScopeFor(viewer), range.from, range.to);
  const byStage = Object.fromEntries(LEAD_STAGES.map((stage) => [stage, 0])) as Record<LeadStage, number>;
  const reached = Object.fromEntries(FUNNEL_STAGES.map((stage) => [stage, 0])) as FunnelReport["reached"];
  const lostReasons = new Map<string, number>();
  const counsellors = new Map<string, FunnelCount & { userId: string | null; displayName: string | null }>();
  let contacted = 0;
  for (const row of rows) {
    byStage[row.stage] += 1;
    const furthest = stageOrdinal(row.furthestStage);
    for (const stage of FUNNEL_STAGES) if (furthest >= stageOrdinal(stage)) reached[stage] += 1;
    if (furthest >= stageOrdinal("contacted")) contacted += 1;
    if (row.stage === "lost") {
      const reason = row.lostReason ?? "unspecified";
      lostReasons.set(reason, (lostReasons.get(reason) ?? 0) + 1);
    }
    const key = row.assignedTo ?? "unassigned";
    const entry = counsellors.get(key) ?? {
      ...emptyCount(key),
      userId: row.assignedTo,
      displayName: row.assignedTo ? row.assigneeName : null,
    };
    tally(entry, row);
    counsellors.set(key, entry);
  }
  return {
    from: toIso(range.from),
    to: toIso(range.to),
    total: rows.length,
    byStage,
    reached,
    bySource: grouped(rows, (row) => row.source),
    byTool: grouped(rows, (row) => canonicalTool(row.tool) ?? "none"),
    byCentre: grouped(rows, (row) => row.centreSlug ?? "none"),
    byProgram: grouped(rows, (row) => row.programInterest ?? "none"),
    byCounsellor: [...counsellors.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)),
    lostReasons: [...lostReasons.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
    conversion: { contactedRate: rate(contacted, rows.length), enrolledRate: rate(byStage.enrolled, rows.length) },
    gateDaily: gateDailyCounts(viewer, range),
  };
}

/**
 * Lead gate (docs/lead-gate-plan.md §3, WP9): contact forms received before a free tool's result,
 * per Asia/Kolkata day in [from, to), newest first; only days with forms. Scoped to the viewer.
 * A form that created its lead counts as a new family, any other as a family already on file;
 * a browser bound past the per-phone cap adds no form and is not counted.
 */
export function gateDailyCounts(viewer: CrmViewer, range: { from: number; to: number }): GateDayCount[] {
  return gateSubmissionsByDay(getDb(), leadScopeFor(viewer), range.from, range.to, GATE_CONSENT_VERSION_LIKE, IST_OFFSET_MS).map((row) => ({
    day: new Date(row.istDay * DAY_MS).toISOString().slice(0, 10),
    newFamilies: row.newFamilies,
    knownFamilies: row.knownFamilies,
  }));
}

/** Report range from optional ISO bounds: default the last 30 days, at most ~3 years, from < to. */
export function reportRange(from: number | null, to: number | null, now: number): { from: number; to: number } | null {
  const end = to ?? now;
  const start = from ?? end - DEFAULT_REPORT_DAYS * DAY_MS;
  if (start >= end || end - start > MAX_REPORT_DAYS * DAY_MS) return null;
  return { from: start, to: end };
}

export const EXPORT_MAX_ROWS = 5000;

const EXPORT_HEADER = [
  "lead_id",
  "created_at",
  "stage",
  "lost_reason",
  "student_name",
  "guardian_name",
  "contact_name",
  "phone",
  "email",
  "current_class",
  "program_interest",
  "centre",
  "source",
  "tool",
  "page",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "assigned_to",
  "submissions",
  "last_activity_at",
  "next_task_due_at",
] as const;

/**
 * CSV of the leads matching `filters` (max 5000, newest first), admin / manager only, scoped.
 * Formula-injection safe (see `csvCell`); no messages or notes. Audited (`crm.export`) with the
 * row count and the filter NAMES used — never the search text.
 */
export function exportLeadsCsv(
  viewer: CrmViewer,
  filters: LeadFilters = {},
  now: number = Date.now(),
): CrmResult<{ csv: string; rows: number; filename: string }> {
  if (viewer.role !== "admin" && viewer.role !== "manager") return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  const query = buildLeadQuery(viewer, { ...filters, includeErased: false }, now);
  const { rows } = queryLeads(db, { ...query, sort: query.sort ?? "newest", limit: EXPORT_MAX_ROWS, offset: 0 });
  const lines = [csvLine(EXPORT_HEADER)];
  for (const row of rows) {
    lines.push(
      csvLine([
        row.id,
        toIso(row.createdAt),
        row.stage,
        row.lostReason,
        row.studentName,
        row.guardianName,
        row.contactName ?? (row.studentName || row.guardianName ? null : leadDisplayName(row)),
        row.phoneE164,
        row.email,
        row.currentClass,
        row.programInterest,
        row.centreSlug,
        row.source,
        canonicalTool(row.tool),
        row.page,
        row.utmSource,
        row.utmMedium,
        row.utmCampaign,
        row.assigneeName,
        row.submissionCount,
        toIso(row.lastActivityAt),
        toIso(row.nextTaskDueAt),
      ]),
    );
  }
  const filterKeys = Object.entries(filters)
    .filter(([key, value]) => value !== undefined && value !== "" && key !== "includeErased")
    .map(([key]) => key)
    .sort();
  crmAudit(db, {
    actorId: viewer.userId,
    action: CRM_AUDIT.export,
    target: null,
    details: { rows: rows.length, filters: filterKeys.join(","), truncated: rows.length >= EXPORT_MAX_ROWS },
    now,
  });
  const day = new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
  // Excel needs the BOM to read UTF-8 (Hindi names).
  return ok({ csv: `﻿${lines.join("\r\n")}\r\n`, rows: rows.length, filename: `aspire-leads-${day}.csv` });
}
