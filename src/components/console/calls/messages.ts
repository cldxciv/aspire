/**
 * The console-calls words (src/i18n/messages/{en,hi}/console-calls.ts; owner: 1B-CALLS). Server
 * parents pick one language with `callsMessages(locale)` and pass it to the client islands as a
 * prop (src/i18n/README.md); client files import only the `CallsMessages` TYPE from here.
 */
import type { Locale } from "@/i18n/config";
import consoleCallsEn from "@/i18n/messages/en/console-calls";
import consoleCallsHi from "@/i18n/messages/hi/console-calls";
import { pick } from "../shared/messages";

export type CallsMessages = typeof consoleCallsEn;

export function callsMessages(locale: Locale): CallsMessages {
  return pick(locale, consoleCallsEn, consoleCallsHi);
}
