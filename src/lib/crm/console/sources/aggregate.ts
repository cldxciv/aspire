/**
 * The arithmetic of "Where enquiries come from" (docs/admin-phase-1b-plan.md §5.J, §6.6; owner:
 * 1B-SOURCES). PURE: lead origin rows in, report sections out, so every formula is unit-tested
 * without a database. The rows are `P_all` (scope, no test leads, erased stubs included).
 */
import { stageOrdinal, type LeadStage } from "../../types";
import { classifyChannel, isAiAssistantHost, isAiAssistantSignal, isMapsSignal, MAPS_HOSTS, hostMatches, normalizeHost, type ChannelInput } from "../channels";
import { istWeekStart } from "../session";
import { CHANNELS, HEARD_VIA, type Channel } from "../types";
import { istDayKey } from "./range";
import {
  SMALL_SAMPLE_UNDER,
  TOP_LIST_SIZE,
  TREND_MAX_WEEKS,
  TREND_SERIES,
  type CampaignRow,
  type ChannelRow,
  type FunnelCounts,
  type HeardRow,
  type OtherBucket,
  type PageRow,
  type ReferrerRow,
  type SignalSummary,
  type SourceRange,
  type TrendSeries,
  type TrendWeek,
  type WeeklyTrend,
} from "./types";

const WEEK_MS = 7 * 86_400_000;

/** The non-personal origin of one enquiry (the repo's `SourceLeadRow`). */
export interface OriginRow extends ChannelInput {
  createdAt: number;
  page: string | null;
  stage: LeadStage;
  furthestStage: LeadStage;
  heardVia: string | null;
  erased: boolean;
}

/** Channels the table always shows, even at 0 (plan §5.J item 1). */
export const ALWAYS_SHOWN_CHANNELS: readonly Channel[] = ["google_maps", "ai_assistants"];
/** "Tagged website link" key of the Google Maps signal breakdown (a GBP / Maps UTM tag rather than a Maps referrer). */
export const MAPS_TAG_KEY = "tagged";

const COUNSELLING = stageOrdinal("counselling_booked");

/** Reached counselling = the furthest stage is counselling booked or later (lost leads keep their furthest stage). */
export function reachedCounselling(row: Pick<OriginRow, "furthestStage">): boolean {
  return stageOrdinal(row.furthestStage) >= COUNSELLING;
}

export function admitted(row: Pick<OriginRow, "stage">): boolean {
  return row.stage === "enrolled";
}

/** Funnel counts of a group of enquiries. */
export function funnel(rows: readonly Pick<OriginRow, "stage" | "furthestStage">[]): FunnelCounts {
  let reached = 0;
  let enrolled = 0;
  for (const row of rows) {
    if (reachedCounselling(row)) reached += 1;
    if (admitted(row)) enrolled += 1;
  }
  return { enquiries: rows.length, reachedCounselling: reached, admitted: enrolled, smallSample: rows.length < SMALL_SAMPLE_UNDER };
}

function groupBy<T, K>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/** Largest first; ties by key (deterministic). */
function byCountThenKey<K extends string>(a: [K, number], b: [K, number]): number {
  return b[1] - a[1] || a[0].localeCompare(b[0]);
}

/** Channels table: every channel with enquiries plus Google Maps and AI assistants; largest first, ties in `CHANNELS` order. */
export function channelRows(rows: readonly OriginRow[]): ChannelRow[] {
  const groups = groupBy(rows, (row) => classifyChannel(row));
  const shown = CHANNELS.filter((channel) => groups.has(channel) || ALWAYS_SHOWN_CHANNELS.includes(channel));
  return shown
    .map((channel) => ({ channel, ...funnel(groups.get(channel) ?? []) }))
    .sort((a, b) => b.enquiries - a.enquiries || CHANNELS.indexOf(a.channel) - CHANNELS.indexOf(b.channel));
}

/**
 * An all-signals view: the visit carried the signal (whatever channel won) OR staff recorded it
 * under "how they heard"; each enquiry counted once.
 */
function signalSummary(rows: readonly OriginRow[], visitSignal: (row: OriginRow) => boolean, heardValue: string, signalKey: (row: OriginRow) => string | null): SignalSummary {
  const matched: OriginRow[] = [];
  const bySignal = new Map<string, number>();
  let fromVisit = 0;
  let fromStaff = 0;
  let both = 0;
  for (const row of rows) {
    const visit = visitSignal(row);
    const staff = row.heardVia === heardValue;
    if (!visit && !staff) continue;
    matched.push(row);
    if (visit) {
      fromVisit += 1;
      const key = signalKey(row);
      if (key) bySignal.set(key, (bySignal.get(key) ?? 0) + 1);
    }
    if (staff) fromStaff += 1;
    if (visit && staff) both += 1;
  }
  return {
    ...funnel(matched),
    fromVisit,
    fromStaff,
    both,
    bySignal: [...bySignal.entries()].sort(byCountThenKey).map(([key, count]) => ({ key, count })),
  };
}

/** Google Maps, all signals: a GBP / Maps tag or a Maps referrer, or "heard via Google Maps". */
export function mapsSummary(rows: readonly OriginRow[]): SignalSummary {
  return signalSummary(rows, isMapsSignal, "google_maps", (row) => {
    const host = normalizeHost(row.referrer);
    return host && hostMatches(host, MAPS_HOSTS) ? host : MAPS_TAG_KEY;
  });
}

/** AI assistants, all signals: an AI assistant referrer or `utm_source`, or "heard via an AI assistant". */
export function aiSummary(rows: readonly OriginRow[]): SignalSummary {
  return signalSummary(rows, isAiAssistantSignal, "ai_assistant", (row) => {
    const host = normalizeHost(row.referrer);
    if (host && isAiAssistantHost(host)) return host;
    const source = typeof row.utmSource === "string" ? row.utmSource.trim().toLowerCase() : "";
    return source || null;
  });
}

function mostCommon(values: readonly (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    const clean = typeof value === "string" ? value.trim() : "";
    if (clean) counts.set(clean, (counts.get(clean) ?? 0) + 1);
  }
  const [top] = [...counts.entries()].sort(byCountThenKey);
  return top ? top[0] : null;
}

/** Splits sorted groups into the top `size` and an "Other" bucket. */
function topAndOther<T>(sorted: readonly [string, T[]][], size: number): { top: [string, T[]][]; rest: [string, T[]][] } {
  return { top: sorted.slice(0, size), rest: sorted.slice(size) };
}

function sortedGroups<T>(groups: Map<string, T[]>): [string, T[]][] {
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

/** Campaign tags (`utm_campaign`, trimmed): the top 20 with their most common source / medium, then "Other". */
export function campaignRows(rows: readonly OriginRow[]): { rows: CampaignRow[]; other: (OtherBucket & FunnelCounts) | null; untagged: number } {
  const tagged = rows.filter((row) => typeof row.utmCampaign === "string" && row.utmCampaign.trim() !== "");
  const groups = groupBy(tagged, (row) => (row.utmCampaign as string).trim());
  const { top, rest } = topAndOther(sortedGroups(groups), TOP_LIST_SIZE);
  const restRows = rest.flatMap(([, list]) => list);
  return {
    rows: top.map(([campaign, list]) => ({
      campaign,
      topSource: mostCommon(list.map((row) => row.utmSource)),
      topMedium: mostCommon(list.map((row) => row.utmMedium)),
      ...funnel(list),
    })),
    other: rest.length > 0 ? { ...funnel(restRows), distinct: rest.length } : null,
    untagged: rows.length - tagged.length,
  };
}

/** Referring websites (host, kept after erase): the top 20 with AI hosts flagged, then "Other"; `none` = no referrer. */
export function referrerRows(rows: readonly OriginRow[]): { rows: ReferrerRow[]; other: OtherBucket | null; none: number } {
  const withHost = rows.map((row) => normalizeHost(row.referrer)).filter((host): host is string => host !== null);
  const groups = groupBy(withHost, (host) => host);
  const { top, rest } = topAndOther(sortedGroups(groups), TOP_LIST_SIZE);
  return {
    rows: top.map(([host, list]) => ({ host, enquiries: list.length, ai: isAiAssistantHost(host) })),
    other: rest.length > 0 ? { enquiries: rest.reduce((sum, [, list]) => sum + list.length, 0), distinct: rest.length } : null,
    none: rows.length - withHost.length,
  };
}

/** Landing pages (`page`): the top 20, then "Other"; `none` = no page recorded (staff entries, imports, Meta forms). */
export function pageRows(rows: readonly OriginRow[]): { rows: PageRow[]; other: OtherBucket | null; none: number } {
  const withPage = rows.map((row) => (typeof row.page === "string" && row.page !== "" ? row.page : null)).filter((page): page is string => page !== null);
  const groups = groupBy(withPage, (page) => page);
  const { top, rest } = topAndOther(sortedGroups(groups), TOP_LIST_SIZE);
  return {
    rows: top.map(([page, list]) => ({ page, enquiries: list.length })),
    other: rest.length > 0 ? { enquiries: rest.reduce((sum, [, list]) => sum + list.length, 0), distinct: rest.length } : null,
    none: rows.length - withPage.length,
  };
}

/** "How they heard about us" as recorded by staff: known values in list order, then newer values, then "Not recorded". */
export function heardRows(rows: readonly OriginRow[]): HeardRow[] {
  if (rows.length === 0) return [];
  const groups = groupBy(rows, (row) => (typeof row.heardVia === "string" && row.heardVia !== "" ? row.heardVia : null));
  const known = HEARD_VIA.filter((key) => groups.has(key)).map((key) => ({ key, enquiries: groups.get(key)?.length ?? 0 }));
  const newer = [...groups.entries()]
    .filter(([key]) => key !== null && !(HEARD_VIA as readonly string[]).includes(key))
    .sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])))
    .map(([key, list]) => ({ key, enquiries: list.length }));
  return [...known, ...newer, { key: null, enquiries: groups.get(null)?.length ?? 0 }];
}

/**
 * Weekly trend (IST weeks, Monday start) over the range, at most its last 12 weeks: the 5 biggest
 * channels over the weeks shown (ties in `CHANNELS` order), then "Others". When older weeks are
 * left out, `shownFromDay` says where the trend starts (the page says so).
 */
export function weeklyTrend(rows: readonly OriginRow[], range: Pick<SourceRange, "fromMs" | "toMs">): WeeklyTrend {
  if (range.toMs <= range.fromMs) return { series: [], weeks: [], shownFromDay: null };
  const firstWeek = istWeekStart(range.fromMs);
  const lastWeek = istWeekStart(range.toMs - 1);
  const starts: number[] = [];
  for (let week = lastWeek; week >= firstWeek && starts.length < TREND_MAX_WEEKS; week -= WEEK_MS) starts.unshift(week);
  const shownFrom = Math.max(starts[0], range.fromMs);
  const inWindow = rows.filter((row) => row.createdAt >= shownFrom && row.createdAt < range.toMs);
  const channelOf = new Map<OriginRow, Channel>(inWindow.map((row) => [row, classifyChannel(row)]));
  const totals = new Map<Channel, number>();
  for (const channel of channelOf.values()) totals.set(channel, (totals.get(channel) ?? 0) + 1);
  const top = CHANNELS.filter((channel) => totals.has(channel))
    .sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || CHANNELS.indexOf(a) - CHANNELS.indexOf(b))
    .slice(0, TREND_SERIES);
  const hasOthers = [...totals.keys()].some((channel) => !top.includes(channel));
  const series: TrendSeries[] = hasOthers ? [...top, "others"] : [...top];
  const weeks: TrendWeek[] = starts.map((start) => {
    const counts: Record<string, number> = Object.fromEntries(series.map((key) => [key, 0]));
    return { weekStart: istDayKey(start), partial: start < range.fromMs || start + WEEK_MS > range.toMs, counts, total: 0 };
  });
  for (const [row, channel] of channelOf) {
    const index = starts.indexOf(istWeekStart(row.createdAt));
    if (index < 0) continue;
    const key: TrendSeries = top.includes(channel) ? channel : "others";
    weeks[index].counts[key] += 1;
    weeks[index].total += 1;
  }
  return { series, weeks, shownFromDay: starts[0] > firstWeek ? istDayKey(starts[0]) : null };
}
