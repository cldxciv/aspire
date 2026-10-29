/**
 * Follow-up presets (docs/admin-phase-1b-plan.md §5.C, O2, O9; owner: 1B-CALLS). PURE and
 * client-safe: LR's calling-hours arithmetic (src/lib/crm/sla/calling-hours.ts) with a fixed IST
 * offset, every scan capped at LR's 400 days.
 *
 * - `later_today` = now + LR's retry wait (`speedRule.retry.firstAfterMinutes`, default 120) in
 *   WORKING minutes, so 18:30 carries over to the next open morning (one rule, not two; O9).
 * - `tomorrow` = the first open calling day after today, at the family's preferred window;
 *   `in_3_days` = the same for the first open day on or after today + 3.
 * - Decision 9's outer limit: nothing is ever set before 08:00 or after 21:00 IST. Presets are moved
 *   inside it; a picked time outside it is refused (`isInsideHardWindow`).
 */
import type { CallingHours, SpeedRule } from "../../lead-ops-types";
import { addWorkingMinutes, IST_OFFSET_MS, isOpenAt, istDayNumber, MAX_SCAN_DAYS, minutesOfDay, windowOn, type OpenWindow } from "../../sla/calling-hours";
import { HARD_CALL_WINDOW, type FollowUpPreset, type NextFollowUp, type PreferredTime } from "../types";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** "afternoon" starts no earlier than 13:00, "evening" no earlier than 16:30 (IST). */
export const PREFERRED_FROM_MINUTES: Readonly<Record<"afternoon" | "evening", number>> = { afternoon: 13 * 60, evening: 16 * 60 + 30 };
/** No preference ("any" / not recorded): an hour after opening. */
export const ANY_TIME_AFTER_OPENING_MINUTES = 60;
/** A suggested time is never later than this before closing. */
export const CLOSING_MARGIN_MINUTES = 30;
/** Fallback when no open day exists within 400 days (a misconfigured schedule): 10:00 IST. */
const FALLBACK_MINUTES = 10 * 60;

const HARD_START = minutesOfDay(HARD_CALL_WINDOW.start) ?? 8 * 60;
const HARD_END = minutesOfDay(HARD_CALL_WINDOW.end) ?? 21 * 60;

/** Midnight IST (epoch ms) of an IST day number. */
export function dayStartMs(day: number): number {
  return day * DAY_MS - IST_OFFSET_MS;
}

/** Minutes after IST midnight of an instant. */
export function istMinutesOf(at: number): number {
  return Math.floor((at - dayStartMs(istDayNumber(at))) / MINUTE_MS);
}

/** Whether `at` lies inside decision 9's outer limit (08:00–21:00 IST, both ends allowed). */
export function isInsideHardWindow(at: number): boolean {
  const start = dayStartMs(istDayNumber(at));
  return at >= start + HARD_START * MINUTE_MS && at <= start + HARD_END * MINUTE_MS;
}

/** `at` moved inside 08:00–21:00 IST: before 08:00 → 08:00 that day; after 21:00 → 08:00 the next day. */
export function clampToHardWindow(at: number): number {
  const day = istDayNumber(at);
  const start = dayStartMs(day);
  if (at < start + HARD_START * MINUTE_MS) return start + HARD_START * MINUTE_MS;
  if (at > start + HARD_END * MINUTE_MS) return dayStartMs(day + 1) + HARD_START * MINUTE_MS;
  return at;
}

/** The open window of the first open IST day on or after `day`, or null (none within 400 days). */
export function firstOpenWindowFrom(hours: CallingHours, day: number): OpenWindow | null {
  for (let d = day; d <= day + MAX_SCAN_DAYS; d += 1) {
    const window = windowOn(hours, dayStartMs(d));
    if (window) return window;
  }
  return null;
}

/**
 * The follow-up time inside an open window for the family's preferred time: morning = opening;
 * afternoon = max(opening, 13:00); evening = max(opening, 16:30); none / any = opening + 60 min;
 * never later than 30 minutes before closing (and never before opening).
 */
export function preferredTimeIn(window: OpenWindow, preferred: PreferredTime | null): number {
  const midnight = dayStartMs(istDayNumber(window.start));
  let at: number;
  if (preferred === "morning") at = window.start;
  else if (preferred === "afternoon" || preferred === "evening") at = Math.max(window.start, midnight + PREFERRED_FROM_MINUTES[preferred] * MINUTE_MS);
  else at = window.start + ANY_TIME_AFTER_OPENING_MINUTES * MINUTE_MS;
  const latest = window.end - CLOSING_MARGIN_MINUTES * MINUTE_MS;
  return Math.max(window.start, Math.min(at, latest));
}

/** The preferred-window time on the first open day on or after `day` (inside the hard window). */
export function followUpOnDay(hours: CallingHours, day: number, preferred: PreferredTime | null): number {
  const window = firstOpenWindowFrom(hours, day);
  const at = window ? preferredTimeIn(window, preferred) : dayStartMs(day) + FALLBACK_MINUTES * MINUTE_MS;
  return clampToHardWindow(at);
}

/** Every preset resolved at `now` (epoch ms). */
export function resolvePresets(
  hours: CallingHours,
  rule: Pick<SpeedRule, "retry">,
  now: number,
  preferred: PreferredTime | null,
): Record<FollowUpPreset, number> {
  const today = istDayNumber(now);
  return {
    later_today: clampToHardWindow(addWorkingMinutes(hours, now, rule.retry.firstAfterMinutes)),
    tomorrow: followUpOnDay(hours, today + 1, preferred),
    in_3_days: followUpOnDay(hours, today + 3, preferred),
  };
}

/** The due time of a follow-up choice: a preset's time or the picked instant; null for `none` / a bad time. */
export function resolveNext(next: NextFollowUp, presets: Record<FollowUpPreset, number>): number | null {
  if (next.kind === "preset") return presets[next.preset] ?? null;
  if (next.kind === "at") {
    const at = Date.parse(next.at);
    return Number.isFinite(at) ? at : null;
  }
  return null;
}

/** Whether a follow-up time lies outside LR's calling hours (a warning, never a refusal; O2). */
export function outsideCallingHours(hours: CallingHours, at: number): boolean {
  return !isOpenAt(hours, at);
}

/** "09:00–19:00" for an open window (IST). */
function windowLabel(window: OpenWindow): string {
  const hhmm = (ms: number) => {
    const minutes = istMinutesOf(ms);
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  };
  return `${hhmm(window.start)}–${hhmm(window.end)}`;
}

/** "09:00–19:00": the calling window of the IST day of `at`, else of the next open day; "" when none. */
export function callingHoursLabel(hours: CallingHours, at: number): string {
  const window = firstOpenWindowFrom(hours, istDayNumber(at));
  return window ? windowLabel(window) : "";
}

/**
 * "10:00–14:00": the calling window of the IST day of `at` ONLY (a picked follow-up's own day, e.g.
 * a short Sunday); null when that day is closed (a closed weekday or a closed date).
 */
export function callingHoursOn(hours: CallingHours, at: number): string | null {
  const window = windowOn(hours, at);
  return window ? windowLabel(window) : null;
}
