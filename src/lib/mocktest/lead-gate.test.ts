import { describe, expect, it } from "vitest";

import { MOCK_TESTS } from "@/content/mocktest";
import { GATE_AT_START_MINUTES, gateAtStart, mockExamSlug, mockTestToolUse, neverGated, startedBeforeGate } from "./lead-gate";
import { scoreRequestSchema } from "./schemas";

// Mock tests and the lead gate (docs/lead-gate-plan.md §5.7, §8.4): pure rules.

describe("where a mock test asks for contact details", () => {
  it("tests of 60 minutes or more ask at the start; shorter ones at the result", () => {
    expect(GATE_AT_START_MINUTES).toBe(60);
    expect(gateAtStart(180)).toBe(true);
    expect(gateAtStart(60)).toBe(true);
    expect(gateAtStart(59)).toBe(false);
    expect(gateAtStart(30)).toBe(false);
    expect(gateAtStart(Number.NaN)).toBe(false);
  });

  it("the sample catalog: the 60-minute JEE test asks at the start, the 45-minute NEET and 30-minute weekly tests at the result", () => {
    const at = Object.fromEntries(MOCK_TESTS.map((test) => [test.id, gateAtStart(test.durationMinutes)]));
    expect(at).toMatchObject({ "jee-main-sample": true, "neet-sample": false, "all-himachal-mock-sample": false });
  });
});

describe("earlier attempts are never gated", () => {
  const since = Date.parse("2026-10-21T04:00:00Z");

  it("only a start before LEAD_GATE_SINCE counts", () => {
    expect(startedBeforeGate(since, since - 1)).toBe(true);
    expect(startedBeforeGate(since, since)).toBe(false);
    expect(startedBeforeGate(since, since + 60_000)).toBe(false);
  });

  it("unknown switch-on time or start → not an earlier attempt", () => {
    expect(startedBeforeGate(null, since - 1)).toBe(false);
    expect(startedBeforeGate(since, undefined)).toBe(false);
    expect(startedBeforeGate(since, null)).toBe(false);
    expect(startedBeforeGate(since, 0)).toBe(false);
    expect(startedBeforeGate(since, Number.NaN)).toBe(false);
  });

  it("the score request keeps a valid start and ignores a malformed one (never a 422)", () => {
    const base = { testId: "neet-sample", answers: [0, null] };
    expect(scoreRequestSchema.parse({ ...base, startedAt: since - 1, record: true })).toMatchObject({ startedAt: since - 1, record: true });
    for (const startedAt of ["yesterday", -5, 1.5, null]) {
      const parsed = scoreRequestSchema.safeParse({ ...base, startedAt, record: "yes", seen: "yes" });
      expect(parsed.success, String(startedAt)).toBe(true);
      expect(parsed.data?.startedAt).toBeUndefined();
      expect(parsed.data?.record).toBeUndefined();
      expect(parsed.data?.seen).toBeUndefined();
    }
    expect(scoreRequestSchema.parse({ ...base, seen: true })).toMatchObject({ seen: true });
    expect(scoreRequestSchema.parse({ ...base, seen: false }).seen).toBeUndefined();
  });

  it("a result this browser already showed (`seen`) stays open, with or without LEAD_GATE_SINCE", () => {
    expect(neverGated(since, { seen: true })).toBe(true);
    expect(neverGated(null, { seen: true, startedAt: since + 60_000 })).toBe(true);
    expect(neverGated(since, { startedAt: since - 1 })).toBe(true);
    expect(neverGated(since, { startedAt: since + 60_000 })).toBe(false);
    expect(neverGated(null, { startedAt: since - 1 })).toBe(false);
    expect(neverGated(since, {})).toBe(false);
    expect(neverGated(since, { seen: false, startedAt: since + 1 })).toBe(false);
    expect(neverGated(since, { seen: null })).toBe(false);
  });
});

describe("tool-use note of a scored mock test", () => {
  it("test, exam slug and a 10-point band only — never the exact score", () => {
    const neet = { id: "neet-sample", exam: "NEET" as const };
    expect(mockTestToolUse(neet, { score: 35, maxScore: 160 })).toEqual({
      tool: "mock-test",
      key: "neet-sample",
      testId: "neet-sample",
      exam: "neet",
      scoreBand: "pct-20-29",
    });
    expect(mockTestToolUse(neet, { score: -8, maxScore: 160 }).scoreBand).toBe("pct-below-0");
    expect(mockTestToolUse(neet, { score: 160, maxScore: 160 }).scoreBand).toBe("pct-90-100");
    expect(mockTestToolUse(neet, { score: 0, maxScore: 0 }).scoreBand).toBeNull();
    expect(mockExamSlug("JEE_MAIN")).toBe("jee-main");
    expect(mockExamSlug("BOH")).toBe("boh");
  });
});
