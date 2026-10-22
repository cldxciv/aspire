import { describe, expect, it } from "vitest";
import type { LocalAttempt } from "@/lib/mocktest/local-store";
import { fixedSaveBody, rankedSaveRefusal } from "./save-request";

// The result pages' POST /api/mocktest/attempts: what they send and how a refused ranked save is shown.

describe("fixedSaveBody (a fixed test's save from its result page)", () => {
  const attempt: LocalAttempt = {
    id: "attempt-abc123",
    testId: "neet-sample",
    answers: [0, null, 2],
    timeSpentSec: [10, 0, 30],
    startedAt: 1_000,
    submittedAt: 61_000,
    submitReason: "manual",
    score: 7,
    maxScore: 12,
  };

  it("sends `seen` (the result is already shown here, so the lead gate never asks) and never a client score", () => {
    const body = fixedSaveBody("neet-sample", attempt);
    expect(body).toEqual({
      testId: "neet-sample",
      attemptId: "attempt-abc123",
      answers: [0, null, 2],
      timeSpentSec: [10, 0, 30],
      startedAt: 1_000,
      submittedAt: 61_000,
      startToken: null,
      seen: true,
    });
    expect(body).not.toHaveProperty("score");
  });

  it("passes the server start token on", () => {
    expect(fixedSaveBody("weekly-1", { ...attempt, startToken: "A".repeat(32) }).startToken).toBe("A".repeat(32));
  });
});

describe("rankedSaveRefusal (a ranked paper's save that did not go through)", () => {
  const refused = (status: number, extra: { leadGate?: boolean; reason?: string | null } = {}) =>
    rankedSaveRefusal({ status, leadGate: extra.leadGate ?? false, reason: extra.reason ?? null });

  it("the lead gate's 401 shows the contact form (then the save again), never the sign-in notice", () => {
    expect(refused(401, { leadGate: true })).toEqual({ state: "locked" });
  });

  it("any other 401 / 403 asks to sign in; 404 expired; 409 conflict by reason; else an error", () => {
    expect(refused(401)).toEqual({ state: "signIn" });
    expect(refused(403)).toEqual({ state: "signIn" });
    expect(refused(404)).toEqual({ state: "expired" });
    expect(refused(409, { reason: "paper_already_scored" })).toEqual({ state: "conflict", reason: "scored" });
    expect(refused(409, { reason: "paper_already_saved" })).toEqual({ state: "conflict", reason: "saved" });
    expect(refused(500)).toEqual({ state: "error", status: 500 });
    expect(refused(0)).toEqual({ state: "error", status: 0 });
  });
});
