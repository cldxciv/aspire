/**
 * Pure, client-safe helpers for the first-call screens (owner: LR-SLA; docs/lead-routing-plan.md
 * §15, §20): countdown words, the alert strip's lines, and the "Calling hours & speed" checks
 * the browser runs before saving (the server re-validates everything with CORE's validators).
 */
import { format } from "@/i18n/format";
import {
  CALLING_HOURS_LIMITS,
  SPEED_RULE_LIMITS,
  WEEKDAYS,
  type CallingHours,
  type SlaSummary,
  type SpeedRule,
  type Weekday,
} from "@/lib/crm/lead-ops-types";
import { KNOWN_LEAD_SOURCES } from "@/lib/crm/types";
import type { CrmRequest } from "../api";
import type { CrmMessages } from "../format";
import { leadOpsRequests } from "../lead-ops-api";

export type SpeedMessages = CrmMessages["speed"];

const MINUTE_MS = 60_000;

// ---------------------------------------------------------------------------------------------
// Countdowns

/** "25 min" / "1 h 5 min" (whole minutes, rounded up so "due in 0 min" never shows early). */
export function durationText(t: Pick<SpeedMessages["callNow"], "minutes" | "hoursMinutes">, ms: number): string {
  const total = Math.max(1, Math.ceil(Math.abs(ms) / MINUTE_MS));
  if (total < 60) return format(t.minutes, { count: total });
  return format(t.hoursMinutes, { hours: Math.floor(total / 60), minutes: total % 60 });
}

/** "due in 25 min" before the due time, "late by 10 min" after it. */
export function countdownText(t: SpeedMessages["callNow"], dueAt: string, now: number): { late: boolean; text: string } {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) return { late: false, text: "" };
  const late = now >= due;
  return { late, text: format(late ? t.lateBy : t.dueIn, { time: durationText(t, due - now) }) };
}

// ---------------------------------------------------------------------------------------------
// The alert strip

/** The summary request (area names in the page's language). */
export function summaryRequest(locale: string): CrmRequest {
  const request = leadOpsRequests.slaSummary();
  return locale === "hi" ? { ...request, path: `${request.path}?lang=hi` } : request;
}

/** Whether the strip has anything to say (it renders nothing otherwise). */
export function hasAlerts(summary: SlaSummary | null): summary is SlaSummary {
  if (!summary) return false;
  const { mine, area, sa } = summary;
  if (mine.callNow > 0 || mine.retriesDue > 0) return true;
  if (area && (area.areas.length > 0 || area.byExecutive.length > 0)) return true;
  if (!sa) return false;
  const meta = sa.meta;
  return (
    sa.escalated > 0 ||
    sa.unassignedNoArea > 0 ||
    sa.toolSignups > 0 ||
    sa.unmatchedPlaces > 0 ||
    (meta !== null && (meta.paused !== null || meta.failed > 0 || meta.silentHours !== null))
  );
}

export interface StripLink {
  text: string;
  /** LOCALE-FREE path. */
  href: string;
  tone: "info" | "warn" | "danger";
}

/** The super admin's queue links (only the non-zero ones). */
export function superAdminLinks(sa: NonNullable<SlaSummary["sa"]>, t: SpeedMessages["strip"]): StripLink[] {
  const links: StripLink[] = [];
  if (sa.escalated > 0) links.push({ text: format(t.escalated, { count: sa.escalated }), href: "/crm?sla=escalated", tone: "danger" });
  if (sa.unassignedNoArea > 0) {
    links.push({ text: format(t.unassignedNoArea, { count: sa.unassignedNoArea }), href: "/crm?area=none&assignee=unassigned&stage=open", tone: "warn" });
  }
  if (sa.toolSignups > 0) links.push({ text: format(t.toolSignups, { count: sa.toolSignups }), href: "/crm?area=tool_signups&stage=open", tone: "info" });
  if (sa.unmatchedPlaces > 0) links.push({ text: format(t.unmatchedPlaces, { count: sa.unmatchedPlaces }), href: "/crm/settings/areas", tone: "info" });
  const meta = sa.meta;
  if (meta) {
    const href = "/crm/settings/integrations";
    if (meta.paused === "auth") links.push({ text: t.metaPausedAuth, href, tone: "danger" });
    if (meta.paused === "permission") links.push({ text: t.metaPausedPermission, href, tone: "danger" });
    if (meta.failed > 0) links.push({ text: format(t.metaFailed, { count: meta.failed }), href, tone: "warn" });
    if (meta.silentHours !== null) links.push({ text: format(t.metaSilent, { hours: meta.silentHours }), href, tone: "warn" });
  }
  return links;
}

/** "Kangra: 4 overdue · 2 waiting for someone" per area. */
export function areaLines(area: NonNullable<SlaSummary["area"]>, t: SpeedMessages["strip"]): string[] {
  return area.areas.map((entry) => {
    const name = entry.id === "none" || entry.name === "" ? t.noArea : entry.name;
    const parts = [format(t.areaLine, { area: name, count: entry.overdue })];
    if (entry.unassigned > 0) parts.push(format(t.areaWaiting, { count: entry.unassigned }));
    return parts.join(" · ");
  });
}

/** "Ravi 3, Meena (away) 1" — the per-executive digest (A7). */
export function executiveDigest(area: NonNullable<SlaSummary["area"]>, t: SpeedMessages["strip"]): string {
  return area.byExecutive
    .map((person) => format(t.executiveLine, { name: person.away ? `${person.name} (${t.away})` : person.name, count: person.overdue }))
    .join(", ");
}

/** The tab title with the waiting count: "(3) Today's calls"; the base title without any old count. */
export function titleWithCount(t: Pick<SpeedMessages["strip"], "titleCount">, title: string, count: number): string {
  const base = baseTitle(title);
  return count > 0 ? format(t.titleCount, { count, title: base }) : base;
}

export function baseTitle(title: string): string {
  return title.replace(/^\(\d+\)\s+/, "");
}

// ---------------------------------------------------------------------------------------------
// "Calling hours & speed" checks (browser side; the server is the authority)

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function minutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** Problems with the weekly hours, keyed by field (`week.mon`, `week`, `closedDates`). */
export function callingHoursIssues(hours: CallingHours, t: SpeedMessages["hours"]): Record<string, string> {
  const issues: Record<string, string> = {};
  let open = 0;
  for (const day of WEEKDAYS) {
    const spec = hours.week[day];
    if (!spec.open) continue;
    open += 1;
    if (!HHMM.test(spec.start) || !HHMM.test(spec.end)) issues[`week.${day}`] = format(t.issues.timeInvalid, { day: t.days[day] });
    else if (minutes(spec.start) >= minutes(spec.end)) issues[`week.${day}`] = format(t.issues.endBeforeStart, { day: t.days[day] });
  }
  if (open === 0) issues.week = t.issues.noOpenDay;
  if (hours.closedDates.length > CALLING_HOURS_LIMITS.closedDates) {
    issues.closedDates = format(t.issues.tooManyDates, { max: CALLING_HOURS_LIMITS.closedDates });
  } else if (!hours.closedDates.every(isValidDate)) {
    issues.closedDates = t.issues.dateInvalid;
  }
  return issues;
}

/** Adds a closed date (sorted, no duplicates): the new hours, or the problem. */
export function addClosedDate(hours: CallingHours, date: string, t: SpeedMessages["hours"]): { ok: true; value: CallingHours } | { ok: false; issue: string } {
  if (!isValidDate(date)) return { ok: false, issue: t.issues.dateInvalid };
  if (hours.closedDates.includes(date)) return { ok: false, issue: t.issues.dateDuplicate };
  if (hours.closedDates.length >= CALLING_HOURS_LIMITS.closedDates) {
    return { ok: false, issue: format(t.issues.tooManyDates, { max: CALLING_HOURS_LIMITS.closedDates }) };
  }
  return { ok: true, value: { ...hours, closedDates: [...hours.closedDates, date].sort() } };
}

const inRange = (value: number, range: { min: number; max: number }) => Number.isInteger(value) && value >= range.min && value <= range.max;

/** Problems with the speed rule, keyed by field (the same names the server uses). */
export function speedRuleIssues(rule: SpeedRule, t: SpeedMessages["rule"]): Record<string, string> {
  const L = SPEED_RULE_LIMITS;
  const issues: Record<string, string> = {};
  if (!inRange(rule.firstCallMinutes, L.firstCallMinutes)) issues.firstCallMinutes = format(t.issues.firstCall, L.firstCallMinutes);
  if (!inRange(rule.tiers.areaHead.afterMinutes, L.tierMinutes)) issues["tiers.areaHead"] = format(t.issues.tier, L.tierMinutes);
  if (!inRange(rule.tiers.superAdmin.afterMinutes, L.tierMinutes)) issues["tiers.superAdmin"] = format(t.issues.tier, L.tierMinutes);
  else if (rule.tiers.superAdmin.afterMinutes <= rule.tiers.areaHead.afterMinutes) issues["tiers.superAdmin"] = t.issues.tierOrder;
  if (!inRange(rule.retry.firstAfterMinutes, L.retryFirstAfterMinutes) || !inRange(rule.retry.maxAttempts, L.retryMaxAttempts)) {
    issues.retry = format(t.issues.retry, {
      min: L.retryFirstAfterMinutes.min,
      max: L.retryFirstAfterMinutes.max,
      minCount: L.retryMaxAttempts.min,
      maxCount: L.retryMaxAttempts.max,
    });
  }
  if (rule.reachedOutcomes.length === 0) issues.reachedOutcomes = t.issues.reachedOutcomes;
  if (!inRange(rule.reachedTargetMinutes, L.reachedTargetMinutes)) issues.reachedTargetMinutes = format(t.issues.reachedTarget, L.reachedTargetMinutes);
  return issues;
}

/** Sources offered as "starts the clock": every known source, plus any other already in the rule. */
export function clockSourceOptions(rule: SpeedRule): string[] {
  const known: readonly string[] = KNOWN_LEAD_SOURCES;
  return [...known, ...rule.sources.filter((source) => !known.includes(source))];
}

/** A source id in words (unknown ids: "Other"). */
export function sourceText(sources: CrmMessages["sources"], source: string): string {
  return Object.hasOwn(sources, source) ? sources[source as keyof typeof sources] : sources.other;
}

export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The save request: only the changed documents, each with the version the page loaded. */
export function speedSaveRequest(
  current: { callingHours: CallingHours; speedRule: SpeedRule },
  saved: { callingHours: CallingHours; speedRule: SpeedRule; versions: { callingHours: number; speedRule: number } },
): CrmRequest | null {
  const hoursChanged = !sameJson(current.callingHours, saved.callingHours);
  const ruleChanged = !sameJson(current.speedRule, saved.speedRule);
  if (!hoursChanged && !ruleChanged) return null;
  return leadOpsRequests.saveSpeedSettings({
    ...(hoursChanged ? { callingHours: current.callingHours } : {}),
    ...(ruleChanged ? { speedRule: current.speedRule } : {}),
    expectedVersion: {
      ...(hoursChanged ? { callingHours: saved.versions.callingHours } : {}),
      ...(ruleChanged ? { speedRule: saved.versions.speedRule } : {}),
    },
  });
}

export function setDay(hours: CallingHours, day: Weekday, patch: Partial<CallingHours["week"][Weekday]>): CallingHours {
  return { ...hours, week: { ...hours.week, [day]: { ...hours.week[day], ...patch } } };
}
