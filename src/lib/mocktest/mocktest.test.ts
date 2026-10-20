import { describe, expect, it } from "vitest";
import { MOCK_QUESTIONS, MOCK_TESTS, weeklyWindows } from "@/content/mocktest";
import { DISTRICT_IDS, HP_DISTRICTS } from "@/content/mocktest/districts";
import { MOCK_TOPICS } from "@/content/mocktest/topics";
import { computeBadges, isTopTenPercent, istDayNumber, longestStreakDays } from "./badges";
import { rankEntries, schoolKey } from "./leaderboard";
import {
  createRunnerState,
  isRunnerState,
  MAX_TICK_GAP_MS,
  paletteCounts,
  paletteStatus,
  runnerReducer,
  timeSpentSeconds,
  type RunnerState,
} from "./runner-state";
import { attemptBodySchema, nicknameIssue, profileBodySchema, schoolIssue } from "./schemas";
import { normaliseAnswer, parseNumeric, questionOutcome, scoreAttempt, strengthLevel, type ScorableQuestion } from "./scoring";
import { buildStudyPlan, dayType, prioritiseTopics, type PlanTopicInput } from "./study-plan";
import { crossedWarning, formatClock, remainingMs, shouldAutoSubmit } from "./timer";

const mcq = (id: string, answer: number, extra: Partial<ScorableQuestion> = {}): ScorableQuestion => ({
  id,
  subject: "physics",
  topic: "phy-kinematics",
  type: "mcq",
  optionCount: 4,
  answer,
  marking: { correct: 4, wrong: -1 },
  ...extra,
});
const numerical = (id: string, answer: number, extra: Partial<ScorableQuestion> = {}): ScorableQuestion => ({
  id,
  subject: "maths",
  topic: "math-integrals",
  type: "numerical",
  answer,
  tolerance: 0,
  marking: { correct: 4, wrong: 0 },
  ...extra,
});

describe("scoring with negative marking", () => {
  const questions = [mcq("q1", 1), mcq("q2", 2), mcq("q3", 0), numerical("q4", 60), numerical("q5", 2.5), numerical("q6", 3)];

  it("adds +4 per correct, −1 per wrong MCQ, 0 for a wrong numerical and 0 for unattempted", () => {
    const result = scoreAttempt(questions, [1, 3, null, "60", "2.4", null], [30, 40, 0, 50, 60, 5]);
    expect(result.correct).toBe(2);
    expect(result.wrong).toBe(2);
    expect(result.unattempted).toBe(2);
    expect(result.attempted).toBe(4);
    expect(result.score).toBe(4 - 1 + 0 + 4 + 0 + 0);
    expect(result.maxScore).toBe(24);
    expect(result.accuracy).toBeCloseTo(0.5);
    expect(result.timeSec).toBe(185);
    expect(result.questions.map((q) => q.outcome)).toEqual(["correct", "wrong", "unattempted", "correct", "wrong", "unattempted"]);
    expect(result.questions.map((q) => q.marks)).toEqual([4, -1, 0, 4, 0, 0]);
  });

  it("can go below zero", () => {
    expect(scoreAttempt([mcq("a", 0), mcq("b", 0)], [1, 2]).score).toBe(-2);
  });

  it("numerical answers: equivalent spellings and tolerance", () => {
    const q = numerical("n", 60);
    for (const ok of ["60", "60.0", "+60", " 60 ", 60]) expect(questionOutcome(q, ok as never), String(ok)).toBe("correct");
    for (const bad of ["61", "6e1", "60abc"]) expect(questionOutcome(q, bad), bad).toBe("wrong");
    expect(questionOutcome(numerical("t", 1.5, { tolerance: 0.05 }), "1.54")).toBe("correct");
    expect(questionOutcome(numerical("t", 1.5, { tolerance: 0.05 }), "1.56")).toBe("wrong");
    expect(questionOutcome(numerical("neg", -3), "-3")).toBe("correct");
  });

  it("parseNumeric accepts plain decimals only", () => {
    expect(parseNumeric("12")).toBe(12);
    expect(parseNumeric("-0.5")).toBe(-0.5);
    expect(parseNumeric(".5")).toBe(0.5);
    expect(parseNumeric("1e3")).toBeNull();
    expect(parseNumeric("Infinity")).toBeNull();
    expect(parseNumeric("")).toBeNull();
    expect(parseNumeric("1234567890123")).toBeNull();
  });

  it("normaliseAnswer rejects out-of-range options and non-numbers", () => {
    expect(normaliseAnswer(mcq("x", 0), 3)).toEqual({ ok: true, value: 3 });
    expect(normaliseAnswer(mcq("x", 0), 4)).toEqual({ ok: false });
    expect(normaliseAnswer(mcq("x", 0), 1.5)).toEqual({ ok: false });
    expect(normaliseAnswer(mcq("x", 0), "1")).toEqual({ ok: false });
    expect(normaliseAnswer(mcq("x", 0), null)).toEqual({ ok: true, value: null });
    expect(normaliseAnswer(numerical("y", 1), "abc")).toEqual({ ok: false });
    expect(normaliseAnswer(numerical("y", 1), "  ")).toEqual({ ok: true, value: null });
    expect(normaliseAnswer(numerical("y", 1), 7)).toEqual({ ok: true, value: "7" });
  });

  it("summarises subjects and topics with strength levels", () => {
    const qs = [
      mcq("a", 0, { topic: "phy-optics" }),
      mcq("b", 0, { topic: "phy-optics" }),
      mcq("c", 0, { topic: "phy-current" }),
      mcq("d", 0, { topic: "phy-current" }),
      mcq("e", 0, { topic: "phy-modern" }),
      numerical("f", 1),
    ];
    const result = scoreAttempt(qs, [0, 0, 0, 1, null, "2"]);
    const topic = (id: string) => result.topics.find((t) => t.topic === id);
    expect(topic("phy-optics")?.level).toBe("strong");
    expect(topic("phy-current")?.level).toBe("developing");
    expect(topic("phy-modern")?.level).toBe("skipped");
    expect(topic("math-integrals")?.level).toBe("weak");
    expect(result.subjects.map((s) => [s.subject, s.score, s.maxScore])).toEqual([
      ["physics", 4 + 4 + 4 - 1, 20],
      ["maths", 0, 4],
    ]);
    expect(strengthLevel({ attempted: 0, correct: 0 }, 3)).toBe("skipped");
  });
});

describe("question bank (sample content, D-032)", () => {
  const byId = new Map(MOCK_QUESTIONS.map((q) => [q.id, q]));

  it("has unique ids, valid answers, four options, bilingual text and known topics", () => {
    expect(byId.size).toBe(MOCK_QUESTIONS.length);
    for (const q of MOCK_QUESTIONS) {
      expect(q.status, q.id).toBe("placeholder");
      expect(q.source, q.id).toBe("Aspire sample");
      for (const text of [q.stem, q.solution]) {
        expect(text.en.trim().length, q.id).toBeGreaterThan(10);
        expect(text.hi, q.id).toMatch(/[ऀ-ॿ]/);
      }
      expect(MOCK_TOPICS[q.topic]?.subject, `${q.id} topic`).toBe(q.subject);
      if (q.type === "mcq") {
        expect(q.options, q.id).toHaveLength(4);
        expect(new Set(q.options.map((o) => o.en)).size, `${q.id} distinct options`).toBe(4);
        for (const o of q.options) expect(o.hi.trim(), q.id).not.toBe("");
        expect(q.answer, q.id).toBeGreaterThanOrEqual(0);
        expect(q.answer, q.id).toBeLessThan(4);
        expect(q.marking, q.id).toEqual({ correct: 4, wrong: -1 });
      } else {
        expect(Number.isFinite(q.answer), q.id).toBe(true);
        expect(q.exam, q.id).toBe("JEE_MAIN");
        expect(q.marking, q.id).toEqual({ correct: 4, wrong: 0 });
      }
    }
  });

  it("JEE Main sample: 15 each of Physics, Chemistry, Maths (12 MCQ + 3 numerical), 60 minutes", () => {
    const test = MOCK_TESTS.find((t) => t.id === "jee-main-sample")!;
    expect(test.durationMinutes).toBe(60);
    expect(test.sections.map((s) => [s.subject, s.questionIds.length])).toEqual([
      ["physics", 15],
      ["chemistry", 15],
      ["maths", 15],
    ]);
    for (const section of test.sections) {
      const types = section.questionIds.map((id) => byId.get(id)!.type);
      expect(types.filter((t) => t === "mcq")).toHaveLength(12);
      expect(types.filter((t) => t === "numerical")).toHaveLength(3);
    }
  });

  it("NEET sample: 10 each of Physics, Chemistry, Botany, Zoology, 45 minutes, MCQ only", () => {
    const test = MOCK_TESTS.find((t) => t.id === "neet-sample")!;
    expect(test.durationMinutes).toBe(45);
    expect(test.sections.map((s) => [s.subject, s.questionIds.length])).toEqual([
      ["physics", 10],
      ["chemistry", 10],
      ["botany", 10],
      ["zoology", 10],
    ]);
    for (const id of test.sections.flatMap((s) => s.questionIds)) expect(byId.get(id)!.type).toBe("mcq");
  });

  it("every test references existing questions of its own exam; tests are placeholders", () => {
    for (const test of MOCK_TESTS) {
      expect(test.status).toBe("placeholder");
      for (const section of test.sections) {
        for (const id of section.questionIds) {
          expect(byId.get(id)?.subject, `${test.id}/${id}`).toBe(section.subject);
          expect(byId.get(id)?.exam, `${test.id}/${id}`).toBe(test.exam);
        }
      }
    }
  });

  it("spreads each test's MCQ answer key over A–D, so no single letter can be guessed (CONTENT-VERIFY)", () => {
    for (const test of MOCK_TESTS) {
      const keys = test.sections.flatMap((s) => s.questionIds.map((id) => byId.get(id)!)).flatMap((q) => (q.type === "mcq" ? [q.answer] : []));
      for (let option = 0; option < 4; option++) {
        const share = keys.filter((k) => k === option).length / keys.length;
        expect(share, `${test.id} option ${option}`).toBeGreaterThan(0.15);
        expect(share, `${test.id} option ${option}`).toBeLessThanOrEqual(0.35);
      }
    }
  });

  it("weekly windows are consecutive Monday–Sunday IST weeks", () => {
    const windows = weeklyWindows("2026-10-19", 3);
    expect(windows[0]).toEqual({ id: "week-2026-10-19", startsAt: "2026-10-19T00:00:00+05:30", endsAt: "2026-10-25T23:59:59+05:30" });
    expect(windows[1].startsAt).toBe("2026-10-26T00:00:00+05:30");
    expect(Date.parse(windows[1].startsAt) - Date.parse(windows[0].endsAt)).toBe(1000);
    expect(MOCK_TESTS.find((t) => t.kind === "weekly")?.windows?.length).toBeGreaterThan(0);
  });

  it("has Himachal's 12 districts", () => {
    expect(HP_DISTRICTS).toHaveLength(12);
    expect(new Set(DISTRICT_IDS).size).toBe(12);
  });
});

describe("palette state machine (NTA convention)", () => {
  const T0 = 1_000_000;
  const fresh = (durationMinutes = 60) => createRunnerState({ testId: "t", attemptId: "attempt-1", questionCount: 4, durationMinutes, now: T0 });

  it("starts with Q1 visited (not answered) and the rest not visited", () => {
    const s = fresh();
    expect([0, 1, 2, 3].map((i) => paletteStatus(s, i))).toEqual(["notAnswered", "notVisited", "notVisited", "notVisited"]);
  });

  it("answer / save & next / mark & next / clear / goto give the five statuses", () => {
    let s: RunnerState = fresh();
    s = runnerReducer(s, { type: "answer", value: 2, now: T0 + 1000 });
    expect(paletteStatus(s, 0)).toBe("answered");
    s = runnerReducer(s, { type: "saveNext", now: T0 + 2000 });
    expect(s.current).toBe(1);
    s = runnerReducer(s, { type: "markNext", now: T0 + 3000 });
    expect(paletteStatus(s, 1)).toBe("marked");
    s = runnerReducer(s, { type: "answer", value: "12", now: T0 + 4000 });
    s = runnerReducer(s, { type: "markNext", now: T0 + 5000 });
    expect(paletteStatus(s, 2)).toBe("answeredMarked");
    expect(s.current).toBe(3);
    s = runnerReducer(s, { type: "goto", index: 0, now: T0 + 6000 });
    s = runnerReducer(s, { type: "clear", now: T0 + 7000 });
    expect(paletteStatus(s, 0)).toBe("notAnswered");
    expect(paletteCounts(s)).toEqual({ notVisited: 0, notAnswered: 2, answered: 0, marked: 1, answeredMarked: 1 });
    // Save & Next on a marked question removes the mark.
    s = runnerReducer(s, { type: "goto", index: 2, now: T0 + 8000 });
    s = runnerReducer(s, { type: "saveNext", now: T0 + 9000 });
    expect(paletteStatus(s, 2)).toBe("answered");
  });

  it("does not move past the first or last question", () => {
    let s = runnerReducer(fresh(), { type: "previous", now: T0 + 1 });
    expect(s.current).toBe(0);
    s = runnerReducer(s, { type: "goto", index: 3, now: T0 + 2 });
    s = runnerReducer(s, { type: "saveNext", now: T0 + 3 });
    expect(s.current).toBe(3);
  });

  it("accrues time to the question on screen, capped per step and at the deadline", () => {
    let s = fresh();
    s = runnerReducer(s, { type: "tick", now: T0 + 5000 });
    s = runnerReducer(s, { type: "goto", index: 1, now: T0 + 8000 });
    s = runnerReducer(s, { type: "tick", now: T0 + 8000 + MAX_TICK_GAP_MS + 60_000 });
    expect(timeSpentSeconds(s)).toEqual([8, MAX_TICK_GAP_MS / 1000, 0, 0]);
    // After a reload, the time the page was closed is not credited to a question.
    const resumed = runnerReducer(s, { type: "resume", now: T0 + 30 * 60_000 });
    expect(timeSpentSeconds(runnerReducer(resumed, { type: "tick", now: T0 + 30 * 60_000 + 1000 }))).toEqual([8, 601, 0, 0]);
    // Never past the deadline.
    const short = runnerReducer(fresh(1), { type: "tick", now: T0 + 5 * 60_000 });
    expect(timeSpentSeconds(short)).toEqual([60, 0, 0, 0]);
  });

  it("ignores every action after submission", () => {
    const s = runnerReducer(fresh(), { type: "submit", now: T0 + 1000, reason: "manual" });
    expect(s.submittedAt).toBe(T0 + 1000);
    expect(runnerReducer(s, { type: "answer", value: 1, now: T0 + 2000 })).toBe(s);
  });

  it("validates saved state", () => {
    const s = fresh();
    expect(isRunnerState(JSON.parse(JSON.stringify(s)), "t", 4)).toBe(true);
    expect(isRunnerState(s, "other", 4)).toBe(false);
    expect(isRunnerState(s, "t", 5)).toBe(false);
    expect(isRunnerState({ ...s, version: 2 }, "t", 4)).toBe(false);
  });
});

describe("timer and auto-submit", () => {
  it("auto-submits exactly at the deadline, once", () => {
    const state = { deadline: 10_000, submittedAt: null };
    expect(shouldAutoSubmit(state, 9_999)).toBe(false);
    expect(shouldAutoSubmit(state, 10_000)).toBe(true);
    expect(shouldAutoSubmit({ ...state, submittedAt: 10_000 }, 20_000)).toBe(false);
    expect(remainingMs(10_000, 12_000)).toBe(0);
  });

  it("a timed-out submit records the deadline, not the late reload time", () => {
    const s = createRunnerState({ testId: "t", attemptId: "attempt-1", questionCount: 2, durationMinutes: 1, now: 0 });
    const done = runnerReducer(s, { type: "submit", now: 5 * 60_000, reason: "timeout" });
    expect(done.submittedAt).toBe(60_000);
    expect(done.submitReason).toBe("timeout");
  });

  it("formats the clock and announces the 5- and 1-minute marks", () => {
    expect(formatClock(3_600_000)).toBe("01:00:00");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(0)).toBe("00:00");
    expect(crossedWarning(301_000, 299_000)).toBe("five");
    expect(crossedWarning(61_000, 60_000)).toBe("one");
    expect(crossedWarning(200_000, 199_000)).toBeNull();
  });
});

describe("30-day study plan", () => {
  const topics: PlanTopicInput[] = [
    { subject: "physics", topic: "phy-optics", mastery: 1, level: "strong" },
    { subject: "chemistry", topic: "chem-mole", mastery: 0.5, level: "developing" },
    { subject: "maths", topic: "math-limits", mastery: 0, level: "weak" },
    { subject: "physics", topic: "phy-current", mastery: 0, level: "skipped" },
  ];

  it("orders weak / skipped topics first", () => {
    expect(prioritiseTopics(topics).map((t) => t.topic)).toEqual(["math-limits", "phy-current", "chem-mole", "phy-optics"]);
  });

  it("has 30 days: weekly revision days, a final revision and a full mock on day 30", () => {
    const plan = buildStudyPlan(topics);
    expect(plan).toHaveLength(30);
    expect(plan.filter((d) => d.type === "revision").map((d) => d.day)).toEqual([7, 14, 21, 28, 29]);
    expect(plan[29]).toMatchObject({ type: "mock", blocks: [{ kind: "mock" }] });
    expect(plan[0].blocks.map((b) => [b.kind, b.topic])).toEqual([
      ["learn", "math-limits"],
      ["learn", "phy-current"],
    ]);
    expect(plan[6].blocks.every((b) => b.kind === "revise")).toBe(true);
    for (const day of plan) expect(day.blocks.length).toBeGreaterThan(0);
    expect(dayType(30, 30)).toBe("mock");
  });

  it("returns nothing without topics", () => {
    expect(buildStudyPlan([])).toEqual([]);
  });
});

describe("badges", () => {
  const day = 24 * 60 * 60 * 1000;
  it("first test and a 3-day IST streak", () => {
    const base = Date.parse("2026-10-20T10:00:00+05:30");
    expect(computeBadges({ attemptTimes: [] })).toEqual([]);
    expect(computeBadges({ attemptTimes: [base] })).toEqual(["first-test"]);
    expect(longestStreakDays([base, base + day, base + 2 * day])).toBe(3);
    expect(computeBadges({ attemptTimes: [base, base + day, base + 2 * day] })).toEqual(["first-test", "streak-3"]);
    expect(longestStreakDays([base, base + 2 * day, base + 3 * day])).toBe(2);
    // 23:30 and 00:30 IST are different calendar days.
    expect(istDayNumber(Date.parse("2026-10-20T23:30:00+05:30")) + 1).toBe(istDayNumber(Date.parse("2026-10-21T00:30:00+05:30")));
  });

  it("top 10 % needs at least 10 participants", () => {
    expect(isTopTenPercent(1, 5)).toBe(false);
    expect(isTopTenPercent(1, 10)).toBe(true);
    expect(isTopTenPercent(2, 10)).toBe(false);
    expect(isTopTenPercent(3, 25)).toBe(true);
    expect(computeBadges({ attemptTimes: [1], leaderboardPositions: [{ rank: 1, total: 12 }] })).toContain("top-10");
  });
});

describe("leaderboard ranking and profile rules", () => {
  it("ranks by score, then time; ties share a rank", () => {
    const ranked = rankEntries([
      { id: "a", score: 40, timeTakenSec: 900, submittedAt: 3 },
      { id: "b", score: 52, timeTakenSec: 1200, submittedAt: 2 },
      { id: "c", score: 40, timeTakenSec: 900, submittedAt: 1 },
      { id: "d", score: 40, timeTakenSec: 800, submittedAt: 4 },
    ]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([
      ["b", 1],
      ["d", 2],
      ["c", 3],
      ["a", 3],
    ]);
  });

  it("groups school spellings", () => {
    expect(schoolKey("D.A.V.  Public School, Shimla")).toBe(schoolKey("d a v public school shimla"));
  });

  it("moderates nicknames and schools", () => {
    expect(nicknameIssue("Rocket_99")).toBeNull();
    expect(nicknameIssue("तारा")).toBeNull();
    expect(nicknameIssue("ab")).toBe("length");
    expect(nicknameIssue("hello<script>")).toBe("characters");
    expect(nicknameIssue("12345")).toBe("letter");
    expect(nicknameIssue("call 9876543")).toBe("digits");
    expect(nicknameIssue("Aspire Official")).toBe("blocked");
    expect(schoolIssue("Govt. Sr. Sec. School (Boys), Una")).toBeNull();
    expect(schoolIssue("www.example.com")).toBe("blocked");
  });

  it("profile schema tidies input and drops the school flag without a school", () => {
    const parsed = profileBodySchema.safeParse({ nickname: "  Star   Gazer ", district: "kangra", school: "  ", showSchool: true, leaderboardOptIn: true });
    expect(parsed.success && parsed.data).toEqual({ nickname: "Star Gazer", district: "kangra", school: null, showSchool: false, leaderboardOptIn: true });
    expect(profileBodySchema.safeParse({ nickname: "Star", district: "delhi", school: null, showSchool: false, leaderboardOptIn: true }).success).toBe(false);
  });

  it("attempt schema strips a client-supplied score", () => {
    const parsed = attemptBodySchema.parse({
      testId: "neet-sample",
      attemptId: "attempt-123",
      answers: [0],
      timeSpentSec: [5],
      startedAt: 1,
      submittedAt: 2,
      score: 160,
    });
    expect("score" in parsed).toBe(false);
  });
});
