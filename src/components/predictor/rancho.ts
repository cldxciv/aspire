import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { clampToolSummary, type RanchoOpenDetail } from "@/lib/ask/cards";
import { bucketRange, shareBucketFor, type ExamScoreTable, type PredictorExam, type RankBandPrediction } from "@/lib/predictor/engine";
import { formatNumber, formatRankRange } from "./format";

/** Strings for the "Ask Rancho how to improve" hand-off (from `predictor.form`, `.result` and `.share`). */
export interface PredictorRanchoMessages {
  exams: Record<PredictorExam, string>;
  crl: Record<PredictorExam, string>;
  range: string;
  rangeScore: string;
  rangePercentile: string;
  askRanchoPrompt: string;
  askRanchoContext: string;
  askRanchoSample: string;
}

/**
 * What the predictor hands to Rancho (client-safe, pure): the localised prompt and a short summary
 * — exam, the score / percentile RANGE of the share card (e.g. 180–189 marks, never the exact
 * value), the common-rank-list band and the sample label. Never the category, PwD, home state,
 * gender or anything personal. Used by the full predictor and the homepage mini predictor.
 */
export function predictorRanchoDetail(
  band: RankBandPrediction,
  table: ExamScoreTable,
  locale: Locale,
  t: PredictorRanchoMessages,
): RanchoOpenDetail {
  const bucket = shareBucketFor(band.input, table);
  const range = bucketRange(bucket, table);
  const decimals = bucket.mode === "percentile" ? 2 : 0;
  const input = format(bucket.mode === "percentile" ? t.rangePercentile : t.rangeScore, {
    from: formatNumber(range.low, locale, decimals),
    to: formatNumber(range.high, locale, decimals),
  });
  const summary = format(t.askRanchoContext, {
    exam: t.exams[band.exam],
    range: input,
    rank: t.crl[band.exam],
    band: formatRankRange(band.crl, locale, t.range),
  });
  return {
    prompt: t.askRanchoPrompt,
    toolContext: { tool: "predictor", summary: clampToolSummary(band.sample ? `${summary} ${t.askRanchoSample}` : summary) },
  };
}
