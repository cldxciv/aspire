import "server-only";

import { FLASHCARDS_STATUS } from "@/content/planner/flashcards";
import { SYLLABUS_STATUS } from "@/content/planner/syllabus";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getVisibleMockTests, summariseTest } from "@/lib/mocktest/catalog";
import { isLeaderboardTest } from "@/lib/mocktest/timing";
import type { TestSummary } from "@/lib/mocktest/types";
import { getPredictorData } from "@/lib/predictor/data";
import { hasSampleData } from "@/lib/predictor/engine";
import type { PredictorData } from "@/lib/predictor/types";

/** Mock tests shown in the widget at most. */
export const HOME_MOCK_TEST_LIMIT = 3;

export type HomeMockTest = Pick<TestSummary, "id" | "exam" | "kind" | "title" | "durationMinutes" | "questionCount" | "sample">;

/** What the homepage tools widget needs, decided on the server with the tools' own visibility rules. */
export interface HomeToolsData {
  /**
   * Predictor tables the widget may use: score tables only (the rank band needs no cut-off rows),
   * or null when no table may be shown (production today) — no sample numbers reach the browser.
   */
  predictor: { data: PredictorData; sample: boolean } | null;
  /** Up to HOME_MOCK_TEST_LIMIT visible tests, in catalogue order. */
  tests: HomeMockTest[];
  /** True when a visible test has a leaderboard. */
  leaderboard: boolean;
  /** Same rule as /tools/planner: open with published content, or with samples in dev / preview. */
  planner: { available: boolean; sample: boolean };
}

/**
 * Static-friendly (no request data): reads only content files and the placeholder switch, like
 * the other homepage accessors. Sample tables and tests appear only where the full tools show them.
 */
export function getHomeToolsData(): HomeToolsData {
  const predictorData = getPredictorData();
  const visibleTests = getVisibleMockTests();
  const showSamples = showPlaceholderContent();
  const withCards = FLASHCARDS_STATUS === "published" || showSamples;
  return {
    predictor: predictorData
      ? { data: { scoreTables: predictorData.scoreTables, cutoffTables: [] }, sample: hasSampleData(predictorData) }
      : null,
    tests: visibleTests.slice(0, HOME_MOCK_TEST_LIMIT).map((test) => {
      const { id, exam, kind, title, durationMinutes, questionCount, sample } = summariseTest(test);
      return { id, exam, kind, title, durationMinutes, questionCount, sample };
    }),
    leaderboard: visibleTests.some((test) => isLeaderboardTest(test)),
    planner: {
      available: SYLLABUS_STATUS === "published" || showSamples,
      sample: SYLLABUS_STATUS !== "published" || (withCards && FLASHCARDS_STATUS !== "published"),
    },
  };
}
