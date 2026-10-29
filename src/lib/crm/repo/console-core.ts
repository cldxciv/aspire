import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { text } from "./rows";

/**
 * Admin console Phase 1b: the small reads and writes CORE needs (docs/admin-phase-1b-plan.md
 * §4.2; owner: 1B-CORE). Feature packages keep their own SQL in repo/console-<pkg>.ts.
 */

/** Keeps a lead's non-personal referrer host after erase (plan §3.3, E20). Idempotent. */
export function upsertAttribution(db: DatabaseSync, leadId: string, referrerHost: string, now: number): void {
  db.prepare(
    `INSERT INTO crm_lead_attribution (lead_id, referrer_host, kept_at) VALUES (?, ?, ?)
     ON CONFLICT (lead_id) DO UPDATE SET referrer_host = excluded.referrer_host, kept_at = excluded.kept_at`,
  ).run(leadId, referrerHost.slice(0, 100), now);
}

/**
 * Erase (D-042): wipes the personal "more details" (second phone, school, referred by) and keeps
 * the rest (board, hostel, exam, year, how they heard, intake session, preferred time, who decides)
 * for counts. No row → nothing to do.
 */
export function wipeDetailsPersonal(db: DatabaseSync, leadId: string): void {
  db.prepare("UPDATE crm_lead_details SET alt_phone_e164 = NULL, school = NULL, referred_by = NULL WHERE lead_id = ?").run(leadId);
}

/** Distinct centre slugs on leads (erased stubs included: they keep their centre). */
export function centreSlugsInLeads(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT DISTINCT centre_slug FROM crm_leads WHERE centre_slug IS NOT NULL ORDER BY centre_slug")
    .all()
    .map((row) => String(row.centre_slug));
}

/** Distinct default (serving) centres of areas; of `areaIds` only when given. */
export function areaDefaultCentres(db: DatabaseSync, areaIds?: readonly string[]): string[] {
  if (areaIds && areaIds.length === 0) return [];
  const filter = areaIds ? ` AND id IN (${areaIds.map(() => "?").join(", ")})` : "";
  return db
    .prepare(`SELECT DISTINCT default_centre_slug FROM crm_areas WHERE default_centre_slug IS NOT NULL${filter} ORDER BY default_centre_slug`)
    .all(...(areaIds ?? []))
    .map((row) => String(row.default_centre_slug));
}

/** Distinct centre slugs attached to any area (`crm_area_centres`). */
export function areaCentreSlugs(db: DatabaseSync): string[] {
  return db
    .prepare("SELECT DISTINCT centre_slug FROM crm_area_centres ORDER BY centre_slug")
    .all()
    .map((row) => String(row.centre_slug));
}

/** The kept referrer host of an erased lead, or null. */
export function findAttributionHost(db: DatabaseSync, leadId: string): string | null {
  return text(db.prepare("SELECT referrer_host FROM crm_lead_attribution WHERE lead_id = ?").get(leadId)?.referrer_host);
}
