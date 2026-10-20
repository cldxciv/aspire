import { addDays, diffDays, istDateKey, istInstant, isDateKey, type DateKey } from "@/lib/planner/dates";
import { PLAN_LIMITS } from "@/lib/planner/plan";
import {
  predictRankBand,
  scoreTableFor,
  valueRange,
  type InputMode,
  type PredictorData,
  type PredictorExam,
  type RankBandPrediction,
} from "@/lib/predictor/engine";

/**
 * Pure, client-safe helpers for the homepage "Student tools" widget (HomeTools): tab keyboard
 * rules, the mini rank estimate and the exam countdown. Nothing here reads the clock or storage;
 * callers pass "today" (read in the browser only).
 */

export const HOME_TOOL_KEYS = ["predictor", "mockTests", "ask", "planner"] as const;
export type HomeToolKey = (typeof HOME_TOOL_KEYS)[number];

/** Fixed DOM ids: the section renders once per page. */
export const homeToolTabId = (key: HomeToolKey) => `home-tools-tab-${key}`;
export const homeToolPanelId = (key: HomeToolKey) => `home-tools-panel-${key}`;

/** Modifier keys held during a key press (a `KeyboardEvent` fits). */
export interface KeyModifiers {
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/**
 * WAI-ARIA tabs (APG): the index a key press moves to from tab `index` of `count`, or null when
 * the key is not a tab key. Both arrow pairs work, because the tabs are a grid on phones and a
 * vertical rail from `md`; focus wraps around. With Alt, Ctrl or Meta held it is never a tab key,
 * so browser and OS shortcuts (Alt+Left = Back, Ctrl+Home, Cmd+Arrow) keep working.
 */
export function tabTargetIndex(key: string, index: number, count: number, modifiers: KeyModifiers = {}): number | null {
  if (count <= 0) return null;
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** Parses "182", "182.5" or "99,5" (comma decimal); NaN when empty or not a number (same rule as the full predictor). */
export function parseScoreInput(raw: string): number {
  const text = raw.trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

export type MiniEstimate =
  | { status: "ok"; band: RankBandPrediction }
  | { status: "invalid"; min: number; max: number }
  | { status: "not-loaded" };

/**
 * Rank band for the widget: exam + score/percentile only (category, PwD, home state and gender
 * keep the engine's defaults, which do not change the common-rank-list band). Percentile falls
 * back to score for exams without percentiles, as in the full predictor.
 */
export function miniEstimate(exam: PredictorExam, mode: InputMode, raw: string, data: PredictorData | null): MiniEstimate {
  const table = scoreTableFor(exam, data);
  if (!table) return { status: "not-loaded" };
  const effectiveMode: InputMode = table.supports.percentile ? mode : "score";
  const result = predictRankBand({ exam, mode: effectiveMode, value: parseScoreInput(raw) }, data);
  if (result.status === "ok") return { status: "ok", band: result };
  if (result.status === "not-loaded") return { status: "not-loaded" };
  const range = valueRange(table, effectiveMode);
  return { status: "invalid", min: range.low, max: range.high };
}

export type ExamCountdown =
  | { kind: "empty" }
  | { kind: "past" }
  | { kind: "today" }
  | { kind: "tomorrow" }
  | { kind: "tooFar" }
  | { kind: "days"; days: number };

/**
 * Days from `today` (IST date key, read in the browser) to `examDate` (`YYYY-MM-DD` from the date
 * input). Empty / incomplete input or an unknown "today" (server render) → "empty". Dates beyond
 * the planner's horizon (PLAN_LIMITS.maxDays) → "tooFar", as the planner form would refuse them.
 */
export function examCountdown(examDate: string, today: DateKey | null): ExamCountdown {
  if (!today || !isDateKey(today) || !isDateKey(examDate)) return { kind: "empty" };
  const days = diffDays(today, examDate);
  if (days < 0) return { kind: "past" };
  if (days === 0) return { kind: "today" };
  if (days === 1) return { kind: "tomorrow" };
  if (days > PLAN_LIMITS.maxDays) return { kind: "tooFar" };
  return { kind: "days", days };
}

/** Milliseconds from `nowMs` to the next midnight in India time (always > 0), when "today" changes. */
export function msUntilNextIstMidnight(nowMs: number): number {
  return istInstant(addDays(istDateKey(nowMs), 1), 0) - nowMs;
}

/**
 * Splits a message around one placeholder so the value can be styled on its own:
 * `splitTemplate("{days} days to {exam}", "days")` → ["", " days to {exam}"]. Without the
 * placeholder the whole template comes first.
 */
export function splitTemplate(template: string, name: string): [string, string] {
  const token = `{${name}}`;
  const at = template.indexOf(token);
  return at === -1 ? [template, ""] : [template.slice(0, at), template.slice(at + token.length)];
}
