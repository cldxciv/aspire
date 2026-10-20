import "server-only";

import type { Locale } from "@/i18n/config";
import { stripLocale } from "@/i18n/paths";
import type { EnquiryContext, EnquirySource } from "@/lib/contracts/enquiry";
import { captureLead, leadContextFromEnquiry, leadInputFromEnquiry, type CaptureLeadInput, type LeadContext } from "@/lib/crm";

import type { ConsentRecord } from "./enquiry-consent";

/**
 * Thin adapter between POST /api/enquiries and the CRM lead store (`src/lib/crm`, docs/crm.md).
 * Owner: CRM-CORE (written by CRM-CAPTURE).
 * The enquiry pipeline only knows this interface, so the handler can be tested with a fake sink
 * and the CRM can change its internals without touching the public form path.
 *
 * Rules for every sink:
 *  - never throw for an expected failure; return `{ ok: false, code }` with a short machine code
 *    (`[a-z0-9_]`, no input, no PII) — the handler logs it as `store_<code>`;
 *  - `duplicate: true` when the phone already had a lead and this submission was appended to it
 *    (D-040) — still a successful capture.
 */

/** One validated public enquiry, ready to become (or be appended to) a lead. */
export interface LeadCaptureInput {
  /** `ENQ-…` reference shown to the visitor; also sent to the webhook, if any. */
  reference: string;
  /** ISO-8601 server time. */
  receivedAt: string;
  source: EnquirySource;
  /** Mobile number normalised to E.164 (`+91` + 10 digits) — the CRM's duplicate key. */
  phone: string;
  /** Student's name (hero, admissions) or the sender's own name (contact). */
  name: string;
  guardianName?: string;
  email?: string;
  currentClass?: string;
  programInterest?: string;
  /** Centre slug or "not-sure" (already checked against the published centres). */
  preferredCentre?: string;
  topic?: string;
  /** Legacy quick form only: "enquiry" | "scholarship". */
  intent?: string;
  message?: string;
  consent: ConsentRecord;
  /** Language of the page the enquiry was sent from. */
  locale: Locale;
  /** Attribution only (page, utm_*, tool, referrer host). */
  context?: EnquiryContext;
}

export type LeadSinkResult =
  | { ok: true; leadId: string; duplicate: boolean }
  | { ok: false; code: string };

export interface LeadSink {
  readonly kind: "crm" | "unavailable" | "custom";
  capture(input: LeadCaptureInput): Promise<LeadSinkResult>;
}

/** Keeps sink failure codes log-safe. */
export function safeSinkCode(code: unknown): string {
  return typeof code === "string" && /^[a-z0-9_]{1,40}$/.test(code) ? code : "unknown";
}

/** For tests / emergencies: every capture fails honestly. */
export const unavailableLeadSink: LeadSink = {
  kind: "unavailable",
  async capture() {
    return { ok: false, code: "crm_unavailable" };
  },
};

/**
 * Attribution in the CRM's shape (`leadContextFromEnquiry`): locale-free page path, referrer host,
 * camelCase utm keys, CRM tool ids ("mock-test" → "mocktest"), the predictor's exam + score band.
 * `locale` is the page language (the context's, else the request's). Undefined when empty.
 */
export function toLeadContext(context: EnquiryContext | undefined, locale?: Locale): LeadContext | undefined {
  const lead = leadContextFromEnquiry(context);
  if (!lead) return undefined;
  if (lead.page) lead.page = stripLocale(lead.page);
  const attribution = Object.entries(lead).some(([key, value]) => key !== "locale" && value !== null);
  if (!attribution) return undefined;
  lead.locale = context?.locale ?? locale ?? null;
  return lead;
}

/**
 * The CRM's input for one capture: the enquiry fields, the consent (version, time, language and
 * the exact sentence shown — kept on the submission activity as proof), the reference and the
 * attribution context with the page language and the predictor's exam + band.
 */
export function toCaptureLeadInput(input: LeadCaptureInput): CaptureLeadInput {
  const base = leadInputFromEnquiry(input, {
    consentTextVersion: input.consent.version,
    consentAt: Date.parse(input.consent.givenAt),
    context: toLeadContext(input.context, input.locale) ?? { locale: input.locale },
    reference: input.reference,
  });
  return { ...base, consent: { ...base.consent, locale: input.consent.locale, text: input.consent.text } };
}

/** The CRM lead store (CRM-CORE `captureLead`, D-037 – D-040): synchronous SQLite, dedupes by phone. */
export const crmLeadSink: LeadSink = {
  kind: "crm",
  async capture(input) {
    let result: ReturnType<typeof captureLead>;
    try {
      result = captureLead(toCaptureLeadInput(input), Date.parse(input.receivedAt));
    } catch {
      // Database error (locked, disk, schema). Its message may echo data: never log it.
      return { ok: false, code: "db_error" };
    }
    return result.ok ? { ok: true, leadId: result.leadId, duplicate: !result.isNew } : { ok: false, code: safeSinkCode(result.error) };
  },
};

/** The sink POST /api/enquiries uses. */
export function getLeadSink(): LeadSink {
  return crmLeadSink;
}
