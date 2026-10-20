import "server-only";

import { predictorTables } from "@/content/predictor";
import { showPlaceholderContent } from "@/lib/content-mode";
import { selectVisibleData } from "./engine";
import type { PredictorData } from "./types";

/**
 * Predictor tables that may be shown right now (D-005 / D-032): `published` tables always,
 * `placeholder` (sample) tables only while showPlaceholderContent() is on. Null when nothing is
 * loaded — production today — so callers show "coming soon" and no sample numbers reach the
 * browser. Pass the result to predictRankBand / matchColleges (./engine) or to client components.
 */
export function getPredictorData(): PredictorData | null {
  return selectVisibleData(predictorTables, showPlaceholderContent());
}
