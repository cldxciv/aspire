import type { Bilingual } from "./types";

/**
 * The 12 districts of Himachal Pradesh, for the optional district on a leaderboard profile (D-034).
 * Fixed list: the API accepts only these ids. Kept in src/content (not in UI code or messages) so
 * place names live with other content.
 */
export const HP_DISTRICTS = [
  { id: "bilaspur", name: { en: "Bilaspur", hi: "बिलासपुर" } },
  { id: "chamba", name: { en: "Chamba", hi: "चंबा" } },
  { id: "hamirpur", name: { en: "Hamirpur", hi: "हमीरपुर" } },
  { id: "kangra", name: { en: "Kangra", hi: "कांगड़ा" } },
  { id: "kinnaur", name: { en: "Kinnaur", hi: "किन्नौर" } },
  { id: "kullu", name: { en: "Kullu", hi: "कुल्लू" } },
  { id: "lahaul-spiti", name: { en: "Lahaul and Spiti", hi: "लाहौल और स्पीति" } },
  { id: "mandi", name: { en: "Mandi", hi: "मंडी" } },
  { id: "shimla", name: { en: "Shimla", hi: "शिमला" } },
  { id: "sirmaur", name: { en: "Sirmaur", hi: "सिरमौर" } },
  { id: "solan", name: { en: "Solan", hi: "सोलन" } },
  { id: "una", name: { en: "Una", hi: "ऊना" } },
] as const satisfies readonly { id: string; name: Bilingual }[];

export type DistrictId = (typeof HP_DISTRICTS)[number]["id"];

export const DISTRICT_IDS = HP_DISTRICTS.map((d) => d.id) as [DistrictId, ...DistrictId[]];

export function isDistrictId(value: unknown): value is DistrictId {
  return typeof value === "string" && (DISTRICT_IDS as readonly string[]).includes(value);
}

export function districtName(id: string | null | undefined, locale: "en" | "hi"): string | null {
  const district = HP_DISTRICTS.find((d) => d.id === id);
  return district ? district.name[locale] : null;
}
