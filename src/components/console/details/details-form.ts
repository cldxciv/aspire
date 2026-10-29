/**
 * The "More details" form ↔ PUT /api/crm/leads/[leadId]/details (docs/admin-phase-1b-plan.md
 * §5.E; owner: 1B-FAMILY). Pure and client-safe: the dialog keeps every field as a string; this
 * file turns the changed ones into the partial body, with the same rules as the server (the
 * Add-enquiry phone normaliser, not the main number, text limits).
 */
import type { CrmRequest } from "@/components/crm/api";
import { checkAltPhone, REFERRED_BY_MAX, SCHOOL_MAX } from "@/lib/crm/console/details/rules";
import type { LeadDetailsPatch } from "@/lib/crm/console/details/schemas";
import { LEAD_DETAIL_FIELDS, type LeadDetailField, type LeadMoreDetails } from "@/lib/crm/console/types";
import { familyRequests } from "./api";

export type DetailFormValues = Record<LeadDetailField, string>;
export type DetailFormIssue = "altPhoneInvalid" | "altPhoneSame" | "tooLong";

/** Text fields and their limits. */
export const DETAIL_TEXT_MAX: Readonly<Partial<Record<LeadDetailField, number>>> = { school: SCHOOL_MAX, referredBy: REFERRED_BY_MAX };

/** "+919876500000" → "9876500000" (what staff type); other values unchanged. */
function nationalNumber(e164: string | null): string {
  if (!e164) return "";
  return /^\+91\d{10}$/.test(e164) ? e164.slice(3) : e164;
}

/** Saved details as form values ("" for not recorded). */
export function detailFormValues(details: LeadMoreDetails): DetailFormValues {
  const values = {} as DetailFormValues;
  for (const field of LEAD_DETAIL_FIELDS) {
    const value = details[field];
    values[field] = field === "altPhone" ? nationalNumber(details.altPhone) : value === null || value === undefined ? "" : String(value);
  }
  return values;
}

function cleanTyped(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export type DetailsRequestResult =
  | { ok: true; request: CrmRequest; fields: LeadDetailField[] }
  | { ok: false; nothing: true }
  | { ok: false; nothing?: false; issues: Partial<Record<LeadDetailField, DetailFormIssue>> };

/**
 * Only the fields that changed (a cleared field → `null`), checked like the server. `nothing` when
 * no field changed (no request is sent). `mainPhone` is the family's main number (E.164).
 */
export function detailsRequest(leadId: string, initial: LeadMoreDetails, values: DetailFormValues, mainPhone: string | null): DetailsRequestResult {
  const issues: Partial<Record<LeadDetailField, DetailFormIssue>> = {};
  const patch: LeadDetailsPatch = {};
  const fields: LeadDetailField[] = [];
  const set = (field: LeadDetailField, value: string | number | null) => {
    if (value === (initial[field] ?? null)) return;
    (patch as Record<string, unknown>)[field] = value;
    fields.push(field);
  };

  const phone = checkAltPhone(values.altPhone, mainPhone);
  if (!phone.ok) issues.altPhone = phone.issue;
  else set("altPhone", phone.value);

  for (const field of ["school", "referredBy"] as const) {
    const text = cleanTyped(values[field]);
    if (text.length > (DETAIL_TEXT_MAX[field] ?? 0)) issues[field] = "tooLong";
    else set(field, text === "" ? null : text);
  }
  for (const field of ["board", "hostel", "targetExam", "heardVia", "intakeSession", "preferredTime", "decisionMaker"] as const) {
    set(field, values[field] === "" ? null : values[field]);
  }
  const year = values.targetYear.trim();
  set("targetYear", year === "" ? null : Number(year));

  if (Object.keys(issues).length > 0) return { ok: false, issues };
  if (fields.length === 0) return { ok: false, nothing: true };
  return { ok: true, request: familyRequests.saveDetails(leadId, patch), fields };
}
