import "server-only";

import { randomUUID } from "node:crypto";

import { getDb, withTransaction } from "@/lib/db/connection";

import { CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "./access";
import { autoAssign, NOTE_MAX } from "./leads";
import { canonicalTool, cleanMultiline, cleanPagePath, cleanReferrer, cleanSlug, cleanText, normalizePhoneE164 } from "./pure";
import { insertActivity } from "./repo/activities";
import { findLeadById, findLeadByPhone, insertLead, updateLead, type LeadRow, type LeadUpdate } from "./repo/leads";
import type { Meta } from "./repo/rows";
import {
  MANUAL_LEAD_SOURCES,
  type CaptureLeadInput,
  type CaptureLeadResult,
  type CrmResult,
  type CrmViewer,
  type EditableLeadField,
  type LeadContext,
  type ManualLeadInput,
} from "./types";

/**
 * Public forms → leads (D-039, D-040). `captureLead` is what POST /api/enquiries calls once a
 * submission is valid, not a honeypot hit, and carries the consent tick.
 */

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NOT_SURE = "not-sure";

interface CleanFields {
  studentName: string | null;
  guardianName: string | null;
  contactName: string | null;
  email: string | null;
  currentClass: string | null;
  programInterest: string | null;
  centreSlug: string | null;
}

function cleanName(value: unknown): string | null {
  const name = cleanText(value, 80);
  return name && name.length >= 2 ? name : null;
}

function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

function cleanFields(input: {
  studentName?: string | null;
  guardianName?: string | null;
  contactName?: string | null;
  email?: string | null;
  currentClass?: string | null;
  programInterest?: string | null;
  centreSlug?: string | null;
}): CleanFields {
  const centre = cleanSlug(input.centreSlug);
  return {
    studentName: cleanName(input.studentName),
    guardianName: cleanName(input.guardianName),
    contactName: cleanName(input.contactName),
    email: cleanEmail(input.email),
    currentClass: cleanSlug(input.currentClass),
    programInterest: cleanSlug(input.programInterest),
    centreSlug: centre === NOT_SURE ? null : centre,
  };
}

interface CleanContext {
  page: string | null;
  referrer: string | null;
  tool: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
}

function cleanContext(context: LeadContext | undefined): CleanContext {
  const utm = (value: unknown) => cleanText(value, 100);
  return {
    page: cleanPagePath(context?.page),
    referrer: cleanReferrer(context?.referrer),
    tool: canonicalTool(cleanSlug(context?.tool, 32)),
    utmSource: utm(context?.utmSource),
    utmMedium: utm(context?.utmMedium),
    utmCampaign: utm(context?.utmCampaign),
    utmTerm: utm(context?.utmTerm),
    utmContent: utm(context?.utmContent),
  };
}

const MERGE_FIELDS: readonly EditableLeadField[] = [
  "studentName",
  "guardianName",
  "contactName",
  "email",
  "currentClass",
  "programInterest",
  "centreSlug",
];

/**
 * Stores a consented public submission as a lead.
 *
 * Dedupe by E.164 phone: an existing (not erased) lead gets a `submission` activity, its EMPTY
 * fields that no staff member has edited are filled, consent version/time and the latest message
 * are updated, first-touch attribution is kept, and a `lost` lead is reopened as `new`. A new lead
 * is auto-assigned (rules → round-robin → unassigned). Audited as `crm.lead_capture` (no personal
 * data). Synchronous; throws only on database errors.
 */
export function captureLead(input: CaptureLeadInput, now: number = Date.now()): CaptureLeadResult {
  const consentVersion = cleanText(input?.consent?.textVersion, 64);
  if (!consentVersion) return { ok: false, error: "consent_missing" };
  const phone = normalizePhoneE164(input.phone);
  if (!phone) return { ok: false, error: "invalid_phone" };
  const source = cleanSlug(input.source, 32);
  if (!source) return { ok: false, error: "invalid_input" };
  const consentAt = typeof input.consent.at === "number" && Number.isFinite(input.consent.at) ? input.consent.at : now;
  const fields = cleanFields(input);
  const context = cleanContext(input.context);
  const message = cleanMultiline(input.message, 1000);
  const meta: Meta = { source, consentTextVersion: consentVersion };
  if (context.tool) meta.tool = context.tool;
  if (context.page) meta.page = context.page;
  const toolExam = cleanSlug(input.context?.toolExam, 30);
  if (toolExam) meta.toolExam = toolExam;
  const toolBand = cleanSlug(input.context?.toolBand, 30);
  if (toolBand) meta.toolBand = toolBand;
  if (input.context?.locale === "en" || input.context?.locale === "hi") meta.locale = input.context.locale;
  if (input.consent.locale === "en" || input.consent.locale === "hi") meta.consentLocale = input.consent.locale;
  const consentText = cleanText(input.consent.text, 1000);
  if (consentText) meta.consentText = consentText;
  const topic = cleanSlug(input.topic, 40);
  if (topic) meta.topic = topic;
  const reference = cleanText(input.reference, 40);
  if (reference && /^[A-Z]{2,5}-[0-9A-Z]{4,20}$/.test(reference)) meta.reference = reference;

  const db = getDb();
  return withTransaction(db, (): CaptureLeadResult => {
    const existing = findLeadByPhone(db, phone);
    if (existing) {
      const merged = mergeSubmission(existing, fields, context, message, consentVersion, consentAt, now);
      updateLead(db, existing.id, merged.update);
      insertActivity(db, {
        leadId: existing.id,
        type: "submission",
        body: message,
        meta: { ...meta, filled: merged.filled },
        actorId: null,
        at: now,
      });
      if (existing.stage === "lost") {
        insertActivity(db, {
          leadId: existing.id,
          type: "stage_change",
          meta: { from: "lost", to: "new", reopened: true },
          actorId: null,
          at: now,
        });
      }
      const fresh = findLeadById(db, existing.id);
      const assigneeId = fresh ? autoAssign(db, fresh, now) : existing.assignedTo;
      crmAudit(db, {
        actorId: null,
        action: CRM_AUDIT.leadCapture,
        target: existing.id,
        details: { source, isNew: false, reopened: existing.stage === "lost", assigned: assigneeId !== null },
        now,
      });
      return { ok: true, leadId: existing.id, isNew: false, assigneeId };
    }

    const id = randomUUID();
    insertLead(db, {
      id,
      createdAt: now,
      updatedAt: now,
      stage: "new",
      furthestStage: "new",
      lostReason: null,
      assignedTo: null,
      source,
      ...fields,
      ...context,
      phoneE164: phone,
      message,
      consentTextVersion: consentVersion,
      consentAt,
      staffEdited: [],
      submissionCount: 1,
      lastActivityAt: now,
      nextTaskDueAt: null,
    });
    insertActivity(db, { leadId: id, type: "submission", body: message, meta: { ...meta, filled: [] }, actorId: null, at: now });
    const row = findLeadById(db, id);
    const assigneeId = row ? autoAssign(db, row, now) : null;
    crmAudit(db, {
      actorId: null,
      action: CRM_AUDIT.leadCapture,
      target: id,
      details: { source, isNew: true, assigned: assigneeId !== null },
      now,
    });
    return { ok: true, leadId: id, isNew: true, assigneeId };
  });
}

function mergeSubmission(
  existing: LeadRow,
  fields: CleanFields,
  context: CleanContext,
  message: string | null,
  consentVersion: string,
  consentAt: number,
  now: number,
): { update: LeadUpdate; filled: string[] } {
  const update: LeadUpdate = {
    updatedAt: now,
    lastActivityAt: now,
    submissionCount: existing.submissionCount + 1,
    consentTextVersion: consentVersion,
    consentAt,
  };
  const filled: string[] = [];
  for (const field of MERGE_FIELDS) {
    const incoming = fields[field];
    if (incoming === null || existing[field] !== null || existing.staffEdited.includes(field)) continue;
    update[field] = incoming;
    filled.push(field);
  }
  for (const key of Object.keys(context) as (keyof CleanContext)[]) {
    if (context[key] !== null && existing[key] === null) update[key] = context[key];
  }
  if (message) update.message = message;
  if (existing.stage === "lost") {
    update.stage = "new";
    update.lostReason = null;
  }
  return { update, filled };
}

/** The enquiry contract's `EnquiryContext` shape (structural; snake_case utm keys). */
export interface EnquiryContextLike {
  page?: string | null;
  locale?: string | null;
  referrer?: string | null;
  tool?: string | null;
  toolExam?: string | null;
  toolBand?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
}

/** The enquiry contract's attribution context → `LeadContext` (same tool ids). */
export function leadContextFromEnquiry(context: EnquiryContextLike | null | undefined): LeadContext | undefined {
  if (!context) return undefined;
  return {
    page: context.page ?? null,
    referrer: context.referrer ?? null,
    tool: context.tool ?? null,
    toolExam: context.toolExam ?? null,
    toolBand: context.toolBand ?? null,
    locale: context.locale ?? null,
    utmSource: context.utm_source ?? null,
    utmMedium: context.utm_medium ?? null,
    utmCampaign: context.utm_campaign ?? null,
    utmTerm: context.utm_term ?? null,
    utmContent: context.utm_content ?? null,
  };
}

/**
 * Builds a `CaptureLeadInput` from a validated enquiry (structural: works with the current
 * contract and additive changes). `name` is the student's name on hero / admissions / quick
 * forms and the submitter's own name on the contact form. The consent version and attribution
 * come from the enquiry's own `consentVersion` / `context` unless `extras` overrides them.
 */
export function leadInputFromEnquiry(
  enquiry: {
    source: string;
    name: string;
    phone: string;
    email?: string | null;
    message?: string | null;
    guardianName?: string | null;
    currentClass?: string | null;
    programInterest?: string | null;
    preferredCentre?: string | null;
    topic?: string | null;
    intent?: string | null;
    consentVersion?: string | null;
    context?: EnquiryContextLike | null;
  },
  extras: { consentTextVersion?: string; consentAt?: number; context?: LeadContext; reference?: string | null } = {},
): CaptureLeadInput {
  const isContact = enquiry.source === "contact";
  return {
    source: enquiry.source,
    studentName: isContact ? null : enquiry.name,
    contactName: isContact ? enquiry.name : null,
    guardianName: enquiry.guardianName ?? null,
    phone: enquiry.phone,
    email: enquiry.email ?? null,
    message: enquiry.message ?? null,
    currentClass: enquiry.currentClass ?? null,
    programInterest: enquiry.programInterest ?? null,
    centreSlug: enquiry.preferredCentre ?? null,
    topic: enquiry.topic ?? enquiry.intent ?? null,
    consent: { textVersion: extras.consentTextVersion ?? enquiry.consentVersion ?? "", at: extras.consentAt },
    context: extras.context ?? leadContextFromEnquiry(enquiry.context),
    reference: extras.reference ?? null,
  };
}

/**
 * A lead entered by staff (walk-in, phone call, referral). The staff member confirms the family
 * agreed to be contacted. An existing lead with the same phone is reused (activity appended).
 * Counsellors' new leads are assigned to themselves; others go through auto-assignment.
 */
export function createManualLead(
  viewer: CrmViewer,
  input: ManualLeadInput,
  now: number = Date.now(),
): CrmResult<{ leadId: string; isNew: boolean }> {
  const fieldErrors: Record<string, string[]> = {};
  if (!(MANUAL_LEAD_SOURCES as readonly string[]).includes(input.source)) fieldErrors.source = ["Choose where this lead came from."];
  if (input.consent !== true) fieldErrors.consent = ["Confirm the family agreed to be contacted."];
  const phone = normalizePhoneE164(input.phone);
  if (!phone) fieldErrors.phone = ["Enter a valid 10-digit mobile number."];
  const fields = cleanFields(input);
  if (!fields.studentName && !fields.guardianName) fieldErrors.studentName = ["Enter the student's or the parent's name."];
  if (input.email && !fields.email) fieldErrors.email = ["Enter a valid email address."];
  if (Object.keys(fieldErrors).length > 0 || !phone) return fail("validation", CRM_MESSAGES.validation, fieldErrors);
  const note = cleanMultiline(input.note, NOTE_MAX);

  const db = getDb();
  return withTransaction(db, (): CrmResult<{ leadId: string; isNew: boolean }> => {
    const existing = findLeadByPhone(db, phone);
    if (existing) {
      const merged = mergeSubmission(existing, fields, cleanContext(undefined), null, existing.consentTextVersion ?? "staff-recorded", existing.consentAt ?? now, now);
      // Staff re-entering a family: never touch consent records, only fill empty fields.
      delete merged.update.consentTextVersion;
      delete merged.update.consentAt;
      merged.update.submissionCount = existing.submissionCount;
      updateLead(db, existing.id, merged.update);
      if (existing.stage === "lost") {
        insertActivity(db, {
          leadId: existing.id,
          type: "stage_change",
          meta: { from: "lost", to: "new", reopened: true },
          actorId: viewer.userId,
          at: now,
        });
      }
      insertActivity(db, {
        leadId: existing.id,
        type: "created",
        body: note,
        meta: { source: input.source, existing: true, filled: merged.filled },
        actorId: viewer.userId,
        at: now,
      });
      crmAudit(db, {
        actorId: viewer.userId,
        action: CRM_AUDIT.leadCreate,
        target: existing.id,
        details: { source: input.source, isNew: false },
        now,
      });
      return ok({ leadId: existing.id, isNew: false });
    }

    const id = randomUUID();
    insertLead(db, {
      id,
      createdAt: now,
      updatedAt: now,
      stage: "new",
      furthestStage: "new",
      lostReason: null,
      assignedTo: viewer.role === "counsellor" ? viewer.userId : null,
      source: input.source,
      ...fields,
      ...cleanContext(undefined),
      phoneE164: phone,
      message: null,
      consentTextVersion: "staff-recorded",
      consentAt: now,
      staffEdited: [],
      submissionCount: 0,
      lastActivityAt: now,
      nextTaskDueAt: null,
    });
    insertActivity(db, { leadId: id, type: "created", body: note, meta: { source: input.source }, actorId: viewer.userId, at: now });
    if (viewer.role === "counsellor") {
      insertActivity(db, { leadId: id, type: "assignment", meta: { from: null, to: viewer.userId }, actorId: viewer.userId, at: now });
    } else {
      const row = findLeadById(db, id);
      if (row) autoAssign(db, row, now);
    }
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.leadCreate,
      target: id,
      details: { source: input.source, isNew: true },
      now,
    });
    return ok({ leadId: id, isNew: true });
  });
}
