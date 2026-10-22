import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { pickAssignee } from "../assignment";
import type { ArrivalKind, RoutingMode, RoutingResult } from "../lead-ops-types";
import { insertActivity } from "../repo/activities";
import { areaIdOfCentre, findLeadRouting } from "../repo/areas-core";
import { findAreaRow, listAreaMemberRows, listAreaMemberUserIds, type MemberRow } from "../repo/areas";
import { updateLead as updateLeadRow, type LeadRow } from "../repo/leads";
import { getCursor, setCursor } from "../repo/rules";
import { openClockCountsByAssignee } from "../repo/sla-core";
import { findStaff } from "../repo/staff";
import { isAway, listAway } from "../repo/staff-ops";
import { getRoutingSettings } from "../settings";

/**
 * Who gets a lead (docs/lead-routing-plan.md §13.4 step 2, §14.1; owner LR-ROUTING).
 *
 * Eligible = an enabled `staff` account with an active CRM membership, not away, who is an
 * executive (counsellor) or an area head (manager) with "takes leads". Pools, in order:
 *   A `area`        the area's own eligible members — tied to the effective centre
 *                   (`lead.centreSlug ?? area.default_centre_slug`), else untied, else everyone;
 *   B `area_borrow` when A is empty: the members of the area that owns the serving centre (one hop);
 *   C `rule`/`centre` legacy `pickAssignee` without anyone who has an area membership or is away;
 *   D nobody — the lead waits in its area's queue, Tool sign-ups (gate-only, no area) or Unassigned.
 * Within A and B the person with the fewest open first-call clocks wins (A5); ties go round-robin
 * (`crm_rr_cursors` key `area:<poolAreaId>:<centre|*>`). Legacy routing mode = today's
 * `pickAssignee` (only skipping the excluded and the away).
 */

export type PickedAssignee = { userId: string; via: "rule" | "centre" | "area" | "area_borrow"; areaId?: string };

export function routingMode(db: DatabaseSync): RoutingMode {
  return getRoutingSettings(db).value.mode;
}

/** Whether a member may receive new leads right now (`exclude` aside). */
export function isEligibleMember(member: MemberRow, now: number): boolean {
  if (member.disabled || !member.active) return false;
  if (member.awayUntil !== null && member.awayUntil > now) return false;
  return member.crmRole === "counsellor" || (member.crmRole === "manager" && member.takesLeads);
}

/** The preferred tier of an area's eligible members: tied to `centre`, else untied, else all. */
function preferredTier(members: readonly MemberRow[], centre: string | null): { ids: string[]; centre: string | null } {
  if (centre) {
    const tied = members.filter((member) => member.centreSlug === centre);
    if (tied.length > 0) return { ids: tied.map((member) => member.userId), centre };
  }
  const untied = members.filter((member) => member.centreSlug === null);
  if (untied.length > 0) return { ids: untied.map((member) => member.userId), centre: null };
  return { ids: members.map((member) => member.userId), centre: null };
}

/**
 * Load-aware pick (A5): the fewest open first-call clocks; a tie goes to the next id after the
 * pool's round-robin cursor (sorted, wrapping). Updates the cursor.
 */
export function pickLoadAware(
  db: DatabaseSync,
  ids: readonly string[],
  cursorKey: string,
  now: number,
  load: ReadonlyMap<string, number> = openClockCountsByAssignee(db),
): string | null {
  if (ids.length === 0) return null;
  const counts = ids.map((id) => load.get(id) ?? 0);
  const least = Math.min(...counts);
  const tied = ids.filter((_, index) => counts[index] === least).sort();
  const last = getCursor(db, cursorKey);
  const next = (last === null ? undefined : tied.find((id) => id > last)) ?? tied[0];
  setCursor(db, cursorKey, next, now);
  return next;
}

function eligibleOf(db: DatabaseSync, areaId: string, now: number, exclude: ReadonlySet<string>): MemberRow[] {
  return listAreaMemberRows(db, areaId).filter((member) => !exclude.has(member.userId) && isEligibleMember(member, now));
}

/** The active area that owns `area.default_centre_slug`, when it is a different one (borrow, A1). */
export function servingAreaOf(db: DatabaseSync, areaId: string): { areaId: string; centre: string } | null {
  const area = findAreaRow(db, areaId);
  if (!area?.defaultCentreSlug) return null;
  const owner = areaIdOfCentre(db, area.defaultCentreSlug);
  if (!owner || owner === areaId) return null;
  const ownerArea = findAreaRow(db, owner);
  return ownerArea?.active ? { areaId: owner, centre: area.defaultCentreSlug } : null;
}

/** §13.4 step 2 for one lead. See the module comment. */
export function pickForLead(
  db: DatabaseSync,
  lead: Pick<LeadRow, "id" | "centreSlug" | "programInterest" | "areaId">,
  routing: RoutingResult,
  now: number,
  opts: { exclude?: readonly string[] } = {},
): PickedAssignee | null {
  const exclude = new Set(opts.exclude ?? []);
  const away = listAway(db, now);
  if (routingMode(db) === "legacy") {
    return pickAssignee(db, lead, now, { skip: (id) => exclude.has(id) || away.has(id) });
  }

  const areaId = routing.areaId ?? lead.areaId;
  const area = areaId ? findAreaRow(db, areaId) : null;
  if (area?.active) {
    const load = openClockCountsByAssignee(db);
    // A — the area's own people.
    const own = eligibleOf(db, area.id, now, exclude);
    if (own.length > 0) {
      const tier = preferredTier(own, lead.centreSlug ?? area.defaultCentreSlug);
      const userId = pickLoadAware(db, tier.ids, `area:${area.id}:${tier.centre ?? "*"}`, now, load);
      if (userId) return { userId, via: "area", areaId: area.id };
    }
    // B — borrow the serving centre's team (one hop).
    const serving = servingAreaOf(db, area.id);
    if (serving) {
      const borrowed = eligibleOf(db, serving.areaId, now, exclude);
      if (borrowed.length > 0) {
        const tier = preferredTier(borrowed, serving.centre);
        const userId = pickLoadAware(db, tier.ids, `area:${serving.areaId}:${tier.centre ?? "*"}`, now, load);
        if (userId) return { userId, via: "area_borrow", areaId: serving.areaId };
      }
    }
  } else if (!areaId && findLeadRouting(db, lead.id)?.gateOnly === true) {
    // D — a tool sign-up with no area waits in "Tool sign-ups" (A2), whatever LEAD_GATE_ASSIGN says.
    return null;
  }

  // C — the legacy rules / centre round-robin, without area members and the away.
  const members = listAreaMemberUserIds(db);
  return pickAssignee(db, lead, now, { skip: (id) => exclude.has(id) || away.has(id) || members.has(id) });
}

/**
 * Whether `userId` serves `areaId`, mirroring the pools: a member of it; else — when it has no
 * eligible people of its own — a member of the area whose team covers it (borrow, A1); else — when
 * that team is empty too — anyone in the legacy pool (no area membership at all), so a lead keeps
 * its legacy assignee until the area has people.
 */
export function servesArea(db: DatabaseSync, userId: string, areaId: string, now: number): boolean {
  const own = listAreaMemberRows(db, areaId);
  if (own.some((member) => member.userId === userId)) return true;
  if (own.some((member) => isEligibleMember(member, now))) return false;
  const serving = servingAreaOf(db, areaId);
  if (serving) {
    const team = listAreaMemberRows(db, serving.areaId);
    if (team.some((member) => member.userId === userId)) return true;
    if (team.some((member) => isEligibleMember(member, now))) return false;
  }
  return !listAreaMemberUserIds(db).has(userId);
}

/** §14.1 step 3: whether the current assignee may keep (or get) the lead. */
export function assignable(
  db: DatabaseSync,
  userId: string,
  ctx: { now: number; kind: ArrivalKind; firstEnquiry: boolean; areaId: string | null },
): boolean {
  const staff = findStaff(db, userId);
  if (!staff || !staff.active || staff.disabled || staff.userRole !== "staff") return false;
  const awayMatters = ctx.kind === "new" || ctx.kind === "reopened" || ctx.firstEnquiry;
  if (awayMatters && isAway(db, userId, ctx.now)) return false;
  if (ctx.kind === "reopened" && ctx.areaId && routingMode(db) === "areas" && !servesArea(db, userId, ctx.areaId, ctx.now)) return false;
  return true;
}

/**
 * Sets a lead's assignee and records the `assignment` activity (`from → to`, `via`), like
 * CORE's `autoAssign`. `actorId` null = automatic. No-op when nothing changes.
 */
export function recordAssignment(
  db: DatabaseSync,
  leadId: string,
  from: string | null,
  to: string | null,
  input: { via: string; actorId: string | null; now: number },
): boolean {
  if (from === to) return false;
  updateLeadRow(db, leadId, { assignedTo: to, updatedAt: input.now });
  insertActivity(db, {
    leadId,
    type: "assignment",
    meta: { from, to, auto: input.actorId === null, via: input.via },
    actorId: input.actorId,
    at: input.now,
  });
  return true;
}
