import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { CRM_AUDIT, crmAudit } from "../access";
import { PLACE_INPUT_MAX, type ArrivalKind, type AreaResolution, type RoutingOutcome, type RoutingResult } from "../lead-ops-types";
import { areaIdOfCentre, findAreasActive, findLeadRouting, upsertLeadRouting } from "../repo/areas-core";
import { deleteMember, findAreaRow, listUserAreaIds, upsertMember, findMember } from "../repo/areas";
import type { LeadRow } from "../repo/leads";
import { findStaff } from "../repo/staff";
import { setScopeMode } from "../repo/staff-ops";
import { getAreasSeed } from "../settings";
import { assignable, pickForLead, routingMode } from "./pool";
import { placeKeyOf, resolveDistrict, type AliasIndex } from "./resolve";
import { ensureAreasSeeded, loadAliasIndex } from "./seed";

/**
 * SEAM `@/lib/crm/routing` (docs/lead-routing-plan.md §14.3; owner LR-ROUTING, replacing LR-CORE's
 * stub). The signatures are frozen; CORE (`arrival.ts`, `leads.ts`, the admin users API) and
 * LR-IMPORT (`previewPlace`) call them inside their own transactions.
 *
 * - `ensureAreasSeeded`: the 12 HP districts, once (./seed.ts);
 * - `routeLead`: the lead's area (centre first, then the place the family gave) → `crm_lead_routing`;
 * - `pickAssigneeForLead`: own area → serving-centre team → legacy rules → nobody (./pool.ts);
 * - `isAssignable`: may the current assignee keep the lead (§14.1 step 3);
 * - `setUserAreas`: a person's area memberships (managers get the explicit `areas` scope, H2);
 * - `previewPlace`: read-only "where would this family land" for the import preview.
 * Area administration (screens, API) lives in ./areas-service.ts.
 */

export { ensureAreasSeeded } from "./seed";
/** For LR-SLA's summary / dashboard: the number of distinct unmatched places (counts only). */
export { unmatchedPlaceCount } from "./unmatched";

const cut = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed.slice(0, PLACE_INPUT_MAX);
};

/**
 * The area a lead lands in: its centre's area, else the resolved place (no writes). `outside`:
 * the place is known to be outside Himachal although no state is passed (re-routing a stored
 * `outside_hp` row; only `border` aliases may then match).
 */
export function computeRouting(
  db: DatabaseSync,
  input: { centreSlug: string | null; districtInput: string | null; stateInput: string | null; outside?: boolean },
  index: AliasIndex = loadAliasIndex(db),
): AreaResolution {
  const centreArea = areaIdOfCentre(db, input.centreSlug);
  if (centreArea && findAreaRow(db, centreArea)?.active) return { areaId: centreArea, outcome: "area", match: "centre", key: placeKeyOf(input.districtInput) };
  return resolveDistrict(input.districtInput, input.stateInput, index, { outside: input.outside === true });
}

/**
 * Routes a lead (§13.4 step 1) and writes its routing row. A new lead always gets a row; an
 * existing lead only changes area when it had none and the new input resolves (a place that still
 * does not resolve replaces the older words, for "Unmatched places"). `gate_only` stays 1 while
 * every arrival so far was a tool sign-up. Automatic routing never sets `routed_by`.
 */
export function routeLead(
  db: DatabaseSync,
  lead: LeadRow,
  input: { districtInput: string | null; stateInput: string | null; gate: boolean; at: number; actorId: string | null },
): RoutingResult {
  ensureAreasSeeded(db, input.at);
  const existing = findLeadRouting(db, lead.id);
  const gateOnly = existing ? existing.gateOnly && input.gate : input.gate;
  const placeInput = cut(input.districtInput);
  const fresh = computeRouting(db, { centreSlug: lead.centreSlug, districtInput: placeInput, stateInput: cut(input.stateInput) });
  const write = (result: AreaResolution) =>
    upsertLeadRouting(db, {
      leadId: lead.id,
      areaId: result.areaId,
      match: result.match,
      outcome: result.outcome,
      placeInput,
      placeKey: result.key,
      gateOnly,
      routedAt: input.at,
      routedBy: null,
    });

  if (!existing || (existing.areaId === null && (fresh.areaId !== null || fresh.outcome !== "empty"))) {
    write(fresh);
    return { areaId: fresh.areaId, outcome: fresh.outcome, match: fresh.match };
  }
  if (existing.gateOnly !== gateOnly) upsertLeadRouting(db, { ...existing, gateOnly });
  return { areaId: existing.areaId, outcome: existing.outcome, match: existing.match };
}

/** Picks the next assignee for a lead (§13.4 step 2: own area → borrow → legacy rules → none). */
export function pickAssigneeForLead(
  db: DatabaseSync,
  lead: LeadRow,
  routing: RoutingResult,
  now: number,
  opts: { exclude?: string[] } = {},
): { userId: string; via: "rule" | "centre" | "area" | "area_borrow"; areaId?: string } | null {
  return pickForLead(db, lead, routing, now, opts);
}

/**
 * Whether `userId` may keep / receive this lead (§14.1 step 3): false when disabled or inactive
 * (any kind); away (new, reopened, first enquiry); in areas mode, outside the lead's new area
 * (reopened only; the serving-centre team counts for an area with nobody of its own).
 */
export function isAssignable(
  db: DatabaseSync,
  userId: string,
  ctx: { now: number; kind: ArrivalKind; firstEnquiry: boolean; areaId: string | null },
): boolean {
  return assignable(db, userId, ctx);
}

/**
 * Replaces a staff member's area memberships (kept rows keep their centre tie and "takes
 * leads"; new rows are untied). Managers get the explicit `areas` scope (H2), even with no areas
 * (they then see only their assigned leads). Unknown ids → `unknown_area`, inactive →
 * `inactive_area` (422, never 500; P2). Audited `crm.area_members` (counts only).
 */
export function setUserAreas(
  db: DatabaseSync,
  userId: string,
  areaIds: string[],
  opts: { actorId: string; now: number },
): { ok: true } | { ok: false; error: "unknown_area" | "inactive_area" | "not_staff" } {
  ensureAreasSeeded(db, opts.now);
  const staff = findStaff(db, userId);
  if (!staff || staff.userRole !== "staff") return { ok: false, error: "not_staff" };
  const wanted = [...new Set(areaIds)];
  const found = findAreasActive(db, wanted);
  for (const id of wanted) {
    if (!found.has(id)) return { ok: false, error: "unknown_area" };
    if (found.get(id) === false) return { ok: false, error: "inactive_area" };
  }
  const current = listUserAreaIds(db, userId);
  let removed = 0;
  for (const areaId of current) {
    if (!wanted.includes(areaId) && deleteMember(db, areaId, userId)) removed += 1;
  }
  let added = 0;
  for (const areaId of wanted) {
    if (findMember(db, areaId, userId)) continue;
    upsertMember(db, { areaId, userId, centreSlug: null, takesLeads: false, actorId: opts.actorId, now: opts.now });
    added += 1;
  }
  if (staff.crmRole === "manager") setScopeMode(db, { userId, mode: "areas", actorId: opts.actorId, now: opts.now });
  crmAudit(db, {
    actorId: opts.actorId,
    action: CRM_AUDIT.areaMembers,
    target: userId,
    details: { via: "person", areas: wanted.length, added, removed, scope: staff.crmRole === "manager" ? "areas" : null },
    now: opts.now,
  });
  return { ok: true };
}

/**
 * READ-ONLY "where would this family land" for the import preview (LR-IMPORT, §17 step 1): the
 * area of `centreSlug`, else the resolved place. null = not available (legacy routing mode, or the
 * areas were never seeded). Never writes.
 */
export function previewPlace(
  db: DatabaseSync,
  input: { districtInput: string | null; stateInput: string | null; centreSlug: string | null },
): { areaId: string | null; outcome: RoutingOutcome } | null {
  if (getAreasSeed(db) === null || routingMode(db) === "legacy") return null;
  const result = computeRouting(db, { centreSlug: input.centreSlug, districtInput: cut(input.districtInput), stateInput: cut(input.stateInput) });
  return { areaId: result.areaId, outcome: result.outcome };
}
