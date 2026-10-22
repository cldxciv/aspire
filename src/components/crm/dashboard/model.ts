/**
 * Pure, client-safe helpers for the lead dashboard (owner: LR-SLA; docs/lead-routing-plan.md §16):
 * percentages, the inbox link behind each tile, and the row labels. No server imports.
 */
import type { Locale } from "@/i18n/config";
import { htmlLang } from "@/i18n/config";
import { format } from "@/i18n/format";
import type { DashboardData, SpeedRow } from "@/lib/crm/lead-ops-types";
import type { CrmMessages } from "../format";

export type DashboardMessages = CrmMessages["dashboard"];

/** 0.8333 → "83%" (locale digits); null → the "no value" dash. */
export function percentText(rate: number | null, locale: Locale, none: string): string {
  if (rate === null || !Number.isFinite(rate)) return none;
  return new Intl.NumberFormat(htmlLang[locale], { style: "percent", maximumFractionDigits: 0 }).format(rate);
}

/** Minutes with one decimal at most ("12.5 min"); null → the dash. */
export function minutesText(t: Pick<DashboardMessages["speed"], "minutes" | "none">, value: number | null, locale: Locale): string {
  if (value === null || !Number.isFinite(value)) return t.none;
  return format(t.minutes, { value: new Intl.NumberFormat(htmlLang[locale], { maximumFractionDigits: 1 }).format(value) });
}

/** met / (met + missed) of a table row, or null when nothing is decided yet. */
export function rowMetRate(row: Pick<SpeedRow, "met" | "missed">): number | null {
  const decided = row.met + row.missed;
  return decided > 0 ? Math.round((row.met / decided) * 10_000) / 10_000 : null;
}

/**
 * How many clocks a rate is out of ("10 of 12"): `count / rate`, or null when the rate is 0 / unknown
 * (SpeedStats carries the count and the rate, not the denominator).
 */
export function outOf(count: number, rate: number | null): number | null {
  return rate !== null && rate > 0 ? Math.round(count / rate) : null;
}

/** The inbox (or settings) link behind a "right now" tile; LOCALE-FREE; null = no link. */
export function nowTileHref(key: keyof DashboardData["now"], area: string | null): string | null {
  const scoped = (query: string) => `/crm?${query}${area ? `&area=${encodeURIComponent(area)}` : ""}`;
  switch (key) {
    case "callNow":
      return scoped("sla=open");
    case "overdue":
      return scoped("sla=overdue");
    case "escalated":
      return scoped("sla=escalated");
    case "unassignedInAreas":
      // The count only covers leads WITH an area; the inbox has no "any area" filter, so without a
      // chosen area there is no list that matches the number (no link rather than a wrong one).
      return area ? `/crm?area=${encodeURIComponent(area)}&assignee=unassigned&stage=open` : null;
    case "unassignedNoArea":
      return "/crm?area=none&assignee=unassigned&stage=open";
    case "toolSignups":
      return "/crm?area=tool_signups&stage=open";
    case "unmatchedPlaces":
      return "/crm/settings/areas";
    default:
      return null;
  }
}

/** A row's display name: the area / person / source / campaign in words. */
export function rowLabel(
  kind: "area" | "executive" | "source" | "campaign",
  key: string,
  label: string | undefined,
  t: { tables: DashboardMessages["tables"]; sources: CrmMessages["sources"] },
  areaNames: Readonly<Record<string, string>>,
): string {
  if (kind === "area") return key === "none" ? t.tables.noArea : (areaNames[key] ?? label ?? key);
  if (kind === "executive") return key === "unassigned" ? t.tables.unassigned : (label ?? key);
  if (kind === "campaign") return key === "none" ? t.tables.noCampaign : key;
  return Object.hasOwn(t.sources, key) ? t.sources[key as keyof typeof t.sources] : t.sources.other;
}

/** Bar width (0–100, whole percent) for an in-time rate; 0 when unknown. */
export function barWidth(rate: number | null): number {
  if (rate === null || !Number.isFinite(rate)) return 0;
  return Math.max(0, Math.min(100, Math.round(rate * 100)));
}
