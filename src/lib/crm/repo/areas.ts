import "server-only";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import type { AliasKind, AreaKind, CrmAreaAlias, RoutingOutcome } from "../lead-ops-types";
import type { CrmRole } from "../types";
import { int, text } from "./rows";

/**
 * Area administration SQL (owner: LR-ROUTING; docs/lead-routing-plan.md §12, §13). Areas, their
 * centres, aliases and members, plus the lead queries routing needs (re-route, unmatched places,
 * bulk reassign). CORE's reads (scope, centre → area, routing rows) stay in ./areas-core.ts.
 * Every write runs inside the caller's transaction; nothing here audits.
 */

export interface AreaRow {
  id: string;
  nameEn: string;
  nameHi: string;
  kind: AreaKind;
  defaultCentreSlug: string | null;
  active: boolean;
  mergedInto: string | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

const AREA_COLUMNS = "id, name_en, name_hi, kind, default_centre_slug, active, merged_into, position, created_at, updated_at";

function mapArea(row: Record<string, unknown>): AreaRow {
  return {
    id: String(row.id),
    nameEn: String(row.name_en),
    nameHi: String(row.name_hi),
    kind: row.kind === "custom" ? "custom" : "district",
    defaultCentreSlug: row.default_centre_slug === null || row.default_centre_slug === undefined ? null : String(row.default_centre_slug),
    active: Number(row.active) === 1,
    mergedInto: row.merged_into === null || row.merged_into === undefined ? null : String(row.merged_into),
    position: Number(row.position),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function listAreaRows(db: DatabaseSync): AreaRow[] {
  return db.prepare(`SELECT ${AREA_COLUMNS} FROM crm_areas ORDER BY position, id`).all().map(mapArea);
}

export function findAreaRow(db: DatabaseSync, id: string): AreaRow | null {
  const row = db.prepare(`SELECT ${AREA_COLUMNS} FROM crm_areas WHERE id = ?`).get(id);
  return row ? mapArea(row) : null;
}

export function countAreas(db: DatabaseSync): number {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM crm_areas").get()?.n ?? 0);
}

/** Inserts an area; false when the id is taken (INSERT OR IGNORE). */
export function insertArea(
  db: DatabaseSync,
  input: { id: string; nameEn: string; nameHi: string; kind: AreaKind; defaultCentreSlug: string | null; position: number; actorId: string | null; now: number },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO crm_areas (id, name_en, name_hi, kind, default_centre_slug, active, position, created_at, updated_at, created_by)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    )
    .run(input.id, input.nameEn, input.nameHi, input.kind, input.defaultCentreSlug, input.position, input.now, input.now, input.actorId);
  return Number(result.changes) > 0;
}

export function nextAreaPosition(db: DatabaseSync): number {
  return (int(db.prepare("SELECT MAX(position) AS p FROM crm_areas").get()?.p) ?? -1) + 1;
}

const AREA_PATCH: Readonly<Record<string, string>> = {
  nameEn: "name_en",
  nameHi: "name_hi",
  defaultCentreSlug: "default_centre_slug",
  active: "active",
  mergedInto: "merged_into",
  position: "position",
};

export function updateAreaRow(
  db: DatabaseSync,
  id: string,
  patch: Partial<Pick<AreaRow, "nameEn" | "nameHi" | "defaultCentreSlug" | "active" | "mergedInto" | "position">>,
  now: number,
): void {
  const sets: string[] = ["updated_at = ?"];
  const values: SQLInputValue[] = [now];
  for (const [key, value] of Object.entries(patch)) {
    const column = AREA_PATCH[key];
    if (!column || value === undefined) continue;
    sets.push(`${column} = ?`);
    values.push(typeof value === "boolean" ? (value ? 1 : 0) : (value as SQLInputValue));
  }
  db.prepare(`UPDATE crm_areas SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
}

// ---------------------------------------------------------------------------------------------
// Centres

/** `centre_slug → area_id` for every centre that belongs to an area. */
export function listCentreAreas(db: DatabaseSync): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of db.prepare("SELECT centre_slug, area_id FROM crm_area_centres ORDER BY centre_slug").all()) {
    map.set(String(row.centre_slug), String(row.area_id));
  }
  return map;
}

/** Adds a centre to an area (moving it from another area: a centre belongs to at most one). */
export function putCentre(db: DatabaseSync, centreSlug: string, areaId: string, now: number): void {
  db.prepare(
    `INSERT INTO crm_area_centres (centre_slug, area_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT (centre_slug) DO UPDATE SET area_id = excluded.area_id`,
  ).run(centreSlug, areaId, now);
}

/** Sets exactly these centres on an area: others leave it, these move to it. */
export function setAreaCentres(db: DatabaseSync, areaId: string, centreSlugs: readonly string[], now: number): void {
  const keep = new Set(centreSlugs);
  for (const row of db.prepare("SELECT centre_slug FROM crm_area_centres WHERE area_id = ?").all(areaId)) {
    const slug = String(row.centre_slug);
    if (!keep.has(slug)) db.prepare("DELETE FROM crm_area_centres WHERE centre_slug = ?").run(slug);
  }
  for (const slug of keep) putCentre(db, slug, areaId, now);
}

export function moveCentres(db: DatabaseSync, from: string, to: string): number {
  return Number(db.prepare("UPDATE crm_area_centres SET area_id = ? WHERE area_id = ?").run(to, from).changes);
}

// ---------------------------------------------------------------------------------------------
// Aliases

export interface AliasRow extends CrmAreaAlias {
  areaId: string;
}

export function listAliasRows(db: DatabaseSync): AliasRow[] {
  return db
    .prepare("SELECT alias_key, area_id, label, kind FROM crm_area_aliases ORDER BY area_id, kind, label")
    .all()
    .map((row) => ({ key: String(row.alias_key), areaId: String(row.area_id), label: String(row.label), kind: String(row.kind) as AliasKind }));
}

/** Aliases of ACTIVE areas only (the routing index). */
export function listActiveAliasRows(db: DatabaseSync): AliasRow[] {
  return db
    .prepare(
      `SELECT al.alias_key, al.area_id, al.label, al.kind FROM crm_area_aliases al
         JOIN crm_areas a ON a.id = al.area_id AND a.active = 1
        ORDER BY al.alias_key`,
    )
    .all()
    .map((row) => ({ key: String(row.alias_key), areaId: String(row.area_id), label: String(row.label), kind: String(row.kind) as AliasKind }));
}

export function findAlias(db: DatabaseSync, key: string): AliasRow | null {
  const row = db.prepare("SELECT alias_key, area_id, label, kind FROM crm_area_aliases WHERE alias_key = ?").get(key);
  return row ? { key: String(row.alias_key), areaId: String(row.area_id), label: String(row.label), kind: String(row.kind) as AliasKind } : null;
}

/** Inserts an alias; false when the key already exists (for any area). */
export function insertAlias(
  db: DatabaseSync,
  input: { key: string; areaId: string; label: string; kind: AliasKind; actorId: string | null; now: number },
): boolean {
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO crm_area_aliases (alias_key, area_id, label, kind, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.key, input.areaId, input.label.slice(0, 60), input.kind, input.now, input.actorId);
  return Number(result.changes) > 0;
}

export function deleteAlias(db: DatabaseSync, areaId: string, key: string): boolean {
  return Number(db.prepare("DELETE FROM crm_area_aliases WHERE area_id = ? AND alias_key = ?").run(areaId, key).changes) > 0;
}

export function moveAliases(db: DatabaseSync, from: string, to: string): number {
  return Number(db.prepare("UPDATE crm_area_aliases SET area_id = ? WHERE area_id = ?").run(to, from).changes);
}

// ---------------------------------------------------------------------------------------------
// Members

export interface MemberRow {
  areaId: string;
  userId: string;
  centreSlug: string | null;
  takesLeads: boolean;
  displayName: string;
  crmRole: CrmRole;
  /** Active CRM membership (`crm_staff.active`). */
  active: boolean;
  /** The account is disabled, or no longer a staff account. */
  disabled: boolean;
  awayUntil: number | null;
}

const MEMBER_SELECT = `
  SELECT m.area_id, m.user_id, m.centre_slug, m.takes_leads, u.display_name, u.disabled, u.role AS user_role,
         s.crm_role, s.active, av.away_until
    FROM crm_area_members m
    JOIN users u ON u.id = m.user_id
    JOIN crm_staff s ON s.user_id = m.user_id
    LEFT JOIN crm_staff_availability av ON av.user_id = m.user_id`;

function mapMember(row: Record<string, unknown>): MemberRow {
  return {
    areaId: String(row.area_id),
    userId: String(row.user_id),
    centreSlug: row.centre_slug === null || row.centre_slug === undefined ? null : String(row.centre_slug),
    takesLeads: Number(row.takes_leads) === 1,
    displayName: String(row.display_name),
    crmRole: String(row.crm_role) as CrmRole,
    active: Number(row.active) === 1,
    disabled: Number(row.disabled) === 1 || String(row.user_role) !== "staff",
    awayUntil: row.away_until === null || row.away_until === undefined ? null : Number(row.away_until),
  };
}

export function listMemberRows(db: DatabaseSync): MemberRow[] {
  return db.prepare(`${MEMBER_SELECT} ORDER BY m.area_id, u.display_name COLLATE NOCASE, m.user_id`).all().map(mapMember);
}

export function listAreaMemberRows(db: DatabaseSync, areaId: string): MemberRow[] {
  return db.prepare(`${MEMBER_SELECT} WHERE m.area_id = ? ORDER BY m.user_id`).all(areaId).map(mapMember);
}

export function findMember(db: DatabaseSync, areaId: string, userId: string): { centreSlug: string | null; takesLeads: boolean } | null {
  const row = db.prepare("SELECT centre_slug, takes_leads FROM crm_area_members WHERE area_id = ? AND user_id = ?").get(areaId, userId);
  return row ? { centreSlug: text(row.centre_slug), takesLeads: Number(row.takes_leads) === 1 } : null;
}

export function upsertMember(
  db: DatabaseSync,
  input: { areaId: string; userId: string; centreSlug: string | null; takesLeads: boolean; actorId: string | null; now: number },
): void {
  db.prepare(
    `INSERT INTO crm_area_members (area_id, user_id, centre_slug, takes_leads, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (area_id, user_id) DO UPDATE SET centre_slug = excluded.centre_slug, takes_leads = excluded.takes_leads`,
  ).run(input.areaId, input.userId, input.centreSlug, input.takesLeads ? 1 : 0, input.now, input.actorId);
}

export function deleteMember(db: DatabaseSync, areaId: string, userId: string): boolean {
  return Number(db.prepare("DELETE FROM crm_area_members WHERE area_id = ? AND user_id = ?").run(areaId, userId).changes) > 0;
}

/** Every area id (active or not) a user is a member of. */
export function listUserAreaIds(db: DatabaseSync, userId: string): string[] {
  return db
    .prepare("SELECT area_id FROM crm_area_members WHERE user_id = ? ORDER BY area_id")
    .all(userId)
    .map((row) => String(row.area_id));
}

/** Users with a membership in any ACTIVE area (they leave the legacy pool, §13.4 step C). */
export function listAreaMemberUserIds(db: DatabaseSync): Set<string> {
  return new Set(
    db
      .prepare("SELECT DISTINCT m.user_id FROM crm_area_members m JOIN crm_areas a ON a.id = m.area_id AND a.active = 1")
      .all()
      .map((row) => String(row.user_id)),
  );
}

// ---------------------------------------------------------------------------------------------
// Leads (routing queries; no personal fields)

const OPEN_LEAD = "l.erased_at IS NULL AND l.stage NOT IN ('enrolled', 'lost')";

/**
 * Open leads the "re-route" button can change, oldest first:
 * - no area, routed automatically (not a deliberate "No area"), with a place key or a centre to
 *   route by; or
 * - nobody assigned — except, in areas mode, a tool sign-up with no area (it waits in Tool
 *   sign-ups and is never auto-assigned, A2).
 * Leads that can never change (no place, no centre, already assigned) are left out, so they never
 * fill the window and hide newer leads that can.
 */
export function listRerouteCandidates(db: DatabaseSync, limit: number, areasMode: boolean): string[] {
  return db
    .prepare(
      `SELECT l.id FROM crm_leads l LEFT JOIN crm_lead_routing r ON r.lead_id = l.id
        WHERE ${OPEN_LEAD}
          AND (
            (r.area_id IS NULL AND r.routed_by IS NULL AND (r.place_key IS NOT NULL OR l.centre_slug IS NOT NULL))
            OR (l.assigned_to IS NULL AND NOT (? = 1 AND r.area_id IS NULL AND COALESCE(r.gate_only, 0) = 1))
          )
        ORDER BY l.created_at, l.id LIMIT ?`,
    )
    .all(areasMode ? 1 : 0, limit)
    .map((row) => String(row.id));
}

/** Open leads with no area whose stored place key is `placeKey`. */
export function listOpenLeadsByPlaceKey(db: DatabaseSync, placeKey: string, limit: number): string[] {
  return db
    .prepare(
      `SELECT l.id FROM crm_leads l JOIN crm_lead_routing r ON r.lead_id = l.id
        WHERE ${OPEN_LEAD} AND r.area_id IS NULL AND r.place_key = ?
        ORDER BY l.created_at, l.id LIMIT ?`,
    )
    .all(placeKey, limit)
    .map((row) => String(row.id));
}

export interface UnmatchedRow {
  key: string;
  sample: string;
  count: number;
  open: number;
  outcomes: RoutingOutcome[];
}

/** Routing rows that routed nowhere; a deliberate "No area" (`routed_by` set) is not one. */
const UNMATCHED_WHERE = `r.outcome IN ('unknown', 'ambiguous', 'outside_hp') AND r.area_id IS NULL AND r.routed_by IS NULL
          AND r.place_key IS NOT NULL AND r.place_key <> '' AND l.erased_at IS NULL AND r.routed_at >= ?`;

/**
 * The unmatched places (A8): routing rows with outcome unknown / ambiguous / outside_hp on
 * non-erased leads routed since `since`, grouped by place key, most frequent first.
 */
export function listUnmatchedRows(db: DatabaseSync, since: number, limit: number): UnmatchedRow[] {
  return db
    .prepare(
      `SELECT r.place_key AS place_key, MIN(r.place_input) AS sample, COUNT(*) AS n,
              SUM(CASE WHEN l.stage NOT IN ('enrolled', 'lost') THEN 1 ELSE 0 END) AS open_n,
              GROUP_CONCAT(DISTINCT r.outcome) AS outcomes
         FROM crm_lead_routing r JOIN crm_leads l ON l.id = r.lead_id
        WHERE ${UNMATCHED_WHERE}
        GROUP BY r.place_key
        ORDER BY n DESC, r.place_key
        LIMIT ?`,
    )
    .all(since, limit)
    .map((row) => ({
      key: String(row.place_key),
      sample: text(row.sample) ?? "",
      count: Number(row.n),
      open: Number(row.open_n ?? 0),
      outcomes: String(row.outcomes ?? "")
        .split(",")
        .filter((value): value is RoutingOutcome => value === "unknown" || value === "ambiguous" || value === "outside_hp")
        .sort(),
    }));
}

/** Number of distinct unmatched place keys (dashboard / summary counts). */
export function countUnmatchedKeys(db: DatabaseSync, since: number): number {
  return Number(
    db
      .prepare(
        `SELECT COUNT(DISTINCT r.place_key) AS n FROM crm_lead_routing r JOIN crm_leads l ON l.id = r.lead_id
          WHERE ${UNMATCHED_WHERE}`,
      )
      .get(since)?.n ?? 0,
  );
}

/** Moves every lead routed to `from` onto `to` (merge). */
export function moveRoutingRows(db: DatabaseSync, from: string, to: string): number {
  return Number(db.prepare("UPDATE crm_lead_routing SET area_id = ? WHERE area_id = ?").run(to, from).changes);
}

/**
 * Leads assigned to `userId` for "reassign uncalled leads of X" (A5): open, not erased; `uncalled`
 * = with an open first-call clock. Oldest first.
 */
export function listAssignedLeadIds(db: DatabaseSync, userId: string, scope: "uncalled" | "open", limit: number): string[] {
  const clock = scope === "uncalled" ? "AND EXISTS (SELECT 1 FROM crm_sla_clocks c WHERE c.lead_id = l.id AND c.resolved_at IS NULL)" : "";
  return db
    .prepare(`SELECT l.id FROM crm_leads l WHERE l.assigned_to = ? AND ${OPEN_LEAD} ${clock} ORDER BY l.created_at, l.id LIMIT ?`)
    .all(userId, limit)
    .map((row) => String(row.id));
}
