import { z } from "zod";

import { collectEnquiryContext } from "@/components/forms/enquiry-context";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages/types";
import { enquiryContextSchema, type EnquiryContext } from "@/lib/contracts/enquiry";
import {
  LEAD_GATE_ERRORS,
  LEAD_GATE_FIELDS,
  leadGateSubmitSchema,
  PREDICTOR_BAND_PATTERN,
  type LeadGateField,
  type LeadGateTool,
} from "@/lib/lead-gate/contract";

/**
 * Pure helpers behind <LeadGateForm> (client-safe, no React): the request body, client-side
 * validation with the shared contract schema, localisation of field errors, and attribution.
 */

export type LeadGateErrorMessages = Messages<"leadGate">["errors"];
export type LeadGateFieldErrors = Partial<Record<LeadGateField, string>>;

/** Predictor only: the exam and score band the visitor is about to see (never the exact score). */
export interface LeadGateSummary {
  exam?: string;
  band?: string;
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** The POST /api/lead-gate body from the form's fields (hidden consentVersion and honeypot included). */
export function buildLeadGatePayload(form: FormData, tool: LeadGateTool, context: EnquiryContext | undefined): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    studentName: text(form, "studentName"),
    phone: text(form, "phone"),
    currentClass: text(form, "currentClass"),
    submittedBy: text(form, "submittedBy"),
    consent: form.get("consent") !== null,
    consentVersion: text(form, "consentVersion"),
    tool,
    website: text(form, "website"),
  };
  if (context) payload.context = context;
  return payload;
}

/** First message per known field, in display order. */
export function pickLeadGateErrors(fieldErrors: Record<string, string[] | undefined>): LeadGateFieldErrors {
  const out: LeadGateFieldErrors = {};
  for (const field of LEAD_GATE_FIELDS) {
    const message = fieldErrors[field]?.[0];
    if (message) out[field] = message;
  }
  return out;
}

export type LeadGateValidation =
  | { ok: true }
  /** Field errors to show (English contract messages). */
  | { ok: false; fieldErrors: LeadGateFieldErrors }
  /** The page's consent version is not accepted any more: reload. */
  | { ok: false; staleConsent: true };

/** Client-side validation with the contract schema (the server re-validates). */
export function validateLeadGatePayload(payload: Record<string, unknown>): LeadGateValidation {
  const parsed = leadGateSubmitSchema.safeParse(payload);
  if (parsed.success) return { ok: true };
  const flat = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
  const fieldErrors = pickLeadGateErrors(flat);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  if (flat.consentVersion) return { ok: false, staleConsent: true };
  return { ok: false, fieldErrors: { consent: LEAD_GATE_ERRORS.consent } };
}

/** The localised message for one field error (`message` = the contract's English text). */
export function localizeLeadGateError(field: string, message: string, t: LeadGateErrorMessages): string {
  switch (field) {
    case "studentName":
      return message === LEAD_GATE_ERRORS.studentNameTooLong ? t.studentNameTooLong : t.studentName;
    case "phone":
      return message === LEAD_GATE_ERRORS.phoneImplausible ? t.phoneImplausible : t.phone;
    case "currentClass":
      return t.currentClass;
    case "submittedBy":
      return t.submittedBy;
    case "consent":
      return t.consent;
    default:
      return t.generic;
  }
}

export function localizeLeadGateErrors(errors: LeadGateFieldErrors, t: LeadGateErrorMessages): LeadGateFieldErrors {
  const out: LeadGateFieldErrors = {};
  for (const field of LEAD_GATE_FIELDS) {
    const message = errors[field];
    if (message) out[field] = localizeLeadGateError(field, message, t);
  }
  return out;
}

/**
 * Attribution for a gate submit: the visit's context (page, locale, utm_*, referrer host) with the
 * tool forced to the gate's tool, and for the predictor the exam + band being unlocked.
 * Validated with the enquiry contract's lenient schema (anything invalid is dropped).
 */
export function leadGateContextFrom(base: EnquiryContext | undefined, tool: LeadGateTool, summary?: LeadGateSummary): EnquiryContext | undefined {
  const raw: Record<string, unknown> = { ...(base ?? {}), tool, toolExam: undefined, toolBand: undefined };
  if (tool === "predictor" && summary) {
    if (summary.exam) raw.toolExam = summary.exam;
    if (summary.band && PREDICTOR_BAND_PATTERN.test(summary.band)) raw.toolBand = summary.band;
  }
  const parsed = enquiryContextSchema.safeParse(raw);
  return parsed.success ? parsed.data : { tool };
}

/** `leadGateContextFrom` for the current page (window); undefined on the server. */
export function collectLeadGateContext(locale: Locale, tool: LeadGateTool, summary?: LeadGateSummary): EnquiryContext | undefined {
  if (typeof window === "undefined") return undefined;
  return leadGateContextFrom(collectEnquiryContext(locale), tool, summary);
}
