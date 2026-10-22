/**
 * Pure helpers for EnquiryForm: turn FormData into the contract's request body and
 * map zod/server field errors onto the fields a variant renders.
 * Kept free of React so they can be unit-tested (enquiry-form.test.ts).
 */

import { HP_DISTRICTS } from "@/content/hp-districts";
import type { Locale } from "@/i18n/config";
import type { EnquiryContext } from "@/lib/contracts/enquiry";
import { HP_DISTRICT_IDS, OUTSIDE_HP } from "@/lib/crm/lead-ops-types";
import type { EnquiryFormVariant } from "./EnquiryForm";

export type FieldName =
  | "name"
  | "currentClass"
  | "programInterest"
  | "phone"
  | "email"
  | "preferredCentre"
  | "district"
  | "topic"
  | "message"
  | "consent";

export type FieldErrors = Partial<Record<FieldName, string>>;

export type Intent = "enquiry" | "scholarship";

/** DOM order per variant — used to pick (and focus) the first invalid field. */
export const FIELD_ORDER: Record<EnquiryFormVariant, FieldName[]> = {
  quick: ["name", "currentClass", "programInterest", "phone", "consent"],
  admissions: ["name", "currentClass", "programInterest", "phone", "email", "preferredCentre", "district", "message", "consent"],
  contact: ["name", "phone", "email", "topic", "district", "message", "consent"],
};

/** Centre values that mean "no centre chosen": the district select is shown for them (§13.8). */
export function needsDistrict(centre: string | null | undefined): boolean {
  return !centre || centre === "not-sure";
}

/**
 * The district select's options (lead routing §13.8): Himachal's 12 districts in the page's
 * language (names from src/content/hp-districts.ts, values = the contract's ids), then "Outside
 * Himachal". Sorted by the visible name.
 */
export function districtOptions(locale: Locale, outsideLabel: string): { value: string; label: string }[] {
  const names = new Map(HP_DISTRICTS.map((district) => [district.id as string, locale === "hi" ? district.hi : district.en]));
  const districts = HP_DISTRICT_IDS.map((id) => ({ value: id as string, label: names.get(id) ?? id })).sort((a, b) =>
    a.label.localeCompare(b.label, locale === "hi" ? "hi" : "en"),
  );
  return [...districts, { value: OUTSIDE_HP, label: outsideLabel }];
}

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Builds the request body exactly as the contract's input type expects.
 * Blank optional fields are omitted. The honeypot is forwarded untouched so the
 * server can drop bot submissions. `consentVersion` comes from ConsentField's hidden input;
 * `context` (attribution, D-039) is collected by the form at submit time and omitted when empty.
 */
export function buildPayload(
  variant: EnquiryFormVariant,
  data: FormData,
  intent: Intent,
  hasCentreField: boolean,
  context?: EnquiryContext,
): Record<string, unknown> {
  const optional = (key: string) => text(data, key) || undefined;
  const honeypot = data.get("website");
  const base = {
    source: variant,
    name: text(data, "name"),
    phone: text(data, "phone"),
    consent: data.has("consent"),
    consentVersion: text(data, "consentVersion"),
    website: typeof honeypot === "string" ? honeypot : "",
    ...(context ? { context } : {}),
  };

  switch (variant) {
    case "quick":
      return {
        ...base,
        currentClass: text(data, "currentClass"),
        programInterest: text(data, "programInterest"),
        intent,
      };
    case "admissions":
      return {
        ...base,
        currentClass: text(data, "currentClass"),
        programInterest: text(data, "programInterest"),
        email: optional("email"),
        preferredCentre: hasCentreField ? optional("preferredCentre") : undefined,
        // Only rendered (so only sent) while no centre is chosen (§13.8).
        district: optional("district"),
        message: optional("message"),
      };
    case "contact":
      return {
        ...base,
        email: optional("email"),
        topic: text(data, "topic"),
        district: optional("district"),
        message: optional("message"),
      };
  }
}

/**
 * Request body of the home hero 3-step form (`source: "hero"`, D-021 / D-021a), exactly as
 * POSTed: the raw `classOrExam` value (the server maps it to class + program), required fields
 * as `""` when blank, blank optional fields omitted. The hero form has no email field, so no
 * `email` is ever sent (the contract keeps it optional).
 */
export type HeroPayload = {
  source: "hero";
  name: string;
  classOrExam: string;
  guardianName: string;
  phone: string;
  preferredCentre?: string;
  /** Lead routing (§13.8): sent only while no centre is chosen. */
  district?: string;
  message?: string;
  consent: boolean;
  /** From ConsentField's hidden input (step 3). */
  consentVersion: string;
  website: string;
  /** Attribution (D-039); omitted when empty. */
  context?: EnquiryContext;
};

/**
 * Builds the hero payload from the whole form (every step's fieldset stays mounted, so one
 * FormData has all three steps). The centre is only read when the centre select is rendered.
 */
export function buildHeroPayload(data: FormData, hasCentreField: boolean, context?: EnquiryContext): HeroPayload {
  const optional = (key: string) => text(data, key) || undefined;
  const honeypot = data.get("website");
  return {
    source: "hero",
    name: text(data, "name"),
    classOrExam: text(data, "classOrExam"),
    guardianName: text(data, "guardianName"),
    phone: text(data, "phone"),
    preferredCentre: hasCentreField ? optional("preferredCentre") : undefined,
    district: optional("district"),
    message: optional("message"),
    consent: data.has("consent"),
    consentVersion: text(data, "consentVersion"),
    website: typeof honeypot === "string" ? honeypot : "",
    ...(context ? { context } : {}),
  };
}

/** Keeps the first message for each field this variant renders, in DOM order. */
export function pickErrors(fieldErrors: Record<string, string[] | undefined>, order: FieldName[]): FieldErrors {
  const picked: FieldErrors = {};
  for (const field of order) {
    const message = fieldErrors[field]?.[0];
    if (message) picked[field] = message;
  }
  return picked;
}
