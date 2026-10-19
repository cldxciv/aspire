/**
 * Pure helpers for EnquiryForm: turn FormData into the contract's request body and
 * map zod/server field errors onto the fields a variant renders.
 * Kept free of React so they can be unit-tested (enquiry-form.test.ts).
 */

import type { EnquiryFormVariant } from "./EnquiryForm";

export type FieldName =
  | "name"
  | "currentClass"
  | "programInterest"
  | "phone"
  | "email"
  | "preferredCentre"
  | "topic"
  | "message"
  | "consent";

export type FieldErrors = Partial<Record<FieldName, string>>;

export type Intent = "enquiry" | "scholarship";

/** DOM order per variant — used to pick (and focus) the first invalid field. */
export const FIELD_ORDER: Record<EnquiryFormVariant, FieldName[]> = {
  quick: ["name", "currentClass", "programInterest", "phone", "consent"],
  admissions: ["name", "currentClass", "programInterest", "phone", "email", "preferredCentre", "message", "consent"],
  contact: ["name", "phone", "email", "topic", "message", "consent"],
};

function text(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Builds the request body exactly as the contract's input type expects.
 * Blank optional fields are omitted. The honeypot is forwarded untouched so the
 * server can drop bot submissions.
 */
export function buildPayload(
  variant: EnquiryFormVariant,
  data: FormData,
  intent: Intent,
  hasCentreField: boolean,
): Record<string, unknown> {
  const optional = (key: string) => text(data, key) || undefined;
  const honeypot = data.get("website");
  const base = {
    source: variant,
    name: text(data, "name"),
    phone: text(data, "phone"),
    consent: data.has("consent"),
    website: typeof honeypot === "string" ? honeypot : "",
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
        message: optional("message"),
      };
    case "contact":
      return {
        ...base,
        email: optional("email"),
        topic: text(data, "topic"),
        message: optional("message"),
      };
  }
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
