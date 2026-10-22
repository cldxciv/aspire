import type { QbDifficulty, QbExam, QbQuestionType } from "./types";

/**
 * Calibration maths (owner: QB-CORE-A; §B11). Pure and client-safe. Statistics only ever SUGGEST a
 * difficulty change for a reviewer to accept; nothing here changes a label.
 *
 * - p = correct ÷ attempted (omissions are tracked separately as the omission rate).
 * - A suggestion needs at least 30 attempts AND a Wilson 95 % interval lying entirely inside another
 *   band than the current label.
 * - Bands use Aspire's default thresholds per exam AND question type ("Aspire defaults, not official").
 *   MCQ thresholds sit above the 0.25 guessing floor of a four-option question.
 * - Discrimination D = p(top third) − p(bottom third), from papers tagged by the slot's score
 *   histogram once it holds 30 or more papers; D < −0.1 with 15 or more papers in each third raises
 *   `negative_discrimination` ("possible wrong key").
 */

export const CALIBRATION_MIN_ATTEMPTED = 30;
export const DISCRIMINATION_MIN_EACH = 15;
export const NEGATIVE_DISCRIMINATION_BELOW = -0.1;
export const HISTOGRAM_MIN_PAPERS = 30;
/** Chance of guessing a four-option single-correct question. */
export const GUESSING_FLOOR_MCQ4 = 0.25;

/** easy when p ≥ easyMin; hard when p < hardMax; medium in between. */
export interface QbBandThresholds {
  easyMin: number;
  hardMax: number;
}

export type QbCalibrationThresholds = Record<QbExam, { mcq: QbBandThresholds; numerical: QbBandThresholds | null }>;

export const QB_DEFAULT_THRESHOLDS: Readonly<QbCalibrationThresholds> = {
  JEE_MAIN: { mcq: { easyMin: 0.6, hardMax: 0.35 }, numerical: { easyMin: 0.5, hardMax: 0.2 } },
  JEE_ADV: { mcq: { easyMin: 0.5, hardMax: 0.3 }, numerical: { easyMin: 0.4, hardMax: 0.15 } },
  NEET: { mcq: { easyMin: 0.75, hardMax: 0.45 }, numerical: null },
  BOH: { mcq: { easyMin: 0.7, hardMax: 0.4 }, numerical: null },
};

export function thresholdsFor(
  thresholds: Readonly<QbCalibrationThresholds>,
  exam: QbExam,
  type: QbQuestionType,
): QbBandThresholds | null {
  const entry = thresholds[exam];
  if (!entry) return null;
  return type === "numerical" ? entry.numerical : entry.mcq;
}

/** Wilson score interval (default 95 %) for `successes` out of `n`; null when n = 0. */
export function wilsonInterval(successes: number, n: number, z = 1.959963984540054): [number, number] | null {
  if (!(n > 0)) return null;
  const p = Math.min(1, Math.max(0, successes / n));
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export function bandOf(p: number, t: QbBandThresholds): QbDifficulty {
  if (p >= t.easyMin) return "easy";
  if (p < t.hardMax) return "hard";
  return "medium";
}

/** The band containing the WHOLE interval, or null when it straddles a boundary. */
export function intervalBand(interval: readonly [number, number], t: QbBandThresholds): QbDifficulty | null {
  const [low, high] = interval;
  if (low >= t.easyMin) return "easy";
  if (high < t.hardMax) return "hard";
  if (low >= t.hardMax && high < t.easyMin) return "medium";
  return null;
}

/** A suggested difficulty (different from `current`), or null. */
export function suggestDifficulty(input: {
  attempted: number;
  correct: number;
  current: QbDifficulty | null;
  thresholds: QbBandThresholds | null;
  minAttempted?: number;
}): QbDifficulty | null {
  if (!input.thresholds) return null;
  if (input.attempted < (input.minAttempted ?? CALIBRATION_MIN_ATTEMPTED)) return null;
  const interval = wilsonInterval(input.correct, input.attempted);
  if (!interval) return null;
  const band = intervalBand(interval, input.thresholds);
  return band && band !== input.current ? band : null;
}

/** D = p_top − p_bottom, or null with fewer than `minEach` papers in either third. */
export function discrimination(
  input: { topN: number; topCorrect: number; bottomN: number; bottomCorrect: number },
  minEach = DISCRIMINATION_MIN_EACH,
): number | null {
  if (input.topN < minEach || input.bottomN < minEach) return null;
  return input.topCorrect / input.topN - input.bottomCorrect / input.bottomN;
}

export function isNegativeDiscrimination(d: number | null): boolean {
  return d !== null && d < NEGATIVE_DISCRIMINATION_BELOW;
}

// ---------------------------------------------------------------------------------------------
// Score histogram (per slot): 1 % buckets of the paper percentage, −100 … 100.

export function scoreBucket(score: number, maxScore: number): number {
  if (!(maxScore > 0)) return 0;
  const pct = (score / maxScore) * 100;
  return Math.max(-100, Math.min(100, Math.floor(pct)));
}

export interface ThirdCutoffs {
  /** Buckets strictly below this are the bottom third. */
  bottomBelow: number;
  /** Buckets at or above this are the top third. */
  topFrom: number;
  papers: number;
}

/** Tercile cut-offs from a histogram; null below `minPapers` papers. */
export function thirdCutoffs(hist: readonly { bucket: number; n: number }[], minPapers = HISTOGRAM_MIN_PAPERS): ThirdCutoffs | null {
  const rows = hist.filter((row) => row.n > 0).slice().sort((a, b) => a.bucket - b.bucket);
  const total = rows.reduce((sum, row) => sum + row.n, 0);
  if (total < minPapers) return null;
  const quantileBucket = (fraction: number) => {
    const target = total * fraction;
    let seen = 0;
    for (const row of rows) {
      seen += row.n;
      if (seen >= target) return row.bucket;
    }
    return rows[rows.length - 1].bucket;
  };
  const lowEdge = quantileBucket(1 / 3);
  const highEdge = quantileBucket(2 / 3);
  return { bottomBelow: lowEdge, topFrom: Math.max(highEdge + 1, lowEdge + 1), papers: total };
}

export function paperThird(bucket: number, cutoffs: ThirdCutoffs | null): "top" | "bottom" | "middle" | null {
  if (!cutoffs) return null;
  if (bucket >= cutoffs.topFrom) return "top";
  if (bucket < cutoffs.bottomBelow) return "bottom";
  return "middle";
}
