import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";
import { findUserById } from "@/lib/db/users";

import { CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "./access";
import { deleteGateDataForLead } from "./gate";
import { cleanSlug, toIso } from "./pure";
import { insertActivity, scrubActivities } from "./repo/activities";
import { findLeadById, openLeadCounts, updateLead } from "./repo/leads";
import { listRules, replaceRules } from "./repo/rules";
import { findStaff, listStaffRows, upsertStaffRow, type StaffRow } from "./repo/staff";
import { scrubTasks } from "./repo/tasks";
import {
  CRM_ROLES,
  crmPermissions,
  type AssignmentRule,
  type AssignmentRuleInput,
  type CrmResult,
  type CrmRole,
  type CrmStaffMember,
  type CrmViewer,
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
] as const;

export const ERASED_TASK_TITLE = "[erased]";

/**
 * Wipes a lead's personal data and keeps an anonymised stub (stage, source, centre, program, class,
 * dates, assignee) so funnel counts stay right. Admin only. Idempotent.
 * Lead gate: also deletes the lead's passes (every browser is asked again) and all its `tool_use`
 * entries (not needed for funnel counts); the audit row carries the two counts.
 */
export function eraseLead(
  viewer: CrmViewer,
  leadId: string,
  now: number = Date.now(),
): CrmResult<{ leadId: string; erasedAt: string }> {
  if (!crmPermissions(viewer).canErase) return fail("forbidden", CRM_MESSAGES.forbidden);
  const db = getDb();
  return withTransaction(db, (): CrmResult<{ leadId: string; erasedAt: string }> => {
    const lead = findLeadById(db, leadId);
    if (!lead) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null) return ok({ leadId, erasedAt: toIso(lead.erasedAt) });
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
    insertActivity(db, { leadId, type: "erase", actorId: viewer.userId, at: now });
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.leadErase,
      target: leadId,
      // ("pass…" keys would be dropped by the audit sanitiser)
      details: { gateBrowsers: gate.passesRevoked, toolUsesDeleted: gate.toolUsesDeleted },
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

/** Creates or changes a staff member's CRM role, centre scope and active flag. Admin only. */
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

/** Replaces every rule (order = priority among equally specific rules). Admin only. Audited. */
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
