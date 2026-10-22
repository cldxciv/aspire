import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { earliestAssignment, lastAssignmentAtOrBefore } from "../repo/sla";

/**
 * "Who held the lead at due time" (owner: LR-SLA; docs/lead-routing-plan.md §15, A10): a missed
 * first call is charged to that person, not to whoever holds the lead later.
 *
 * = the `to` of the last `assignment` entry at or before `at`; with none, the person who held the
 * lead before its first recorded change (the earliest entry's `from`); with no entries at all,
 * the lead's current assignee. null = nobody held it (the unassigned queue).
 */
export function holderAt(db: DatabaseSync, leadId: string, at: number, currentAssignee: string | null): string | null {
  const last = lastAssignmentAtOrBefore(db, leadId, at);
  if (last.found) return last.to;
  const first = earliestAssignment(db, leadId);
  return first.found ? first.from : currentAssignee;
}
