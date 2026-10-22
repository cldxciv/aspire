import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, leadScopeFor, ok } from "../access";
import { SLA_VIEWS, type MetaPauseReason, type SlaQueueItem, type SlaQueuePage, type SlaSummary, type SlaView } from "../lead-ops-types";
import { phoneLastDigits, toIso } from "../pure";
import { responsibleAreaIds } from "../repo/areas-core";
import {
  countOpenUnassigned,
  countOpenUnassignedByArea,
  countRetriesDue,
  listAreaAlertInfo,
  queryOpenClocks,
  type AreaAlertInfo,
  type OpenClockLeadRow,
  type OpenClockQuery,
} from "../repo/sla";
import { listAway } from "../repo/staff-ops";
import { metaHealthSummary } from "../meta";
import { unmatchedPlaceCount } from "../routing";
import { slaClockView, slaStateOf } from "../sla-state";
import type { CrmResult, CrmViewer } from "../types";
import { RETRY_TASK_TITLE } from "./followups";

/**
 * What the first-call alerts show (owner: LR-SLA; docs/lead-routing-plan.md §15, §21, §22). Read
 * only: no writes, no transaction. In-app only (D-041); nothing is ever sent.
 *
 * Who is alerted: tier 1 (the area-head step) goes to the lead's responsible heads — the area's own
 * heads, else the heads of the area that owns its serving centre, else the super admins; leads with
 * no area go to the super admins. Tier 2 goes to the super admins. Heads get a digest per
 * executive, not one alert per lead (A7).
 */

/** Area names in the requested language (the API has no locale; the strip passes `lang`). */
export type NameLang = "en" | "hi";
/** Summary `area.areas[].id` for overdue leads with no area (super admins only; name left to the UI). */
export const NO_AREA_ID = "none";
const LIST_LIMIT = 200;
const SCAN_LIMIT = 5000;

const late = (row: OpenClockLeadRow, now: number) => slaStateOf(row, now) !== "due";

// ---------------------------------------------------------------------------------------------
// Meta health (counts and times only)

export interface MetaHealth {
  lastWebhookAt: string | null;
  lastImportAt: string | null;
  pending: number;
  failed: number;
  paused: MetaPauseReason | null;
  /** Hours without a Meta lead imported (§18.5: since `lastImportAt`, or since setup) once past the silence alert; else null. */
  silentHours: number | null;
}

/**
 * Meta health for the strip and the dashboard: META's own `metaHealthSummary` through the seam
 * (one definition of "pending", "failed" and the silence alert). Null while Meta is switched off.
 */
export function metaHealth(db: DatabaseSync, now: number): MetaHealth | null {
  return metaHealthSummary(db, now);
}

// ---------------------------------------------------------------------------------------------
// Responsible heads (tier 1)

/** Whether some area head receives this (active) area's tier-1 alerts (its own, or its serving area's). */
export function headCovers(area: AreaAlertInfo, byId: ReadonlyMap<string, AreaAlertInfo>): boolean {
  if (area.hasHead) return true;
  const serving = area.servingAreaId ? byId.get(area.servingAreaId) : undefined;
  return serving !== undefined && serving.active && serving.hasHead;
}

/**
 * Areas whose tier-1 alerts fall to the super admins: no head of their own or of their serving
 * area, or switched off. A switched-off (not merged) area keeps its leads' routing rows, but heads
 * only answer for ACTIVE areas (`responsibleAreaIds`), so its late leads would otherwise reach nobody.
 */
export function headlessAreaIds(areas: readonly AreaAlertInfo[]): string[] {
  const byId = new Map(areas.map((area) => [area.id, area]));
  return areas.filter((area) => !area.active || !headCovers(area, byId)).map((area) => area.id);
}

type AreaDigest = NonNullable<SlaSummary["area"]>;

/** The per-area / per-executive digest of tier-1 alerts on `areaIds` (+ leads with no area). */
function areaDigest(
  db: DatabaseSync,
  input: { areaIds: readonly string[]; includeNoArea: boolean; info: readonly AreaAlertInfo[]; now: number; lang: NameLang },
): AreaDigest {
  const { now } = input;
  const alerted = queryOpenClocks(db, { areaIn: input.areaIds, tier1At: now, limit: SCAN_LIMIT }).rows;
  const noArea = input.includeNoArea ? queryOpenClocks(db, { areaKind: "no_area", tier1At: now, limit: SCAN_LIMIT }).rows : [];
  const unassigned = input.areaIds.length > 0 ? countOpenUnassignedByArea(db, { areaIn: input.areaIds }) : new Map<string, number>();
  const overdueByArea = new Map<string, number>();
  for (const row of alerted) if (row.areaId) overdueByArea.set(row.areaId, (overdueByArea.get(row.areaId) ?? 0) + 1);

  const wanted = new Set(input.areaIds);
  const areas: AreaDigest["areas"] = input.info
    .filter((area) => wanted.has(area.id))
    .map((area) => ({
      id: area.id,
      name: input.lang === "hi" ? area.nameHi || area.nameEn : area.nameEn,
      overdue: overdueByArea.get(area.id) ?? 0,
      unassigned: unassigned.get(area.id) ?? 0,
    }))
    .filter((area) => area.overdue > 0 || area.unassigned > 0);
  if (noArea.length > 0) areas.push({ id: NO_AREA_ID, name: "", overdue: noArea.length, unassigned: 0 });

  const away = listAway(db, now);
  const people = new Map<string, { userId: string; name: string; overdue: number; away: boolean }>();
  for (const row of [...alerted, ...noArea]) {
    if (!row.assignedTo) continue;
    const entry = people.get(row.assignedTo) ?? { userId: row.assignedTo, name: row.assigneeName ?? "", overdue: 0, away: away.has(row.assignedTo) };
    entry.overdue += 1;
    people.set(row.assignedTo, entry);
  }
  const byExecutive = [...people.values()].sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
  return { areas, byExecutive };
}

// ---------------------------------------------------------------------------------------------
// GET /api/crm/sla/summary

/**
 * The alert strip's counts for one viewer:
 * - `mine`: open first calls assigned to them (`callNow`), the late ones (`overdue`), the next
 *   deadline, and "Call again" tasks due;
 * - `area` (area heads): tier-1 alerts in the areas they answer for, per area and per executive;
 *   for super admins: the tier-1 alerts nobody else receives (areas with no head, no area);
 * - `sa` (super admins): escalated, the Unassigned and Tool sign-ups queues, unmatched places, Meta.
 */
export function slaSummary(viewer: CrmViewer, now: number, options: { lang?: NameLang } = {}, db: DatabaseSync = getDb()): SlaSummary {
  const lang = options.lang ?? "en";
  const mine = queryOpenClocks(db, { assignee: viewer.userId, limit: SCAN_LIMIT });
  let overdue = 0;
  let nextDue: number | null = null;
  for (const row of mine.rows) {
    if (late(row, now)) overdue += 1;
    else if (nextDue === null || row.dueAt < nextDue) nextDue = row.dueAt;
  }
  const summary: SlaSummary = {
    generatedAt: new Date(now).toISOString(),
    mine: {
      callNow: mine.total,
      overdue,
      nextDueAt: nextDue === null ? null : toIso(nextDue),
      retriesDue: viewer.role === "admin" ? 0 : countRetriesDue(db, viewer.userId, RETRY_TASK_TITLE, now),
    },
  };

  const superAdmin = viewer.role === "admin" && viewer.superAdmin === true;
  if (viewer.role !== "manager" && !superAdmin) return summary;
  const info = listAreaAlertInfo(db);
  if (viewer.role === "manager") {
    summary.area = areaDigest(db, { areaIds: responsibleAreaIds(db, viewer.userId), includeNoArea: false, info, now, lang });
  }
  if (superAdmin) {
    const digest = areaDigest(db, { areaIds: headlessAreaIds(info), includeNoArea: true, info, now, lang });
    if (digest.areas.length > 0 || digest.byExecutive.length > 0) summary.area = digest;
    const meta = metaHealth(db, now);
    summary.sa = {
      escalated: queryOpenClocks(db, { escalatedAt: now, limit: 0 }).total,
      unassignedNoArea: countOpenUnassigned(db, "none"),
      toolSignups: countOpenUnassigned(db, "tool_signups"),
      unmatchedPlaces: unmatchedPlaceCount(now),
      meta: meta ? { pending: meta.pending, failed: meta.failed, paused: meta.paused, silentHours: meta.silentHours } : null,
    };
  }
  return summary;
}

// ---------------------------------------------------------------------------------------------
// GET /api/crm/sla?view=…

export function isSlaView(value: unknown): value is SlaView {
  return typeof value === "string" && (SLA_VIEWS as readonly string[]).includes(value);
}

/**
 * Which lists a role may open (§22): everyone their own (`mine`); area heads and admins the
 * late-or-unassigned list of what they can see (`area`); super admins also `escalated` and the
 * no-area queues (`unassigned`, `tool_signups`). Anything else → 403 (M2: parameters only narrow).
 */
export function slaViewAllowed(viewer: CrmViewer, view: SlaView): boolean {
  if (view === "mine") return true;
  if (view === "area") return viewer.role === "manager" || viewer.role === "admin";
  return viewer.role === "admin" && viewer.superAdmin === true;
}

function queryFor(viewer: CrmViewer, view: SlaView, now: number): OpenClockQuery {
  switch (view) {
    case "mine":
      return { assignee: viewer.userId, limit: LIST_LIMIT };
    case "area":
      return { scope: leadScopeFor(viewer), lateOrUnassignedAt: now, limit: LIST_LIMIT };
    case "escalated":
      return { escalatedAt: now, limit: LIST_LIMIT };
    case "unassigned":
      return { assignee: "unassigned", areaKind: "none", limit: LIST_LIMIT };
    case "tool_signups":
      return { areaKind: "tool_signups", limit: LIST_LIMIT };
  }
}

/** A row → the list item (masked: the last four digits only). */
export function toQueueItem(row: OpenClockLeadRow, now: number): SlaQueueItem | null {
  const clock = slaClockView(row, now);
  if (!clock) return null;
  return {
    leadId: row.leadId,
    displayName: row.studentName ?? row.contactName ?? row.guardianName ?? null,
    phoneLast4: phoneLastDigits(row.phoneE164),
    areaId: row.areaId,
    assignee: row.assignedTo ? { userId: row.assignedTo, displayName: row.assigneeName ?? "" } : null,
    source: row.source,
    clock,
  };
}

/** One first-call list, earliest due first (at most 200 items; `total` counts them all). */
export function slaQueue(viewer: CrmViewer, view: SlaView, now: number, db: DatabaseSync = getDb()): CrmResult<SlaQueuePage> {
  if (!slaViewAllowed(viewer, view)) return fail("forbidden", CRM_MESSAGES.forbidden);
  const result = queryOpenClocks(db, queryFor(viewer, view, now));
  const items = result.rows.map((row) => toQueueItem(row, now)).filter((item): item is SlaQueueItem => item !== null);
  return ok({ view, items, total: result.total, generatedAt: new Date(now).toISOString() });
}
