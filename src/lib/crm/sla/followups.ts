import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { CallingHours, SpeedRule } from "../lead-ops-types";
import type { ClockRow } from "../repo/sla-core";
import { bumpClockRetries } from "../repo/sla";
import { createFollowUpTask } from "../tasks";
import type { ContactOutcome } from "../types";
import { addWorkingMinutes, nextWindowStart } from "./calling-hours";

/**
 * "Call again" retry tasks (owner: LR-SLA; docs/lead-routing-plan.md §15, A6). When a person logs
 * an unanswered call before the family is reached, the system adds a follow-up for the lead's
 * assignee: the first one `retry.firstAfterMinutes` working minutes later (default 2 working
 * hours), later ones at the next opening + 1 hour; at most `retry.maxAttempts`; never when the
 * lead already has an open task. Nothing is sent to the family (D-041).
 */

/** Fixed, bilingual task title (tasks are stored text, read in both languages; never family data). */
export const RETRY_TASK_TITLE = "Call again · दोबारा कॉल करें";
/** Outcomes that mean "nobody picked up". */
export const RETRY_OUTCOMES: readonly ContactOutcome[] = ["no_answer", "busy", "switched_off"];
/** Later retries: this many working minutes after the next opening. */
export const LATER_RETRY_MINUTES = 60;

/** When the next retry is due (`retriesCreated` = retries already made for this clock). */
export function retryDueAt(hours: CallingHours, rule: SpeedRule, retriesCreated: number, now: number): number {
  if (retriesCreated === 0) return addWorkingMinutes(hours, now, rule.retry.firstAfterMinutes);
  const opening = nextWindowStart(hours, now) ?? now;
  return addWorkingMinutes(hours, opening, LATER_RETRY_MINUTES);
}

/** Whether this contact should get a retry task (pure part of the rule). */
export function wantsRetry(rule: SpeedRule, clock: Pick<ClockRow, "reachedAt" | "retriesCreated">, outcome: ContactOutcome | null): boolean {
  return (
    rule.retry.enabled &&
    outcome !== null &&
    RETRY_OUTCOMES.includes(outcome) &&
    clock.reachedAt === null &&
    clock.retriesCreated < rule.retry.maxAttempts
  );
}

/**
 * Creates the retry task when the rule asks for one (inside the caller's transaction). Returns
 * true when a task was added (and the clock's `retries_created` went up).
 */
export function maybeCreateRetry(
  db: DatabaseSync,
  input: { clock: ClockRow; leadId: string; assigneeId: string | null; outcome: ContactOutcome | null; hours: CallingHours; rule: SpeedRule; at: number },
): boolean {
  if (!wantsRetry(input.rule, input.clock, input.outcome)) return false;
  const task = createFollowUpTask(db, {
    leadId: input.leadId,
    title: RETRY_TASK_TITLE,
    dueAt: retryDueAt(input.hours, input.rule, input.clock.retriesCreated, input.at),
    assigneeId: input.assigneeId,
    now: input.at,
    onlyIfNoOpenTask: true,
  });
  if (!task) return false;
  bumpClockRetries(db, input.clock.id);
  return true;
}
