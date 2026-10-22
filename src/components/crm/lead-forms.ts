/**
 * Pure form logic behind the lead-detail islands (client-safe, unit-tested): each turns the
 * form's raw values into either a localisable validation issue or the exact CRM request.
 */
import { DISTRICT_INPUT_VALUES } from "@/lib/crm/lead-ops-types";
import { normalizePhoneE164 } from "@/lib/crm/pure";
import {
  CONSENT_METHODS,
  CONTACT_CHANNELS,
  EDITABLE_LEAD_FIELDS,
  ERASE_REASONS,
  isLeadStage,
  isLostReason,
  MANUAL_LEAD_SOURCES,
  type ConsentMethod,
  type ContactChannel,
  type ContactOutcome,
  type EditableLeadField,
  type EraseReason,
  type LeadStage,
  type ManualDuplicateMode,
  type ManualLeadSource,
} from "@/lib/crm/types";
import { crmRequests, type CrmRequest, type NewLeadBody } from "./api";
import { istDueAt } from "./format";
import { OUTCOMES_BY_CHANNEL } from "./types";

export const NOTE_MAX = 2000;
export const TASK_TITLE_MAX = 200;

export type FormResult<Issue extends string> = { ok: true; request: CrmRequest } | { ok: false; issue: Issue };

/** Stage change: moving to `lost` needs a reason; anything else goes straight through. */
export function stageChangeRequest(
  leadId: string,
  stage: string,
  lostReason?: string,
): FormResult<"invalidStage" | "reasonRequired"> {
  if (!isLeadStage(stage)) return { ok: false, issue: "invalidStage" };
  if (stage === "lost") {
    if (!isLostReason(lostReason)) return { ok: false, issue: "reasonRequired" };
    return { ok: true, request: crmRequests.changeStage(leadId, "lost", lostReason) };
  }
  return { ok: true, request: crmRequests.changeStage(leadId, stage) };
}

/** Whether choosing `next` from `current` must open the lost-reason dialog first. */
export function needsLostReason(current: LeadStage, next: string): boolean {
  return next === "lost" && current !== "lost";
}

export function isContactChannel(value: unknown): value is ContactChannel {
  return typeof value === "string" && (CONTACT_CHANNELS as readonly string[]).includes(value);
}

/** "Log this call / message": channel + an outcome valid for it + optional note. */
export function logContactRequest(
  leadId: string,
  input: { channel: string; outcome: string; note?: string },
): FormResult<"outcomeRequired" | "noteTooLong"> {
  if (!isContactChannel(input.channel)) return { ok: false, issue: "outcomeRequired" };
  const outcomes = OUTCOMES_BY_CHANNEL[input.channel] as readonly string[];
  if (!outcomes.includes(input.outcome)) return { ok: false, issue: "outcomeRequired" };
  if ((input.note ?? "").trim().length > NOTE_MAX) return { ok: false, issue: "noteTooLong" };
  return {
    ok: true,
    request: crmRequests.logContact(leadId, { channel: input.channel, outcome: input.outcome as ContactOutcome, note: input.note }),
  };
}

export function noteRequest(leadId: string, body: string): FormResult<"required" | "tooLong"> {
  const text = body.trim();
  if (!text) return { ok: false, issue: "required" };
  if (text.length > NOTE_MAX) return { ok: false, issue: "tooLong" };
  return { ok: true, request: crmRequests.addNote(leadId, text) };
}

export function taskRequest(
  leadId: string,
  input: { title: string; date: string; time?: string },
): FormResult<"titleRequired" | "dueRequired"> {
  const title = input.title.trim();
  if (!title || title.length > TASK_TITLE_MAX) return { ok: false, issue: "titleRequired" };
  const dueAt = istDueAt(input.date, input.time);
  if (!dueAt) return { ok: false, issue: "dueRequired" };
  return { ok: true, request: crmRequests.createTask(leadId, { title, dueAt }) };
}

// ---------------------------------------------------------------------------------------------
// "Add enquiry" (admin-console plan §8, Agent B)

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const NAME_MAX = 80;

export type ManualLeadValues = {
  source: string;
  studentName: string;
  guardianName: string;
  phone: string;
  email: string;
  currentClass: string;
  programInterest: string;
  centreSlug: string;
  /** Lead routing (§13.8): an HP district id or `outside-hp`; only sent while no centre is chosen. */
  district: string;
  note: string;
  consentMethod: string;
  consent: boolean;
};

export const EMPTY_MANUAL_LEAD: ManualLeadValues = {
  source: "walk_in",
  studentName: "",
  guardianName: "",
  phone: "",
  email: "",
  currentClass: "",
  programInterest: "",
  centreSlug: "",
  district: "",
  note: "",
  consentMethod: "",
  consent: false,
};

export type ManualLeadField = "source" | "name" | "phone" | "email" | "note" | "consentMethod" | "consent";
export type ManualLeadIssue = "required" | "invalid" | "tooLong";

function nameIssue(value: string): ManualLeadIssue | null {
  const name = value.trim();
  if (!name) return null;
  if (name.length < 2) return "invalid";
  return name.length > NAME_MAX ? "tooLong" : null;
}

/**
 * The "Add enquiry" form → POST /api/crm/leads, or per-field issues (same rules as the server:
 * a valid source, the student's or the parent's name, an Indian mobile number, a valid email if
 * given, how the family agreed, and the consent tick). `onDuplicate: "report"` first, so a family
 * already on file is only reported; "Log a visit" sends the same form again with `"append"`.
 */
export function manualLeadRequest(
  values: ManualLeadValues,
  onDuplicate: ManualDuplicateMode = "report",
): { ok: true; request: CrmRequest } | { ok: false; issues: Partial<Record<ManualLeadField, ManualLeadIssue>> } {
  const issues: Partial<Record<ManualLeadField, ManualLeadIssue>> = {};
  if (!(MANUAL_LEAD_SOURCES as readonly string[]).includes(values.source)) issues.source = "required";
  const student = nameIssue(values.studentName);
  const guardian = nameIssue(values.guardianName);
  if (student || guardian) issues.name = student ?? guardian ?? "invalid";
  else if (!values.studentName.trim() && !values.guardianName.trim()) issues.name = "required";
  if (!values.phone.trim()) issues.phone = "required";
  else if (!normalizePhoneE164(values.phone)) issues.phone = "invalid";
  const email = values.email.trim();
  if (email && (email.length > 254 || !EMAIL.test(email))) issues.email = "invalid";
  if (values.note.trim().length > NOTE_MAX) issues.note = "tooLong";
  if (!(CONSENT_METHODS as readonly string[]).includes(values.consentMethod)) issues.consentMethod = "required";
  if (values.consent !== true) issues.consent = "required";
  if (Object.keys(issues).length > 0) return { ok: false, issues };

  // `district` is the routing select (§13.8): the server's schema takes it; CORE's NewLeadBody predates it.
  const body: NewLeadBody & { district?: string } = {
    source: values.source as ManualLeadSource,
    phone: values.phone.trim(),
    consent: true,
    consentMethod: values.consentMethod as ConsentMethod,
    onDuplicate,
  };
  const optional = {
    studentName: values.studentName.trim().replace(/\s+/g, " "),
    guardianName: values.guardianName.trim().replace(/\s+/g, " "),
    email: email.toLowerCase(),
    currentClass: values.currentClass.trim(),
    programInterest: values.programInterest.trim(),
    centreSlug: values.centreSlug.trim(),
    note: values.note.trim(),
  };
  for (const [key, value] of Object.entries(optional) as [keyof typeof optional, string][]) if (value) body[key] = value;
  const district = values.district.trim();
  if (!body.centreSlug && (DISTRICT_INPUT_VALUES as readonly string[]).includes(district)) body.district = district;
  return { ok: true, request: crmRequests.createLead(body) };
}

// ---------------------------------------------------------------------------------------------
// "Edit details" (existing PATCH /api/crm/leads/:id `fields`)

export type DetailValues = Record<EditableLeadField, string>;
export type DetailIssue = "invalid" | "tooLong";

/** A lead's editable fields as form values ("" for empty). */
export function detailValues(lead: Partial<Record<EditableLeadField, string | null>>): DetailValues {
  return Object.fromEntries(EDITABLE_LEAD_FIELDS.map((field) => [field, lead[field] ?? ""])) as DetailValues;
}

/**
 * Only the fields that changed (a cleared field → `null`), checked like the server: names 2–80
 * characters, a valid email. `nothing` when no field changed (no request is sent).
 */
export function editDetailsRequest(
  leadId: string,
  initial: DetailValues,
  values: DetailValues,
):
  | { ok: true; request: CrmRequest; changed: EditableLeadField[] }
  | { ok: false; nothing: true }
  | { ok: false; nothing?: false; issues: Partial<Record<EditableLeadField, DetailIssue>> } {
  const issues: Partial<Record<EditableLeadField, DetailIssue>> = {};
  const fields: Partial<Record<EditableLeadField, string | null>> = {};
  for (const field of EDITABLE_LEAD_FIELDS) {
    const before = (initial[field] ?? "").trim();
    let after = (values[field] ?? "").trim();
    if (field === "studentName" || field === "guardianName" || field === "contactName") {
      after = after.replace(/\s+/g, " ");
      const issue = nameIssue(after);
      if (issue) issues[field] = issue === "tooLong" ? "tooLong" : "invalid";
    } else if (field === "email") {
      after = after.toLowerCase();
      if (after && (after.length > 254 || !EMAIL.test(after))) issues[field] = "invalid";
    }
    if (after !== before) fields[field] = after === "" ? null : after;
  }
  if (Object.keys(issues).length > 0) return { ok: false, issues };
  const changed = Object.keys(fields) as EditableLeadField[];
  if (changed.length === 0) return { ok: false, nothing: true };
  return { ok: true, request: crmRequests.updateDetails(leadId, fields), changed };
}

// ---------------------------------------------------------------------------------------------
// "Erase" (admins; existing POST /api/crm/leads/:id/erase)

/** The typed confirmation must equal `word` exactly (after trimming; case-sensitive, like GitHub's). */
export function eraseRequest(
  leadId: string,
  input: { typed: string; word: string; reason: string },
): FormResult<"reasonRequired" | "wordMismatch"> {
  if (!(ERASE_REASONS as readonly string[]).includes(input.reason)) return { ok: false, issue: "reasonRequired" };
  if (input.typed.trim() !== input.word) return { ok: false, issue: "wordMismatch" };
  return { ok: true, request: crmRequests.erase(leadId, input.reason as EraseReason) };
}
