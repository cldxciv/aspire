import type { CutoffTable, ExamScoreTable } from "@/lib/predictor/types";
import { SAMPLE_SOURCE } from "./sample";

/**
 * Brain of Himachal (BOH, Aspire's statewide scholarship test) — SAMPLE tables (status
 * "placeholder", D-032). NOT official: the marking scheme (out of 100 here), candidate count,
 * curve and tier cut-offs are illustrative. Scholarship terms are unconfirmed
 * (docs/content-verification.md), so tiers carry no percentages or amounts. Aspire must supply the
 * real BOH merit data and tier rules before the status may become "published".
 */
export const bohScores: ExamScoreTable = {
  exam: "boh",
  year: 2025,
  minScore: 0,
  maxScore: 100,
  candidates: { low: 3_000, high: 5_000 },
  anchors: [
    { score: 0, percentileLow: 0, percentileHigh: 2 },
    { score: 20, percentileLow: 10, percentileHigh: 20 },
    { score: 40, percentileLow: 45, percentileHigh: 60 },
    { score: 60, percentileLow: 80, percentileHigh: 88 },
    { score: 75, percentileLow: 93, percentileHigh: 96 },
    { score: 85, percentileLow: 97.5, percentileHigh: 98.8 },
    { score: 95, percentileLow: 99.5, percentileHigh: 99.9 },
    { score: 100, percentileLow: 99.9, percentileHigh: 100 },
  ],
  supports: { percentile: false, category: false, pwd: false, homeState: false, gender: false },
  shareBucket: 5,
  status: "placeholder",
  source: SAMPLE_SOURCE,
};

const tier = (n: number, closingRank: number) => ({
  id: `aspire-boh-tier-${n}`,
  instituteId: "aspire-boh",
  program: `Scholarship tier ${n}`,
  programHi: `छात्रवृत्ति श्रेणी ${n}`,
  quota: "AI" as const,
  seatCategory: "OPEN" as const,
  closingRank,
});

export const bohCutoffs: CutoffTable = {
  exam: "boh",
  year: 2025,
  counselling: "Aspire BOH",
  categoryRankBasis: "crl",
  reachFactor: 1.25,
  institutes: [{ id: "aspire-boh", name: "Aspire IIT & Medical — BOH", state: "HP", kind: "Scholarship" }],
  rows: [tier(1, 25), tier(2, 100), tier(3, 300), tier(4, 800)],
  status: "placeholder",
  source: SAMPLE_SOURCE,
};
