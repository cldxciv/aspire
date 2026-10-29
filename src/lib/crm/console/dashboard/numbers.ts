import "server-only";

import type { Locale } from "@/i18n/config";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { DAY_MS } from "../../pure";
import {
  admissionCountsByCentre,
  effectiveCentresInScope,
  erasedSince,
  originRows,
  targetSumsByCentre,
  weekSubLines,
  type OriginRow,
} from "../../repo/console-numbers";
import type { CrmViewer, LeadFilters } from "../../types";
import { consoleCentres, titleCaseSlug, viewerCentreSlugs } from "../centres";
import { classifyChannel } from "../channels";
import { countForFilters, inboxHref } from "../counts";
import { currentSession, istWeekStart } from "../session";
import { CHANNELS, consolePermissions, type CentreNumbers, type CentreRef, type Channel, type ConsoleNumbers } from "../types";
import { admissionsHref, TOP_SOURCES_DAYS, topSourcesHref } from "./links";

/**
 * The five numbers by centre (docs/admin-phase-1b-plan.md §5.A, §6.1, D-078; owner: 1B-NUMBERS).
 *
 * - Numbers that LINK to the Enquiries list are counted by CORE's `countForFilters` over the very
 *   filters their link carries (`numberFilters`), so the list shows the same count by construction;
 *   per-centre rows use its `by: "centre"` split, the Total row the whole scope.
 * - Sub-lines the list cannot show (free-tool sign-ups, imports, "N more since erased"), admissions,
 *   targets and top sources come from repo/console-numbers.ts over `P_all` (erased stubs included).
 *
 * Rows: CRM admins (and managers without a centre scope) get every console centre; managers their
 * centres; both plus any effective centre found in scope, any centre with a target the viewer may
 * read, and "No centre yet" when a lead has none. Targets follow the Targets and Admissions done
 * pages: managers read only their own centres' targets (plan §7), so the Total's "x of T" matches
 * Admissions done for the same session.
 */

/** Top sources shown per row, and the fewest enquiries worth ranking (plan §5.A item 5). */
export const TOP_SOURCES = 3;
export const RANK_MIN_ENQUIRIES = 5;

export type NumberKey = "today" | "week" | "notCalled" | "notCalledOver24h" | "overdue";

/**
 * The inbox filters behind each linked number (plan §6.1). `centre`: a slug, `none` ("No centre
 * yet") or undefined (the Total row: the whole scope).
 */
export function numberFilters(centre?: string): Record<NumberKey, LeadFilters> {
  const at: LeadFilters = centre === undefined ? {} : { centre };
  return {
    today: { created: "today", ...at },
    week: { created: "week", ...at },
    notCalled: { stage: "new", contact: "none", signups: "hide", ...at },
    notCalledOver24h: { stage: "new", contact: "none", signups: "hide", created: "over24h", ...at },
    overdue: { due: "overdue", stage: "open", ...at },
  };
}

/** The 3 most frequent channels (ties in `CHANNELS` order); nothing under 5 enquiries. */
export function topSources(rows: readonly OriginRow[]): { channel: Channel; count: number }[] {
  if (rows.length < RANK_MIN_ENQUIRIES) return [];
  const counts = new Map<Channel, number>();
  for (const row of rows) {
    const channel = classifyChannel(row);
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel))
    .slice(0, TOP_SOURCES);
}

/**
 * The rows to show: every console centre (`own` null) or the viewer's centres, plus effective
 * centres found in scope, then "No centre yet" when a lead in scope has none. Website centres keep
 * their content order; the rest follow by slug.
 */
export function centreRows(all: readonly CentreRef[], own: readonly string[] | null, found: readonly (string | null)[], demo: boolean): CentreRef[] {
  const label = new Map(all.filter((ref) => ref.slug !== null).map((ref) => [ref.slug as string, ref.label]));
  const order = new Map(all.map((ref, index) => [ref.slug, index]));
  const slugs = new Set<string>(own ?? all.flatMap((ref) => (ref.slug === null ? [] : [ref.slug])));
  for (const slug of found) if (slug !== null) slugs.add(slug);
  const rows: CentreRef[] = [...slugs]
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b))
    .map((slug) => ({ slug, label: label.get(slug) ?? titleCaseSlug(slug), demo }));
  if (found.includes(null)) rows.push({ slug: null, label: "", demo });
  return rows;
}

/** Looks a grouped count up by centre (null = no centre yet). */
function grouped(list: { key: string | null; count: number }[]): Map<string | null, number> {
  return new Map(list.map((row) => [row.key, row.count]));
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * The five numbers for each centre row and the Total (plan §6.1) as of `now`. `locale` names the
 * website centres. Reads only (no transaction).
 */
export async function consoleNumbers(viewer: CrmViewer, now: number, locale: Locale = "en"): Promise<ConsoleNumbers> {
  const db = getDb();
  const scope = leadScopeFor(viewer);
  const session = currentSession(now);
  const weekStart = istWeekStart(now);
  const demo = showPlaceholderContent();

  const all = await consoleCentres(db, locale);
  const own = viewerCentreSlugs(db, viewer);
  const showTargets = consolePermissions(viewer, { isSuperAdmin: viewer.superAdmin === true }).canViewTargets;
  const targets = new Map(showTargets ? [...targetSumsByCentre(db, session.key, "admissions")].filter(([slug]) => own === null || own.includes(slug)) : []);
  const centres = centreRows(all, own, [...effectiveCentresInScope(db, scope), ...targets.keys()], demo);

  // Linked numbers: the inbox's own query, split by effective centre, plus the whole-scope totals.
  const filters = numberFilters();
  const keys = Object.keys(filters) as NumberKey[];
  const byCentre = Object.fromEntries(keys.map((key) => [key, grouped(countForFilters(viewer, filters[key], now, "centre"))])) as Record<NumberKey, Map<string | null, number>>;
  const totals = Object.fromEntries(keys.map((key) => [key, countForFilters(viewer, filters[key], now)])) as Record<NumberKey, number>;

  // Unlinked sub-lines, admissions, targets and top sources (P_all).
  const subLines = weekSubLines(db, scope, weekStart);
  const erased = erasedSince(db, scope, weekStart);
  const admissions = admissionCountsByCentre(db, scope, session);
  const origins = originRows(db, scope, now - TOP_SOURCES_DAYS * DAY_MS, now);

  const links = (centre?: string): CentreNumbers["links"] => {
    const f = numberFilters(centre);
    return {
      today: inboxHref(f.today),
      week: inboxHref(f.week),
      notCalled: inboxHref(f.notCalled),
      notCalledOver24h: inboxHref(f.notCalledOver24h),
      overdue: inboxHref(f.overdue),
      admissions: admissionsHref(session.key, centre),
      sources: topSourcesHref(centre),
    };
  };

  const rows: CentreNumbers[] = centres.map((centre) => {
    const key = centre.slug;
    const own = origins.filter((row) => row.centre === key);
    const lines = subLines.get(key);
    return {
      centre,
      enquiriesToday: byCentre.today.get(key) ?? 0,
      enquiriesWeek: byCentre.week.get(key) ?? 0,
      toolSignupsWeek: lines?.toolSignups ?? 0,
      importedWeek: lines?.imported ?? 0,
      erasedWeek: erased.get(key) ?? 0,
      notCalled: byCentre.notCalled.get(key) ?? 0,
      notCalledOver24h: byCentre.notCalledOver24h.get(key) ?? 0,
      overdue: byCentre.overdue.get(key) ?? 0,
      admissionsSession: admissions.get(key) ?? 0,
      sessionTarget: key === null ? null : (targets.get(key) ?? null),
      topSources: topSources(own),
      enquiries30d: own.length,
      links: links(key ?? "none"),
    };
  });

  const shownTargets = rows.map((row) => row.sessionTarget).filter((value): value is number => value !== null);
  const total: CentreNumbers = {
    centre: { slug: null, label: "", demo },
    enquiriesToday: totals.today,
    enquiriesWeek: totals.week,
    toolSignupsWeek: sum([...subLines.values()].map((line) => line.toolSignups)),
    importedWeek: sum([...subLines.values()].map((line) => line.imported)),
    erasedWeek: sum(erased.values()),
    notCalled: totals.notCalled,
    notCalledOver24h: totals.notCalledOver24h,
    overdue: totals.overdue,
    admissionsSession: sum(admissions.values()),
    sessionTarget: shownTargets.length === 0 ? null : sum(shownTargets),
    topSources: topSources(origins),
    enquiries30d: origins.length,
    links: links(),
  };

  return { generatedAt: new Date(now).toISOString(), session, rows, total, centreListIsDemo: demo };
}
