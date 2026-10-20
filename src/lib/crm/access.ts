import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { Session } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/db/audit";
import { getDb } from "@/lib/db/connection";

import type { LeadScope } from "./repo/leads";
import { findStaff, listAssignableStaff, type StaffRow } from "./repo/staff";
import type { CrmErrorCode, CrmResult, CrmViewer } from "./types";

/**
 * Record-level access for the CRM (D-038), deny by default:
 * - admin (core role) → every lead;
 * - manager → leads of their centres (every lead when unscoped) plus leads assigned to them;
 * - counsellor → only leads assigned to them;
 * - anyone else (student, parent, a staff account without an active membership) → nothing.
 */

/**
 * The CRM viewer behind a verified session, or null. Admins need no membership; `staff`
 * accounts need an active `crm_staff` row. Accounts with a pending temporary password get null.
 */
export function resolveCrmViewer(session: Session | null | undefined, db: DatabaseSync = getDb()): CrmViewer | null {
  if (!session || session.mustChangePassword === true) return null;
  if (session.role === "admin") {
    return { userId: session.userId, displayName: session.displayName ?? "Admin", role: "admin", centreSlugs: [] };
  }
  if (session.role !== "staff") return null;
  const staff = findStaff(db, session.userId);
  if (!staff || !staff.active || staff.disabled || staff.userRole !== "staff") return null;
  return { userId: staff.userId, displayName: staff.displayName, role: staff.crmRole, centreSlugs: [...staff.centreSlugs] };
}

export function leadScopeFor(viewer: CrmViewer): LeadScope {
  if (viewer.role === "admin") return { kind: "all" };
  if (viewer.role === "manager") {
    return viewer.centreSlugs.length === 0 ? { kind: "all" } : { kind: "centres", userId: viewer.userId, centreSlugs: viewer.centreSlugs };
  }
  return { kind: "assigned", userId: viewer.userId };
}

/** Whether `viewer` may see a lead. Erased stubs are visible to admins only. */
export function canSeeLead(
  viewer: CrmViewer,
  lead: { assignedTo: string | null; centreSlug: string | null; erasedAt?: number | null },
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
  }
}

/** Whether a staff member's centre scope covers a centre (empty scope = every centre). */
export function scopeCovers(centreSlugs: readonly string[], centreSlug: string | null): boolean {
  return centreSlugs.length === 0 || (centreSlug !== null && centreSlugs.includes(centreSlug));
}

/**
 * The staff member `assigneeId` if `viewer` may hand them a lead of `centreSlug`: an active
 * membership on an enabled staff account; a scoped manager may only pick members whose scope
 * covers the lead's centre.
 */
export function assignableMember(
  db: DatabaseSync,
  viewer: CrmViewer,
  assigneeId: string,
  centreSlug: string | null,
): StaffRow | null {
  const member = listAssignableStaff(db).find((staff) => staff.userId === assigneeId) ?? null;
  if (!member) return null;
  if (viewer.role === "manager" && viewer.centreSlugs.length > 0 && !scopeCovers(member.centreSlugs, centreSlug)) {
    return null;
  }
  return member;
}

// ---------------------------------------------------------------------------
// Results and audit
// ---------------------------------------------------------------------------

export const CRM_MESSAGES = {
  notFound: "No such lead.",
  taskNotFound: "No such task.",
  forbidden: "Your CRM role does not allow this.",
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

/** Audit actions (`audit_log.action`). Details never hold names, phones, emails or free text. */
export const CRM_AUDIT = {
  leadCapture: "crm.lead_capture",
  leadCreate: "crm.lead_create",
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
