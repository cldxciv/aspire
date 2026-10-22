import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { isSuperAdmin } from "@/lib/auth/super-admin";
import type { Session } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";

import { AREA_FILTER_NONE, AREA_FILTER_TOOL_SIGNUPS } from "./lead-ops-types";
import { centresOfAreas, listMemberAreaIds, responsibleAreaIds } from "./repo/areas-core";
import type { LeadScope } from "./repo/leads";
import { findStaff, listAssignableStaff, type StaffRow } from "./repo/staff";
import { findScopeMode } from "./repo/staff-ops";
import type { CrmErrorCode, CrmResult, CrmViewer, LeadFilters } from "./types";

/**
 * Record-level access for the CRM (D-038), deny by default:
 * - admin (core role) → every lead (a super admin is an admin with a grant, D-044);
 * - manager with an explicit `areas` scope (H2, docs/lead-routing-plan.md §13.5) → leads assigned to
 *   them, leads routed to an area they answer for (`responsibleAreaIds`), leads whose centre is in
 *   those areas; with zero areas, only their assigned leads;
 * - manager without a scope row (legacy) → leads of their centres (every lead when unscoped) plus
 *   leads assigned to them;
 * - counsellor → only leads assigned to them;
 * - anyone else (student, parent, a staff account without an active membership) → nothing.
 */

/**
 * The CRM viewer behind a verified session, or null. Admins need no membership; `staff`
 * accounts need an active `crm_staff` row. Accounts with a pending temporary password get null.
 * Admins are marked `superAdmin` when they hold an effective grant (never for `channel: "mcp"`);
 * managers with an `areas` scope row get `areaScope`.
 */
export function resolveCrmViewer(
  session: Session | null | undefined,
  db: DatabaseSync = getDb(),
  options: { channel?: "ui" | "mcp" } = {},
): CrmViewer | null {
  if (!session || session.mustChangePassword === true) return null;
  const channel = options.channel ?? "ui";
  if (session.role === "admin") {
    const viewer: CrmViewer = { userId: session.userId, displayName: session.displayName ?? "Admin", role: "admin", centreSlugs: [] };
    if (channel === "mcp") return { ...viewer, superAdmin: false, channel };
    if (isSuperAdmin(session.userId, db)) viewer.superAdmin = true;
    return viewer;
  }
  if (session.role !== "staff") return null;
  const staff = findStaff(db, session.userId);
  if (!staff || !staff.active || staff.disabled || staff.userRole !== "staff") return null;
  const viewer: CrmViewer = { userId: staff.userId, displayName: staff.displayName, role: staff.crmRole, centreSlugs: [...staff.centreSlugs] };
  if (staff.crmRole === "manager" && findScopeMode(db, staff.userId) === "areas") {
    const areaIds = responsibleAreaIds(db, staff.userId);
    viewer.areaScope = { areaIds, centreSlugs: centresOfAreas(db, areaIds) };
  }
  if (channel === "mcp") viewer.channel = channel;
  return viewer;
}

export function leadScopeFor(viewer: CrmViewer): LeadScope {
  if (viewer.role === "admin") return { kind: "all" };
  if (viewer.role === "manager") {
    if (viewer.areaScope) {
      return { kind: "areas", userId: viewer.userId, areaIds: viewer.areaScope.areaIds, centreSlugs: viewer.areaScope.centreSlugs };
    }
    return viewer.centreSlugs.length === 0 ? { kind: "all" } : { kind: "centres", userId: viewer.userId, centreSlugs: viewer.centreSlugs };
  }
  return { kind: "assigned", userId: viewer.userId };
}

/**
 * Whether `viewer` may see a lead. Erased stubs are visible to admins only. `areaId` (the lead's
 * routing area) is REQUIRED so a caller that forgets it fails type-checking (§13.5).
 */
export function canSeeLead(
  viewer: CrmViewer,
  lead: { assignedTo: string | null; centreSlug: string | null; areaId: string | null; erasedAt?: number | null },
): boolean {
  if (lead.erasedAt != null && viewer.role !== "admin") return false;
  const scope = leadScopeFor(viewer);
  switch (scope.kind) {
    case "all":
      return true;
    case "assigned":
      return lead.assignedTo === scope.userId;
    case "centres":
      return lead.assignedTo === scope.userId || (lead.centreSlug !== null && scope.centreSlugs.includes(lead.centreSlug));
    case "areas":
      return (
        lead.assignedTo === scope.userId ||
        (lead.areaId !== null && scope.areaIds.includes(lead.areaId)) ||
        (lead.centreSlug !== null && scope.centreSlugs.includes(lead.centreSlug))
      );
  }
}

/**
 * Query parameters only NARROW the scope (M2): an `area` filter naming an area outside an
 * area-scoped manager's areas is refused (403) instead of silently showing nothing.
 */
export function leadFilterForbidden(viewer: CrmViewer, filters: Pick<LeadFilters, "area">): boolean {
  const area = filters.area;
  if (!area || area === AREA_FILTER_NONE || area === AREA_FILTER_TOOL_SIGNUPS) return false;
  if (viewer.role !== "manager" || !viewer.areaScope) return false;
  return !viewer.areaScope.areaIds.includes(area);
}

/** Whether a staff member's centre scope covers a centre (empty scope = every centre). */
export function scopeCovers(centreSlugs: readonly string[], centreSlug: string | null): boolean {
  return centreSlugs.length === 0 || (centreSlug !== null && centreSlugs.includes(centreSlug));
}

/**
 * The staff member `assigneeId` if `viewer` may hand them a lead: an active membership on an
 * enabled staff account. A legacy scoped manager may only pick members whose centre scope covers
 * the lead's centre. An area-scoped manager (§13.5) may pick, for a lead that falls in their areas
 * (its routing area is one they answer for, or — e.g. an older lead with no routing row — its
 * centre is in those areas), any member of an area they answer for: their own team, which also
 * serves the headless areas they cover (A1 borrow). Their legacy centre scope, if any, still
 * applies, and they may always take a lead themselves.
 */
export function assignableMember(
  db: DatabaseSync,
  viewer: CrmViewer,
  assigneeId: string,
  lead: { centreSlug: string | null; areaId: string | null },
): StaffRow | null {
  const member = listAssignableStaff(db).find((staff) => staff.userId === assigneeId) ?? null;
  if (!member) return null;
  if (viewer.role !== "manager") return member;
  if (viewer.areaScope) {
    const { areaIds, centreSlugs } = viewer.areaScope;
    const leadInTheirAreas =
      (lead.areaId !== null && areaIds.includes(lead.areaId)) || (lead.centreSlug !== null && centreSlugs.includes(lead.centreSlug));
    const onTheirTeam = leadInTheirAreas && listMemberAreaIds(db, member.userId).some((areaId) => areaIds.includes(areaId));
    const centreCovered = viewer.centreSlugs.length > 0 && scopeCovers(member.centreSlugs, lead.centreSlug);
    return onTheirTeam || centreCovered || member.userId === viewer.userId ? member : null;
  }
  if (viewer.centreSlugs.length > 0 && !scopeCovers(member.centreSlugs, lead.centreSlug)) return null;
  return member;
}

/**
 * "Away until …" (§13.7, A5): a person may set their own; an area head for members of their areas;
 * a super admin for anyone. Admins without a grant set nobody's (they have no availability).
 */
export function canSetAvailability(db: DatabaseSync, viewer: CrmViewer, targetId: string): boolean {
  if (viewer.role === "admin") return viewer.superAdmin === true;
  if (targetId === viewer.userId) return true;
  if (viewer.role !== "manager") return false;
  const theirs = new Set(viewer.areaScope?.areaIds ?? listMemberAreaIds(db, viewer.userId));
  return listMemberAreaIds(db, targetId).some((areaId) => theirs.has(areaId));
}

// ---------------------------------------------------------------------------
// Results and audit
// ---------------------------------------------------------------------------

export const CRM_MESSAGES = {
  notFound: "No such lead.",
  taskNotFound: "No such task.",
  forbidden: "Your CRM role does not allow this.",
  superAdminOnly: "Only a super admin can change this.",
  erased: "This lead has been erased and can no longer be changed.",
  validation: "Please check the highlighted fields.",
  notStaff: "That account is not a staff account.",
  userNotFound: "No such user.",
} as const;

export function fail<T>(error: CrmErrorCode, message: string, fieldErrors?: Record<string, string[]>): CrmResult<T> {
  return fieldErrors ? { ok: false, error, message, fieldErrors } : { ok: false, error, message };
}

export function ok<T>(data: T): CrmResult<T> {
  return { ok: true, data };
}

/** Audit actions (`audit_log.action`). Details never hold names, phones, emails, typed places, tokens or free text. */
export const CRM_AUDIT = {
  leadCapture: "crm.lead_capture",
  leadCreate: "crm.lead_create",
  /** "Add enquiry" asked whether a number is already on file (`onDuplicate: "report"`); nothing written. */
  leadDuplicateCheck: "crm.lead_duplicate_check",
  leadView: "crm.lead_view",
  leadUpdate: "crm.lead_update",
  stageChange: "crm.stage_change",
  assign: "crm.assign",
  noteAdd: "crm.note_add",
  contactLog: "crm.contact_log",
  taskCreate: "crm.task_create",
  taskDone: "crm.task_done",
  export: "crm.export",
  leadErase: "crm.lead_erase",
  /** Lead gate: the family chose "Stop Aspire contacting me" (docs/lead-gate-plan.md). */
  gateWithdraw: "crm.gate_withdraw",
  staffUpsert: "crm.staff_upsert",
  rulesSet: "crm.rules_set",
  // Lead routing, the 1-hour rule and Meta (docs/lead-routing-plan.md §23).
  areaCreate: "crm.area_create",
  areaUpdate: "crm.area_update",
  areaMerge: "crm.area_merge",
  areaMembers: "crm.area_members",
  areaAlias: "crm.area_alias",
  areaSetupFromCentre: "crm.area_setup_from_centre",
  areaReroute: "crm.area_reroute",
  leadReroute: "crm.lead_reroute",
  bulkReassign: "crm.bulk_reassign",
  availability: "crm.availability",
  /** `{ key, version }` — never the value. */
  settingsUpdate: "crm.settings_update",
  importStart: "crm.import_start",
  import: "crm.import",
  metaConfig: "crm.meta_config",
  /** `{ slot }` (the secret's name; survives the audit key sanitiser), never the secret. */
  metaSecretSet: "crm.meta_secret_set",
  metaSecretDelete: "crm.meta_secret_delete",
  /** `{ action }`. */
  metaAction: "crm.meta_action",
} as const;

export type CrmAuditAction = (typeof CRM_AUDIT)[keyof typeof CRM_AUDIT];

export function crmAudit(
  db: DatabaseSync,
  input: {
    actorId: string | null;
    action: CrmAuditAction;
    target: string | null;
    details?: Record<string, string | number | boolean | null>;
    now: number;
  },
): void {
  recordAudit(db, input);
}
