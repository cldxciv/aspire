import { topicLabel } from "@/content/mocktest/topics";
import type { Locale } from "@/i18n/config";
import { format } from "@/i18n/format";
import { clampToolSummary, type RanchoOpenDetail } from "@/lib/ask/cards";
import { prioritiseTopics } from "@/lib/mocktest/study-plan";
import { scoreBand } from "@/lib/mocktest/timing";
import type { RunnerTest, ScoreResult } from "@/lib/mocktest/types";
import type { MocktestMessages } from "./format";

/** Weakest topics named in the hand-off at most. */
export const RANCHO_WEAK_TOPIC_LIMIT = 5;

export type MockTestRanchoMessages = Pick<
  MocktestMessages["result"],
  | "askRancho"
  | "askRanchoPrompt"
  | "askRanchoContext"
  | "askRanchoStrong"
  | "askRanchoStrongPrompt"
  | "askRanchoAllStrong"
  | "askRanchoBand"
  | "askRanchoBelowZero"
>;

/** "40–49 %" (10-point band of the maximum, as on the certificate check), never the exact score. */
export function ranchoScoreBand(score: number, maxScore: number, t: Pick<MockTestRanchoMessages, "askRanchoBand" | "askRanchoBelowZero">): string {
  const band = scoreBand(score, maxScore);
  if (band === "below-0") return t.askRanchoBelowZero;
  const [low, high] = band.split("-");
  return format(t.askRanchoBand, { low, high });
}

/**
 * What a mock-test result hands to Rancho (client-safe, pure): the button label and the hand-off —
 * the test title, a 10-point score band and up to five topic LABELS that need work (weakest first,
 * the order of the 30-day plan). Never question text, the student's answers, the answer key, the
 * exact score, the attempt id or anything personal. When every topic is strong the button and the
 * prompt ask what to practise next instead of naming "weak topics".
 */
export function mockTestRancho(
  test: Pick<RunnerTest, "title">,
  result: Pick<ScoreResult, "score" | "maxScore" | "topics">,
  locale: Locale,
  t: MockTestRanchoMessages,
): { label: string; detail: RanchoOpenDetail } {
  const weakest = [
    ...new Set(
      prioritiseTopics(result.topics)
        .filter((topic) => topic.level !== "strong")
        .map((topic) => topicLabel(topic.topic, locale)),
    ),
  ].slice(0, RANCHO_WEAK_TOPIC_LIMIT);
  const allStrong = weakest.length === 0;
  const summary = format(allStrong ? t.askRanchoAllStrong : t.askRanchoContext, {
    test: test.title[locale],
    band: ranchoScoreBand(result.score, result.maxScore, t),
    // "; " because some topic names contain commas ("Work, energy and power").
    topics: weakest.join("; "),
  });
  return {
    label: allStrong ? t.askRanchoStrong : t.askRancho,
    detail: {
      prompt: allStrong ? t.askRanchoStrongPrompt : t.askRanchoPrompt,
      toolContext: { tool: "mock-test", summary: clampToolSummary(summary) },
    },
  };
}
