import type { RankerRecord, ResultRecord } from "@/lib/types";
import type { TextOverlay } from "./overlay";

// MACHINE DRAFT — Hindi overlay for src/content/results.ts.
// Needs native Hindi review before launch (docs/hindi-review-register.md).
//
// Only generic labels are overlaid ("Allotted:", "State Rank", "Score", "Top
// Choice", "From … Batch", "Cat. Rank"). Student names, ranks, scores, years,
// exam names, schools, institutions and degree names are never translated, and
// featured-result quotes (students' own words) stay English (`quoteLang: "en"`).
export type ResultOverlay = TextOverlay<Pick<ResultRecord, "rankOrOutcome" | "destination">>;
export type RankerOverlay = TextOverlay<Pick<RankerRecord, "note">>;

export const resultsHi: Readonly<Record<string, ResultOverlay>> = {
  "res-2026-neet-pradyun-dharma": { rankOrOutcome: "आवंटित: AIIMS Jodhpur" },
  "res-2026-neet-parth-pandit": { rankOrOutcome: "आवंटित: AIIMS Jammu" },
  "res-2026-neet-sanskriti-negi": { rankOrOutcome: "आवंटित: LHMC New Delhi" },
  "res-2026-neet-alabhya-thakur": { rankOrOutcome: "आवंटित: IGMC Shimla" },
  "res-2025-neet-hitesh-thakur": {
    rankOrOutcome: "राज्य रैंक #2",
    destination: "MBBS, IGMC Shimla (राज्य रैंक #2)",
  },
  "res-2025-neet-mitali-thakur": { destination: "MBBS, AIIMS Bilaspur (पहली पसंद)" },
  "res-2025-neet-ananya-sharma": { rankOrOutcome: "NEET स्कोर 682" },
};

/** Ranker notes, keyed by ranker id ("AIR …" notes are ranks and stay as they are). */
export const rankersHi: Readonly<Record<string, RankerOverlay>> = {
  "ranker-49": { note: "ड्रॉपर बैच से" },
  "ranker-50": { note: "SSB बैच से" },
  "ranker-51": { note: "SSB बैच से" },
  "ranker-356": { note: "श्रेणी रैंक 90" },
  "ranker-499": { note: "SSB बैच से" },
};
