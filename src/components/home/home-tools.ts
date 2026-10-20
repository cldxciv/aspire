import { predictorBand } from "@/components/forms/enquiry-context";
import { format } from "@/i18n/format";
import { clampToolSummary, type RanchoOpenDetail } from "@/lib/ask/cards";
import { addDays, diffDays, istDateKey, istInstant, isDateKey, type DateKey } from "@/lib/planner/dates";
import { PLAN_LIMITS } from "@/lib/planner/plan";
import {
  bucketRange,
  predictRankBand,
  scoreTableFor,
  shareBucketFor,
  valueRange,
  type ExamScoreTable,
  type InputMode,
  type PredictorData,
  type PredictorExam,
  type RankBandPrediction,
} from "@/lib/predictor/engine";

/**
 * Pure, client-safe helpers for the homepage "Student tools" widget (HomeTools): tab keyboard
 * rules, the mini rank estimate and its lead-gate steps, and the exam countdown. Nothing here
 * reads the clock or storage; callers pass "today" (read in the browser only).
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

// ── Lead gate (docs/lead-gate-plan.md §8.2): contact details once before the mini predictor's band ──
// miniGateSummary mirrors WP2's predictorSummary (predictor-gate.ts), which takes a college-match
// result instead of a rank band; merge them into one helper once both packages have settled.

/**
 * What the gate keeps with a mini-predictor result: the exam and the score / percentile band of the
 * share card ("score-180-189", the same bucket as the full predictor's counsellor link), never the
 * exact value. No band when the bucket can't be expressed (e.g. negative marks).
 */
export function miniGateSummary(band: RankBandPrediction, table: ExamScoreTable): { exam: PredictorExam; band?: string } {
  const bucket = shareBucketFor(band.input, table);
  const range = bucketRange(bucket, table);
  const key = predictorBand(bucket.mode, Math.floor(range.low), Math.floor(range.high));
  return key ? { exam: band.exam, band: key } : { exam: band.exam };
}

/** What an explicit "Predict" led to: fix the value, show the band, or the contact form first. */
export type MiniReveal = "invalid" | "shown" | "gated";

/**
 * One explicit "Predict". The input is validated FIRST (critique 1.10): an invalid value never
 * asks for contact details. A valid one asks the gate (`useLeadGate().requestAccess`), which
 * answers true at once when the browser is unlocked, signed in, the gate is off, or the server
 * can't be reached (browser-only tools fail open). Results from SAMPLE tables are gated too (owner
 * decision, 21 Oct 2026: the form itself says the results use sample data).
 */
export async function revealMiniResult(outcome: MiniEstimate, requestAccess: () => Promise<boolean>): Promise<MiniReveal> {
  if (outcome.status !== "ok") return "invalid";
  return (await requestAccess()) ? "shown" : "gated";
}

/** What the widget does after a gate step (miniGateStep). */
export interface MiniGateEffect {
  /** The band may show (until "Not you?"). */
  reveal: boolean;
  /** The one tool-use note for this step (exam + score band, never the exact value), or null. */
  note: { exam: PredictorExam; band?: string } | null;
  /**
   * Where focus goes: the band's first line, the value field, or nowhere (it stays on "Predict",
   * or the contact form takes it).
   */
  focus: "result" | "value" | null;
}

/**
 * The widget's gate steps (plan §13.1 "per-host pure gate reducers"); `outcome` is the CURRENT
 * estimate and `table` its exam's score table.
 * - `predict`: an explicit "Predict", after `revealMiniResult`. Invalid → back to the value field;
 *   gated → nothing yet (the contact form takes the slot and focuses its own heading); shown →
 *   the band and one note.
 * - `unlocked`: useLeadGate's `onUnlocked` while this widget waited (its own form, another tool on
 *   the page or another tab). The band for the current input (it may have been edited while the
 *   form was open) and one note when that input gives a band; so every "Predict" that ends in a
 *   band is noted exactly once. Focus moves only when this widget's own form unlocked (it held
 *   focus and is about to go): to the band, or to the value field when the input gives none.
 */
export function miniGateStep(
  event: { kind: "predict"; decision: MiniReveal } | { kind: "unlocked"; byThisHost: boolean },
  outcome: MiniEstimate,
  table: ExamScoreTable | undefined,
): MiniGateEffect {
  const ok = outcome.status === "ok";
  const note = outcome.status === "ok" && table ? miniGateSummary(outcome.band, table) : null;
  if (event.kind === "predict") {
    if (event.decision === "invalid") return { reveal: false, note: null, focus: "value" };
    if (event.decision === "gated") return { reveal: false, note: null, focus: null };
    return { reveal: true, note, focus: null };
  }
  return { reveal: true, note, focus: event.byThisHost ? (ok ? "result" : "value") : null };
}

/** What the widget's result slot shows: the placeholder, the compact contact form, or the band. */
export type MiniResultSlot = "empty" | "gate" | "result";

/**
 * The result slot. The form wins while it is open (the visitor may still be editing the score;
 * the form keeps what they typed). The band shows only after this widget was unlocked and while
 * the current input is valid; "Not you?" puts the widget back to the placeholder.
 */
export function miniResultSlot(state: { outcome: MiniEstimate | null; revealed: boolean; gateOpen: boolean }): MiniResultSlot {
  if (state.gateOpen) return "gate";
  return state.revealed && state.outcome?.status === "ok" ? "result" : "empty";
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

/**
 * "Ask Rancho for a plan" from the countdown: the exam and the days left only (nothing else is
 * typed in the widget). Null unless the countdown shows a number of days.
 */
export function countdownRanchoDetail(
  countdown: ExamCountdown,
  exam: string,
  t: { askRanchoPrompt: string; askRanchoContext: string },
): RanchoOpenDetail | null {
  if (countdown.kind !== "days") return null;
  const summary = format(t.askRanchoContext, { exam, days: countdown.days.toLocaleString("en-IN") });
  return { prompt: t.askRanchoPrompt, toolContext: { tool: "planner", summary: clampToolSummary(summary) } };
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
