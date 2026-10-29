/**
 * The console-family words (src/i18n/messages/{en,hi}/console-family.ts; owner: 1B-FAMILY): more
 * details, possible duplicates, lost review and the Enquiries quick views and chips. Server parents
 * pick one language with `familyMessages(locale)` and pass it to client islands as a prop; client
 * files import only the `FamilyMessages` TYPE from here.
 */
import type { Locale } from "@/i18n/config";
import consoleFamilyEn from "@/i18n/messages/en/console-family";
import consoleFamilyHi from "@/i18n/messages/hi/console-family";
import { pick } from "../shared/messages";

export type FamilyMessages = typeof consoleFamilyEn;

export function familyMessages(locale: Locale): FamilyMessages {
  return pick(locale, consoleFamilyEn, consoleFamilyHi);
}
