/**
 * Calling-hours arithmetic (owner: LR-SLA; docs/lead-routing-plan.md §15, D-046). PURE and
 * client-safe: no I/O, no server imports, fixed UTC+05:30 (India has no daylight saving), every
 * scan capped at 400 days so a schedule with no open time can never loop.
 *
 * One window per day (`week[day]`, [start, end) in IST); `closedDates` (YYYY-MM-DD, IST) are shut
 * all day. "Working time" = time inside those windows: the 1-hour first-call rule counts only it,
 * carrying any remainder over to the next opening (Q3).
 */
import type { CallingHours, Weekday } from "../lead-ops-types";

export const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Upper bound of every scan (days). */
export const MAX_SCAN_DAYS = 400;

const WEEKDAY_OF_UTC_DAY: readonly Weekday[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface OpenWindow {
  start: number;
  end: number;
}

/** "HH:MM" → minutes after midnight, or null when malformed. */
export function minutesOfDay(hhmm: string): number | null {
  const match = HHMM.exec(hhmm);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** IST calendar-day number (days since 1970-01-01 in India) of an instant. */
export function istDayNumber(at: number): number {
  return Math.floor((at + IST_OFFSET_MS) / DAY_MS);
}

/** The IST calendar date `YYYY-MM-DD` of an IST day number. */
export function istDateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The weekday of an IST day number. */
export function weekdayOfDay(day: number): Weekday {
  return WEEKDAY_OF_UTC_DAY[new Date(day * DAY_MS).getUTCDay()];
}

/** A reusable reader: the open window of an IST day, or null when that day is closed. */
function windowReader(hours: CallingHours): (day: number) => OpenWindow | null {
  const closed = new Set(hours.closedDates);
  const parsed = new Map<Weekday, { start: number; end: number } | null>();
  for (const [day, spec] of Object.entries(hours.week) as [Weekday, CallingHours["week"][Weekday]][]) {
    const start = spec?.open ? minutesOfDay(spec.start) : null;
    const end = spec?.open ? minutesOfDay(spec.end) : null;
    parsed.set(day, start !== null && end !== null && start < end ? { start, end } : null);
  }
  return (day) => {
    if (closed.has(istDateOfDay(day))) return null;
    const window = parsed.get(weekdayOfDay(day)) ?? null;
    if (!window) return null;
    const midnight = day * DAY_MS - IST_OFFSET_MS;
    return { start: midnight + window.start * MINUTE_MS, end: midnight + window.end * MINUTE_MS };
  };
}

/** The open window of the IST day containing `at`, or null (closed that day). */
export function windowOn(hours: CallingHours, at: number): OpenWindow | null {
  return windowReader(hours)(istDayNumber(at));
}

/** Whether executives are at their phones at `at`. */
export function isOpenAt(hours: CallingHours, at: number): boolean {
  const window = windowOn(hours, at);
  return window !== null && at >= window.start && at < window.end;
}

/** `at` itself when open, else the start of the next open window; null if none within 400 days. */
export function nextOpening(hours: CallingHours, at: number): number | null {
  const read = windowReader(hours);
  const first = istDayNumber(at);
  for (let day = first; day <= first + MAX_SCAN_DAYS; day += 1) {
    const window = read(day);
    if (window && at < window.end) return Math.max(at, window.start);
  }
  return null;
}

/** The start of the first open window that begins strictly after `at` (the "next opening" of a later retry). */
export function nextWindowStart(hours: CallingHours, at: number): number | null {
  const read = windowReader(hours);
  const first = istDayNumber(at);
  for (let day = first; day <= first + MAX_SCAN_DAYS; day += 1) {
    const window = read(day);
    if (window && window.start > at) return window.start;
  }
  return null;
}

/**
 * `start` plus `minutes` of working time (Q3): time outside the windows does not count, and the
 * remainder carries over to the next opening. 10:00 + 60 → 11:00; 18:30 + 60 → 09:30 the next open
 * day (Mon–Sat 09–19). With no open time in 400 days it falls back to wall-clock minutes.
 */
export function addWorkingMinutes(hours: CallingHours, start: number, minutes: number): number {
  let remaining = Math.max(0, Math.round(minutes * MINUTE_MS));
  const read = windowReader(hours);
  const first = istDayNumber(start);
  let cursor = start;
  for (let day = first; day <= first + MAX_SCAN_DAYS; day += 1) {
    const window = read(day);
    if (!window) continue;
    const from = Math.max(cursor, window.start);
    if (from >= window.end) continue;
    const available = window.end - from;
    if (remaining <= available) return from + remaining;
    remaining -= available;
    cursor = window.end;
  }
  return start + Math.max(0, Math.round(minutes * MINUTE_MS));
}

/** Working time (ms) between `from` and `to` (0 when `to` ≤ `from`). */
export function workingMsBetween(hours: CallingHours, from: number, to: number): number {
  if (!(to > from)) return 0;
  const read = windowReader(hours);
  const first = istDayNumber(from);
  const last = Math.min(istDayNumber(to), first + MAX_SCAN_DAYS);
  let total = 0;
  for (let day = first; day <= last; day += 1) {
    const window = read(day);
    if (!window) continue;
    const overlap = Math.min(to, window.end) - Math.max(from, window.start);
    if (overlap > 0) total += overlap;
  }
  return total;
}
