import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { ClockReason, ClockResolution } from "../lead-ops-types";
import { int, text } from "./rows";
import { leadFilterWhere, type LeadFilter } from "./sla";

/**
 * Lead dashboard SQL (owner: LR-SLA; docs/lead-routing-plan.md §16). Read only; scoped with the
 * same lead filter as the SLA views (record scope + optional area). No personal fields leave this
 * file: ids, sources, campaign names (`utm_campaign`), stages and times only.
 */

/** `leadFilterWhere`'s (parameter-free) live-lead clause, dropped where erased stubs still count. */
const ERASED_CLAUSE = "l.erased_at IS NULL";

export interface DashboardClockRow {
  id: number;
  leadId: string;
  reason: ClockReason;
  source: string;
  startedAt: number;
  dueAt: number;
  tier1At: number | null;
  tier2At: number | null;
  resolvedAt: number | null;
  resolution: ClockResolution | null;
  firstAttemptAt: number | null;
  firstAttemptBy: string | null;
  assigneeAtDue: string | null;
  workMs: number | null;
  met: boolean | null;
  reachedAt: number | null;
  /** The lead's current assignee and routing area. */
  assignedTo: string | null;
  areaId: string | null;
}

/** Clocks started in [from, to) on leads matching `filter` (erased leads included: their clocks still count). */
export function listClocksStarted(db: DatabaseSync, filter: LeadFilter, from: number, to: number, limit: number): DashboardClockRow[] {
  const where: string[] = ["c.started_at >= ?", "c.started_at < ?"];
  const values: SQLInputValue[] = [from, to];
  const leadWhere: string[] = [];
  leadFilterWhere(filter, leadWhere, values);
  // Erased stubs keep their clocks (resolution `erased`): count them, like Reports counts erased stubs.
  where.push(...leadWhere.filter((clause) => clause !== ERASED_CLAUSE));
  return db
    .prepare(
      `SELECT c.id, c.lead_id, c.reason, c.source, c.started_at, c.due_at, c.tier1_at, c.tier2_at, c.resolved_at, c.resolution,
              c.first_attempt_at, c.first_attempt_by, c.assignee_at_due, c.work_ms, c.met, c.reached_at,
              l.assigned_to, (SELECT area_id FROM crm_lead_routing WHERE lead_id = l.id) AS area_id
         FROM crm_sla_clocks c JOIN crm_leads l ON l.id = c.lead_id
        WHERE ${where.join(" AND ")}
        ORDER BY c.started_at, c.id LIMIT ?`,
    )
    .all(...values, limit)
    .map((row) => {
      const reason = String(row.reason);
      const met = int(row.met);
      return {
        id: Number(row.id),
        leadId: String(row.lead_id),
        reason: reason === "reopened" || reason === "import" ? reason : "new",
        source: String(row.source),
        startedAt: Number(row.started_at),
        dueAt: Number(row.due_at),
        tier1At: int(row.tier1_at),
        tier2At: int(row.tier2_at),
        resolvedAt: int(row.resolved_at),
        resolution: text(row.resolution) as ClockResolution | null,
        firstAttemptAt: int(row.first_attempt_at),
        firstAttemptBy: text(row.first_attempt_by),
        assigneeAtDue: text(row.assignee_at_due),
        workMs: int(row.work_ms),
        met: met === null ? null : met === 1,
        reachedAt: int(row.reached_at),
        assignedTo: text(row.assigned_to),
        areaId: text(row.area_id),
      };
    });
}

/** New leads (CRM arrival = `created_at`) in [from, to) per source. */
export function countNewLeadsBySource(db: DatabaseSync, filter: LeadFilter, from: number, to: number): { key: string; count: number }[] {
  const where: string[] = ["l.created_at >= ?", "l.created_at < ?"];
  const values: SQLInputValue[] = [from, to];
  leadFilterWhere(filter, where, values);
  return db
    .prepare(`SELECT l.source, COUNT(*) AS n FROM crm_leads l WHERE ${where.join(" AND ")} GROUP BY l.source ORDER BY n DESC, l.source`)
    .all(...values)
    .map((row) => ({ key: String(row.source), count: Number(row.n) }));
}

export interface CampaignRow {
  key: string;
  total: number;
  contacted: number;
  reached: number;
  enrolled: number;
  junk: number;
}

/**
 * Leads created in [from, to) per campaign (`utm_campaign`; imported Meta rows carry the campaign
 * name there; `none` = no campaign). `reached` = a call / message with a reached outcome, or a
 * stage from counselling booked on; `junk` = a `wrong_number` outcome or lost as wrong number /
 * duplicate (A27). Top `limit` campaigns by leads.
 */
export function listCampaignRows(
  db: DatabaseSync,
  filter: LeadFilter,
  from: number,
  to: number,
  reachedOutcomes: readonly string[],
  limit: number,
): CampaignRow[] {
  const where: string[] = ["l.created_at >= ?", "l.created_at < ?"];
  const values: SQLInputValue[] = [];
  const outcomeMarks = reachedOutcomes.length > 0 ? reachedOutcomes.map(() => "?").join(", ") : "NULL";
  values.push(...reachedOutcomes, from, to);
  const leadWhere: string[] = [];
  leadFilterWhere(filter, leadWhere, values);
  // Erased stubs keep stage, source and campaign (like Reports): they still count.
  where.push(...leadWhere.filter((clause) => clause !== ERASED_CLAUSE));
  return db
    .prepare(
      `SELECT COALESCE(NULLIF(TRIM(l.utm_campaign), ''), 'none') AS campaign,
              COUNT(*) AS total,
              SUM(CASE WHEN l.furthest_stage <> 'new' THEN 1 ELSE 0 END) AS contacted,
              SUM(CASE WHEN l.furthest_stage IN ('counselling_booked', 'visited_or_demo', 'applied', 'test_taken', 'offer', 'enrolled')
                         OR EXISTS (SELECT 1 FROM crm_activities a WHERE a.lead_id = l.id AND a.type IN ('call', 'whatsapp')
                                      AND json_extract(a.meta, '$.outcome') IN (${outcomeMarks}))
                       THEN 1 ELSE 0 END) AS reached,
              SUM(CASE WHEN l.stage = 'enrolled' THEN 1 ELSE 0 END) AS enrolled,
              SUM(CASE WHEN l.lost_reason IN ('wrong_number', 'duplicate')
                         OR EXISTS (SELECT 1 FROM crm_activities a WHERE a.lead_id = l.id AND a.type IN ('call', 'whatsapp')
                                      AND json_extract(a.meta, '$.outcome') = 'wrong_number')
                       THEN 1 ELSE 0 END) AS junk
         FROM crm_leads l
        WHERE ${where.join(" AND ")}
        GROUP BY campaign
        ORDER BY total DESC, campaign
        LIMIT ?`,
    )
    .all(...values, limit)
    .map((row) => ({
      key: String(row.campaign),
      total: Number(row.total),
      contacted: Number(row.contacted ?? 0),
      reached: Number(row.reached ?? 0),
      enrolled: Number(row.enrolled ?? 0),
      junk: Number(row.junk ?? 0),
    }));
}
