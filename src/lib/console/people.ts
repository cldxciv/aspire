import "server-only";

import type { PublicUser } from "@/lib/auth/accounts";
import { staffMemberships } from "@/lib/crm/admin";
import { listAreaNames } from "@/lib/crm/repo/areas-core";
import { listMemberRows } from "@/lib/crm/repo/areas";
import { openLeadCounts } from "@/lib/crm/repo/leads";
import { listAway } from "@/lib/crm/repo/staff-ops";
import { getDb } from "@/lib/db/connection";

import type { PeopleAreaName, PeopleCrm } from "./people-types";

/**
 * The People list's staff facts (docs/admin-phase-1b-plan.md §5.L; owner: 1B-HOUSEKEEPING), read
 * with lead routing's own queries (no new SQL): CRM role, access and older centre scope
 * (`crm_staff`), area memberships and their names (`crm_area_members`, `crm_areas`), "Away until"
 * (`crm_staff_availability`, only while it is in the future) and open enquiries assigned to the
 * person (the same count as the CRM staff page). Read-only.
 */

/** An account as the admin users API and /admin/users return it. */
export type PeopleUser = Omit<PublicUser, "crm"> & { crm?: PeopleCrm | null };

/** `userId → PeopleCrm` for every staff account with a CRM membership. */
export function peopleCrmByUser(now: number = Date.now()): Map<string, PeopleCrm> {
  const db = getDb();
  const memberships = staffMemberships();
  const result = new Map<string, PeopleCrm>();
  if (memberships.size === 0) return result;

  const names = listAreaNames(db);
  const order = new Map(names.map((area, index) => [area.id, index]));
  const byId = new Map<string, PeopleAreaName>(names.map((area) => [area.id, { id: area.id, en: area.en, hi: area.hi, active: area.active }]));
  const areasOf = new Map<string, string[]>();
  for (const member of listMemberRows(db)) {
    const list = areasOf.get(member.userId) ?? [];
    if (!list.includes(member.areaId)) list.push(member.areaId);
    areasOf.set(member.userId, list);
  }
  const away = listAway(db, now);
  const open = openLeadCounts(db);

  for (const [userId, membership] of memberships) {
    const areaIds = (areasOf.get(userId) ?? [])
      .filter((id) => byId.has(id))
      .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    const awayUntil = away.get(userId);
    result.set(userId, {
      crmRole: membership.crmRole,
      centreSlugs: [...membership.centreSlugs],
      active: membership.active,
      areaIds,
      areaNames: areaIds.map((id) => byId.get(id)).filter((area): area is PeopleAreaName => area !== undefined),
      awayUntil: awayUntil === undefined ? null : new Date(awayUntil).toISOString(),
      openLeads: open.get(userId) ?? 0,
    });
  }
  return result;
}

/** A copy of the account without any `crm` field. */
function plain(user: PublicUser): PeopleUser {
  const copy: PeopleUser = { ...user, crm: undefined };
  delete copy.crm;
  return copy;
}

/** Adds the CRM facts to staff accounts (`crm: null` when a staff login has no membership yet). */
export function withPeopleCrm(users: readonly PublicUser[], now: number = Date.now()): PeopleUser[] {
  if (!users.some((user) => user.role === "staff")) return users.map(plain);
  const crm = peopleCrmByUser(now);
  return users.map((user) => (user.role === "staff" ? { ...plain(user), crm: crm.get(user.id) ?? null } : plain(user)));
}
