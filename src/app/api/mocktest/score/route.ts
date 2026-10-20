import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { applyLeadGateCookies, leadGateRequiredResponse, recordLeadGateToolUse, resolveLeadGateAccess } from "@/lib/lead-gate/server";
import { getVisibleMockTest } from "@/lib/mocktest/catalog";
import { MOCKTEST_MESSAGES, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { mockTestToolUse, neverGated } from "@/lib/mocktest/lead-gate";
import { MOCKTEST_MAX_BODY_BYTES, scoreRequestSchema } from "@/lib/mocktest/schemas";
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
 * Lead gate (docs/lead-gate-plan.md §5.7): when LEAD_GATE=required and this browser is neither
 * signed in nor holding a pass, the answer is the gate 401 (`X-Lead-Gate: required`, body
 * `gate: "lead"`) and nothing is scored — sample tests included. Never gated (data the family
 * already has): an attempt that started before LEAD_GATE_SINCE (`startedAt`) or whose result this
 * browser already showed (`seen`). Both are the browser's word (guests' practice attempts have no
 * server record), so this gate is LEAD CAPTURE, not access control: a hand-made request can claim
 * either. With a pass that records use, the FIRST scoring of an attempt (`record: true`) notes the
 * test, its exam and a 10-point score band on the family's lead (never the score or answers).
 * Signed-in students' own saved attempts are scored by /api/mocktest/attempts (no gate).
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
