/**
 * Pure view logic for "Areas & people" (owner LR-ROUTING; docs/lead-routing-plan.md §13.6, §20).
 * Client-safe and unit-tested (areas-ui.test.ts): message slices, names in the viewer's language,
 * coverage badges, the place tester's sentence, form checks and the area-specific request builders
 * that are not in CORE's frozen `lead-ops-api.ts`.
 */
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import {
  AVAILABILITY_MAX_DAYS,
  type AliasKind,
  type AreaResolution,
  type CrmArea,
  type RoutingMatch,
  type UnmatchedPlace,
} from "@/lib/crm/lead-ops-types";
import type { CrmRole } from "@/lib/crm/types";
import type { CrmRequest } from "../api";
import type { CrmMessages } from "../format";
import { istDayKey, istDayStart } from "../format";

/** The message slices every areas component reads. */
export type AreasMessages = Pick<CrmMessages, "common" | "errors" | "roles"> & { a: CrmMessages["areasAdmin"] };

/** A CRM staff member as the page lists them (server: `AreaPerson`). */
export interface AreaPersonView {
  userId: string;
  displayName: string;
  crmRole: CrmRole;
  active: boolean;
  disabled: boolean;
  areaIds: string[];
  awayUntil: string | null;
  areaScope: boolean;
}

export interface CentreOption {
  value: string;
  label: string;
}

export const LOCALE_FREE_PATH = "/crm/settings/areas";
const DAY_MS = 86_400_000;

export function areaName(area: Pick<CrmArea, "nameEn" | "nameHi">, locale: Locale): string {
  return locale === "hi" ? area.nameHi || area.nameEn : area.nameEn;
}

export function otherAreaName(area: Pick<CrmArea, "nameEn" | "nameHi">, locale: Locale): string | null {
  const other = locale === "hi" ? area.nameEn : area.nameHi;
  return other && other !== areaName(area, locale) ? other : null;
}

export function nameOfArea(areas: readonly CrmArea[], id: string | null, locale: Locale): string {
  if (!id) return "";
  const area = areas.find((item) => item.id === id);
  return area ? areaName(area, locale) : id;
}

export function centreName(centres: readonly CentreOption[], slug: string | null): string {
  if (!slug) return "";
  return centres.find((centre) => centre.value === slug)?.label ?? slug;
}

export type Badge = { kind: "danger" | "warning" | "info" | "neutral"; text: string };

/** Text badges for an area card (never colour alone): switched off / merged, then the coverage gaps. */
export function coverageBadges(area: CrmArea, areas: readonly CrmArea[], locale: Locale, t: AreasMessages["a"]): Badge[] {
  const b = t.area.badges;
  if (area.mergedInto) return [{ kind: "neutral", text: format(b.mergedInto, { area: nameOfArea(areas, area.mergedInto, locale) }) }];
  const badges: Badge[] = [];
  if (!area.active) badges.push({ kind: "neutral", text: b.off });
  if (area.kind === "custom") badges.push({ kind: "info", text: b.custom });
  if (!area.coverage.hasExecutive) badges.push({ kind: "danger", text: b.noExecutive });
  if (!area.coverage.hasHead) badges.push({ kind: "danger", text: b.noHead });
  if (area.coverage.coveredBy) badges.push({ kind: "warning", text: format(b.coveredBy, { area: nameOfArea(areas, area.coverage.coveredBy, locale) }) });
  return badges;
}

/** Active areas that lack an executive or a head (the "need people" count). */
export function areasNeedingPeople(areas: readonly CrmArea[]): number {
  return areas.filter((area) => area.active && (!area.coverage.hasExecutive || !area.coverage.hasHead)).length;
}

/** The place tester's one-line answer. */
export function resolutionText(result: AreaResolution, areas: readonly CrmArea[], locale: Locale, t: AreasMessages["a"]): string {
  const r = t.tester.results;
  switch (result.outcome) {
    case "area":
      return format(r.area, { area: nameOfArea(areas, result.areaId, locale), match: matchText(result.match, t) });
    case "ambiguous":
      return format(r.ambiguous, { areas: (result.candidates ?? []).map((id) => nameOfArea(areas, id, locale)).join(", ") });
    case "outside_hp":
      return r.outside_hp;
    case "unknown":
      return r.unknown;
    case "empty":
      return r.empty;
  }
}

export function matchText(match: RoutingMatch | null, t: AreasMessages["a"]): string {
  return match ? t.tester.matches[match] : t.tester.matches.manual;
}

/** "Map to district": the place to remember, taken from what families typed (the part before a comma). */
export function suggestedLabel(sample: string): string {
  const first = sample.split(/[,/|(\n]/)[0]?.trim() ?? "";
  return (first || sample.trim()).slice(0, 60);
}

/** Kind for a mapped unmatched place: a town outside Himachal is a `border` alias (honoured with any state). */
export function suggestedKind(place: Pick<UnmatchedPlace, "outcomes">): AliasKind {
  return place.outcomes.includes("outside_hp") ? "border" : "town";
}

/** The day picker for "Mark away": the day they are back (00:00 IST), tomorrow … 60 days ahead. */
export function awayDayIssue(day: string, now: number): "untilRequired" | "past" | "tooFar" | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(istDayStart(day))) return "untilRequired";
  const today = istDayKey(now);
  if (day <= today) return "past";
  if (istDayStart(day) - istDayStart(today) > AVAILABILITY_MAX_DAYS * DAY_MS) return "tooFar";
  return null;
}

/** Merge: every person in the source area needs a move / remove choice. */
export function mergeIssue(input: { from: string; into: string; people: readonly string[]; choices: Readonly<Record<string, "move" | "remove" | undefined>> }): "same" | "needChoice" | null {
  if (!input.from || !input.into || input.from === input.into) return "same";
  return input.people.every((userId) => input.choices[userId]) ? null : "needChoice";
}

/** Areas a centre's team would join in "Set up from centre": its own area and those it serves. */
export function areasServedBy(centreSlug: string, areas: readonly CrmArea[]): CrmArea[] {
  return areas.filter((area) => area.active && (area.centres.includes(centreSlug) || area.defaultCentreSlug === centreSlug));
}

/** People a viewer may act on in "People and availability": everyone for a super admin, else their areas' members. */
export function peopleInReach(people: readonly AreaPersonView[], viewer: { superAdmin: boolean; areaIds: readonly string[] }): AreaPersonView[] {
  if (viewer.superAdmin) return [...people];
  const mine = new Set(viewer.areaIds);
  return people.filter((person) => person.areaIds.some((areaId) => mine.has(areaId)));
}

// ---------------------------------------------------------------------------------------------
// Requests only this page sends (paths and bodies of CORE's builders are in ../lead-ops-api.ts)

export const areaPageRequests = {
  /** "Map to district" from Unmatched places: the alias plus the stored key of the waiting families. */
  mapPlace(areaId: string, input: { label: string; kind: AliasKind; placeKey: string }): CrmRequest {
    return {
      path: `/api/crm/areas/${encodeURIComponent(areaId)}/aliases`,
      method: "POST",
      body: { label: input.label.trim(), kind: input.kind, placeKey: input.placeKey },
    };
  },
  /** One person's districts ("Switch to areas" for an area head). */
  setPersonAreas(userId: string, areaIds: readonly string[]): CrmRequest {
    return { path: `/api/crm/areas/people/${encodeURIComponent(userId)}`, method: "PUT", body: { areaIds: [...new Set(areaIds)] } };
  },
};
