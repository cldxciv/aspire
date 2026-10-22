/**
 * The state of a first-call clock (owner: LR-CORE; docs/lead-routing-plan.md §15). PURE and
 * client-safe: lists, the lead page, the alert strip and the dashboard all use this one rule.
 *
 *   "due"       before `due_at`;
 *   "overdue"   from `due_at` (or from `tier1_at`, when that comes first);
 *   "escalated" from `tier2_at`;
 *   null        once the clock is resolved.
 */
import type { ClockReason, SlaClockView, SlaState } from "./lead-ops-types";

type Instant = number | string | null | undefined;

function ms(value: Instant): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface SlaClockTimes {
  dueAt: Instant;
  tier1At?: Instant;
  tier2At?: Instant;
  resolvedAt?: Instant;
}

export function slaStateOf(clock: SlaClockTimes, now: number): SlaState | null {
  if (ms(clock.resolvedAt) !== null) return null;
  const due = ms(clock.dueAt);
  if (due === null) return null;
  const tier2 = ms(clock.tier2At);
  if (tier2 !== null && now >= tier2) return "escalated";
  const tier1 = ms(clock.tier1At);
  if (now >= due || (tier1 !== null && now >= tier1)) return "overdue";
  return "due";
}

/** Whole minutes from `now` to the due time (negative = late by that much). */
export function minutesToDue(dueAt: Instant, now: number): number | null {
  const due = ms(dueAt);
  return due === null ? null : Math.trunc((due - now) / 60_000);
}

/** An open clock (epoch-ms facts) → the view lists and the lead page show; null if it has no due time. */
export function slaClockView(
  clock: { reason: ClockReason; startedAt: number; dueAt: number; tier1At: number | null; tier2At: number | null },
  now: number,
): SlaClockView | null {
  const state = slaStateOf(clock, now);
  if (!state) return null;
  const iso = (value: number | null) => (value === null ? null : new Date(value).toISOString());
  return {
    state,
    reason: clock.reason,
    startedAt: new Date(clock.startedAt).toISOString(),
    dueAt: new Date(clock.dueAt).toISOString(),
    tier1At: iso(clock.tier1At),
    tier2At: iso(clock.tier2At),
  };
}
