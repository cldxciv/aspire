import "server-only";

import { getDb } from "@/lib/db/connection";

import { leadScopeFor } from "../../access";
import { toIso } from "../../pure";
import { activityByActor, admissionsByAssignee, areaMemberIds, countMcpContactCalls, openLeadsByAssignee } from "../../repo/console-numbers";
import { findDisplayNames, listStaffRows } from "../../repo/staff";
import type { CrmViewer } from "../../types";

/**
 * Counsellor activity, a section of Reports (docs/admin-phase-1b-plan.md §5.G, §6.4; owner:
 * 1B-NUMBERS). For the report's dates `[from, to)`, from `crm_activities` on leads in the viewer's
 * scope, per person who acted: calls, connected calls (x of y), WhatsApps sent (logged only once the
 * counsellor confirmed, since 1b), follow-ups done, active IST days, calls per active day; plus
 * their open enquiries now and their admissions in the dates.
 *
 * CRM admins and managers get one row per staff member in scope (admins: every active member;
 * area heads: the members of their areas; everyone who acted on a lead in scope); counsellors only
 * their own row ("Your numbers"). Contacts logged through AI assistant access (MCP) are counted
 * under the admin whose key logged them, with a footnote.
 */

export interface ActivityRow {
  userId: string;
  /** Display name, or null for an account that no longer exists. */
  name: string | null;
  calls: number;
  connected: number;
  whatsapps: number;
  followUps: number;
  activeDays: number;
  /** Calls ÷ active days (one decimal); null when there was no active day. */
  callsPerActiveDay: number | null;
  openLeads: number;
  admissions: number;
  /** The row is the viewer's own. */
  self: boolean;
}

export interface CounsellorActivityReport {
  from: string;
  to: string;
  /** Counsellors: only their own row ("Your numbers"). */
  own: boolean;
  /** Managers: only enquiries of their centres and areas are counted. */
  scoped: boolean;
  rows: ActivityRow[];
  /** Some counted contact or follow-up was logged through AI assistant access. */
  mcpIncluded: boolean;
}

/** Calls per active day, one decimal; null without an active day. */
export function callsPerActiveDay(calls: number, activeDays: number): number | null {
  return activeDays > 0 ? Math.round((calls / activeDays) * 10) / 10 : null;
}

/** The staff members a viewer's table always lists (even with nothing logged). */
function baselinePeople(viewer: CrmViewer): string[] {
  const db = getDb();
  if (viewer.role === "counsellor") return [viewer.userId];
  const members = listStaffRows(db).filter((row) => row.active && !row.disabled);
  if (viewer.role === "admin") return members.map((row) => row.userId);
  if (viewer.areaScope) {
    // Area members who are still active, enabled staff (as for admins).
    const live = new Set(members.map((row) => row.userId));
    return [viewer.userId, ...areaMemberIds(db, viewer.areaScope.areaIds).filter((id) => live.has(id))];
  }
  if (viewer.centreSlugs.length === 0) return members.map((row) => row.userId);
  const mine = new Set(viewer.centreSlugs);
  return [viewer.userId, ...members.filter((row) => row.centreSlugs.some((slug) => mine.has(slug))).map((row) => row.userId)];
}

/** The counsellor activity of `[range.from, range.to)` that `viewer` may see. Reads only. */
export function counsellorActivity(viewer: CrmViewer, range: { from: number; to: number }): CounsellorActivityReport {
  const db = getDb();
  const scope = leadScopeFor(viewer);
  const own = viewer.role === "counsellor";
  const acted = activityByActor(db, scope, range.from, range.to);
  const open = openLeadsByAssignee(db, scope);
  const admitted = admissionsByAssignee(db, scope, range.from, range.to);

  const ids = new Set<string>(baselinePeople(viewer));
  if (!own) {
    for (const row of acted) ids.add(row.actorId);
    for (const id of open.keys()) ids.add(id);
    for (const id of admitted.keys()) ids.add(id);
  }
  const byActor = new Map(acted.map((row) => [row.actorId, row]));
  const names = findDisplayNames(db, [...ids]);
  const rows: ActivityRow[] = [...ids]
    .map((userId) => {
      const done = byActor.get(userId);
      const calls = done?.calls ?? 0;
      const activeDays = done?.activeDays ?? 0;
      return {
        userId,
        name: names.get(userId) ?? null,
        calls,
        connected: done?.connected ?? 0,
        whatsapps: done?.whatsapps ?? 0,
        followUps: done?.followUps ?? 0,
        activeDays,
        callsPerActiveDay: callsPerActiveDay(calls, activeDays),
        openLeads: open.get(userId) ?? 0,
        admissions: admitted.get(userId) ?? 0,
        self: userId === viewer.userId,
      };
    })
    .sort((a, b) => b.calls - a.calls || b.followUps - a.followUps || (a.name ?? "").localeCompare(b.name ?? "") || a.userId.localeCompare(b.userId));

  const counted = rows.filter((row) => row.calls + row.whatsapps + row.followUps > 0).map((row) => row.userId);
  return {
    from: toIso(range.from),
    to: toIso(range.to),
    own,
    scoped: viewer.role === "manager",
    rows,
    mcpIncluded: countMcpContactCalls(db, scope, counted, range.from, range.to) > 0,
  };
}
