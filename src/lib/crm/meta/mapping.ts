/**
 * A Graph lead → the `captureLead` input (docs/lead-routing-plan.md §18.3) — pure. Question names
 * map through `meta_config.fieldMap` (a super admin's choice) or CORE's `guessTarget`; values go
 * through CORE's shared normalisers (`intake/fields.ts`). Nothing the family typed is dropped
 * silently: unmapped answers, and answers a normaliser cannot read, are kept as `answers` (≤ 1000).
 *
 * Consent (H4): `meta:<form_id>` plus `:cb` when the form's configured consent checkbox (or a
 * question mapped to `consentChecked`) was ticked; `at = created_time`; method `meta_lead_form`.
 * Without it the submission says `consentConfirmed: false` and the lead page asks staff to confirm
 * consent on the first call.
 */
import { CAPTURE_ANSWERS_MAX, META_LEAD_SOURCE, type ImportTarget, type MetaConfig } from "../lead-ops-types";
import type { CaptureLeadInput, SubmissionMeta } from "../types";
import {
  cleanPhoneInput,
  guessTarget,
  joinAnswers,
  matchCentre,
  normaliseClass,
  normaliseProgram,
  normaliseSubmittedBy,
  parseBooleanAnswer,
  parseMetaObjectId,
  parseMetaTime,
  platformCode,
  utmSourceForPlatform,
  type CentreOption,
} from "../intake/fields";
import type { GraphLead } from "./graph";

export interface MappedMetaLead {
  input: CaptureLeadInput;
  answers: string | null;
  submissionMeta: SubmissionMeta;
  /** Meta's `created_time` (epoch ms), null when unreadable. */
  createdAt: number | null;
  consentConfirmed: boolean;
  /** Meta's Testing Tool dummy data (`<test lead: dummy data for …>`). */
  dummy: boolean;
  formId: string | null;
}

const DUMMY = /^\s*<\s*test lead/i;

/** The first string value of each question (Graph sends `values: string[]`). */
function firstValues(lead: GraphLead): { name: string; value: string }[] {
  const seen = new Set<string>();
  const out: { name: string; value: string }[] = [];
  for (const field of Array.isArray(lead.field_data) ? lead.field_data.slice(0, 100) : []) {
    const name = typeof field?.name === "string" ? field.name.slice(0, 120) : "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const value = Array.isArray(field.values) ? field.values.find((item): item is string => typeof item === "string") : undefined;
    out.push({ name, value: (value ?? "").slice(0, 2000) });
  }
  return out;
}

const isChecked = (value: unknown) => value === true || value === 1 || value === "1" || value === "true";

const labelOf = (name: string) => name.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

/** Whether a lead (from the bulk read or the node) is Meta's dummy test data. */
export function isDummyLead(lead: GraphLead): boolean {
  return firstValues(lead).some(({ value }) => DUMMY.test(value));
}

export function targetFor(name: string, fieldMap: Readonly<Record<string, ImportTarget>>): ImportTarget {
  return Object.hasOwn(fieldMap, name) ? fieldMap[name] : guessTarget(name);
}

export function mapMetaLead(lead: GraphLead, context: { config: MetaConfig; centres: readonly CentreOption[] }): MappedMetaLead {
  const { config, centres } = context;
  const values = firstValues(lead);
  const answers: { label: string; value: string }[] = [];
  const picked: Partial<Record<ImportTarget, string>> = {};
  let districtFromCity: string | null = null;
  let consentAnswer: boolean | null = null;
  let currentClass: string | null = null;
  let programInterest: string | null = null;
  let centreSlug: string | null = null;
  let submittedBy: "student" | "parent" | null = null;

  for (const { name, value } of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const target = targetFor(name, config.fieldMap);
    const keep = () => answers.push({ label: labelOf(name), value: trimmed });
    switch (target) {
      case "ignore":
        break;
      case "answer":
        keep();
        break;
      case "contactName":
      case "studentName":
      case "guardianName":
      case "email":
      case "state":
        picked[target] ??= trimmed;
        break;
      case "phone":
        picked.phone ??= cleanPhoneInput(trimmed) ?? trimmed;
        break;
      case "district":
        // Facebook pre-fills `city` from profiles (often Chandigarh or Delhi): an explicit district
        // question wins over it (A8).
        if (name.trim().toLowerCase() === "city") districtFromCity ??= trimmed;
        else picked.district ??= trimmed;
        break;
      case "currentClass":
        currentClass ??= normaliseClass(trimmed);
        if (!normaliseClass(trimmed)) keep();
        break;
      case "programInterest":
        programInterest ??= normaliseProgram(trimmed);
        if (!normaliseProgram(trimmed)) keep();
        break;
      case "centre":
        centreSlug ??= matchCentre(trimmed, centres);
        if (!matchCentre(trimmed, centres)) keep();
        break;
      case "submittedBy":
        submittedBy ??= normaliseSubmittedBy(trimmed);
        if (!normaliseSubmittedBy(trimmed)) keep();
        break;
      case "consentChecked":
        consentAnswer ??= parseBooleanAnswer(trimmed);
        break;
      default:
        // Ids, dates, ad / campaign names: taken from the lead node, never from answers.
        break;
    }
  }

  const formId = parseMetaObjectId(lead.form_id ?? "") ?? null;
  const form = formId ? config.forms.find((candidate) => candidate.id === formId) : undefined;
  const checkboxKey = form?.consentCheckboxKey ?? null;
  const responses = Array.isArray(lead.custom_disclaimer_responses) ? lead.custom_disclaimer_responses : [];
  const ticked = checkboxKey !== null && responses.some((response) => response?.checkbox_key === checkboxKey && isChecked(response.is_checked));
  const consentConfirmed = ticked || consentAnswer === true;

  const createdIso = parseMetaTime(lead.created_time ?? "");
  const createdAt = createdIso ? Date.parse(createdIso) : null;
  const adId = parseMetaObjectId(lead.ad_id ?? "");
  const campaignId = parseMetaObjectId(lead.campaign_id ?? "");
  const text = (value: unknown, max = 100) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

  const input: CaptureLeadInput = {
    source: META_LEAD_SOURCE,
    contactName: picked.contactName ?? null,
    studentName: picked.studentName ?? null,
    guardianName: picked.guardianName ?? null,
    phone: picked.phone ?? "",
    email: picked.email ?? null,
    currentClass,
    programInterest: programInterest ?? form?.defaults.programInterest ?? null,
    centreSlug: centreSlug ?? form?.defaults.centreSlug ?? null,
    consent: { textVersion: `meta:${formId ?? "unknown"}${consentConfirmed ? ":cb" : ""}`, ...(createdAt !== null ? { at: createdAt } : {}), method: "meta_lead_form" },
    context: {
      utmSource: utmSourceForPlatform(lead.platform),
      utmMedium: "lead_ad",
      utmCampaign: text(lead.campaign_name) ?? campaignId,
      utmContent: text(lead.ad_name) ?? adId,
      utmTerm: text(lead.adset_name),
    },
    submittedBy,
    district: picked.district ?? districtFromCity,
    state: picked.state ?? null,
  };

  const submissionMeta: SubmissionMeta = { consentConfirmed };
  if (createdIso) submissionMeta.metaCreatedAt = createdIso;
  if (formId) submissionMeta.formId = formId;
  if (adId) submissionMeta.adId = adId;
  if (campaignId) submissionMeta.campaignId = campaignId;
  const platform = platformCode(lead.platform);
  if (platform) submissionMeta.platform = platform;
  const organic = lead.is_organic === true || lead.is_organic === "true" || lead.is_organic === 1 ? true : lead.is_organic === false || lead.is_organic === "false" || lead.is_organic === 0 ? false : null;
  if (organic !== null) submissionMeta.organic = organic;

  return {
    input,
    answers: joinAnswers(answers, CAPTURE_ANSWERS_MAX),
    submissionMeta,
    createdAt,
    consentConfirmed,
    dummy: values.some(({ value }) => DUMMY.test(value)),
    formId,
  };
}
