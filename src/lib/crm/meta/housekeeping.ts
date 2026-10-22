import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { eraseLead } from "../admin";
import { deleteInboxRowsBefore, listExpiredTestLeadIds } from "../repo/meta";
import type { CrmViewer } from "../types";
import { metaLog } from "./runtime";
import { TEST_MODE_MS } from "./test-mode";

/**
 * Inbox housekeeping (docs/lead-routing-plan.md §18.5), run from inside processing (at most once an
 * hour per process unless forced):
 * - `imported`, `duplicate`, `test` and `ignored` rows are deleted 30 days after processing;
 * - `failed` and `unavailable` rows after 90 days;
 * - TEST leads (Meta test mode, A14) are erased 24 hours after they arrived — reason
 *   `wrong_or_test`, actor null (the system), through CORE's `eraseLead`.
 *
 * TEST leads are erased with `suppress: false`: their phone is the super admin's own test number,
 * which must not land in the erase suppressions (a later CSV row or Meta lead with that number
 * would otherwise be skipped as `erased_family`).
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
let lastRunAt = 0;

/**
 * The system as an erasing "viewer": an admin role with NO user id, so the erase entry, the
 * `erased_by` column and the audit row all carry actor null (CORE's `eraseLead` takes a viewer
 * only; see the package report).
 */
const SYSTEM_ERASER: CrmViewer = { userId: null as unknown as string, displayName: "System", role: "admin", centreSlugs: [] };

export interface HousekeepingReport {
  ran: boolean;
  deleted: number;
  testLeadsErased: number;
}

export function runMetaHousekeeping(db: DatabaseSync, now: number, options: { force?: boolean } = {}): HousekeepingReport {
  if (!options.force && now - lastRunAt < HOUR) return { ran: false, deleted: 0, testLeadsErased: 0 };
  lastRunAt = now;
  let deleted = deleteInboxRowsBefore(db, ["imported", "duplicate", "test", "ignored"], now - 30 * DAY);
  deleted += deleteInboxRowsBefore(db, ["failed", "unavailable"], now - 90 * DAY);
  let testLeadsErased = 0;
  for (const leadId of listExpiredTestLeadIds(db, now - TEST_MODE_MS)) {
    const result = eraseLead(SYSTEM_ERASER, leadId, now, { reason: "wrong_or_test", suppress: false });
    if (result.ok) testLeadsErased += 1;
    else metaLog("housekeeping", "warn", "test_erase_failed");
  }
  if (deleted > 0 || testLeadsErased > 0) metaLog("housekeeping", "success");
  return { ran: true, deleted, testLeadsErased };
}

/** Test helper. */
export function resetMetaHousekeepingForTests(): void {
  lastRunAt = 0;
}
