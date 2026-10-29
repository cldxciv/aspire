/**
 * Call attempts (docs/admin-phase-1b-plan.md §5.C, decision 10, O10; owner: 1B-CALLS). PURE and
 * client-safe, over the lead's call and WhatsApp entries NEWEST FIRST:
 * - `calls` = how many calls were logged;
 * - `unansweredStreak` = the calls at the top of the list with no answer, busy or phone switched off,
 *   counted back to the latest other contact (a call or WhatsApp with any other outcome: spoke to
 *   them, asked us to call back, message sent… ends the streak);
 * - `suggestNotReachable` = streak ≥ 5 ("Mark as not reachable?" is only ever offered; staff confirm).
 */
import type { AttemptSummary } from "../types";
import { NOT_REACHABLE_AFTER } from "../types";
import { isUnansweredOutcome } from "./types";

export interface ContactEntry {
  type: "call" | "whatsapp";
  outcome: string | null;
}

export function attemptSummary(contacts: readonly ContactEntry[]): AttemptSummary {
  let calls = 0;
  for (const entry of contacts) if (entry.type === "call") calls += 1;
  let unansweredStreak = 0;
  for (const entry of contacts) {
    if (entry.type === "call" && isUnansweredOutcome(entry.outcome)) unansweredStreak += 1;
    else break;
  }
  return { calls, unansweredStreak, suggestNotReachable: unansweredStreak >= NOT_REACHABLE_AFTER };
}

/** The streak once a call with `outcome` is logged (an answered call resets it to 0). */
export function streakAfter(summary: Pick<AttemptSummary, "unansweredStreak">, outcome: string | null | undefined): number {
  return isUnansweredOutcome(outcome) ? summary.unansweredStreak + 1 : 0;
}

/**
 * Whether to offer "Mark as not reachable?": `unansweredStreak + (this outcome unanswered ? 1 : 0) ≥ 5`
 * for an unanswered call or "no call needed" (`null`); never right after the family was reached.
 */
export function offerNotReachable(summary: Pick<AttemptSummary, "unansweredStreak">, outcome: string | null | undefined): boolean {
  if (outcome !== null && outcome !== undefined && !isUnansweredOutcome(outcome)) return false;
  return summary.unansweredStreak + (isUnansweredOutcome(outcome) ? 1 : 0) >= NOT_REACHABLE_AFTER;
}
