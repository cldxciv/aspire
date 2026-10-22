import type { NextResponse } from "next/server";
import { authorizeRole } from "@/lib/auth/policy";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import {
  applyLeadGateCookies,
  leadGateRequiredResponse,
  recordLeadGateToolUse,
  resolveLeadGateAccess,
  type LeadGateAccess,
} from "@/lib/lead-gate/server";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { paperRelease, qbPaperPort, submitPaper } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestConflict, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { mockTestToolUse, neverGated, neverGatedPaper, paperToolUse } from "@/lib/mocktest/lead-gate";
import { parseBlueprintTest } from "@/lib/mocktest/resolve";
import { MOCKTEST_MAX_BODY_BYTES, scoreRequestSchema, type ScoreRequest } from "@/lib/mocktest/schemas";
import { mocktestLimiters, publicRelease, scoreForTest } from "@/lib/mocktest/service";
import { getClientIp } from "@/lib/server/request-guards";

/** English D-007 message of the gate 401 (the result page shows its own localised form). */
const GATE_MESSAGE = "Share a contact number once to see your score.";

/**
 * POST /api/mocktest/score — scores a finished attempt for anyone (guests included). Nothing about
 * the attempt is stored. `{ testId, answers, timeSpentSec?, startedAt?, record?, seen? }` →
 * `ScoredAttempt` (`{ testId, result, review, projection, sample, solutionsReleased,
 * solutionsReleaseAt }`). A score sent by the client is ignored.
 *
 * Lead gate (docs/lead-gate-plan.md §5.7): when LEAD_GATE=required and this browser holds no pass
 * (`resolveLeadGateAccess().enforce`; being signed in does not count, owner decision 22 Oct 2026:
 * staff and admins are asked like visitors, students and parents unless their account has a mobile
 * number on file), the answer is the gate 401 (`X-Lead-Gate: required`, body
 * `gate: "lead"`) and nothing is scored — sample tests included. Never gated (data the family
 * already has): an attempt that started before LEAD_GATE_SINCE (`startedAt`) or whose result this
 * browser already showed (`seen`). Both are the browser's word (guests' practice attempts have no
 * server record), so this gate is LEAD CAPTURE, not access control: a hand-made request can claim
 * either. With a pass that records use, the FIRST scoring of an attempt (`record: true`) notes the
 * test, its exam and a 10-point score band on the family's lead (never the score or answers).
 * Saving an attempt (POST /api/mocktest/attempts) scores it too, so it applies this same gate;
 * viewing a saved attempt (GET) is the student's own data and is not gated.
 *
 * Answer key (QA-SEC-M6 M1): for a test with a leaderboard, while a weekly window is open (until
 * its last attempts must have finished) the result keeps per-question correct / wrong / not
 * attempted but `review` is EMPTY and `solutionsReleased` false, with `solutionsReleaseAt`. A
 * student's own saved attempt gets its solutions from /api/mocktest/attempts instead. Practice
 * tests (no leaderboard) always release the key and solutions.
 *
 * Order: same-origin (403), 300 per IP per 10 minutes (429), JSON ≤ 16 KB (415 / 413 / 400; read
 * before the gate decision because `startedAt` and `seen` are in it), gate 401 unless
 * `neverGated`, unknown or hidden test (404), malformed answers (422). Every answer refreshes a
 * session cookie / clears a dead pass cookie (applyLeadGateCookies).
 *
 * Generated papers (`testId` "bp-…" with `paperId` / `paperToken`): see `scoreGeneratedPaper`
 * below — the paper is found first (404), ranked papers are refused (409 `use_attempts`), then the
 * same gate with the paper's server `createdAt`, then the answer lock (409 `paper_already_scored`).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "score", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const limit = mocktestLimiters.score.check(getClientIp(request.headers));
    if (!limit.allowed) return rateLimited(limit);

    const gate = await resolveLeadGateAccess();
    const body = await parseJsonBody(request, scoreRequestSchema, MOCKTEST_MAX_BODY_BYTES);
    if (!body.ok) return applyLeadGateCookies(body.response, gate);
    // Generated (exam-pattern) papers: their own rules below.
    if (body.data.paperId !== undefined || parseBlueprintTest(body.data.testId)) {
      return applyLeadGateCookies(await scoreGeneratedPaper(body.data, gate), gate);
    }
    if (gate.enforce && !neverGated(gate.since, body.data)) {
      mocktestLog({ route: "score", outcome: "gate_required" });
      return applyLeadGateCookies(leadGateRequiredResponse(GATE_MESSAGE), gate);
    }

    const test = getVisibleMockTest(body.data.testId);
    if (!test) return applyLeadGateCookies(testNotFound(), gate);

    const outcome = scoreForTest(test, body.data.answers, body.data.timeSpentSec, publicRelease(test, Date.now()));
    if (!outcome.ok) {
      return applyLeadGateCookies(portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: outcome.fieldErrors }), gate);
    }
    // Pass holders only (never sessions or the gate being off); never throws.
    if (body.data.record === true) recordLeadGateToolUse(gate, mockTestToolUse(test, outcome.scored.result));
    return applyLeadGateCookies(portalApiItem(outcome.scored), gate);
  } catch (error) {
    return mocktestServerError("score", error);
  }
}

/**
 * Generated papers (docs/question-bank-plan.md §B10): `testId` "bp-<slot>…" plus `paperId` and, for
 * a guest, `paperToken` (a signed-in student's own paper needs no token).
 * - 422 when `paperId` is missing for a "bp-" test, or sent with a fixed test;
 * - 404 unknown, expired or not yours (also when `testId` is not the paper's);
 * - 409 `use_attempts` for a RANKED paper: it is scored only when the student saves it
 *   (/api/mocktest/attempts), so /score can never act as an answer-key oracle for a live board;
 * - the lead gate as for fixed tests, but "started before LEAD_GATE_SINCE" uses the SERVER's
 *   `createdAt` of the paper, never the browser's `startedAt` (`seen` still counts);
 * - answer lock: the first scoring locks the answers; the same answers re-score (key corrections
 *   apply), different answers → 409 `paper_already_scored`. The first, plausibly timed scoring
 *   records the question statistics (once);
 * - key + solutions only after a quarter of the paper's time since it was made (`solutionsReleaseAt`);
 *   per-question outcomes and source labels straight away;
 * - tool use: `bp-<slot>` with the exam and a 10-point band (never the paper id or the score).
 */
async function scoreGeneratedPaper(data: ScoreRequest, gate: LeadGateAccess): Promise<NextResponse> {
  const ref = parseBlueprintTest(data.testId);
  if (!ref || data.paperId === undefined) {
    return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: ref ? { paperId: ["required"] } : { testId: ["invalid"] } });
  }
  const now = Date.now();
  const owner = authorizeRole(gate.session?.session ?? null, ["student"]);
  const port = await qbPaperPort();
  const record = await port.loadPaper(data.paperId, { token: data.paperToken ?? null, userId: owner.ok ? owner.session.userId : null }, now);
  if (!record || record.view.testId !== data.testId) return portalApiError("not_found", MOCKTEST_MESSAGES.paperNotFound);
  if (record.view.kind === "ranked") return mocktestConflict("use_attempts", MOCKTEST_MESSAGES.useAttempts);
  if (gate.enforce && !neverGatedPaper(gate.since, record.view, data)) {
    mocktestLog({ route: "score", outcome: "gate_required" });
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
  const scored = submission.outcome.scored;
  // Pass holders only (never sessions or the gate being off); never throws.
  if (data.record === true) recordLeadGateToolUse(gate, paperToolUse({ slot: record.view.slot, exam: record.view.exam }, scored.result));
  return portalApiItem(scored);
}
