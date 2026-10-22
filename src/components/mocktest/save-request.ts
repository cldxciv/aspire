import type { LocalAttempt } from "@/lib/mocktest/local-store";

/**
 * POST /api/mocktest/attempts from the result pages (pure and client-safe; save-request.test.ts).
 * A generated paper's body is `paperSaveBody` (./paper-client.ts).
 */

/**
 * A fixed test's save from its result page. `seen`: the panel is part of a result already shown on
 * this device, so the lead gate never asks again (the /score rule).
 */
export function fixedSaveBody(testId: string, attempt: LocalAttempt) {
  return {
    testId,
    attemptId: attempt.id,
    answers: attempt.answers,
    timeSpentSec: attempt.timeSpentSec,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt,
    startToken: attempt.startToken ?? null,
    seen: true as const,
  };
}

export type RankedSaveRefusal =
  | { state: "locked" }
  | { state: "signIn" }
  | { state: "expired" }
  | { state: "conflict"; reason: "scored" | "saved" }
  | { state: "error"; status: number };

/**
 * A ranked paper's save that did not go through, as its result page shows it. The lead gate's 401
 * comes first (the save is the paper's first scoring) → `locked`: the contact form, then the save
 * again. Any other 401 / 403 → `signIn`; 404 → `expired`; 409 → `conflict`; else `error`.
 */
export function rankedSaveRefusal(response: { leadGate: boolean; status: number; reason: string | null }): RankedSaveRefusal {
  if (response.leadGate) return { state: "locked" };
  if (response.status === 401 || response.status === 403) return { state: "signIn" };
  if (response.status === 404) return { state: "expired" };
  if (response.status === 409) return { state: "conflict", reason: response.reason === "paper_already_scored" ? "scored" : "saved" };
  return { state: "error", status: response.status };
}
