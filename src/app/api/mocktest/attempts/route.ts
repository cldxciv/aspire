import { connection, type NextResponse } from "next/server";
import type { MockTestDefinition } from "@/content/mocktest/types";
import { PASSWORD_CHANGE_REQUIRED_MESSAGE, requireRole } from "@/lib/auth/guards";
import { authorizeRole, type AuthFailure } from "@/lib/auth/policy";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { applyLeadGateCookies, leadGateRequiredResponse, resolveLeadGateAccess, type LeadGateAccess } from "@/lib/lead-gate/server";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { paperRelease, paperTieBreak, qbPaperPort, scorePaperAnswers, submitPaper } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestConflict, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { neverGated, startedBeforeGate } from "@/lib/mocktest/lead-gate";
import { parseBlueprintTest } from "@/lib/mocktest/resolve";
import { attemptBodySchema, MOCKTEST_MAX_BODY_BYTES, type AttemptBody } from "@/lib/mocktest/schemas";
import { mocktestLimiters, OWN_ATTEMPT_RELEASE, scoreForTest } from "@/lib/mocktest/service";
import {
  findSavedClientAttempt,
  getAttemptForStudent,
  listAttemptsForStudent,
  paperLinkForAttempt,
  savePaperAttempt,
  saveTimedAttempt,
  summariseAttempts,
  summaryOf,
} from "@/lib/mocktest/store";
import type { SavedAttempt, SavedAttemptDetail, SavedPaperAttemptDetail } from "@/lib/mocktest/types";

const ID_PATTERN = /^[0-9a-f-]{36}$/;

/** English D-007 message of the gate 401, the same as /api/mocktest/score's (the result page shows its own localised form). */
const GATE_MESSAGE = "Share a contact number once to see your score.";

/**
 * GET /api/mocktest/attempts — the signed-in student's OWN saved attempts (D-034):
 * `{ attempts: SavedAttemptSummary[], summary: AttemptsSummary }`, or with `?id=<attempt id>` one
 * attempt with its answers and full scored result, solutions included (`SavedAttemptDetail`; 404
 * when it is not theirs). 401 signed out, 403 other roles.
 */
export async function GET(request: Request) {
  try {
    await connection();
    const auth = await requireRole("student");
    if (!auth.ok) return auth.response;
    const userId = auth.session.userId;
    const id = new URL(request.url).searchParams.get("id");
    if (id !== null) {
      if (!ID_PATTERN.test(id)) return portalApiError("bad_request", "Invalid attempt id.");
      const attempt = getAttemptForStudent(userId, id);
      if (!attempt) return portalApiError("not_found", "Attempt not found.");
      if (parseBlueprintTest(attempt.testId)) return await paperAttemptDetail(attempt);
      const test = getVisibleMockTest(attempt.testId);
      if (!test) return testNotFound();
      const outcome = rescoreSaved(test, attempt);
      if (!outcome.ok) return portalApiError("not_found", "Attempt not found.");
      return portalApiItem<SavedAttemptDetail>({ ...attempt, scored: outcome.scored });
    }
    return portalApiItem({ attempts: listAttemptsForStudent(userId), summary: summariseAttempts(userId) });
  } catch (error) {
    return mocktestServerError("attempts", error);
  }
}

/** A saved fixed-test attempt re-scored from its STORED answers, with solutions (its owner's own data). */
function rescoreSaved(test: MockTestDefinition, attempt: SavedAttempt) {
  let outcome = scoreForTest(test, attempt.answers, attempt.timeSpentSec, OWN_ATTEMPT_RELEASE);
  // JEE numerical marking fix (22 Oct 2026, +4 / 0 → +4 / −1): an attempt saved before it keeps
  // its stored score — re-scored with the old marking when that reproduces the stored score.
  if (outcome.ok && outcome.scored.result.score !== attempt.score) {
    const legacy = scoreForTest(test, attempt.answers, attempt.timeSpentSec, OWN_ATTEMPT_RELEASE, { legacyNumericalMarking: true });
    if (legacy.ok && legacy.scored.result.score === attempt.score) outcome = legacy;
  }
  return outcome;
}

/** requireRole's 401 / 403 for a decision made on the session the gate already resolved. */
function roleRefusal(error: AuthFailure): NextResponse {
  return error === "password_change_required" ? portalApiError("forbidden", PASSWORD_CHANGE_REQUIRED_MESSAGE) : portalApiError(error);
}

/**
 * POST /api/mocktest/attempts — saves a finished attempt for the signed-in student.
 * `{ testId, attemptId, answers, timeSpentSec, startedAt, submittedAt, startToken?, seen? }`. The server
 * re-scores from the answer key (a client score is ignored), stores the attempt and returns
 * `{ attempt, scored }` — the student's own saved attempt, so with solutions — 201 when new, 200
 * when this attempt id was already saved.
 *
 * Timing (QA-SEC-M6 M1): the browser's `startedAt` / `submittedAt` / `timeSpentSec` are kept for
 * the student's own analysis only. The attempt can count on a weekly leaderboard only with a
 * valid, unused `startToken` from POST /api/mocktest/start issued to this student for this test
 * while a window was open, and a SERVER-measured duration between the minimum and the time limit
 * + grace (src/lib/mocktest/timing.ts). Otherwise it is saved as practice (`attempt.leaderboard`
 * false, `attempt.practiceReason`) — a result is never rejected for its timing.
 *
 * Lead gate (docs/lead-gate-plan.md §5.7): saving scores the attempt, so it follows the same rule
 * as /api/mocktest/score — when `resolveLeadGateAccess().enforce` (LEAD_GATE=required and this
 * browser holds no pass; being signed in does not count) the answer is the gate 401
 * (`X-Lead-Gate: required`, body `gate: "lead"`) and nothing is scored or saved. Never gated, as
 * on /score: an attempt that started before LEAD_GATE_SINCE (`startedAt`) or whose result this
 * browser already showed (`seen: true`; the result page sends it). Like /score this is lead
 * capture, not access control (`seen` and `startedAt` are the browser's word). A retried save of
 * an attempt this student already saved at this test (same `testId` and `attemptId`) is answered
 * from the STORED row and its stored answers' scoring (200, as GET ?id= shows it) — never a scoring
 * of the retry's body. Viewing saved attempts (GET) is the student's own data and stays ungated.
 *
 * Same-origin (403) → student only (401 / 403) → 30 per student per hour (429) → JSON ≤ 16 KB →
 * gate 401 unless never gated → visible test (404) → answers valid (422). The session is read
 * once (with the gate), so every answer after the same-origin check re-issues a session cookie
 * whose expiry was just extended and clears a dead pass cookie (applyLeadGateCookies).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "attempts", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const gate = await resolveLeadGateAccess();
    const auth = authorizeRole(gate.session?.session ?? null, ["student"]);
    if (!auth.ok) return applyLeadGateCookies(roleRefusal(auth.error), gate);
    const userId = auth.session.userId;

    const limit = mocktestLimiters.attempts.check(userId);
    if (!limit.allowed) return applyLeadGateCookies(rateLimited(limit), gate);

    const body = await parseJsonBody(request, attemptBodySchema, MOCKTEST_MAX_BODY_BYTES);
    if (!body.ok) return applyLeadGateCookies(body.response, gate);
    const data = body.data;
    // Generated (exam-pattern) papers: their own rules below.
    if (data.paperId !== undefined || parseBlueprintTest(data.testId)) {
      return applyLeadGateCookies(await savePaperRequest(data, userId, gate), gate);
    }
    let retried: SavedAttempt | null = null;
    if (gate.enforce && !neverGated(gate.since, data)) {
      retried = findSavedClientAttempt(userId, data.testId, data.attemptId);
      if (!retried) {
        mocktestLog({ route: "attempts", outcome: "gate_required" });
        return applyLeadGateCookies(leadGateRequiredResponse(GATE_MESSAGE), gate);
      }
    }

    const test = getVisibleMockTest(data.testId);
    if (!test) return applyLeadGateCookies(testNotFound(), gate);
    if (retried) {
      const stored = rescoreSaved(test, retried);
      if (!stored.ok) return applyLeadGateCookies(portalApiError("not_found", "Attempt not found."), gate);
      return applyLeadGateCookies(portalApiItem({ attempt: summaryOf(retried), scored: stored.scored }, { status: 200 }), gate);
    }

    const outcome = scoreForTest(test, data.answers, data.timeSpentSec, OWN_ATTEMPT_RELEASE);
    if (!outcome.ok) {
      return applyLeadGateCookies(portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: outcome.fieldErrors }), gate);
    }

    // Browser times: the student's own record only, made consistent (never in the future).
    const now = Date.now();
    const submittedAt = Math.min(data.submittedAt, now);
    const startedAt = Math.min(data.startedAt, submittedAt);

    const { attempt, created } = saveTimedAttempt({
      userId,
      test,
      startToken: data.startToken,
      attemptId: data.attemptId,
      answers: outcome.answers,
      timeSpentSec: outcome.timeSpentSec,
      result: outcome.scored.result,
      timeTakenSec: outcome.timeTakenSec,
      startedAt,
      submittedAt,
      now,
    });
    return applyLeadGateCookies(portalApiItem({ attempt: summaryOf(attempt), scored: outcome.scored }, { status: created ? 201 : 200 }), gate);
  } catch (error) {
    return mocktestServerError("attempts", error);
  }
}

/**
 * POST for a generated paper (docs/question-bank-plan.md §B9.4, §B10): `testId` "bp-<slot>…",
 * `paperId`, and `paperToken` unless the student made the paper while signed in (ranked papers:
 * the owner's session only). The paper's server `createdAt` is the attempt's server start (no start
 * token). A ranked paper ("bp-<slot>-ranked") counts on its month's board when its owner saves it
 * within the time rules; it is saved ONCE (409 `paper_already_saved`), with its official tie-break
 * vector. Practice papers are saved as practice. The answer lock applies (409 `paper_already_scored`
 * when the paper was already scored with other answers). Key + solutions follow the paper's
 * release rule: practice a quarter of its time after it was made, ranked when the month closes
 * (a ranked paper's per-question source labels too: `paper.sourcesWithheldUntil`).
 * 422 `paperId` missing (or sent with a fixed test), 404 unknown / expired / not yours.
 *
 * Lead gate, after the paper is found (404 first, as on /score) and BEFORE anything is scored or
 * locked. Never gated: a paper made before LEAD_GATE_SINCE (its SERVER `createdAt`, never the
 * browser's `startedAt`), or one already scored (`view.scored`: its answers are locked and its
 * result was shown; a practice paper is scored by /score before the result page saves it). `seen`
 * is IGNORED here: every route that shows a paper's result scores (and so locks) it first, so
 * "seen" on an unscored paper is a claim the server knows to be false. A RANKED paper is scored
 * only here (/score refuses it), so its first save is where the gate asks.
 */
async function savePaperRequest(data: AttemptBody, userId: string, gate: LeadGateAccess): Promise<NextResponse> {
  const ref = parseBlueprintTest(data.testId);
  if (!ref || data.paperId === undefined) {
    return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: ref ? { paperId: ["required"] } : { testId: ["invalid"] } });
  }
  const now = Date.now();
  const port = await qbPaperPort();
  const record = await port.loadPaper(data.paperId, { token: data.paperToken ?? null, userId }, now);
  if (!record || record.view.testId !== data.testId) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
  if (gate.enforce && !record.view.scored && !startedBeforeGate(gate.since, record.view.createdAt)) {
    mocktestLog({ route: "attempts", outcome: "gate_required" });
    return leadGateRequiredResponse(GATE_MESSAGE);
  }
  const submission = await submitPaper(port, record, {
    answers: data.answers,
    timeSpentSec: data.timeSpentSec,
    release: paperRelease(record.view, now),
    now,
  });
  if (!submission.ok) {
    if (submission.reason === "paper_already_scored") return mocktestConflict("paper_already_scored", MOCKTEST_MESSAGES.alreadyScored);
    if (submission.reason === "paper_not_found") return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
    return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: submission.fieldErrors });
  }
  const { outcome } = submission;
  // Browser times: the student's own record only, made consistent (never in the future).
  const submittedAt = Math.min(data.submittedAt, now);
  const startedAt = Math.min(data.startedAt, submittedAt);
  const saved = savePaperAttempt({
    userId,
    testId: record.view.testId,
    attemptId: data.attemptId,
    answers: outcome.answers,
    timeSpentSec: outcome.timeSpentSec,
    result: outcome.scored.result,
    timeTakenSec: outcome.timeTakenSec,
    startedAt,
    submittedAt,
    now,
    paper: {
      id: record.view.id,
      kind: record.view.kind,
      userId: record.userId,
      windowId: record.view.windowId,
      createdAt: record.view.createdAt,
      durationMinutes: record.view.durationMinutes,
    },
    tiebreak: paperTieBreak(record, outcome.scored.result),
  });
  if (!saved.ok) return mocktestConflict("paper_already_saved", MOCKTEST_MESSAGES.alreadySaved);
  return portalApiItem({ attempt: summaryOf(saved.attempt), scored: outcome.scored }, { status: saved.created ? 201 : 200 });
}

/** GET ?id= for an attempt at a generated paper: re-scored from the stored answers (key corrections apply). */
async function paperAttemptDetail(attempt: SavedAttempt): Promise<Response> {
  const link = paperLinkForAttempt(attempt.id);
  if (!link) return portalApiError("not_found", "Attempt not found.");
  const now = Date.now();
  const port = await qbPaperPort();
  const record = await port.loadPaperTrusted(link.paperId, now);
  if (!record) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
  const review = await port.reviewItems(record, now);
  const outcome = scorePaperAnswers(record, review, attempt.answers, attempt.timeSpentSec, paperRelease(record.view, now));
  if (!outcome.ok) return portalApiError("not_found", "Attempt not found.");
  return portalApiItem<SavedPaperAttemptDetail>({ ...attempt, paperId: link.paperId, rescoredAt: link.rescoredAt, scored: outcome.scored });
}
