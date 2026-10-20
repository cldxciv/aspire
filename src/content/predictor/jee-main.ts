import type { CutoffTable, ExamScoreTable } from "@/lib/predictor/types";
import { SAMPLE_SOURCE, sampleRows } from "./sample";

/**
 * JEE Main — SAMPLE tables (status "placeholder", D-032). NOT official: the curve, candidate
 * count, shares and closing ranks are illustrative so the predictor can be built and reviewed.
 * Aspire must replace them with the NTA percentile data and the JoSAA final-round opening/closing
 * ranks (and confirm each institute's quota structure against the JoSAA seat matrix) before the
 * status may become "published". IITs are not listed: they admit through JEE Advanced.
 */
export const jeeMainScores: ExamScoreTable = {
  exam: "jee-main",
  year: 2025,
  minScore: -75,
  maxScore: 300,
  candidates: { low: 1_200_000, high: 1_400_000 },
  anchors: [
    { score: -75, percentileLow: 0, percentileHigh: 1 },
    { score: 0, percentileLow: 5, percentileHigh: 15 },
    { score: 30, percentileLow: 45, percentileHigh: 60 },
    { score: 50, percentileLow: 75, percentileHigh: 82 },
    { score: 70, percentileLow: 88, percentileHigh: 91.5 },
    { score: 90, percentileLow: 94, percentileHigh: 96 },
    { score: 110, percentileLow: 96.8, percentileHigh: 97.8 },
    { score: 130, percentileLow: 98.2, percentileHigh: 98.9 },
    { score: 150, percentileLow: 99, percentileHigh: 99.4 },
    { score: 170, percentileLow: 99.45, percentileHigh: 99.7 },
    { score: 190, percentileLow: 99.7, percentileHigh: 99.85 },
    { score: 210, percentileLow: 99.83, percentileHigh: 99.92 },
    { score: 240, percentileLow: 99.93, percentileHigh: 99.97 },
    { score: 270, percentileLow: 99.98, percentileHigh: 99.995 },
    { score: 300, percentileLow: 99.995, percentileHigh: 100 },
  ],
  categoryShare: {
    EWS: { low: 0.12, high: 0.16 },
    "OBC-NCL": { low: 0.28, high: 0.36 },
    SC: { low: 0.06, high: 0.1 },
    ST: { low: 0.02, high: 0.04 },
  },
  pwdShare: { low: 0.005, high: 0.012 },
  supports: { percentile: true, category: true, pwd: true, homeState: true, gender: true },
  shareBucket: 10,
  status: "placeholder",
  source: SAMPLE_SOURCE,
};

export const jeeMainCutoffs: CutoffTable = {
  exam: "jee-main",
  year: 2025,
  counselling: "JoSAA",
  categoryRankBasis: "category",
  reachFactor: 1.25,
  institutes: [
    { id: "nit-hamirpur", name: "NIT Hamirpur", state: "HP", kind: "NIT" },
    { id: "iiit-una", name: "IIIT Una", state: "HP", kind: "IIIT" },
    { id: "nit-jalandhar", name: "NIT Jalandhar", state: "OTHER", kind: "NIT" },
    { id: "nit-kurukshetra", name: "NIT Kurukshetra", state: "OTHER", kind: "NIT" },
  ],
  rows: sampleRows(
    [
      { instituteId: "nit-hamirpur", code: "cse", program: "B.Tech Computer Science and Engineering", open: { HS: 19_000, OS: 12_000 } },
      { instituteId: "nit-hamirpur", code: "ece", program: "B.Tech Electronics and Communication Engineering", open: { HS: 29_000, OS: 18_000 } },
      { instituteId: "nit-hamirpur", code: "civil", program: "B.Tech Civil Engineering", open: { HS: 70_000, OS: 45_000 } },
      { instituteId: "iiit-una", code: "cse", program: "B.Tech Computer Science and Engineering", open: { AI: 26_000 } },
      { instituteId: "iiit-una", code: "ece", program: "B.Tech Electronics and Communication Engineering", open: { AI: 36_000 } },
      { instituteId: "nit-jalandhar", code: "cse", program: "B.Tech Computer Science and Engineering", open: { OS: 14_000 } },
      { instituteId: "nit-jalandhar", code: "me", program: "B.Tech Mechanical Engineering", open: { OS: 38_000 } },
      { instituteId: "nit-kurukshetra", code: "cse", program: "B.Tech Computer Science and Engineering", open: { OS: 8_000 } },
      { instituteId: "nit-kurukshetra", code: "ece", program: "B.Tech Electronics and Communication Engineering", open: { OS: 13_000 } },
    ],
    { category: { EWS: 0.18, "OBC-NCL": 0.5, SC: 0.4, ST: 0.3 }, female: 1.4, pwd: 0.1 },
  ),
  status: "placeholder",
  source: SAMPLE_SOURCE,
};
