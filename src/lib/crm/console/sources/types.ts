/**
 * "Where enquiries come from" (docs/admin-phase-1b-plan.md §5.J, §6.6, §6.7, D-082; owner:
 * 1B-SOURCES): the report shapes. CLIENT-SAFE: no server-only imports, no I/O.
 *
 * Population (plan §6): `P_all` = the viewer's scope (`scopedLeadWhere`), test leads left out,
 * ERASED STUBS INCLUDED (only their non-personal origin is kept), created in the range. So these
 * counts can be higher than the Enquiries list, and the page says so.
 */
import type { Channel } from "../types";

/** Range presets of `/crm/sources?range=` (default 90 days). A custom range uses `from` / `to` (IST dates). */
export const SOURCE_RANGES = ["30d", "90d", "session"] as const;
export type SourceRangePreset = (typeof SOURCE_RANGES)[number];
export type SourceRangeKey = SourceRangePreset | "custom";
export const DEFAULT_SOURCE_RANGE: SourceRangePreset = "90d";

/** The resolved range: `[fromMs, toMs)`; `fromDay` / `toDay` are the IST calendar days it covers (inclusive). */
export interface SourceRange {
  key: SourceRangeKey;
  fromMs: number;
  toMs: number;
  fromDay: string;
  toDay: string;
}

/** Groups under this many enquiries are marked "Small sample" (plan §6.6, §10.3). */
export const SMALL_SAMPLE_UNDER = 10;
/** Campaigns, referring websites and landing pages: the top 20, then "Other". */
export const TOP_LIST_SIZE = 20;
/** Weekly trend: the 5 biggest channels, then "Others"; at most the last 12 IST weeks of the range. */
export const TREND_SERIES = 5;
export const TREND_MAX_WEEKS = 12;
/** Free tools card: the last 14 IST days. */
export const TOOL_DAYS = 14;

/** Enquiries of a group, how many reached counselling (furthest stage ≥ counselling booked) and how many were admitted. */
export interface FunnelCounts {
  enquiries: number;
  reachedCounselling: number;
  admitted: number;
  /** Fewer than `SMALL_SAMPLE_UNDER` enquiries. */
  smallSample: boolean;
}

export interface ChannelRow extends FunnelCounts {
  channel: Channel;
}

/**
 * An "all signals" view (plan §5.J items 2–3, §6.6): families whose website visit carried the
 * signal (a tag or referrer, whatever channel won) or whom staff recorded under "how they heard",
 * each family counted ONCE in the totals.
 */
export interface SignalSummary extends FunnelCounts {
  /** The visit carried the signal (tag or referrer). */
  fromVisit: number;
  /** Staff recorded it under "how they heard about us". */
  fromStaff: number;
  /** Both of the above (counted once in `enquiries`). */
  both: number;
  /** Where the visit signal came from (a host such as "chatgpt.com" or a `utm_source`), largest first. */
  bySignal: { key: string; count: number }[];
}

/** The rest of a top-N list: how many enquiries and how many distinct values were folded into "Other". */
export interface OtherBucket {
  enquiries: number;
  distinct: number;
}

export interface CampaignRow extends FunnelCounts {
  campaign: string;
  /** The most common `utm_source` / `utm_medium` with this campaign (null when never set). */
  topSource: string | null;
  topMedium: string | null;
}

export interface ReferrerRow {
  host: string;
  enquiries: number;
  /** An AI assistant host (ChatGPT, Perplexity, …). */
  ai: boolean;
}

export interface PageRow {
  page: string;
  enquiries: number;
}

/** `key: null` = "Not recorded". Unknown (newer) values are kept as written. */
export interface HeardRow {
  key: string | null;
  enquiries: number;
}

export type TrendSeries = Channel | "others";

export interface TrendWeek {
  /** Monday of the IST week (`YYYY-MM-DD`). */
  weekStart: string;
  /** The range starts or ends inside this week (only part of it is counted). */
  partial: boolean;
  /** Per series (every series of `WeeklyTrend.series` is present). */
  counts: Record<string, number>;
  total: number;
}

export interface WeeklyTrend {
  /** The top channels over the weeks shown (largest first, ties in `CHANNELS` order), then "others" when any. */
  series: TrendSeries[];
  /** Oldest first. */
  weeks: TrendWeek[];
  /**
   * The Monday the trend starts from (`YYYY-MM-DD`, IST) when the range is longer than
   * `TREND_MAX_WEEKS` weeks and its older weeks are left out; null when the whole range is shown.
   */
  shownFromDay: string | null;
}

/** The lead gate's effective mode (contact form before a free tool's result). */
export interface GateStatus {
  mode: "required" | "optional" | "off";
  offReason: "unset" | "store_off" | "no_secret" | null;
}

/** One IST day of free-tool use (admins only). */
export interface ToolDay {
  /** `YYYY-MM-DD` (IST). */
  day: string;
  /** Contact forms before a result: new families / families already on file (scoped like the inbox). */
  contactNew: number;
  contactKnown: number;
  /** Mock tests submitted (saved attempts only). */
  mockTests: number;
  /** Planner: signed-in students active that day. */
  plannerStudents: number;
  /** Rancho questions (site-wide); null where the site no longer keeps the count (older than yesterday). */
  ranchoQuestions: number | null;
  /** Tool uses noted on enquiries (families who shared their details), per tool. */
  toolUses: number;
  toolUsesByTool: Record<string, number>;
}

export interface ToolsCard {
  gate: GateStatus;
  /** Enquiries per tool in the page's range (canonical tool ids: predictor, mock-test, ask = Rancho, planner). */
  enquiriesByTool: { tool: string; enquiries: number }[];
  /** Usage rows: CRM admins only (null for area heads). Oldest day first. */
  usage: { days: ToolDay[] } | null;
}

export interface SourcesReport {
  generatedAt: string;
  range: SourceRange;
  /** The centre filter (effective centre): a slug, `none` (no centre yet) or null (every centre). */
  centre: string | null;
  total: number;
  /** How many of `total` were erased later (their non-personal origin is still counted). */
  erased: number;
  channels: ChannelRow[];
  maps: SignalSummary;
  ai: SignalSummary;
  campaigns: { rows: CampaignRow[]; other: (OtherBucket & FunnelCounts) | null; untagged: number };
  referrers: { rows: ReferrerRow[]; other: OtherBucket | null; none: number };
  pages: { rows: PageRow[]; other: OtherBucket | null; none: number };
  heard: HeardRow[];
  weekly: WeeklyTrend;
  tools: ToolsCard;
}

/** The search overview's periods (days). */
export const SEARCH_PERIODS = [30, 90] as const;

export interface SearchOverview {
  generatedAt: string;
  /** `showPlaceholderContent()`: the site is hidden from search engines (demo mode). */
  hiddenFromSearch: boolean;
  periods: {
    days: number;
    searchEngines: FunnelCounts;
    maps: FunnelCounts;
    ai: FunnelCounts;
  }[];
}
