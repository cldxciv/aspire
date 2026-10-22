import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { AreaName, RoutingMatch, RoutingOutcome } from "../lead-ops-types";
import { int, text } from "./rows";

/**
 * The area reads and routing-row writes CORE needs (owner: LR-CORE; docs/lead-routing-plan.md
 * §12, §13.5): manager scope, centre ↔ area, a lead's routing row, and the erase wipe. Area
 * administration (create, aliases, members, merge, seed) is ROUTING's (src/lib/crm/repo/areas.ts).
 */

/** An active head of an area: a member whose CRM role is manager, active, on an enabled staff account. */
const ACTIVE_HEAD = `
  SELECT 1 FROM crm_area_members hm
    JOIN crm_staff hs ON hs.user_id = hm.user_id AND hs.crm_role = 'manager' AND hs.active = 1
    JOIN users hu ON hu.id = hm.user_id AND hu.disabled = 0 AND hu.role = 'staff'
   WHERE hm.area_id = a.id`;

/** Active areas `userId` is a member of (any role), by position. */
export function listMemberAreaIds(db: DatabaseSync, userId: string): string[] {
  return db
    .prepare(
      `SELECT m.area_id FROM crm_area_members m JOIN crm_areas a ON a.id = m.area_id
        WHERE m.user_id = ? AND a.active = 1 ORDER BY a.position, a.id`,
    )
    .all(userId)
    .map((row) => String(row.area_id));
}

/**
 * The areas a manager answers for (§13.5, A1): the active areas they are a member of, plus any
 * active area with NO active head of its own whose serving centre (`default_centre_slug`) belongs
 * to one of those areas (one hop). A manager with zero areas gets [] (assigned leads only).
 */
export function responsibleAreaIds(db: DatabaseSync, userId: string): string[] {
  const own = listMemberAreaIds(db, userId);
  if (own.length === 0) return [];
  const marks = own.map(() => "?").join(", ");
  const served = db
    .prepare(
      `SELECT a.id FROM crm_areas a
        WHERE a.active = 1
          AND a.default_centre_slug IN (SELECT centre_slug FROM crm_area_centres WHERE area_id IN (${marks}))
          AND NOT EXISTS (${ACTIVE_HEAD})
        ORDER BY a.position, a.id`,
    )
    .all(...own)
    .map((row) => String(row.id));
  return [...new Set([...own, ...served])];
}

/** The area a centre belongs to (`crm_area_centres`), or null. */
export function areaIdOfCentre(db: DatabaseSync, centreSlug: string | null): string | null {
  if (!centreSlug) return null;
  return text(db.prepare("SELECT area_id FROM crm_area_centres WHERE centre_slug = ?").get(centreSlug)?.area_id);
}

/** Centre slugs that belong to any of `areaIds`. */
export function centresOfAreas(db: DatabaseSync, areaIds: readonly string[]): string[] {
  if (areaIds.length === 0) return [];
  return db
    .prepare(`SELECT centre_slug FROM crm_area_centres WHERE area_id IN (${areaIds.map(() => "?").join(", ")}) ORDER BY centre_slug`)
    .all(...areaIds)
    .map((row) => String(row.centre_slug));
}

/** Whether `userId` is a member of area `areaId`. */
export function isAreaMember(db: DatabaseSync, areaId: string, userId: string): boolean {
  return db.prepare("SELECT 1 AS ok FROM crm_area_members WHERE area_id = ? AND user_id = ?").get(areaId, userId) !== undefined;
}

/** Which of `areaIds` exist, and whether each is active (unknown ids are left out). */
export function findAreasActive(db: DatabaseSync, areaIds: readonly string[]): Map<string, boolean> {
  const found = new Map<string, boolean>();
  if (areaIds.length === 0) return found;
  for (const row of db
    .prepare(`SELECT id, active FROM crm_areas WHERE id IN (${areaIds.map(() => "?").join(", ")})`)
    .all(...areaIds)) {
    found.set(String(row.id), Number(row.active) === 1);
  }
  return found;
}

/** Every area's names (active and not), by position — for labels and filter options. */
export function listAreaNames(db: DatabaseSync): AreaName[] {
  return db
    .prepare("SELECT id, name_en, name_hi, active FROM crm_areas ORDER BY position, id")
    .all()
    .map((row) => ({ id: String(row.id), en: String(row.name_en), hi: String(row.name_hi), active: Number(row.active) === 1 }));
}

// ---------------------------------------------------------------------------------------------
// crm_lead_routing

export interface LeadRoutingRow {
  leadId: string;
  areaId: string | null;
  match: RoutingMatch | null;
  outcome: RoutingOutcome;
  placeInput: string | null;
  placeKey: string | null;
  gateOnly: boolean;
  routedAt: number;
  routedBy: string | null;
}

export function findLeadRouting(db: DatabaseSync, leadId: string): LeadRoutingRow | null {
  const row = db
    .prepare("SELECT area_id, match, outcome, place_input, place_key, gate_only, routed_at, routed_by FROM crm_lead_routing WHERE lead_id = ?")
    .get(leadId);
  if (!row) return null;
  return {
    leadId,
    areaId: text(row.area_id),
    match: text(row.match) as RoutingMatch | null,
    outcome: String(row.outcome) as RoutingOutcome,
    placeInput: text(row.place_input),
    placeKey: text(row.place_key),
    gateOnly: Number(row.gate_only) === 1,
    routedAt: Number(row.routed_at),
    routedBy: text(row.routed_by),
  };
}

/** Inserts or replaces a lead's routing row (place text cut to 60 characters). */
export function upsertLeadRouting(db: DatabaseSync, row: LeadRoutingRow): void {
  const cut = (value: string | null) => (value === null ? null : value.slice(0, 60));
  const values: SQLInputValue[] = [
    row.leadId,
    row.areaId,
    row.match,
    row.outcome,
    cut(row.placeInput),
    cut(row.placeKey),
    row.gateOnly ? 1 : 0,
    row.routedAt,
    row.routedBy,
  ];
  db.prepare(
    `INSERT INTO crm_lead_routing (lead_id, area_id, match, outcome, place_input, place_key, gate_only, routed_at, routed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (lead_id) DO UPDATE SET
       area_id = excluded.area_id, match = excluded.match, outcome = excluded.outcome, place_input = excluded.place_input,
       place_key = excluded.place_key, gate_only = excluded.gate_only, routed_at = excluded.routed_at, routed_by = excluded.routed_by`,
  ).run(...values);
}

/** Erase (D-042): drops the family's own words from the routing row; the area stays. */
export function wipeRoutingInput(db: DatabaseSync, leadId: string): void {
  db.prepare("UPDATE crm_lead_routing SET place_input = NULL, place_key = NULL WHERE lead_id = ?").run(leadId);
}

/** Leads per area id (diagnostics / dashboards); key null = no area. */
export function countLeadsByArea(db: DatabaseSync): Map<string | null, number> {
  const counts = new Map<string | null, number>();
  for (const row of db.prepare("SELECT area_id, COUNT(*) AS n FROM crm_lead_routing GROUP BY area_id").all()) {
    counts.set(text(row.area_id), int(row.n) ?? 0);
  }
  return counts;
}
