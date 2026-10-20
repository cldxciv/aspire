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
