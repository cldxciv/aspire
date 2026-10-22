import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";
import { findUserById } from "@/lib/db/users";
import { keyedHash, secretBoxStatus } from "@/lib/server/secret-box";

import { CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "./access";
import { deleteGateDataForLead } from "./gate";
import { cleanSlug, toIso } from "./pure";
import { insertActivity, scrubActivities } from "./repo/activities";
import { wipeRoutingInput } from "./repo/areas-core";
import { upsertSuppression } from "./repo/intake";
import { findLeadById, openLeadCounts, updateLead } from "./repo/leads";
import { listRules, replaceRules } from "./repo/rules";
import { findStaff, listStaffRows, upsertStaffRow, type StaffRow } from "./repo/staff";
import { scrubTasks } from "./repo/tasks";
import { closeSlaClock } from "./sla";
import {
  CRM_ROLES,
  crmPermissions,
  ERASE_REASONS,
  type AssignmentRule,
  type AssignmentRuleInput,
  type CrmResult,
  type CrmRole,
  type CrmStaffMember,
  type CrmViewer,
  type EraseReason,
  type StaffInput,
} from "./types";

/** Admin-side CRM services: erase (D-042), staff membership, assignment rules. */

// ---------------------------------------------------------------------------
// Erase (D-042)
// ---------------------------------------------------------------------------

/** Meta keys that are structured, non-personal facts and survive an erase. */
const KEEP_META_KEYS = [
  "source",
  "tool",
  "page",
  "topic",
  "consentTextVersion",
  "consentLocale",
  "consentText",
  "locale",
  "toolExam",
  "toolBand",
  "from",
  "to",
  "lostReason",
  "reopened",
  "outcome",
  "auto",
  "via",
  "fields",
  "filled",
  "taskId",
  "dueAt",
  "assigneeId",
  "existing",
  // Lead gate (docs/lead-gate-plan.md): who filled in the gate form, and that it landed on a lost lead.
  "submittedBy",
  "onLostLead",
  // Staff-entered families: how they agreed to be contacted (proof of consent, not personal data).
  "consentMethod",
  "reason",
  // Lead routing (docs/lead-routing-plan.md §14.2): import / Meta bookkeeping (ids and flags only).
  "attached",
  "importBatch",
  "metaCreatedAt",
  "formId",
  "adId",
  "campaignId",
  "consentConfirmed",
] as const;

export const ERASED_TASK_TITLE = "[erased]";

/** Fixed-code log line for erase bookkeeping (never ids, names or phones). */
function eraseLog(reason: "no_suppression_key"): void {
  console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "warn", event: "crm", route: "erase", outcome: "degraded", reason }));
}

/**
 * Wipes a lead's personal data and keeps an anonymised stub (stage, source, centre, program, class,
 * dates, assignee) so funnel counts stay right. Admin only. Idempotent.
 * Lead routing (§12, M5): also wipes the family's typed place from the routing row, closes the
 * open first-call clock (`erased`) and writes the erase suppression (keyed hash of the phone) so
 * an old list or Meta lead cannot bring the family back; without INTEGRATIONS_SECRET the erase
 * still runs but writes no suppression (a fixed-code log line says so). Meta / CSV refs are kept.
 * Lead gate: also deletes the lead's passes (every browser is asked again) and all its `tool_use`
 * entries (not needed for funnel counts); the audit row carries the two counts.
 * `options.reason` (one of ERASE_REASONS, from the admin's erase dialog) is kept on the erase
 * entry and in the audit row; an unknown value is ignored. `options.suppress: false` (system use
 * only: the 24-hour erase of Meta TEST leads, whose phone is the super admin's own test number)
 * skips the suppression row.
 */
export function eraseLead(
  viewer: CrmViewer,
  leadId: string,
  now: number = Date.now(),
  options: { reason?: EraseReason | null; suppress?: boolean } = {},
): CrmResult<{ leadId: string; erasedAt: string }> {
  if (!crmPermissions(viewer).canErase) return fail("forbidden", CRM_MESSAGES.forbidden);
  const reason = (ERASE_REASONS as readonly unknown[]).includes(options.reason) ? (options.reason as EraseReason) : null;
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ leadId: string; erasedAt: string }> => {
    const lead = findLeadById(db, leadId);
    if (!lead) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null) return ok({ leadId, erasedAt: toIso(lead.erasedAt) });
    let suppressed = false;
    if (lead.phoneE164 && options.suppress !== false) {
      const box = secretBoxStatus();
      if (box.configured && box.keyId) {
        upsertSuppression(db, { phoneHash: keyedHash("phone", lead.phoneE164), keyId: box.keyId, erasedAt: now });
        suppressed = true;
      } else {
        eraseLog("no_suppression_key");
      }
    }
    updateLead(db, leadId, {
      studentName: null,
      guardianName: null,
      contactName: null,
      phoneE164: null,
      email: null,
      message: null,
      referrer: null,
      staffEdited: [],
      nextTaskDueAt: null,
      erasedAt: now,
      erasedBy: viewer.userId,
      updatedAt: now,
    });
    const gate = deleteGateDataForLead(db, leadId);
    scrubActivities(db, leadId, KEEP_META_KEYS);
    scrubTasks(db, leadId, ERASED_TASK_TITLE, now);
    wipeRoutingInput(db, leadId);
    closeSlaClock(db, { leadId, resolution: "erased", at: now });
    insertActivity(db, { leadId, type: "erase", meta: reason ? { reason } : {}, actorId: viewer.userId, at: now });
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.leadErase,
      target: leadId,
      // ("pass…" keys would be dropped by the audit sanitiser)
      details: { gateBrowsers: gate.passesRevoked, toolUsesDeleted: gate.toolUsesDeleted, ...(suppressed ? { suppressed } : {}), ...(reason ? { reason } : {}) },
      now,
    });
    return ok({ leadId, erasedAt: toIso(now) });
  });
}

// ---------------------------------------------------------------------------
// Staff membership
// ---------------------------------------------------------------------------

function toMember(row: StaffRow, openLeads: Map<string, number>, withLoginId: boolean): CrmStaffMember {
  const member: CrmStaffMember = {
    userId: row.userId,
    displayName: row.displayName,
    crmRole: row.crmRole,
    centreSlugs: row.centreSlugs,
    active: row.active,
    disabled: row.disabled,
    openLeads: openLeads.get(row.userId) ?? 0,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
  if (withLoginId) member.loginId = row.loginId;
  return member;
}

/** Every CRM member (admin: with login ids; managers: read-only, no login ids). */
export function listStaff(viewer: CrmViewer): CrmResult<CrmStaffMember[]> {
  if (!crmPermissions(viewer).canViewStaff) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  const counts = openLeadCounts(db);
  return ok(listStaffRows(db).map((row) => toMember(row, counts, viewer.role === "admin")));
}

export const MAX_SCOPE_CENTRES = 20;

/** Validates a membership. Returns field errors, or the cleaned input. */
export function validateStaffInput(
  input: Partial<StaffInput>,
): { ok: true; value: StaffInput } | { ok: false; fieldErrors: Record<string, string[]> } {
  const fieldErrors: Record<string, string[]> = {};
  const crmRole = input.crmRole;
  if (!crmRole || !(CRM_ROLES as readonly string[]).includes(crmRole)) fieldErrors.crmRole = ["Choose counsellor or manager."];
  const centres: string[] = [];
  for (const raw of input.centreSlugs ?? []) {
    const slug = cleanSlug(raw);
    if (!slug) {
      fieldErrors.centreSlugs = ["Use centre slugs such as shimla."];
      break;
    }
    if (!centres.includes(slug)) centres.push(slug);
  }
  if (centres.length > MAX_SCOPE_CENTRES) fieldErrors.centreSlugs = [`At most ${MAX_SCOPE_CENTRES} centres.`];
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: { crmRole: crmRole as CrmRole, centreSlugs: centres, active: input.active !== false } };
}

/**
 * Writes a membership for a `staff` account inside the caller's transaction (also used by
 * POST /api/admin/users when an admin creates a staff account). Audited.
 */
export function writeStaffMembership(
  db: DatabaseSync,
  actorId: string,
  userId: string,
  input: StaffInput,
  now: number,
): void {
  upsertStaffRow(db, { userId, ...input, actorId, now });
  crmAudit(db, {
    actorId,
    action: CRM_AUDIT.staffUpsert,
    target: userId,
    details: { crmRole: input.crmRole, centres: input.centreSlugs.join(","), active: input.active },
    now,
  });
}

/** Creates or changes a staff member's CRM role, centre scope and active flag. Super admin only (D-044, Q7). */
export function upsertStaff(
  viewer: CrmViewer,
  userId: string,
  input: Partial<StaffInput>,
  now: number = Date.now(),
): CrmResult<CrmStaffMember> {
  if (!crmPermissions(viewer).canManageStaff) return fail("forbidden", CRM_MESSAGES.forbidden);
  const checked = validateStaffInput(input);
  if (!checked.ok) return fail("validation", CRM_MESSAGES.validation, checked.fieldErrors);
  const db = getDb();
  return withTransaction(db, (): CrmResult<CrmStaffMember> => {
    const user = findUserById(db, userId);
    if (!user) return fail("not_found", CRM_MESSAGES.userNotFound);
    if (user.role !== "staff") return fail("validation", CRM_MESSAGES.notStaff, { userId: [CRM_MESSAGES.notStaff] });
    writeStaffMembership(db, viewer.userId, userId, checked.value, now);
    const row = findStaff(db, userId);
    if (!row) return fail("not_found", CRM_MESSAGES.userNotFound);
    return ok(toMember(row, openLeadCounts(db), true));
  });
}

/** CRM membership per user id (for the admin user list). */
export function staffMemberships(): Map<string, { crmRole: CrmRole; centreSlugs: string[]; active: boolean }> {
  return new Map(
    listStaffRows(getDb()).map((row) => [row.userId, { crmRole: row.crmRole, centreSlugs: row.centreSlugs, active: row.active }]),
  );
}

// ---------------------------------------------------------------------------
// Assignment rules
// ---------------------------------------------------------------------------

export const MAX_RULES = 50;
export const MAX_RULE_MEMBERS = 50;

export function getAssignmentRules(viewer: CrmViewer): CrmResult<AssignmentRule[]> {
  if (!crmPermissions(viewer).canViewStaff) return fail("forbidden", CRM_MESSAGES.forbidden);
  return ok(listRules(getDb()));
}

/** Replaces every rule (order = priority among equally specific rules). Super admin only (D-044). Audited. */
export function setAssignmentRules(
  viewer: CrmViewer,
  rules: readonly Partial<AssignmentRuleInput>[],
  now: number = Date.now(),
): CrmResult<AssignmentRule[]> {
  if (!crmPermissions(viewer).canEditRules) return fail("forbidden", CRM_MESSAGES.forbidden);
  if (rules.length > MAX_RULES) return fail("validation", CRM_MESSAGES.validation, { rules: [`At most ${MAX_RULES} rules.`] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<AssignmentRule[]> => {
    const members = new Set(listStaffRows(db).map((row) => row.userId));
    const clean: AssignmentRuleInput[] = [];
    const fieldErrors: Record<string, string[]> = {};
    rules.forEach((rule, index) => {
      const centreSlug = rule.centreSlug == null || rule.centreSlug === "" ? null : cleanSlug(rule.centreSlug);
      const programInterest = rule.programInterest == null || rule.programInterest === "" ? null : cleanSlug(rule.programInterest);
      const memberIds = [...new Set(rule.memberIds ?? [])];
      if (centreSlug === null && rule.centreSlug) fieldErrors[`rules.${index}.centreSlug`] = ["Use a centre slug."];
      if (programInterest === null && rule.programInterest) fieldErrors[`rules.${index}.programInterest`] = ["Use a program value."];
      if (memberIds.length === 0 || memberIds.length > MAX_RULE_MEMBERS || !memberIds.every((id) => members.has(id))) {
        fieldErrors[`rules.${index}.memberIds`] = ["Choose CRM staff members."];
      }
      clean.push({ centreSlug, programInterest, memberIds, active: rule.active !== false });
    });
    if (Object.keys(fieldErrors).length > 0) return fail("validation", CRM_MESSAGES.validation, fieldErrors);
    replaceRules(db, clean, now);
    crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.rulesSet, target: null, details: { rules: clean.length }, now });
    return ok(listRules(db));
  });
}
