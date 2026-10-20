/**
 * Calendar-date helpers for the study planner (A4-PLANNER). Pure and client-safe.
 *
 * Every planner date is an India Standard Time calendar day written as a `YYYY-MM-DD` key, so the
 * browser, the server and the parent summary agree on "today" whatever the device's time zone.
 * IST has no daylight saving: it is always UTC+05:30.
 *
 * Nothing here reads the clock. Callers pass `Date.now()` from an event handler or effect (never
 * during a server render, see CLAUDE.md: no `new Date()` in server components).
 */

export type DateKey = string;

export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as `YYYY-MM-DD` (rejects 2026-02-30). */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== "string") return false;
  const match = DATE_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** Days since 1970-01-01 for a date key (UTC arithmetic on the calendar date itself). */
export function dayNumber(key: DateKey): number {
  const match = DATE_KEY.exec(key);
  if (!match) throw new RangeError(`Invalid date key: ${key}`);
  return Math.round(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS);
}

/** The date key for a day number (inverse of `dayNumber`). */
export function fromDayNumber(day: number): DateKey {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The IST calendar day of an instant (epoch milliseconds). */
export function istDateKey(epochMs: number): DateKey {
  return new Date(epochMs + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes past midnight IST of an instant (0–1439). */
export function istMinutesOfDay(epochMs: number): number {
  const shifted = new Date(epochMs + IST_OFFSET_MS);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function addDays(key: DateKey, days: number): DateKey {
  return fromDayNumber(dayNumber(key) + days);
}

/** `b − a` in whole days. */
export function diffDays(a: DateKey, b: DateKey): number {
  return dayNumber(b) - dayNumber(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(key: DateKey): number {
  return (((dayNumber(key) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday.
}

/** Monday of the (IST) week that contains `key`. Leaderboard weeks run Monday–Sunday. */
export function weekStart(key: DateKey): DateKey {
  return addDays(key, -((weekday(key) + 6) % 7));
}

/** Inclusive list of date keys from `from` to `to` (empty when `to` is before `from`). */
export function dateRange(from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  for (let day = dayNumber(from), end = dayNumber(to); day <= end; day += 1) out.push(fromDayNumber(day));
  return out;
}

/** UTC instant (epoch ms) of an IST wall-clock time on a date: `istInstant("2026-10-21", 18 * 60)`. */
export function istInstant(key: DateKey, minutesOfDay: number): number {
  return dayNumber(key) * DAY_MS + minutesOfDay * 60 * 1000 - IST_OFFSET_MS;
}
