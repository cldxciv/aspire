import type { CutoffTable, ExamScoreTable } from "@/lib/predictor/types";
import { SAMPLE_SOURCE, sampleRows } from "./sample";

/**
 * NEET-UG — SAMPLE tables (status "placeholder", D-032). NOT official: the curve, candidate count
 * and closing ranks are illustrative. Aspire must replace them with the NTA score/rank data, the
 * MCC (15 % all-India quota, AIIMS) final-round closing AIRs and the HP state-quota (85 %)
 * closing ranks before the status may become "published". MCC and HP counselling publish every
 * closing rank as AIR, hence `categoryRankBasis: "crl"`.
 */
export const neetUgScores: ExamScoreTable = {
  exam: "neet-ug",
  year: 2025,
  minScore: -180,
  maxScore: 720,
  candidates: { low: 2_000_000, high: 2_300_000 },
  anchors: [
    { score: -180, percentileLow: 0, percentileHigh: 1 },
    { score: 0, percentileLow: 5, percentileHigh: 15 },
    { score: 100, percentileLow: 40, percentileHigh: 55 },
    { score: 150, percentileLow: 60, percentileHigh: 70 },
    { score: 200, percentileLow: 72, percentileHigh: 80 },
    { score: 300, percentileLow: 85, percentileHigh: 89 },
    { score: 400, percentileLow: 92, percentileHigh: 94 },
    { score: 500, percentileLow: 96.5, percentileHigh: 97.5 },
    { score: 550, percentileLow: 97.8, percentileHigh: 98.6 },
    { score: 600, percentileLow: 98.9, percentileHigh: 99.4 },
    { score: 625, percentileLow: 99.3, percentileHigh: 99.6 },
    { score: 650, percentileLow: 99.6, percentileHigh: 99.82 },
    { score: 680, percentileLow: 99.88, percentileHigh: 99.95 },
    { score: 700, percentileLow: 99.96, percentileHigh: 99.99 },
    { score: 720, percentileLow: 99.995, percentileHigh: 100 },
  ],
  categoryShare: {
    EWS: { low: 0.1, high: 0.14 },
    "OBC-NCL": { low: 0.38, high: 0.46 },
    SC: { low: 0.12, high: 0.16 },
    ST: { low: 0.05, high: 0.08 },
  },
  pwdShare: { low: 0.004, high: 0.01 },
  supports: { percentile: true, category: true, pwd: true, homeState: true, gender: false },
  shareBucket: 20,
  status: "placeholder",
  source: SAMPLE_SOURCE,
};

export const neetUgCutoffs: CutoffTable = {
  exam: "neet-ug",
  year: 2025,
  counselling: "MCC + HP state counselling",
  categoryRankBasis: "crl",
  reachFactor: 1.2,
  institutes: [
    { id: "aiims-bilaspur", name: "AIIMS Bilaspur", state: "HP", kind: "AIIMS" },
    { id: "igmc-shimla", name: "IGMC Shimla", state: "HP", kind: "Medical college" },
    { id: "rpgmc-tanda", name: "Dr. RPGMC Tanda", state: "HP", kind: "Medical college" },
    { id: "slbsgmc-mandi", name: "SLBSGMC Mandi (Ner Chowk)", state: "HP", kind: "Medical college" },
    { id: "yspgmc-nahan", name: "Dr. YSPGMC Nahan", state: "HP", kind: "Medical college" },
    { id: "hpgdc-shimla", name: "HP Government Dental College, Shimla", state: "HP", kind: "Dental college" },
  ],
  rows: sampleRows(
    [
      { instituteId: "aiims-bilaspur", code: "mbbs", program: "MBBS", open: { AI: 3_000 } },
      { instituteId: "igmc-shimla", code: "mbbs", program: "MBBS", open: { AI: 9_000, HS: 27_000 } },
      { instituteId: "rpgmc-tanda", code: "mbbs", program: "MBBS", open: { AI: 12_000, HS: 33_000 } },
      { instituteId: "slbsgmc-mandi", code: "mbbs", program: "MBBS", open: { AI: 17_000, HS: 42_000 } },
      { instituteId: "yspgmc-nahan", code: "mbbs", program: "MBBS", open: { AI: 19_000, HS: 46_000 } },
      { instituteId: "hpgdc-shimla", code: "bds", program: "BDS", open: { AI: 35_000, HS: 80_000 } },
    ],
    { category: { EWS: 1.4, "OBC-NCL": 1.35, SC: 6, ST: 9 }, pwd: 15 },
  ),
  status: "placeholder",
  source: SAMPLE_SOURCE,
};
