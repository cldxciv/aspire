import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { upsertAttribution, wipeDetailsPersonal } from "../repo/console-core";

/**
 * The console part of an erase (D-042; docs/admin-phase-1b-plan.md §3). `eraseLead`
 * (src/lib/crm/admin.ts) calls it inside its transaction BEFORE the lead's referrer is wiped:
 * 1. keeps the non-personal referrer host in `crm_lead_attribution` (sources still count it);
 * 2. wipes the personal "more details" (second phone, school, referred by) and keeps the rest;
 * 3. keeps the ids-only tables (duplicate dismissals, lost reviews) untouched.
 * A future retention job that anonymises instead of deleting rows must call this too.
 */
export function eraseConsoleData(db: DatabaseSync, lead: { id: string; referrer: string | null }, now: number): void {
  if (lead.referrer) upsertAttribution(db, lead.id, lead.referrer, now);
  wipeDetailsPersonal(db, lead.id);
}
