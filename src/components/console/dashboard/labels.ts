/**
 * Words and small formatters of "your numbers" (owner: 1B-NUMBERS). Pure and client-safe. The
 * console pages pick a language with `numbersMessages(locale)`; channel names are shared with
 * "Where enquiries come from" (1B-SOURCES), so a channel reads the same on both pages.
 */
import { CRM_TIME_ZONE } from "@/components/crm/format";
import { htmlLang, type Locale } from "@/i18n/config";
import numbersEn from "@/i18n/messages/en/console-numbers";
import numbersHi from "@/i18n/messages/hi/console-numbers";
import sourcesEn from "@/i18n/messages/en/console-sources";
import sourcesHi from "@/i18n/messages/hi/console-sources";
import type { Channel } from "@/lib/crm/console/types";
import { pick } from "../shared/messages";

export type NumbersMessages = typeof numbersEn;

/** The "your numbers" words in `locale`. */
export function numbersMessages(locale: Locale): NumbersMessages {
  return pick(locale, numbersEn, numbersHi);
}

/** A channel's name in `locale` (the same words as the sources page). */
export function channelLabel(channel: Channel, locale: Locale): string {
  return pick(locale, sourcesEn, sourcesHi).channelNames[channel];
}

/** "10:42" (IST, 24-hour, Latin digits) of an ISO time. */
export function istTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CRM_TIME_ZONE, numberingSystem: "latn" }).format(Date.parse(iso));
}

/** "21 Oct 2026" (IST, Latin digits) of an ISO time. */
export function istDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang[locale], { day: "numeric", month: "short", year: "numeric", timeZone: CRM_TIME_ZONE, numberingSystem: "latn" }).format(Date.parse(iso));
}
