import "server-only";

import { randomUUID } from "node:crypto";

import { isRecordId } from "@/lib/auth/roles";
import { getDb, withTransaction } from "@/lib/db/connection";
import { keyedHashCandidates } from "@/lib/server/secret-box";

import { canSeeLead, CRM_AUDIT, CRM_MESSAGES, crmAudit, fail, ok } from "./access";
import { onLeadArrival } from "./arrival";
import {
  CAPTURE_ANSWERS_MAX,
  DISTRICT_INPUT_VALUES,
  EXTERNAL_PROVIDERS,
  PLACE_INPUT_MAX,
  SUBMISSION_META_MAX_KEYS,
  SYSTEM_CONSENT_METHODS,
  type LeadOrigin,
} from "./lead-ops-types";
import { NOTE_MAX } from "./leads";
import { canonicalTool, cleanMultiline, cleanPagePath, cleanReferrer, cleanSlug, cleanText, normalizePhoneE164 } from "./pure";
import { insertActivity, lastActivityAt, listActivitiesOfTypes } from "./repo/activities";
import { findExternalRef, insertExternalRef, suppressionErasedAt } from "./repo/intake";
import { findLeadById, findLeadByPhone, insertLead, updateLead, type LeadRow, type LeadUpdate } from "./repo/leads";
import type { Meta } from "./repo/rows";
import {
  CONSENT_METHODS,
  GATE_SUBMITTERS,
  MANUAL_LEAD_SOURCES,
  type CaptureLeadInput,
  type CaptureLeadOptions,
  type CaptureLeadResult,
  type CrmResult,
  type CrmViewer,
  type EditableLeadField,
  type LeadContext,
  type ManualLeadAnswer,
  type ManualLeadDuplicate,
  type ManualLeadInput,
  type ManualLeadResult,
  type UnsuppressedCaptureResult,
} from "./types";

/**
 * Public forms → leads (D-039, D-040). `captureLead` is what POST /api/enquiries calls once a
 * submission is valid, not a honeypot hit, and carries the consent tick; the lead gate, the CSV
 * import and Meta Lead Ads call it too (docs/lead-routing-plan.md §14.2). Every capture ends in
 * `onLeadArrival` (routing, assignment, the first-call clock; §14.1).
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

/** Submission meta keys a capture writes itself; `submissionMeta` can never overwrite them. */
const RESERVED_META_KEYS = new Set([
  "source",
  "consentTextVersion",
  "consentLocale",
  "consentText",
  "filled",
  "tool",
  "page",
  "toolExam",
  "toolBand",
  "locale",
  "topic",
  "reference",
  "submittedBy",
  "accountId",
  "accountRole",
  "attached",
  "onLostLead",
]);
const META_KEY = /^[a-z][A-Za-z0-9]{0,31}$/;

/** `submissionMeta`: at most 12 primitive values under safe keys; anything else is dropped. */
function cleanSubmissionMeta(raw: CaptureLeadOptions["submissionMeta"]): Meta {
  const out: Meta = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (Object.keys(out).length >= SUBMISSION_META_MAX_KEYS) break;
    if (!META_KEY.test(key) || RESERVED_META_KEYS.has(key)) continue;
    if (typeof value === "string") {
      const text = cleanText(value, 200);
      if (text) out[key] = text;
    } else if ((typeof value === "number" && Number.isFinite(value)) || typeof value === "boolean" || value === null) {
      out[key] = value;
    }
  }
  return out;
}

function cleanOrigin(origin: LeadOrigin | undefined): LeadOrigin | null | "invalid" {
  if (origin === undefined) return null;
  if (
    !origin ||
    !(EXTERNAL_PROVIDERS as readonly unknown[]).includes(origin.provider) ||
    typeof origin.externalId !== "string" ||
    !/^[A-Za-z0-9_=-]{1,200}$/.test(origin.externalId) ||
    (origin.batchId !== undefined && (typeof origin.batchId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(origin.batchId)))
  ) {
    return "invalid";
  }
  return { provider: origin.provider, externalId: origin.externalId, ...(origin.batchId ? { batchId: origin.batchId } : {}) };
}

const finiteOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * Stores a consented submission as a lead.
 *
 * Dedupe by E.164 phone: an existing (not erased) lead gets a `submission` activity, its EMPTY
 * fields that no staff member has edited are filled, consent version/time and the latest message
 * are updated, first-touch attribution is kept, and a `lost` lead is reopened as `new`. Then the
 * arrival pipeline routes, (re)assigns and times it (§14.1). Audited as `crm.lead_capture` (no
 * personal data). Synchronous; throws only on database errors. Joins the caller's transaction.
 *
 * `options.gate` (lead gate, docs/lead-gate-plan.md): an existing lead is never reopened or
 * re-assigned and keeps its own consent fields; see `CaptureLeadOptions`.
 *
 * Lead routing (§14.2): `origin` (idempotency ref), `existing: "attach"` (history only for a known
 * family), `attachIfOlderThanHistory` (Meta chronology), `suppression` (erased families stay
 * erased), `submissionMeta`, `answers`, `slaClock` / `clockReason` / `arrivedAt` for the clock.
 * Without `suppression` the result can never be `erased_family` (overload).
 */
export function captureLead(
  input: CaptureLeadInput,
  now?: number,
  options?: CaptureLeadOptions & { suppression?: undefined },
): UnsuppressedCaptureResult;
export function captureLead(input: CaptureLeadInput, now?: number, options?: CaptureLeadOptions): CaptureLeadResult;
export function captureLead(input: CaptureLeadInput, now: number = Date.now(), options: CaptureLeadOptions = {}): CaptureLeadResult {
  const gate = options.gate === true;
  const consentVersion = cleanText(input?.consent?.textVersion, 64);
  if (!consentVersion) return { ok: false, error: "consent_missing" };
  const phone = normalizePhoneE164(input.phone);
  if (!phone) return { ok: false, error: "invalid_phone" };
  const source = cleanSlug(input.source, 32);
  if (!source) return { ok: false, error: "invalid_input" };
  const origin = cleanOrigin(options.origin);
  if (origin === "invalid") return { ok: false, error: "invalid_input" };
  const consentAt = typeof input.consent.at === "number" && Number.isFinite(input.consent.at) ? input.consent.at : now;
  const fields = cleanFields(input);
  const context = cleanContext(input.context);
  const message = cleanMultiline(input.message, 1000);
  const answers = cleanMultiline(options.answers, CAPTURE_ANSWERS_MAX);
  const districtInput = cleanText(input.district, PLACE_INPUT_MAX);
  const stateInput = cleanText(input.state, PLACE_INPUT_MAX);
  const arrivedAt = finiteOrNull(options.arrivedAt) ?? now;
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
  // System consent (§14.2, H4): never from "Add enquiry" (CONSENT_METHODS stays separate).
  if ((SYSTEM_CONSENT_METHODS as readonly unknown[]).includes(input.consent.method)) meta.consentMethod = input.consent.method as string;
  const topic = cleanSlug(input.topic, 40);
  if (topic) meta.topic = topic;
  const reference = cleanText(input.reference, 40);
  if (reference && /^[A-Z]{2,5}-[0-9A-Z]{4,20}$/.test(reference)) meta.reference = reference;
  if ((GATE_SUBMITTERS as readonly unknown[]).includes(input.submittedBy)) meta.submittedBy = input.submittedBy as string;
  // Lead gate: the signed-in student / parent account that shared the details (id + role only).
  const account = gate ? options.account : null;
  if (account && isRecordId(account.userId) && (GATE_SUBMITTERS as readonly unknown[]).includes(account.role)) {
    meta.accountId = account.userId;
    meta.accountRole = account.role;
  }
  Object.assign(meta, cleanSubmissionMeta(options.submissionMeta));
  const body = message ?? answers;
  const arrival = { source, gate, manual: false, districtInput, stateInput, slaClock: options.slaClock, clockReason: options.clockReason, arrivedAt, actorId: null, at: now } as const;

  const db = getDb();
  return withTransaction(db, (): CaptureLeadResult => {
    // Idempotency (§14.2 origin): an id already imported writes nothing at all.
    if (origin) {
      const ref = findExternalRef(db, origin.provider, origin.externalId);
      if (ref) return { ok: true, leadId: ref.leadId ?? "", isNew: false, assigneeId: null, alreadyImported: true };
    }
    // Erase suppression (M5): an erased family is not brought back by an old list or Meta lead.
    if (options.suppression) {
      const erasedAt = suppressionErasedAt(db, keyedHashCandidates("phone", phone));
      const createdAt = finiteOrNull(options.suppression.createdAt);
      if (erasedAt !== null && (createdAt === null || createdAt < erasedAt)) return { ok: false, error: "erased_family" };
    }
    const recordRef = (leadId: string) => {
      if (origin) insertExternalRef(db, { provider: origin.provider, externalId: origin.externalId, leadId, batchId: origin.batchId ?? null, now });
    };

    const existing = findLeadByPhone(db, phone);
    if (existing) {
      const attach = options.existing === "attach" || olderThanHistory(existing, options.attachIfOlderThanHistory);
      if (attach) {
        // History only (H3, A4): never consent, stage, lost reason, assignee or message; no clock.
        const merged = mergeSubmission(existing, fields, context, null, consentVersion, consentAt, now, { reopen: false, keepConsent: true });
        updateLead(db, existing.id, merged.update);
        insertActivity(db, { leadId: existing.id, type: "submission", body, meta: { ...meta, filled: merged.filled, attached: true }, actorId: null, at: now });
        recordRef(existing.id);
        onLeadArrival(db, { ...arrival, leadId: existing.id, kind: "attached", assignNew: false });
        crmAudit(db, { actorId: null, action: CRM_AUDIT.leadCapture, target: existing.id, details: { source, isNew: false, attached: true }, now });
        return { ok: true, leadId: existing.id, isNew: false, assigneeId: existing.assignedTo, attached: true };
      }

      const lost = existing.stage === "lost";
      const reopen = lost && !gate;
      const merged = mergeSubmission(existing, fields, context, message, consentVersion, consentAt, now, {
        reopen,
        keepConsent: gate && existing.consentTextVersion !== null,
      });
      updateLead(db, existing.id, merged.update);
      insertActivity(db, {
        leadId: existing.id,
        type: "submission",
        body,
        meta: { ...meta, filled: merged.filled, ...(lost && gate ? { onLostLead: true } : {}) },
        actorId: null,
        at: now,
      });
      if (reopen) {
        insertActivity(db, {
          leadId: existing.id,
          type: "stage_change",
          meta: { from: "lost", to: "new", reopened: true },
          actorId: null,
          at: now,
        });
      }
      recordRef(existing.id);
      const result = onLeadArrival(db, {
        ...arrival,
        leadId: existing.id,
        kind: reopen ? "reopened" : "repeat",
        assignNew: options.assignNew !== false,
      });
      const assigneeId = gate ? existing.assignedTo : result.assigneeId;
      crmAudit(db, {
        actorId: null,
        action: CRM_AUDIT.leadCapture,
        target: existing.id,
        details: { source, isNew: false, reopened: reopen, assigned: assigneeId !== null },
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
    insertActivity(db, { leadId: id, type: "submission", body, meta: { ...meta, filled: [] }, actorId: null, at: now });
    recordRef(id);
    const result = onLeadArrival(db, { ...arrival, leadId: id, kind: "new", assignNew: options.assignNew !== false });
    crmAudit(db, {
      actorId: null,
      action: CRM_AUDIT.leadCapture,
      target: id,
      details: { source, isNew: true, assigned: result.assigneeId !== null },
      now,
    });
    return { ok: true, leadId: id, isNew: true, assigneeId: result.assigneeId };
  });
}

/**
 * Meta chronology (H3): a lead created (on Meta) before the family's lead was closed (`lost` /
 * `enrolled`) or before they withdrew consent is history, not a new request.
 */
function olderThanHistory(existing: LeadRow, rule: CaptureLeadOptions["attachIfOlderThanHistory"]): boolean {
  const createdAt = finiteOrNull(rule?.createdAt);
  if (createdAt === null) return false;
  const db = getDb();
  const closedAt = lastActivityAt(db, existing.id, ["stage_change"], { toStages: ["lost", "enrolled"] });
  const withdrawnAt = lastActivityAt(db, existing.id, ["consent_withdrawn"]);
  return (closedAt !== null && createdAt < closedAt) || (withdrawnAt !== null && createdAt < withdrawnAt);
}

function mergeSubmission(
  existing: LeadRow,
  fields: CleanFields,
  context: CleanContext,
  message: string | null,
  consentVersion: string,
  consentAt: number,
  now: number,
  rules: { reopen: boolean; keepConsent: boolean } = { reopen: true, keepConsent: false },
): { update: LeadUpdate; filled: string[] } {
  const update: LeadUpdate = {
    updatedAt: now,
    lastActivityAt: now,
    submissionCount: existing.submissionCount + 1,
  };
  if (!rules.keepConsent) {
    update.consentTextVersion = consentVersion;
    update.consentAt = consentAt;
  }
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
  if (existing.stage === "lost" && rules.reopen) {
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
 * come from the enquiry's own `consentVersion` / `context` unless `extras` overrides them. The
 * optional `district` (lead routing §13.8: an HP district id or `outside-hp`) routes the lead.
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
    district?: string | null;
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
    district: enquiry.district ?? null,
  };
}

/**
 * A lead entered by staff (walk-in, phone call, referral). The staff member confirms the family
 * agreed to be contacted (and, optionally, how: `consentMethod`, kept on the `created` activity).
 * An existing lead with the same phone is reused (activity appended) — or, with
 * `onDuplicate: "report"`, left untouched and reported as `duplicate: true` (with whether it is
 * closed or the family withdrew consent, and its id only if the viewer may open it; the check is
 * audited) so the screen can offer "Open" / "Log a visit" first. Counsellors' new leads are
 * assigned to themselves; others go through the arrival pipeline (§14.1). `canOpen` says whether
 * the viewer may open the lead afterwards.
 */
export function createManualLead(
  viewer: CrmViewer,
  input: ManualLeadInput & { onDuplicate?: "append" },
  now?: number,
): CrmResult<ManualLeadResult>;
export function createManualLead(viewer: CrmViewer, input: ManualLeadInput, now?: number): CrmResult<ManualLeadAnswer>;
export function createManualLead(
  viewer: CrmViewer,
  input: ManualLeadInput,
  now: number = Date.now(),
): CrmResult<ManualLeadAnswer> {
  const fieldErrors: Record<string, string[]> = {};
  if (!(MANUAL_LEAD_SOURCES as readonly string[]).includes(input.source)) fieldErrors.source = ["Choose where this lead came from."];
  if (input.consent !== true) fieldErrors.consent = ["Confirm the family agreed to be contacted."];
  const consentMethod = input.consentMethod ?? null;
  if (consentMethod !== null && !(CONSENT_METHODS as readonly string[]).includes(consentMethod)) {
    fieldErrors.consentMethod = ["Choose how the family agreed."];
  }
  const phone = normalizePhoneE164(input.phone);
  if (!phone) fieldErrors.phone = ["Enter a valid 10-digit mobile number."];
  const fields = cleanFields(input);
  if (!fields.studentName && !fields.guardianName) fieldErrors.studentName = ["Enter the student's or the parent's name."];
  if (input.email && !fields.email) fieldErrors.email = ["Enter a valid email address."];
  // §13.8: the same optional select as the public forms — one of the 12 HP district ids, `outside-hp`, or empty.
  const district = input.district ? input.district.trim() : "";
  if (district !== "" && !(DISTRICT_INPUT_VALUES as readonly string[]).includes(district)) fieldErrors.district = ["Choose a district from the list."];
  if (Object.keys(fieldErrors).length > 0 || !phone) return fail("validation", CRM_MESSAGES.validation, fieldErrors);
  const note = cleanMultiline(input.note, NOTE_MAX);
  const methodMeta: Meta = consentMethod ? { consentMethod } : {};
  const districtInput = district === "" ? null : cleanText(district, PLACE_INPUT_MAX);
  const arrival = {
    source: input.source,
    gate: false,
    manual: true,
    districtInput,
    stateInput: null,
    arrivedAt: now,
    actorId: viewer.userId,
    at: now,
  } as const;

  const db = getDb();
  return withTransaction(db, (): CrmResult<ManualLeadAnswer> => {
    const existing = findLeadByPhone(db, phone);
    if (existing && input.onDuplicate === "report") {
      // Nothing written to the lead: staff decide first whether to open the family or log this
      // visit on it. The check itself is audited (no phone or name), so numbers cannot be probed
      // silently; a lead outside the viewer's scope is reported without its id.
      const canOpen = canSeeLead(viewer, existing);
      const latestConsent = listActivitiesOfTypes(db, existing.id, ["submission", "created", "consent_withdrawn"])[0];
      crmAudit(db, {
        actorId: viewer.userId,
        action: CRM_AUDIT.leadDuplicateCheck,
        target: existing.id,
        details: { source: input.source, canOpen },
        now,
      });
      return ok<ManualLeadDuplicate>({
        leadId: canOpen ? existing.id : null,
        isNew: false,
        duplicate: true,
        canOpen,
        closed: existing.stage === "lost",
        withdrawn: latestConsent?.type === "consent_withdrawn",
      });
    }
    if (existing) {
      const merged = mergeSubmission(existing, fields, cleanContext(undefined), null, existing.consentTextVersion ?? "staff-recorded", existing.consentAt ?? now, now);
      // Staff re-entering a family: never touch consent records, only fill empty fields.
      delete merged.update.consentTextVersion;
      delete merged.update.consentAt;
      merged.update.submissionCount = existing.submissionCount;
      updateLead(db, existing.id, merged.update);
      const reopened = existing.stage === "lost";
      if (reopened) {
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
        meta: { source: input.source, existing: true, filled: merged.filled, ...methodMeta },
        actorId: viewer.userId,
        at: now,
      });
      onLeadArrival(db, { ...arrival, leadId: existing.id, kind: reopened ? "reopened" : "repeat", assignNew: true });
      crmAudit(db, {
        actorId: viewer.userId,
        action: CRM_AUDIT.leadCreate,
        target: existing.id,
        details: { source: input.source, isNew: false },
        now,
      });
      const fresh = findLeadById(db, existing.id) ?? existing;
      return ok({ leadId: existing.id, isNew: false, canOpen: canSeeLead(viewer, fresh) });
    }

    const id = randomUUID();
    const selfAssign = viewer.role === "counsellor";
    insertLead(db, {
      id,
      createdAt: now,
      updatedAt: now,
      stage: "new",
      furthestStage: "new",
      lostReason: null,
      assignedTo: selfAssign ? viewer.userId : null,
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
    insertActivity(db, { leadId: id, type: "created", body: note, meta: { source: input.source, ...methodMeta }, actorId: viewer.userId, at: now });
    if (selfAssign) {
      insertActivity(db, { leadId: id, type: "assignment", meta: { from: null, to: viewer.userId }, actorId: viewer.userId, at: now });
    }
    // A counsellor keeps their own walk-in (self-assign stays); others go through auto-assignment.
    onLeadArrival(db, { ...arrival, leadId: id, kind: "new", assignNew: !selfAssign });
    crmAudit(db, {
      actorId: viewer.userId,
      action: CRM_AUDIT.leadCreate,
      target: id,
      details: { source: input.source, isNew: true },
      now,
    });
    const created = findLeadById(db, id);
    return ok({ leadId: id, isNew: true, canOpen: created ? canSeeLead(viewer, created) : false });
  });
}
