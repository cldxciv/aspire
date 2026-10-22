import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, leadScopeFor, ok } from "./access";
import type { CallingHours, DashboardData, SpeedRow, SpeedStats } from "./lead-ops-types";
import { DAY_MS, istDayBounds } from "./pure";
import { areaIdOfCentre, listAreaNames } from "./repo/areas-core";
import { countNewLeadsBySource, listCampaignRows, listClocksStarted, type DashboardClockRow } from "./repo/dashboard";
import {
  countOpenUnassigned,
  countOpenUnassignedByArea,
  listAwayStaff,
  listMemberIdsOfAreas,
  queryOpenClocks,
  type LeadFilter,
} from "./repo/sla";
import { findDisplayNames } from "./repo/staff";
import { unmatchedPlaceCount } from "./routing";
import { slaStateOf } from "./sla-state";
import { addWorkingMinutes } from "./sla/calling-hours";
import { holderAt } from "./sla/holder";
import { loadPolicy } from "./sla/policy";
import { metaHealth, type NameLang } from "./sla/views";
import { crmPermissions, type CrmResult, type CrmViewer } from "./types";

/**
 * The lead dashboard (owner: LR-SLA; docs/lead-routing-plan.md §16, A7, A10, A27): what needs a
 * call now, and how fast new families got their first call in a period. Read only.
 *
 * Scope: area heads see their areas (explicit scope) or their legacy scope; admins and super
 * admins everything. `?area=` only NARROWS (an area outside a head's areas → 403, M2). Clocks are
 * counted by when they started; imported clocks (`reason = import`) are reported apart (A7): in
 * `speed.imported` and their own `bySource` row only, never in `byArea` / `byExecutive`.
 *
 * Definitions: `met` = first attempt by the due time; `missed` = first attempt after it, a clock
 * still open past it, or closed after it without an attempt; `metRate` = met / (met + missed).
 * `reached` = the family was reached within `reachedTargetMinutes` working minutes;
 * `reachedRate` = reached / clocks whose target time has passed or that were reached. In
 * `byExecutive`, `met` / `attempted` / the median are credited to the first attempter, `missed` /
 * `leads` / `reached` to whoever held the lead at due time (A10), `open` / `overdue` to the
 * current assignee.
 */

export const DASHBOARD_DEFAULT_DAYS = 30;
export const DASHBOARD_MAX_DAYS = 366;
const CLOCK_LIMIT = 20_000;
const SCAN_LIMIT = 5_000;
const CAMPAIGN_LIMIT = 50;
const NONE = "none";
const UNASSIGNED = "unassigned";

/** [from, to) of a dashboard request (default: the last 30 days); null when invalid or too long. */
export function dashboardRange(from: number | null, to: number | null, now: number): { from: number; to: number } | null {
  const end = to ?? now;
  const start = from ?? end - DASHBOARD_DEFAULT_DAYS * DAY_MS;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > DASHBOARD_MAX_DAYS * DAY_MS) return null;
  return { from: start, to: end };
}

/** The areas a viewer's dashboard covers: "all", or the area ids (heads). null = no dashboard. */
export function dashboardAreaScope(db: DatabaseSync, viewer: CrmViewer): string[] | "all" | null {
  if (viewer.role === "admin") return "all";
  if (viewer.role !== "manager") return null;
  if (viewer.areaScope) return [...viewer.areaScope.areaIds];
  if (viewer.centreSlugs.length === 0) return "all";
  const ids = viewer.centreSlugs.map((slug) => areaIdOfCentre(db, slug)).filter((id): id is string => id !== null);
  return [...new Set(ids)];
}

// ---------------------------------------------------------------------------------------------
// Pure statistics (exported for tests)

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(value * 10) / 10;
}

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) / 10_000 : null);

/** One clock's facts for the statistics. */
export interface ClockOutcome {
  attempted: boolean;
  met: boolean;
  missed: boolean;
  open: boolean;
  /** Open and late (past due or past the area-head step). */
  overdue: boolean;
  reached: boolean;
  /** Reached, or its "reached within" target time has passed. */
  reachDecided: boolean;
  workMinutes: number | null;
}

export function clockOutcome(clock: DashboardClockRow, now: number, hours: CallingHours, reachedTargetMinutes: number): ClockOutcome {
  const open = clock.resolvedAt === null;
  const attempted = clock.firstAttemptAt !== null;
  const met = clock.met === true;
  const missed =
    clock.met === false ||
    (open && now >= clock.dueAt) ||
    (!open && !attempted && clock.resolvedAt !== null && clock.resolvedAt > clock.dueAt);
  const target = addWorkingMinutes(hours, clock.startedAt, reachedTargetMinutes);
  const reached = clock.reachedAt !== null && clock.reachedAt <= target;
  return {
    attempted,
    met,
    missed,
    open,
    overdue: open && slaStateOf(clock, now) !== "due",
    reached,
    reachDecided: reached || now >= target,
    workMinutes: attempted && clock.workMs !== null ? clock.workMs / 60_000 : null,
  };
}

export function speedStats(outcomes: readonly ClockOutcome[]): SpeedStats {
  let met = 0;
  let missed = 0;
  let reached = 0;
  let decided = 0;
  const work: number[] = [];
  for (const outcome of outcomes) {
    if (outcome.met) met += 1;
    if (outcome.missed) missed += 1;
    if (outcome.reached) reached += 1;
    if (outcome.reachDecided) decided += 1;
    if (outcome.workMinutes !== null) work.push(outcome.workMinutes);
  }
  return {
    clocks: outcomes.length,
    met,
    metRate: rate(met, met + missed),
    reached,
    reachedRate: rate(reached, decided),
    medianWorkMinutes: median(work),
  };
}

class RowBuilder {
  private rows = new Map<string, SpeedRow & { work: number[] }>();
  constructor(private readonly labelOf: (key: string) => string | undefined) {}
  private row(key: string) {
    let row = this.rows.get(key);
    if (!row) {
      const label = this.labelOf(key);
      row = { key, ...(label !== undefined ? { label } : {}), leads: 0, attempted: 0, met: 0, missed: 0, reached: 0, medianWorkMinutes: null, open: 0, overdue: 0, work: [] };
      this.rows.set(key, row);
    }
    return row;
  }
  add(key: string, field: "leads" | "attempted" | "met" | "missed" | "reached" | "open" | "overdue"): void {
    this.row(key)[field] += 1;
  }
  work(key: string, minutes: number): void {
    this.row(key).work.push(minutes);
  }
  build(): SpeedRow[] {
    return [...this.rows.values()]
      .map(({ work, ...row }) => ({ ...row, medianWorkMinutes: median(work) }))
      .sort((a, b) => b.leads - a.leads || b.open - a.open || a.key.localeCompare(b.key));
  }
}

// ---------------------------------------------------------------------------------------------
// GET /api/crm/dashboard

export interface DashboardQuery {
  from: number;
  to: number;
  /** An area id: narrows the dashboard to that area. */
  area?: string | null;
}

export function dashboardData(
  viewer: CrmViewer,
  query: DashboardQuery,
  now: number,
  options: { lang?: NameLang } = {},
  db: DatabaseSync = getDb(),
): CrmResult<DashboardData> {
  if (!crmPermissions(viewer).canViewDashboard) return fail("forbidden", CRM_MESSAGES.forbidden);
  const areaScope = dashboardAreaScope(db, viewer);
  if (areaScope === null) return fail("forbidden", CRM_MESSAGES.forbidden);
  const area = query.area ?? null;
  if (area !== null && areaScope !== "all" && !areaScope.includes(area)) return fail("forbidden", CRM_MESSAGES.forbidden);

  const lang = options.lang ?? "en";
  const superAdmin = viewer.role === "admin" && viewer.superAdmin === true;
  const admin = viewer.role === "admin";
  const filter: LeadFilter = { scope: leadScopeFor(viewer), ...(area !== null ? { areaIn: [area] } : {}) };
  const { hours, rule } = loadPolicy(db);
  const names = new Map(listAreaNames(db).map((entry) => [entry.id, lang === "hi" ? entry.hi || entry.en : entry.en]));

  // Speed in the period.
  const clocks = listClocksStarted(db, filter, query.from, query.to, CLOCK_LIMIT);
  const outcomes = clocks.map((clock) => clockOutcome(clock, now, hours, rule.reachedTargetMinutes));
  const live: ClockOutcome[] = [];
  const imported: ClockOutcome[] = [];
  clocks.forEach((clock, index) => (clock.reason === "import" ? imported : live).push(outcomes[index]));

  const people = new Set<string>();
  const holders = clocks.map((clock, index) => {
    if (clock.reason === "import") return null; // not in the per-executive table (A7)
    const holder =
      clock.resolution === "attempt"
        ? clock.assigneeAtDue
        : outcomes[index].missed || now >= clock.dueAt
          ? holderAt(db, clock.leadId, clock.dueAt, clock.assignedTo)
          : clock.assignedTo;
    if (holder) people.add(holder);
    if (clock.firstAttemptBy) people.add(clock.firstAttemptBy);
    if (clock.assignedTo) people.add(clock.assignedTo);
    return holder;
  });
  const personNames = findDisplayNames(db, [...people]);

  const byArea = new RowBuilder((key) => (key === NONE ? undefined : names.get(key)));
  const byExecutive = new RowBuilder((key) => (key === UNASSIGNED ? undefined : personNames.get(key)));
  const bySource = new RowBuilder(() => undefined);
  clocks.forEach((clock, index) => {
    const outcome = outcomes[index];
    // Imported lists arrive all at once, so they are reported apart (A7): in `speed.imported` and
    // their own source row (`csv_import`), never in the per-area or per-executive tables.
    const isImport = clock.reason === "import";
    const tables: (readonly [RowBuilder, string])[] = isImport ? [[bySource, clock.source]] : [[byArea, clock.areaId ?? NONE], [bySource, clock.source]];
    for (const [rows, key] of tables) {
      rows.add(key, "leads");
      if (outcome.attempted) rows.add(key, "attempted");
      if (outcome.met) rows.add(key, "met");
      if (outcome.missed) rows.add(key, "missed");
      if (outcome.reached) rows.add(key, "reached");
      if (outcome.open) rows.add(key, "open");
      if (outcome.overdue) rows.add(key, "overdue");
      if (outcome.workMinutes !== null) rows.work(key, outcome.workMinutes);
    }
    if (isImport) return;
    const holder = holders[index] ?? UNASSIGNED;
    byExecutive.add(holder, "leads");
    if (outcome.missed) byExecutive.add(holder, "missed");
    if (outcome.reached) byExecutive.add(holder, "reached");
    if (clock.firstAttemptBy) {
      byExecutive.add(clock.firstAttemptBy, "attempted");
      if (outcome.met) byExecutive.add(clock.firstAttemptBy, "met");
      if (outcome.workMinutes !== null) byExecutive.work(clock.firstAttemptBy, outcome.workMinutes);
    }
    if (outcome.open) {
      const current = clock.assignedTo ?? UNASSIGNED;
      byExecutive.add(current, "open");
      if (outcome.overdue) byExecutive.add(current, "overdue");
    }
  });

  // Right now.
  const open = queryOpenClocks(db, { ...filter, limit: SCAN_LIMIT });
  let overdue = 0;
  let escalated = 0;
  for (const row of open.rows) {
    const state = slaStateOf(row, now);
    if (state !== "due") overdue += 1;
    if (state === "escalated") escalated += 1;
  }
  const unassignedInAreas = [...countOpenUnassignedByArea(db, filter).values()].reduce((sum, count) => sum + count, 0);
  const awayAll = listAwayStaff(db, now);
  const members = areaScope === "all" ? null : listMemberIdsOfAreas(db, areaScope);
  const away = awayAll
    .filter((person) => members === null || members.has(person.userId))
    .map((person) => ({ userId: person.userId, name: person.name, until: new Date(person.awayUntil).toISOString() }));

  const today = istDayBounds(now);
  const bySourceToday = countNewLeadsBySource(db, filter, today.start, today.end);

  const data: DashboardData = {
    range: { from: new Date(query.from).toISOString(), to: new Date(query.to).toISOString() },
    scope: { areaIds: area !== null ? [area] : areaScope },
    today: { newLeads: bySourceToday.reduce((sum, row) => sum + row.count, 0), bySource: bySourceToday },
    now: {
      callNow: open.total,
      overdue,
      escalated,
      unassignedInAreas,
      ...(admin
        ? { unassignedNoArea: countOpenUnassigned(db, "none"), toolSignups: countOpenUnassigned(db, "tool_signups"), unmatchedPlaces: unmatchedPlaceCount(now) }
        : {}),
      away,
    },
    speed: { live: speedStats(live), imported: speedStats(imported) },
    byArea: byArea.build(),
    byExecutive: byExecutive.build(),
    bySource: bySource.build(),
    byCampaign: listCampaignRows(db, filter, query.from, query.to, rule.reachedOutcomes, CAMPAIGN_LIMIT),
  };
  if (superAdmin) {
    const meta = metaHealth(db, now);
    if (meta) data.meta = meta;
  }
  return ok(data);
}
