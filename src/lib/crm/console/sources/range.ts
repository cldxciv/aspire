/**
 * `/crm/sources` query: range and centre (docs/admin-phase-1b-plan.md §5.J; owner: 1B-SOURCES).
 * PURE and client-safe (the page, the API and the filter form share it). Times are IST: India has
 * no daylight saving, so a fixed UTC+05:30 offset is exact.
 *
 * - `range=30d|90d|session` (default 90 days; "session" = since 1 April IST of the current session);
 * - or `from=YYYY-MM-DD&to=YYYY-MM-DD` (IST days, inclusive; at most about 3 years);
 * - `centre=<slug>` or `centre=none` (the EFFECTIVE centre, like the Enquiries list).
 * Links carry only these enums, dates and centre slugs (plan §1.2 rule 11).
 */
import { cleanSlug } from "../../pure";
import { currentSession } from "../session";
import { DEFAULT_SOURCE_RANGE, SOURCE_RANGES, type SourceRange, type SourceRangeKey, type SourceRangePreset } from "./types";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;
/** The longest custom range (like the reports' 3-year cap). */
export const MAX_SOURCE_RANGE_DAYS = 3 * 366;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface SourcesQuery {
  range: SourceRange;
  centre: string | null;
  /** What the request asked for could not be used (a bad date, a reversed or too long range, a bad centre). */
  invalid: { range: boolean; centre: boolean };
}

/** `YYYY-MM-DD` of the IST day containing `ms`. */
export function istDayKey(ms: number): string {
  return new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** 00:00 IST of a real calendar date written `YYYY-MM-DD`, else null (rejects 2026-02-30). */
export function istDayStartOf(day: string): number | null {
  const match = DATE.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, date);
  const check = new Date(utc);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== date) return null;
  return utc - IST_OFFSET_MS;
}

function isPreset(value: unknown): value is SourceRangePreset {
  return typeof value === "string" && (SOURCE_RANGES as readonly string[]).includes(value);
}

/** A preset range ending now. */
export function presetRange(key: SourceRangePreset, now: number): SourceRange {
  const fromMs = key === "session" ? currentSession(now).fromMs : key === "30d" ? now - 30 * DAY_MS : now - 90 * DAY_MS;
  return { key, fromMs, toMs: now, fromDay: istDayKey(fromMs), toDay: istDayKey(now - 1) };
}

/** A custom range of whole IST days (`to` inclusive, never past now), or null when unusable. */
export function customRange(fromDay: string, toDay: string, now: number): SourceRange | null {
  const fromMs = istDayStartOf(fromDay);
  const toStart = istDayStartOf(toDay);
  if (fromMs === null || toStart === null || toStart < fromMs) return null;
  if (toStart - fromMs > MAX_SOURCE_RANGE_DAYS * DAY_MS) return null;
  if (fromMs > now) return null;
  const toMs = Math.min(toStart + DAY_MS, Math.max(now, fromMs + 1));
  return { key: "custom", fromMs, toMs, fromDay, toDay: istDayKey(toMs - 1) };
}

type Param = string | string[] | null | undefined;
const first = (value: Param): string | undefined => {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw !== "" ? raw.slice(0, 100) : undefined;
};

/**
 * Reads `range` / `from` / `to` / `centre` (from page `searchParams` or `URLSearchParams`).
 * Unusable values fall back to the default range or every centre and are flagged in `invalid`.
 */
export function parseSourcesQuery(get: (name: string) => Param, now: number): SourcesQuery {
  const invalid = { range: false, centre: false };
  const rangeParam = first(get("range"));
  const from = first(get("from"));
  const to = first(get("to"));
  let range: SourceRange | null = null;
  if (isPreset(rangeParam)) range = presetRange(rangeParam, now);
  else if (from !== undefined || to !== undefined || rangeParam === "custom") {
    range = from && to ? customRange(from, to, now) : null;
    if (!range) invalid.range = true;
  } else if (rangeParam !== undefined) invalid.range = true;
  const centreParam = first(get("centre"));
  let centre: string | null = null;
  if (centreParam === "none") centre = "none";
  else if (centreParam !== undefined) {
    const slug = cleanSlug(centreParam);
    if (slug && slug === centreParam) centre = slug;
    else invalid.centre = true;
  }
  return { range: range ?? presetRange(DEFAULT_SOURCE_RANGE, now), centre, invalid };
}

/**
 * The page link for a range and centre, LOCALE-FREE (`/crm/sources?range=30d&centre=shimla`).
 * The default range is left out.
 */
export function sourcesHref(range: Pick<SourceRange, "key" | "fromDay" | "toDay">, centre: string | null, hash = ""): string {
  const params = new URLSearchParams();
  if (range.key === "custom") {
    params.set("from", range.fromDay);
    params.set("to", range.toDay);
  } else if (range.key !== DEFAULT_SOURCE_RANGE) params.set("range", range.key);
  if (centre) params.set("centre", centre);
  const query = params.toString();
  return `/crm/sources${query ? `?${query}` : ""}${hash}`;
}

export type { SourceRangeKey };
