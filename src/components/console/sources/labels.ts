/**
 * Labels and date text for "Where enquiries come from" (owner: 1B-SOURCES). Pure, client-safe.
 * Dates are IST calendar days (`YYYY-MM-DD`); digits stay Latin in both languages.
 */
import { CRM_TIME_ZONE, formatDate, istDayStart } from "@/components/crm/format";
import { htmlLang, type Locale } from "@/i18n/config";
import type en from "@/i18n/messages/en/console-sources";
import type { Channel } from "@/lib/crm/console/types";
import type { TrendSeries } from "@/lib/crm/console/sources/types";

export type SourcesMessages = typeof en;

/** A channel's (or "Others") name. */
export function channelName(s: SourcesMessages, channel: Channel | TrendSeries): string {
  return s.channelNames[channel];
}

/** A "how they heard" answer: known values by name, newer values as stored, null = "Not recorded". */
export function heardName(s: SourcesMessages, key: string | null): string {
  if (key === null) return s.heard.notRecorded;
  return Object.hasOwn(s.heard.values, key) ? s.heard.values[key as keyof SourcesMessages["heard"]["values"]] : key;
}

/** A free tool's name (canonical ids; Rancho = `ask`); unknown ids as stored. */
export function toolName(s: SourcesMessages, tool: string): string {
  return Object.hasOwn(s.tools.toolNames, tool) ? s.tools.toolNames[tool as keyof SourcesMessages["tools"]["toolNames"]] : tool;
}

/** "21 Oct 2026" for an IST day key. */
export function dayLabel(day: string, locale: Locale): string {
  return formatDate(istDayStart(day), locale) ?? day;
}

/** "21 Oct" for an IST day key (chart axes). */
export function shortDayLabel(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang[locale], { day: "numeric", month: "short", timeZone: CRM_TIME_ZONE, numberingSystem: "latn" }).format(istDayStart(day));
}

/** "10:42" (IST, 24-hour) of an ISO time. */
export function timeLabel(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang[locale], { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: CRM_TIME_ZONE, numberingSystem: "latn" }).format(Date.parse(iso));
}
