import "server-only";

import { getDb, withTransaction } from "@/lib/db/connection";

import { canSeeLead, CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "../../access";
import { cleanText, toIso } from "../../pure";
import { insertActivity } from "../../repo/activities";
import { findLeadDetailsRow, upsertLeadDetails, type LeadDetailsRow, type LeadDetailsValues } from "../../repo/console-family";
import { findLeadById, updateLead } from "../../repo/leads";
import type { CrmResult, CrmViewer } from "../../types";
import { CONSOLE_AUDIT, consoleAudit } from "../audit";
import { isSessionKey } from "../session";
import {
  BOARDS,
  DECISION_MAKERS,
  DETAIL_FIELD_PREFIX,
  HEARD_VIA,
  HOSTEL_ANSWERS,
  LEAD_DETAIL_FIELDS,
  PREFERRED_TIMES,
  TARGET_EXAMS,
  type LeadDetailField,
  type LeadMoreDetails,
  type SessionKey,
} from "../types";
import { checkAltPhone, intakeSessionChoices, REFERRED_BY_MAX, SCHOOL_MAX, targetYearChoices } from "./rules";
import type { LeadDetailsPatch } from "./schemas";

/**
 * More enquiry details (docs/admin-phase-1b-plan.md §5.E, D-081; owner: 1B-FAMILY): second phone /
 * WhatsApp, school, board, hostel, target exam and year, how they heard, referred by, joining
 * session, best time to call, who decides. Anyone who can see the lead reads and edits them;
 * erased leads cannot be changed (their personal columns were wiped by `eraseConsoleData`).
 * A change writes one `field_update { fields: ["details.school", …] }` timeline entry (the same
 * activity path `updateLead` uses for field edits) and one audit row with the field NAMES only.
 */

export const DETAILS_MESSAGES = {
  altPhoneInvalid: "Enter a 10-digit Indian mobile number.",
  altPhoneSame: "This is already the family's main number.",
  targetYear: "Choose a year from this year to four years ahead.",
  intakeSession: "Choose this session, the next one or 'Not decided'.",
} as const;

const EMPTY: Omit<LeadMoreDetails, "updatedAt"> = {
  altPhone: null,
  school: null,
  board: null,
  hostel: null,
  targetExam: null,
  targetYear: null,
  heardVia: null,
  referredBy: null,
  intakeSession: null,
  preferredTime: null,
  decisionMaker: null,
};

/** A stored open-vocabulary value that the code still knows, else null (an old value reads as not recorded). */
function known<T extends string>(list: readonly T[], value: string | null): T | null {
  return value !== null && (list as readonly string[]).includes(value) ? (value as T) : null;
}

/** Row → API shape (all null without a row). */
export function toLeadMoreDetails(row: LeadDetailsRow | null): LeadMoreDetails {
  if (!row) return { ...EMPTY, updatedAt: null };
  return {
    altPhone: row.altPhoneE164,
    school: row.school,
    board: known(BOARDS, row.board),
    hostel: known(HOSTEL_ANSWERS, row.hostel),
    targetExam: known(TARGET_EXAMS, row.targetExam),
    targetYear: row.targetYear,
    heardVia: known(HEARD_VIA, row.heardVia),
    referredBy: row.referredBy,
    intakeSession: isSessionKey(row.intakeSession) ? row.intakeSession : null,
    preferredTime: known(PREFERRED_TIMES, row.preferredTime),
    decisionMaker: known(DECISION_MAKERS, row.decisionMaker),
    updatedAt: toIso(row.updatedAt),
  };
}

/**
 * The lead's more details. The answer carries the full second number, so a read is audited
 * `crm.lead_view` like `getLead` (no values). The lead page passes `audit: false`: its own lead
 * read has already recorded that view.
 */
export function getLeadMoreDetails(viewer: CrmViewer, leadId: string, options: { audit?: boolean; now?: number } = {}): CrmResult<LeadMoreDetails> {
  const db = getDb();
  const lead = findLeadById(db, leadId);
  if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
  if (options.audit !== false) crmAudit(db, { actorId: viewer.userId, action: CRM_AUDIT.leadView, target: lead.id, now: options.now ?? Date.now() });
  return ok(toLeadMoreDetails(findLeadDetailsRow(db, leadId)));
}

function valuesOf(details: LeadMoreDetails): LeadDetailsValues {
  return {
    altPhoneE164: details.altPhone,
    school: details.school,
    board: details.board,
    hostel: details.hostel,
    targetExam: details.targetExam,
    targetYear: details.targetYear,
    heardVia: details.heardVia,
    referredBy: details.referredBy,
    intakeSession: details.intakeSession,
    preferredTime: details.preferredTime,
    decisionMaker: details.decisionMaker,
  };
}

/**
 * Saves the fields present in `patch` (`null` clears one). Rules: the second number goes through
 * the Add-enquiry normaliser and may not be the main number; the target year runs from the current
 * IST year to four years ahead and the joining session is the current or the next one (a value
 * already saved may stay). Unchanged values write nothing. 404 unseen, 409 erased, 422 invalid.
 */
export function updateLeadMoreDetails(
  viewer: CrmViewer,
  leadId: string,
  patch: LeadDetailsPatch,
  now: number = Date.now(),
): CrmResult<LeadMoreDetails> {
  const db = getDb();
  return withTransaction(db, (): CrmResult<LeadMoreDetails> => {
    const lead = findLeadById(db, leadId);
    if (!lead || !canSeeLead(viewer, lead)) return fail("not_found", CRM_MESSAGES.notFound);
    if (lead.erasedAt !== null) return fail("conflict", CRM_MESSAGES.erased);
    const current = toLeadMoreDetails(findLeadDetailsRow(db, leadId));
    const next: LeadMoreDetails = { ...current };
    const errors: Record<string, string[]> = {};

    if (patch.altPhone !== undefined) {
      const checked = checkAltPhone(patch.altPhone, lead.phoneE164);
      if (checked.ok) next.altPhone = checked.value;
      else errors.altPhone = [DETAILS_MESSAGES[checked.issue]];
    }
    if (patch.school !== undefined) next.school = cleanText(patch.school, SCHOOL_MAX);
    if (patch.referredBy !== undefined) next.referredBy = cleanText(patch.referredBy, REFERRED_BY_MAX);
    if (patch.board !== undefined) next.board = patch.board;
    if (patch.hostel !== undefined) next.hostel = patch.hostel;
    if (patch.targetExam !== undefined) next.targetExam = patch.targetExam;
    if (patch.heardVia !== undefined) next.heardVia = patch.heardVia;
    if (patch.preferredTime !== undefined) next.preferredTime = patch.preferredTime;
    if (patch.decisionMaker !== undefined) next.decisionMaker = patch.decisionMaker;
    if (patch.targetYear !== undefined) {
      const year = patch.targetYear;
      if (year === null || year === current.targetYear || targetYearChoices(now).includes(year)) next.targetYear = year;
      else errors.targetYear = [DETAILS_MESSAGES.targetYear];
    }
    if (patch.intakeSession !== undefined) {
      const session = patch.intakeSession;
      if (session === null || session === current.intakeSession) next.intakeSession = session as SessionKey | null;
      else if (isSessionKey(session) && intakeSessionChoices(now).includes(session)) next.intakeSession = session;
      else errors.intakeSession = [DETAILS_MESSAGES.intakeSession];
    }
    if (Object.keys(errors).length > 0) return fail("validation", CRM_MESSAGES.validation, errors);

    const changed: LeadDetailField[] = LEAD_DETAIL_FIELDS.filter((field) => next[field] !== current[field]);
    if (changed.length === 0) return ok(current);

    upsertLeadDetails(db, leadId, valuesOf(next), viewer.userId, now);
    const fields = changed.map((field) => `${DETAIL_FIELD_PREFIX}${field}`);
    insertActivity(db, { leadId, type: "field_update", meta: { fields }, actorId: viewer.userId, at: now });
    updateLead(db, leadId, { updatedAt: now, lastActivityAt: now });
    consoleAudit(db, { actorId: viewer.userId, action: CONSOLE_AUDIT.leadDetailsUpdate, target: leadId, details: { fields }, now });
    return ok({ ...next, updatedAt: toIso(now) });
  });
}
