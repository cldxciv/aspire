import { authorizeRole } from "@/lib/auth/policy";
import { PASSWORD_CHANGE_REQUIRED_MESSAGE } from "@/lib/auth/guards";
import { parseJsonBody, rejectCrossOrigin } from "@/lib/auth/request";
import { portalApiError, portalApiItem } from "@/lib/auth/responses";
import { getSession } from "@/lib/auth/session";
import { showPlaceholderContent } from "@/lib/content-mode";
import { generationEnabled, qbPaperPort } from "@/lib/mocktest/generated";
import { MOCKTEST_MESSAGES, mocktestConflict, mocktestLog, mocktestServerError, rateLimited, testNotFound } from "@/lib/mocktest/http";
import { mocktestLimiters } from "@/lib/mocktest/service";
import type { PaperStart } from "@/lib/mocktest/types";
import { paperCreateSchema } from "@/lib/qb/schemas";
import { getClientIp } from "@/lib/server/request-guards";

const PAPERS_MAX_BODY_BYTES = 2 * 1024;

/**
 * POST /api/mocktest/papers — makes a NEW exam-pattern paper for this attempt (docs/question-bank-plan.md
 * §B9–B10): `paperCreateSchema` (src/lib/qb/schemas.ts) `{ slot, mode?: "practice" | "ranked",
 * language?: "en" | "hi", compensatory?: boolean, recent?: { id, token }[] ≤ 5 }` (a malformed
 * `recent` is ignored) → 201 `PaperStart` `{ token, resumed, setId, papers }`.
 *
 * - Practice (anyone, guests included): a fresh paper every time; `token` is the bearer token of
 *   the paper(s), handed out ONCE (only its SHA-256 is stored) — keep it to resume, score and
 *   report. `recent` lets a guest's next paper avoid the questions of their last papers.
 * - Ranked (signed-in students only; 401 / 403): this month's ONE shared paper; a repeat request
 *   returns the same paper with `resumed: true` (200) and `token: null` (the owner's session opens it).
 *   Compensatory time is for practice papers only (422): such attempts are never ranked.
 * - The bank is honest when it is small: 409 `bank_thin` (with `readiness`) when not even a shorter
 *   practice set can be made, 409 `ranked_off` / `ranked_unavailable` for the ranked paper.
 *   Papers are never padded with invented questions.
 *
 * No server-side lead gate here: like /api/mocktest/start, the runner asks for contact details
 * BEFORE calling this for papers of 60 minutes or more (fails open); readiness is fetched first
 * (GET /api/mocktest/papers/readiness) so nobody is asked for a slot that answers `bank_thin`.
 *
 * Same-origin (403) → per IP 150 per 10 minutes and 600 per day (429; a school lab shares an IP)
 * → JSON ≤ 2 KB (415 / 413 / 400; an unknown slot is a 422 field error) → generation on (503) →
 * ranked rules → per signed-in student 10 per hour (429) → no published blueprint (404).
 */
export async function POST(request: Request) {
  try {
    const crossOrigin = rejectCrossOrigin(request);
    if (crossOrigin) {
      mocktestLog({ route: "papers", outcome: "forbidden", reason: crossOrigin.reason });
      return crossOrigin.response;
    }
    const ip = getClientIp(request.headers);
    const limit = mocktestLimiters.papers.check(ip);
    if (!limit.allowed) return rateLimited(limit);
    const daily = mocktestLimiters.papersDaily.check(ip);
    if (!daily.allowed) return rateLimited(daily);

    const body = await parseJsonBody(request, paperCreateSchema, PAPERS_MAX_BODY_BYTES);
    if (!body.ok) return body.response;
    const data = body.data;
    if (!generationEnabled()) return portalApiError("not_configured", MOCKTEST_MESSAGES.generationOff);

    const session = await getSession();
    const auth = authorizeRole(session, ["student"]);
    const userId = auth.ok ? auth.session.userId : null;
    if (data.mode === "ranked") {
      if (!session) return portalApiError("unauthenticated", MOCKTEST_MESSAGES.rankedSignIn);
      if (!auth.ok) {
        return portalApiError("forbidden", auth.error === "password_change_required" ? PASSWORD_CHANGE_REQUIRED_MESSAGE : MOCKTEST_MESSAGES.rankedSignIn);
      }
      if (data.compensatory) return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: { compensatory: ["practice_only"] } });
    }
    if (userId !== null) {
      const own = mocktestLimiters.papersStudent.check(userId);
      if (!own.allowed) return rateLimited(own);
    }

    const port = await qbPaperPort();
    const result = await port.createPaper({
      slot: data.slot,
      mode: data.mode,
      userId,
      language: data.language,
      compensatory: data.compensatory,
      // A signed-in student's history is read on the server; the browser's list is for guests.
      recent: userId === null ? (data.recent ?? []) : [],
      placeholderMode: showPlaceholderContent(),
      now: Date.now(),
    });
    if (!result.ok) {
      mocktestLog({ route: "papers", outcome: "refused", reason: result.reason });
      switch (result.reason) {
        case "no_blueprint":
          return testNotFound();
        case "thin":
          return mocktestConflict("bank_thin", MOCKTEST_MESSAGES.bankThin, { readiness: result.readiness ?? null });
        case "ranked_off":
          return mocktestConflict("ranked_off", MOCKTEST_MESSAGES.rankedOff);
        case "ranked_unavailable":
          return mocktestConflict("ranked_unavailable", MOCKTEST_MESSAGES.rankedUnavailable);
        case "language":
          return portalApiError("validation", MOCKTEST_MESSAGES.validation, { fieldErrors: { language: ["unsupported"] } });
        case "signed_out":
          // The session is checked above; the bank refuses a ranked paper without a student too.
          return portalApiError("unauthenticated", MOCKTEST_MESSAGES.rankedSignIn);
      }
    }
    mocktestLog({ route: "papers", outcome: "success", reason: result.resumed ? "resumed" : data.mode });
    return portalApiItem<PaperStart>(
      {
        token: result.token,
        resumed: result.resumed,
        setId: result.papers[0]?.view.setId ?? null,
        papers: result.papers.map((paper) => paper.view),
      },
      { status: result.resumed ? 200 : 201 },
    );
  } catch (error) {
    return mocktestServerError("papers", error);
  }
}
