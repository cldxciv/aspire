/**
 * Admission sessions and IST day / week starts (docs/admin-phase-1b-plan.md §4.2, §6; owner:
 * 1B-CORE). PURE and client-safe. India has no daylight saving, so a fixed UTC+05:30 offset is exact.
 *
 * Session `S{y}` = [y-04-01 00:00 IST, (y+1)-04-01 00:00 IST), labelled "y–(y+1 mod 100)".
 * Weeks start on Monday 00:00 IST.
 */
import type { SessionKey, SessionRef } from "./types";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;
/** Sessions the console accepts (a sanity range for untrusted keys). */
const MIN_SESSION_YEAR = 2000;
const MAX_SESSION_YEAR = 2099;
const SESSION_KEY = /^S(\d{4})$/;

/** The IST calendar date parts of an instant. */
function istParts(ms: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(ms + IST_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** Whether `value` is a session key the console accepts ("S2026"). */
export function isSessionKey(value: unknown): value is SessionKey {
  if (typeof value !== "string") return false;
  const match = SESSION_KEY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  return year >= MIN_SESSION_YEAR && year <= MAX_SESSION_YEAR;
}

/** The session's first year ("S2026" → 2026). */
export function sessionYear(key: SessionKey): number {
  return Number(key.slice(1));
}

/** The session an instant falls in (April–March, IST). */
export function sessionOf(ms: number): SessionKey {
  const { year, month } = istParts(ms);
  return `S${month >= 3 ? year : year - 1}`;
}

/** Start (epoch ms) of 1 April 00:00 IST of `year`. */
function aprilFirst(year: number): number {
  return Date.UTC(year, 3, 1) - IST_OFFSET_MS;
}

/** A session's bounds and label ("2026–27"). */
export function sessionRef(key: SessionKey): SessionRef {
  const year = sessionYear(key);
  return { key, label: `${year}–${String((year + 1) % 100).padStart(2, "0")}`, fromMs: aprilFirst(year), toMs: aprilFirst(year + 1) };
}

/** The session containing `now`. */
export function currentSession(now: number): SessionRef {
  return sessionRef(sessionOf(now));
}

/** The session `offset` sessions after `key` (negative = earlier). */
export function shiftSession(key: SessionKey, offset: number): SessionKey {
  return `S${sessionYear(key) + offset}`;
}

/** Start (epoch ms) of the IST calendar day containing `now`. */
export function istDayStart(now: number): number {
  return Math.floor((now + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Start (epoch ms) of the IST week containing `now`: Monday 00:00 IST. */
export function istWeekStart(now: number): number {
  const dayStart = istDayStart(now);
  const { weekday } = istParts(now);
  // getUTCDay: 0 = Sunday … 6 = Saturday; days since Monday.
  const sinceMonday = (weekday + 6) % 7;
  return dayStart - sinceMonday * DAY_MS;
}

/** Sessions offered by the session pickers: the previous two, the current one and the next, oldest first. */
export function sessionsForPicker(now: number): SessionRef[] {
  const current = sessionOf(now);
  return [-2, -1, 0, 1].map((offset) => sessionRef(shiftSession(current, offset)));
}
