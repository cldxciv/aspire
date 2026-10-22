/**
 * Himachal Pradesh's 12 districts (public geography, not a claim about Aspire), for the centre
 * finder in the page heroes (src/components/hero/districts.ts). Names in English and Hindi, other
 * spellings used in content, and the approximate position of each district headquarters.
 *
 * Kept in src/content/ because district names such as Solan are legitimate here, while the
 * mockup-string guard (src/test/mockup-strings.test.ts) keeps them out of UI code. Which centre
 * serves a district comes only from the centres data (`servesDistricts`, then `district`).
 */

export type DistrictId =
  | "bilaspur"
  | "chamba"
  | "hamirpur"
  | "kangra"
  | "kinnaur"
  | "kullu"
  | "lahaul-spiti"
  | "mandi"
  | "shimla"
  | "sirmaur"
  | "solan"
  | "una";

export interface HpDistrict {
  id: DistrictId;
  en: string;
  hi: string;
  /** Other spellings used in content (English and Hindi), matched case-insensitively. */
  aliases: readonly string[];
  /** Approximate district headquarters. */
  lat: number;
  lon: number;
}

export const HP_DISTRICTS: readonly HpDistrict[] = [
  { id: "bilaspur", en: "Bilaspur", hi: "बिलासपुर", aliases: [], lat: 31.33, lon: 76.76 },
  { id: "chamba", en: "Chamba", hi: "चंबा", aliases: ["चम्बा"], lat: 32.56, lon: 76.13 },
  { id: "hamirpur", en: "Hamirpur", hi: "हमीरपुर", aliases: [], lat: 31.68, lon: 76.52 },
  // HQ Dharamshala.
  { id: "kangra", en: "Kangra", hi: "कांगड़ा", aliases: ["कांगडा", "काँगड़ा"], lat: 32.22, lon: 76.32 },
  // HQ Reckong Peo.
  { id: "kinnaur", en: "Kinnaur", hi: "किन्नौर", aliases: [], lat: 31.54, lon: 78.27 },
  { id: "kullu", en: "Kullu", hi: "कुल्लू", aliases: ["Kulu"], lat: 31.96, lon: 77.11 },
  // HQ Keylong. Content often says just "Lahaul".
  {
    id: "lahaul-spiti",
    en: "Lahaul and Spiti",
    hi: "लाहौल-स्पीति",
    aliases: ["Lahaul", "Lahul", "Lahaul & Spiti", "Lahaul-Spiti", "Lahul and Spiti", "Spiti", "लाहौल", "लाहौल और स्पीति", "लाहौल स्पीति"],
    lat: 32.57,
    lon: 77.03,
  },
  { id: "mandi", en: "Mandi", hi: "मंडी", aliases: ["मण्डी"], lat: 31.71, lon: 76.93 },
  { id: "shimla", en: "Shimla", hi: "शिमला", aliases: ["Simla"], lat: 31.1, lon: 77.17 },
  // HQ Nahan.
  { id: "sirmaur", en: "Sirmaur", hi: "सिरमौर", aliases: ["Sirmour"], lat: 30.56, lon: 77.3 },
  { id: "solan", en: "Solan", hi: "सोलन", aliases: [], lat: 30.91, lon: 77.1 },
  { id: "una", en: "Una", hi: "ऊना", aliases: [], lat: 31.47, lon: 76.27 },
];
