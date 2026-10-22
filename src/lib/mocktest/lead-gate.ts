import type { MockExam } from "@/content/mocktest/types";
import { mockScoreBand, type LeadGateMode } from "@/lib/lead-gate/contract";

/**
 * Mock tests and the lead gate (docs/lead-gate-plan.md §5.7, §8.4). Client-safe and pure: shared
 * by the runner, the result view and POST /api/mocktest/score.
 *
 * - Tests of GATE_AT_START_MINUTES or more ask for contact details on the start screen, before
 *   POST /api/mocktest/start (critique 1.7: a 3-hour test is never held hostage at the end). That
 *   start step fails OPEN (plan §1.5): if the form cannot be sent, the test can still start.
 *   Shorter tests ask on the result page. /api/mocktest/score asks either way.
 * - /api/mocktest/score is LEAD CAPTURE, not access control: guests' practice attempts have no
 *   server record, so "earlier" and "already seen" are the browser's word (`neverGated`). A
 *   hand-made request can claim either; only /api/ask is truly enforced.
 * - Sample tests are gated too (owner decision 21 Oct 2026: "on now, with an honest note").
 * - Data the family already has is never gated (critique 0.9): an attempt that started before
 *   LEAD_GATE_SINCE, or whose result this browser already showed (it keeps a local score).
 * - Tool-use notes carry the test, its exam and a 10-point score band only (`mockTestToolUse`).
 */

/** Tests at least this long ask at the start; shorter ones at the result. */
export const GATE_AT_START_MINUTES = 60;

export function gateAtStart(durationMinutes: number): boolean {
  return Number.isFinite(durationMinutes) && durationMinutes >= GATE_AT_START_MINUTES;
}

/**
 * True when an attempt started before the gate was switched on (`since` = LEAD_GATE_SINCE, epoch
 * ms): its score is never gated (critique 0.9). `startedAt` is the start this browser recorded with
 * the attempt; practice tests have no server record of a guest's start (nothing is stored for
 * guests), so a request can only state it. Unknown `since` or start → false.
 */
export function startedBeforeGate(since: number | null, startedAt: number | null | undefined): boolean {
  return since !== null && typeof startedAt === "number" && Number.isFinite(startedAt) && startedAt > 0 && startedAt < since;
}

/**
 * True when /api/mocktest/score answers without contact details even while the gate is required:
 * the attempt started before the switch-on (`startedBeforeGate`), or this browser already showed
 * its result (`seen`: the attempt keeps a local score, e.g. scored before "Not you?", sign-out, an
 * expired pass, withdrawn consent or while the gate was optional). Works without LEAD_GATE_SINCE.
 */
export function neverGated(since: number | null, attempt: { startedAt?: number | null; seen?: boolean | null }): boolean {
  return attempt.seen === true || startedBeforeGate(since, attempt.startedAt);
}

/**
 * The runner after an unlock (pure): start the test only when Start was pressed and THIS start
 * screen's form opened the gate (sent, "Continue without sharing", or "Start the test without
 * sharing" after a failed send). An unlock by another tool or tab only closes the form.
 */
export function startsAfterUnlock(pending: boolean, byThisHost: boolean): boolean {
  return pending && byThisHost;
}

/**
 * The locked result page (pure): after /score's gate 401, a later status answer says the gate was
 * relaxed (the flood breaker degraded it to optional, or it was switched off) without opening this
 * browser: ask /score again rather than leave a "paused" form with no way on.
 */
export function gateRelaxed(state: { status: string; mode: LeadGateMode | null }): boolean {
  return state.status !== "open" && (state.mode === "optional" || state.mode === "off");
}

/**
 * Optional mode (the flood breaker's degrade, or LEAD_GATE=optional): /score answers without the
 * gate, so the result page itself offers the contact form, with "Continue without sharing", before
 * the FIRST result of an attempt on this device (pure). Required mode is the server's call (the
 * gate 401); a result already shown here (local score) and the printable views never ask.
 */
export function asksBeforeFirstResult(
  attempt: { score?: number },
  fromResult: boolean,
  gate: { open: boolean; mode: LeadGateMode | null },
): boolean {
  return fromResult && attempt.score === undefined && !gate.open && gate.mode === "optional";
}

/**
 * Generated papers (docs/question-bank-plan.md §B10.6): like `neverGated`, but the "started before
 * LEAD_GATE_SINCE" check uses the SERVER's record of when the paper was made (`createdAt`), never
 * the browser's `startedAt`. `seen` stays the browser's word (it already shows a local score).
 */
export function neverGatedPaper(since: number | null, paper: { createdAt: number }, attempt: { seen?: boolean | null }): boolean {
  return attempt.seen === true || startedBeforeGate(since, paper.createdAt);
}

/** The exam as a lead-record slug ("JEE_MAIN" → "jee-main", "JEE_ADV" → "jee-adv"), the same form the predictor uses. */
export function mockExamSlug(exam: MockExam | "JEE_ADV"): string {
  return exam.toLowerCase().replace(/_/g, "-");
}

/** What POST /api/mocktest/score notes on the family's lead (tool_use): never the exact score or answers. */
export interface MockTestToolUse {
  tool: "mock-test";
  key: string;
  testId: string;
  exam: string;
  scoreBand: string | null;
}

export function mockTestToolUse(test: { id: string; exam: MockExam }, result: { score: number; maxScore: number }): MockTestToolUse {
  return {
    tool: "mock-test",
    key: test.id,
    testId: test.id,
    exam: mockExamSlug(test.exam),
    scoreBand: mockScoreBand(result.score, result.maxScore),
  };
}

/**
 * A generated paper's tool-use note: keyed by the exam-pattern slot (`bp-<slot>`), never the paper
 * id, so a family's papers of one exam on one day merge into one entry (plan §B10.6).
 */
export function paperToolUse(paper: { slot: string; exam: MockExam | "JEE_ADV" }, result: { score: number; maxScore: number }): MockTestToolUse {
  const key = `bp-${paper.slot}`;
  return { tool: "mock-test", key, testId: key, exam: mockExamSlug(paper.exam), scoreBand: mockScoreBand(result.score, result.maxScore) };
}
