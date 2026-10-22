import type { Messages } from "@/i18n/messages/types";

/**
 * Client-side localisation of field errors. The enquiry contract (src/lib/contracts/enquiry.ts,
 * frozen) produces English zod messages, both in the browser and in the server's 422
 * `fieldErrors`. They are never shown as-is: each is mapped by field (+ "too long" for the two
 * length limits) onto a `forms.shared.errors` key in the page's language. The English catalog
 * repeats the contract's wording, so English pages read exactly as before.
 */
export type FieldErrorMessages = Messages<"forms">["shared"]["errors"];

const TOO_LONG = /too long/i;

/** The localised message for one field error. `message` is the contract's (English) text. */
export function localizeFieldError(field: string, message: string, t: FieldErrorMessages): string {
  switch (field) {
    case "name":
      return TOO_LONG.test(message) ? t.nameTooLong : t.name;
    case "guardianName":
      return TOO_LONG.test(message) ? t.guardianNameTooLong : t.guardianName;
    case "message":
      return t.messageTooLong;
    case "phone":
      return t.phone;
    case "email":
      return t.email;
    case "consent":
      return t.consent;
    case "currentClass":
      return t.currentClass;
    case "programInterest":
      return t.programInterest;
    case "preferredCentre":
      return t.preferredCentre;
    case "district":
      return t.district;
    case "classOrExam":
      return t.classOrExam;
    case "topic":
      return t.topic;
    default:
      return t.generic;
  }
}

/** Localises every message of a `{ field: message }` map, keeping its keys (and their order). */
export function localizeFieldErrors<T extends Partial<Record<string, string>>>(errors: T, t: FieldErrorMessages): T {
  const out: Partial<Record<string, string>> = {};
  for (const [field, message] of Object.entries(errors)) {
    if (message) out[field] = localizeFieldError(field, message, t);
  }
  return out as T;
}
