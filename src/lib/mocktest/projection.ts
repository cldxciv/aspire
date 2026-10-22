import type { MockExam } from "@/content/mocktest/types";
import { predictRankBand, scoreTableFor, type PredictorData, type PredictorExam } from "@/lib/predictor/engine";
import type { MockProjection } from "./types";

/**
 * Thin adapter from a mock-test score to the rank predictor (A1-PREDICTOR, src/lib/predictor).
 * Pure: the caller passes the predictor tables it may show (or null).
 *
 * The mock is shorter than the real paper, so the score is scaled to the full paper's maximum
 * (same percentage) before it is looked up — a rough, indicative projection. Returns null when the
 * predictor has no visible table for the exam (e.g. production with sample tables only), when the
 * test has no marks, or when the predictor rejects the input. While the tables are placeholders
 * the result has `sample: true` and the UI says "Sample data".
 */

const EXAM_MAP: Record<MockExam, PredictorExam> = {
  JEE_MAIN: "jee-main",
  NEET: "neet-ug",
  BOH: "boh",
};

/**
 * Generated papers (docs/question-bank-plan.md A7-12): a projection only for FULL-length papers made
 * from real (non-sample) questions, of an exam with predictor tables (JEE Advanced has none, so
 * null). `officialShare` (0–1) travels with it so the result can say when a paper is mostly
 * past-year questions (students who have seen them may score higher).
 */
export function projectPaperRankBand(
  input: { exam: string; short: boolean; sample: boolean; officialShare: number; score: number; maxScore: number },
  data: PredictorData | null,
): MockProjection | null {
  if (input.short || input.sample || !Object.prototype.hasOwnProperty.call(EXAM_MAP, input.exam)) return null;
  const projection = projectRankBand({ exam: input.exam as MockExam, score: input.score, maxScore: input.maxScore }, data);
  return projection ? { ...projection, officialShare: Math.max(0, Math.min(1, input.officialShare)) } : null;
}

export function projectRankBand(
  input: { exam: MockExam; score: number; maxScore: number },
  data: PredictorData | null,
): MockProjection | null {
  if (!data || input.maxScore <= 0) return null;
  const exam = EXAM_MAP[input.exam];
  const table = scoreTableFor(exam, data);
  if (!table) return null;
  const fraction = input.score / input.maxScore;
  const scaled = Math.round(Math.max(table.minScore, Math.min(table.maxScore, fraction * table.maxScore)));
  const band = predictRankBand({ exam, mode: "score", value: scaled }, data);
  if (band.status !== "ok") return null;
  return {
    exam: input.exam,
    scaledScore: scaled,
    fullMaxScore: table.maxScore,
    percentile: band.percentile,
    rank: band.crl,
    year: band.year,
    sample: band.sample,
  };
}
