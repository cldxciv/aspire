import type { QbAnswer, QbMarking, QbQuestionType } from "./types";

/**
 * Scoring of served paper questions against their (corrected) keys (owner: QB-CORE-B). Pure and
 * client-safe. The mock-test side scores attempts with its own scorer (src/lib/mocktest/scoring.ts);
 * this one states the same official rules for the bank's own checks and tests:
 * - a DROPPED question gives full marks to everyone, attempted or not (both bulletins);
 * - single correct: the key index → full marks, another option → `wrong`;
 * - one-or-more correct (`partial: "per_correct_option"`, JEE Advanced 2026): exactly the key → full;
 *   every chosen option correct but not all chosen → +1 per chosen option; any wrong option → `wrong`;
 *   without the partial scheme an incomplete choice is wrong;
 * - numerical: inside [low, high] when a range is given; integer sections need a whole number equal
 *   to the key; two-decimal sections allow ±0.01.
 */

export type QbResponse = number | number[] | string | null | undefined;
export type QbScoredOutcome = "correct" | "partial" | "wrong" | "unattempted";

export interface QbScorableItem {
  id: string;
  type: QbQuestionType;
  answerFormat: "integer" | "decimal2" | null;
  marking: QbMarking;
  key: QbAnswer | null;
  dropped: boolean;
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseNumber(response: QbResponse): number | null {
  if (typeof response === "number") return Number.isFinite(response) ? response : null;
  if (typeof response !== "string") return null;
  const text = response.trim();
  if (text === "" || text.length > 16 || !NUMBER.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function isBlank(response: QbResponse): boolean {
  return response === null || response === undefined || response === "" || (Array.isArray(response) && response.length === 0);
}

export function scoreItem(item: QbScorableItem, response: QbResponse): { outcome: QbScoredOutcome; marks: number } {
  if (item.dropped) return { outcome: "correct", marks: item.marking.correct };
  if (isBlank(response)) return { outcome: "unattempted", marks: 0 };
  const key = item.key;
  if (!key) return { outcome: "wrong", marks: item.marking.wrong };
  const wrong = { outcome: "wrong" as const, marks: item.marking.wrong };
  const full = { outcome: "correct" as const, marks: item.marking.correct };
  if (key.kind === "single") return typeof response === "number" && response === key.index ? full : wrong;
  if (key.kind === "multiple") {
    const chosen = Array.isArray(response) ? [...new Set(response)] : typeof response === "number" ? [response] : null;
    if (!chosen || chosen.length === 0) return { outcome: "unattempted", marks: 0 };
    if (chosen.some((i) => !key.indices.includes(i))) return wrong;
    if (chosen.length === key.indices.length) return full;
    return item.marking.partial === "per_correct_option" ? { outcome: "partial", marks: chosen.length } : wrong;
  }
  const value = parseNumber(response);
  if (value === null) return wrong;
  if (item.answerFormat === "integer") {
    if (!Number.isInteger(value)) return wrong;
    if (key.low !== undefined && key.high !== undefined) return value >= key.low - 1e-9 && value <= key.high + 1e-9 ? full : wrong;
    return value === key.value ? full : wrong;
  }
  if (key.low !== undefined && key.high !== undefined) return value >= key.low - 1e-9 && value <= key.high + 1e-9 ? full : wrong;
  const tolerance = item.answerFormat === "decimal2" ? 0.01 : 0;
  return Math.abs(value - key.value) <= tolerance + 1e-9 ? full : wrong;
}

export interface QbPaperScore {
  score: number;
  maxScore: number;
  correct: number;
  partial: number;
  wrong: number;
  unattempted: number;
  items: { id: string; outcome: QbScoredOutcome; marks: number }[];
}

export function scoreServedPaper(items: readonly QbScorableItem[], responses: readonly QbResponse[]): QbPaperScore {
  const result: QbPaperScore = { score: 0, maxScore: 0, correct: 0, partial: 0, wrong: 0, unattempted: 0, items: [] };
  items.forEach((item, i) => {
    const scored = scoreItem(item, responses[i]);
    result.items.push({ id: item.id, ...scored });
    result.score += scored.marks;
    result.maxScore += item.marking.correct;
    result[scored.outcome] += 1;
  });
  return result;
}
