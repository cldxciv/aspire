import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { LeadStage } from "../types";
import { EFFECTIVE_CENTRE_SQL, REFERRER_WITH_ATTRIBUTION_SQL, TEST_LEAD_SQL } from "./console-sql";
import { scopedLeadWhere, type LeadScope } from "./leads";
import { text } from "./rows";

/**
 * Admin console Phase 1b — read-only SQL for "Where enquiries come from", the Free tools & Rancho
 * card and the search overview (docs/admin-phase-1b-plan.md §5.J, §6.6, §6.7; owner: 1B-SOURCES).
 * Every function is a plain SELECT (no transaction). Lead rows carry no personal fields: only
 * the origin (source, tool, referrer HOST, UTM tags, landing page), the stage and how they heard.
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** One lead of `P_all` with its non-personal origin. */
export interface SourceLeadRow {
  createdAt: number;
  source: string;
  tool: string | null;
  /** `COALESCE(l.referrer, crm_lead_attribution.referrer_host)`: survives erase. */
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  page: string | null;
  stage: LeadStage;
  furthestStage: LeadStage;
  /** `crm_lead_details.heard_via` (kept after erase). */
  heardVia: string | null;
  erased: boolean;
}

/**
 * `P_all` (plan §6): leads in the viewer's scope (`scopedLeadWhere`), test leads left out, ERASED
 * STUBS INCLUDED, created in `[from, to)`; `centre` = an effective-centre slug, `none` (no centre)
 * or null (every centre). Oldest first.
 */
export function sourceLeadRows(db: DatabaseSync, scope: LeadScope, range: { from: number; to: number }, centre: string | null): SourceLeadRow[] {
  const scoped = scopedLeadWhere(scope);
  const where = [scoped.sql, `NOT ${TEST_LEAD_SQL}`, "l.created_at >= ?", "l.created_at < ?"];
  const values: SQLInputValue[] = [...scoped.values, range.from, range.to];
  if (centre === "none") where.push(`${EFFECTIVE_CENTRE_SQL} IS NULL`);
  else if (centre) {
    where.push(`${EFFECTIVE_CENTRE_SQL} = ?`);
    values.push(centre);
  }
  return db
    .prepare(
      `SELECT l.created_at, l.source, l.tool, ${REFERRER_WITH_ATTRIBUTION_SQL} AS ref, l.utm_source, l.utm_medium, l.utm_campaign,
              l.page, l.stage, l.furthest_stage, d.heard_via, l.erased_at
         FROM crm_leads l
         LEFT JOIN crm_lead_attribution la ON la.lead_id = l.id
         LEFT JOIN crm_lead_details d ON d.lead_id = l.id
        WHERE ${where.join(" AND ")}
        ORDER BY l.created_at, l.id`,
    )
    .all(...values)
    .map((row) => ({
      createdAt: Number(row.created_at),
      source: String(row.source),
      tool: text(row.tool),
      referrer: text(row.ref),
      utmSource: text(row.utm_source),
      utmMedium: text(row.utm_medium),
      utmCampaign: text(row.utm_campaign),
      page: text(row.page),
      stage: String(row.stage) as LeadStage,
      furthestStage: String(row.furthest_stage) as LeadStage,
      heardVia: text(row.heard_via),
      erased: row.erased_at !== null && row.erased_at !== undefined,
    }));
}

/** IST day number (days since 1970-01-01 IST) → count. */
export type DayCounts = Map<number, number>;

/** Mock tests submitted per IST day in `[from, to)` (saved attempts only: `mocktest_attempt_meta`). */
export function mockTestsPerDay(db: DatabaseSync, from: number, to: number): DayCounts {
  const counts: DayCounts = new Map();
  for (const row of db
    .prepare(
      `SELECT CAST((server_submitted_at + ?) / 86400000 AS INTEGER) AS ist_day, COUNT(*) AS n
         FROM mocktest_attempt_meta
        WHERE server_submitted_at >= ? AND server_submitted_at < ?
        GROUP BY ist_day`,
    )
    .all(IST_OFFSET_MS, from, to)) {
    counts.set(Number(row.ist_day), Number(row.n));
  }
  return counts;
}

/** Signed-in students active in the planner per IST day (`planner_daily.day` keys, inclusive). */
export function plannerStudentsPerDay(db: DatabaseSync, fromDay: string, toDay: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of db
    .prepare("SELECT day, COUNT(DISTINCT user_id) AS n FROM planner_daily WHERE day >= ? AND day <= ? GROUP BY day")
    .all(fromDay, toDay)) {
    counts.set(String(row.day), Number(row.n));
  }
  return counts;
}

/** One `ask_usage` count (Rancho questions) for a key hash and IST day; 0 when no row. */
export function askUsageCount(db: DatabaseSync, keyHash: string, day: string): number {
  const row = db.prepare("SELECT count FROM ask_usage WHERE key_hash = ? AND day = ?").get(keyHash, day);
  return Number(row?.count ?? 0);
}

/**
 * Free-tool uses noted on enquiries (`tool_use` activities: one entry per lead + tool + key + IST
 * day carrying `uses`) per IST day and tool, in `[from, to)`, on leads in `scope`.
 */
export function toolUsesPerDay(db: DatabaseSync, scope: LeadScope, from: number, to: number): { istDay: number; tool: string; uses: number }[] {
  const scoped = scopedLeadWhere(scope);
  return db
    .prepare(
      `SELECT CAST((a.at + ?) / 86400000 AS INTEGER) AS ist_day, json_extract(a.meta, '$.tool') AS use_tool,
              SUM(COALESCE(CAST(json_extract(a.meta, '$.uses') AS INTEGER), 1)) AS uses
         FROM crm_activities a JOIN crm_leads l ON l.id = a.lead_id
        WHERE a.type = 'tool_use' AND a.at >= ? AND a.at < ? AND ${scoped.sql}
        GROUP BY ist_day, use_tool`,
    )
    .all(IST_OFFSET_MS, from, to, ...scoped.values)
    .map((row) => ({ istDay: Number(row.ist_day), tool: text(row.use_tool) ?? "unknown", uses: Number(row.uses) }));
}
