import "server-only";

import { getDb } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, ok } from "../access";
import type { UnmatchedPlace } from "../lead-ops-types";
import { countUnmatchedKeys, listUnmatchedRows } from "../repo/areas";
import type { CrmResult, CrmViewer } from "../types";

/**
 * "Unmatched places" (docs/lead-routing-plan.md §13.6, A8; owner LR-ROUTING): the place names
 * families typed that routed nowhere (`unknown`, `ambiguous`, `outside_hp`) on leads that are not
 * erased, routed in the last 90 days — the top 50 keys with one example, the count and how many
 * are still open. SUPER ADMINS only (the examples are families' own words). "Map to district" is
 * `addAreaAlias(…, { placeKey })` (./areas-service.ts).
 */

export const UNMATCHED_WINDOW_DAYS = 90;
export const UNMATCHED_LIMIT = 50;
const DAY_MS = 86_400_000;

export function listUnmatchedPlaces(viewer: CrmViewer, now: number = Date.now()): CrmResult<UnmatchedPlace[]> {
  if (viewer.role !== "admin" || viewer.superAdmin !== true) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  const rows = listUnmatchedRows(getDb(), now - UNMATCHED_WINDOW_DAYS * DAY_MS, UNMATCHED_LIMIT);
  return ok(rows.map((row) => ({ key: row.key, sample: row.sample, count: row.count, open: row.open, outcomes: row.outcomes })));
}

/** How many distinct unmatched places there are (counts only; for summaries). */
export function unmatchedPlaceCount(now: number = Date.now()): number {
  return countUnmatchedKeys(getDb(), now - UNMATCHED_WINDOW_DAYS * DAY_MS);
}
