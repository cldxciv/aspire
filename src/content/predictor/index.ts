import type { PredictorData } from "@/lib/predictor/types";
import { bohCutoffs, bohScores } from "./boh";
import { jeeMainCutoffs, jeeMainScores } from "./jee-main";
import { neetUgCutoffs, neetUgScores } from "./neet-ug";

/**
 * All predictor tables (schema: src/lib/predictor/types.ts). Read them ONLY through
 * getPredictorData() (src/lib/predictor/data.ts), which drops `placeholder` tables in production.
 *
 * What Aspire must supply to go live (then set `status: "published"` and `source` to the official
 * source + date; one table per exam session — the newest year is used):
 * - ExamScoreTable per exam: score range, candidates (range), score → percentile anchors,
 *   category / PwD shares (category rank ≈ CRL × share), shareBucket.
 * - CutoffTable per exam: counselling body, rank basis (JoSAA category rank vs MCC AIR),
 *   institutes (id, official name, HP or other state) and final-round rows
 *   (institute, program, quota AI/HS/OS, seat category, PwD, gender pool, opening/closing rank).
 */
export const predictorTables: PredictorData = {
  scoreTables: [jeeMainScores, neetUgScores, bohScores],
  cutoffTables: [jeeMainCutoffs, neetUgCutoffs, bohCutoffs],
};
