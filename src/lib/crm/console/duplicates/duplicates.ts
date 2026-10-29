import "server-only";

import { getDb, withTransaction } from "@/lib/db/connection";

import { canSeeLead, CRM_MESSAGES, fail, leadScopeFor, ok } from "../../access";
import { leadDisplayName } from "../../leads";
import { toIso } from "../../pure";
import {
  findDuplicateCandidatesByIds,
  findLeadDetailsRow,
  findNameDuplicateCandidates,
  findPhoneDuplicateCandidates,
  insertDuplicateDismissal,
  type DuplicateCandidateRow,
} from "../../repo/console-family";
import { findLeadById, scopedLeadWhere, type LeadRow } from "../../repo/leads";
import { isLeadStage, type CrmResult, type CrmViewer, type LeadStage } from "../../types";
import { CONSOLE_AUDIT, consoleAudit } from "../audit";
import { DUPLICATES_MAX, type DuplicateDismissal, type DuplicateMatch, type DuplicateReason } from "./types";

/**
 * Possible duplicates (docs/admin-phase-1b-plan.md §5.F, D-081; owner: 1B-FAMILY). Suggestions
 * only: nothing merges (Phase 2). Matching runs inside the viewer's scope (`scopedLeadWhere`), so a
 * lead the viewer cannot see is never mentioned, not even as a count:
 *   (a) the numbers: their main number = this second number, their second = this main, or both
 *       second numbers equal (non-null);
 *   (b) the same normalised student name, the same class and the same non-null effective centre.
 * Erased leads, enquiries already marked lost as a duplicate (settled, so they stop nagging the
 * surviving family's page) and pairs marked "Not the same family" are left out; at most 5, number
 * matches first.
 */

export const DUPLICATE_MESSAGES = {
  sameLead: "Choose another enquiry.",
} as const;

/** Rows read for the name rule before the names are compared in code. */
const NAME_CANDIDATE_LIMIT = 2000;

/** NFKC, lower case, whitespace collapsed and trimmed; null when nothing is left. */
export function normName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalised = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return normalised === "" ? null : normalised;
}

/** Who may mark a pair "Not the same family": admins, managers, or the assignee of either lead. */
function mayDismiss(viewer: CrmViewer, a: { assignedTo: string | null }, b: { assignedTo: string | null }): boolean {
  if (viewer.role === "admin" || viewer.role === "manager") return true;
  return a.assignedTo === viewer.userId || b.assignedTo === viewer.userId;
}

function toMatch(viewer: CrmViewer, lead: LeadRow, row: DuplicateCandidateRow, reasons: DuplicateReason[]): DuplicateMatch {
  return {
    leadId: row.id,
    name: leadDisplayName(row),
    stage: (isLeadStage(row.stage) ? row.stage : "new") as LeadStage,
    centreSlug: row.effectiveCentre,
    assignee: row.assignedTo ? { userId: row.assignedTo, displayName: row.assigneeName ?? "" } : null,
    createdAt: toIso(row.createdAt),
    reasons,
    canDismiss: mayDismiss(viewer, lead, row),
  };
}

/** The suggestions for a lead the viewer can see (none for an erased lead). A read: no audit. */
export function findDuplicates(viewer: CrmViewer, leadId: string): CrmResult<DuplicateMatch[]> {
  const db = getDb();
  const lead = findLeadById(db, leadId);
  if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
  if (lead.erasedAt !== null) return ok([]);
  const scope = scopedLeadWhere(leadScopeFor(viewer));
  const altPhone = findLeadDetailsRow(db, leadId)?.altPhoneE164 ?? null;

  const reasons = new Map<string, DuplicateReason[]>();
  const rows = new Map<string, DuplicateCandidateRow>();
  const add = (row: DuplicateCandidateRow, reason: DuplicateReason) => {
    rows.set(row.id, row);
    const list = reasons.get(row.id) ?? [];
    if (!list.includes(reason)) list.push(reason);
    reasons.set(row.id, list);
  };

  // (a) the numbers.
  for (const row of findPhoneDuplicateCandidates(db, { leadId, phone: lead.phoneE164, altPhone }, scope, DUPLICATES_MAX * 4)) {
    if (altPhone && row.phoneE164 === altPhone) add(row, "main_is_alt");
    if (lead.phoneE164 && row.altPhoneE164 === lead.phoneE164) add(row, "alt_is_main");
    if (altPhone && row.altPhoneE164 === altPhone) add(row, "same_alt_phone");
  }

  // (b) the same name, class and effective centre.
  const name = normName(lead.studentName);
  const centre = lead.centreSlug ?? lead.areaDefaultCentre;
  if (name && lead.currentClass && centre) {
    const sameName = findNameDuplicateCandidates(db, { leadId, currentClass: lead.currentClass, effectiveCentre: centre }, scope, NAME_CANDIDATE_LIMIT)
      .filter((candidate) => normName(candidate.studentName) === name)
      .map((candidate) => candidate.id);
    const known = sameName.filter((id) => rows.has(id));
    for (const id of known) add(rows.get(id) as DuplicateCandidateRow, "same_name_class_centre");
    const missing = sameName.filter((id) => !rows.has(id)).slice(0, DUPLICATES_MAX);
    for (const row of findDuplicateCandidatesByIds(db, missing)) add(row, "same_name_class_centre");
  }

  const ordered = [...rows.values()].sort((a, b) => {
    const aPhone = (reasons.get(a.id) ?? []).some((reason) => reason !== "same_name_class_centre") ? 0 : 1;
    const bPhone = (reasons.get(b.id) ?? []).some((reason) => reason !== "same_name_class_centre") ? 0 : 1;
    return aPhone - bPhone || b.createdAt - a.createdAt || a.id.localeCompare(b.id);
  });
  return ok(ordered.slice(0, DUPLICATES_MAX).map((row) => toMatch(viewer, lead, row, reasons.get(row.id) ?? [])));
}

/**
 * "Not the same family": the pair is never suggested again (stored once, in id order, ids only).
 * The viewer must see BOTH leads (404 otherwise, so an unseen id reveals nothing) and be an admin,
 * a manager or the assignee of either lead (403). Erased leads cannot be changed (409).
 * Audited `crm.duplicate_dismiss { otherLeadId }` when the pair is new.
 */
export function dismissDuplicate(viewer: CrmViewer, leadId: string, otherLeadId: string, now: number = Date.now()): CrmResult<DuplicateDismissal> {
  if (leadId === otherLeadId) return fail("validation", CRM_MESSAGES.validation, { otherLeadId: [DUPLICATE_MESSAGES.sameLead] });
  const db = getDb();
  return withTransaction(db, (): CrmResult<DuplicateDismissal> => {
    const lead = findLeadById(db, leadId);
    const other = findLeadById(db, otherLeadId);
    if (!lead || !canSeeLead(viewer, lead) || !other || !canSeeLead(viewer, other)) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null || other.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);
    if (!mayDismiss(viewer, lead, other)) return fail("forbidden", CRM_MESSAGES.forbidden);
    const dismissed = insertDuplicateDismissal(db, leadId, otherLeadId, viewer.userId, now);
    if (dismissed) {
      consoleAudit(db, { actorId: viewer.userId, action: CONSOLE_AUDIT.duplicateDismiss, target: leadId, details: { otherLeadId }, now });
    }
    return ok({ leadId, otherLeadId, dismissed });
  });
}
