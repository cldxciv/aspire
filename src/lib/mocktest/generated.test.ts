import { describe, expect, it } from "vitest";
import type { QbPaperView, QbReviewItem, QbServedQuestion } from "@/lib/qb/types";
import {
  answersHash,
  DECIMAL2_TOLERANCE,
  PaperKeyMissingError,
  paperQuestionMeta,
  paperRelease,
  paperResultMeta,
  paperScorableTest,
  paperStatsOutcomes,
  paperTieBreak,
  plausiblePaperTiming,
  reviewItemFromQb,
  scorableFromServed,
  scorePaperAnswers,
  generationEnabled,
  type QbPaperRecord,
} from "./generated";
import { compareRankedEntries, rankRankedEntries, TIEBREAK_WORST, tieBreakVector } from "./leaderboard";
import { mockExamSlug, neverGatedPaper, paperToolUse } from "./lead-gate";
import { projectPaperRankBand } from "./projection";
import { blueprintTestDefinition, blueprintTestIdFor, blueprintTestTitle, isBlueprintTestId, mockTestTitle, parseBlueprintTest } from "./resolve";
import { PAPER_ID, PAPER_TOKEN, scoreRequestSchema } from "./schemas";
import { markResponse, normaliseAnswer, questionOutcome, scoreAttempt, type ScorableQuestion } from "./scoring";
import { scoreForScorable } from "./service";
import { isLeaderboardTest, minDurationMs, monthWindowAt, monthWindowFromId, recentMonthWindows, solutionsLockedUntil } from "./timing";

// Generated (exam-pattern) papers on the mock-test side: pure rules (docs/question-bank-plan.md §B9–B10).
// Every question here is synthetic.

const MIN = 60_000;
const NOW = Date.parse("2026-11-10T10:00:00+05:30");

const multiple = (correctOptions: number[], extra: Partial<ScorableQuestion<string>> = {}): ScorableQuestion<string> => ({
  id: "m",
  subject: "chemistry",
  topic: "chem-x",
  type: "multiple",
  optionCount: 4,
  answer: correctOptions[0],
  correctOptions,
  marking: { correct: 4, wrong: -1, partial: "per_correct_option" },
  ...extra,
});
const numeric = (extra: Partial<ScorableQuestion<string>>): ScorableQuestion<string> => ({
  id: "n",
  subject: "maths",
  topic: "maths-x",
  type: "numerical",
  answer: 12,
  marking: { correct: 4, wrong: -1 },
  ...extra,
});

describe("one-or-more-correct partial marking (JEE Advanced 2026, Section 2 table)", () => {
  const marks = (q: ScorableQuestion<string>, answer: number[] | null) => {
    const normalised = normaliseAnswer(q, answer);
    if (!normalised.ok) throw new Error("invalid");
    return markResponse(q, normalised.value);
  };

  it("full +4 only for exactly the correct options; +3 / +2 / +1 for correct proper subsets", () => {
    const all4 = multiple([0, 1, 2, 3]);
    expect(marks(all4, [0, 1, 2, 3])).toMatchObject({ outcome: "correct", marks: 4, partial: false });
    expect(marks(all4, [3, 1, 0])).toMatchObject({ outcome: "correct", marks: 3, partial: true });
    expect(marks(all4, [0, 1])).toMatchObject({ marks: 2, partial: true });
    expect(marks(all4, [2])).toMatchObject({ marks: 1, partial: true });
    const three = multiple([0, 2, 3]);
    expect(marks(three, [0, 2, 3]).marks).toBe(4);
    expect(marks(three, [2, 0]).marks).toBe(2);
    expect(marks(three, [3]).marks).toBe(1);
    const two = multiple([1, 2]);
    expect(marks(two, [1]).marks).toBe(1);
    expect(marks(two, [1, 2]).marks).toBe(4);
  });

  it("any wrong option → −1; nothing chosen → 0 (unattempted); single-correct needs exactly it", () => {
    const three = multiple([0, 2, 3]);
    expect(marks(three, [0, 1])).toMatchObject({ outcome: "wrong", marks: -1 });
    expect(marks(three, [0, 1, 2, 3])).toMatchObject({ outcome: "wrong", marks: -1 });
    expect(marks(three, [1])).toMatchObject({ outcome: "wrong", marks: -1 });
    expect(marks(three, [])).toMatchObject({ outcome: "unattempted", marks: 0 });
    expect(marks(three, null)).toMatchObject({ outcome: "unattempted", marks: 0 });
    const one = multiple([2]);
    expect(marks(one, [2]).marks).toBe(4);
    expect(marks(one, [2, 3]).marks).toBe(-1);
  });

  it("without a partial scheme a proper subset is wrong (all or nothing)", () => {
    const q = multiple([0, 2, 3], { marking: { correct: 4, wrong: -2 } });
    expect(marks(q, [0, 2])).toMatchObject({ outcome: "wrong", marks: -2 });
  });

  it("normalises: distinct indices in range, sorted; duplicates, out-of-range and non-arrays are invalid", () => {
    const q = multiple([0, 2]);
    expect(normaliseAnswer(q, [3, 0])).toEqual({ ok: true, value: [0, 3] });
    expect(normaliseAnswer(q, [])).toEqual({ ok: true, value: null });
    for (const bad of [[0, 0], [4], [-1], [1.5], 2, "0", [0, 1, 2, 3, 0]]) expect(normaliseAnswer(q, bad), JSON.stringify(bad)).toEqual({ ok: false });
    // An MCQ never takes a list.
    expect(normaliseAnswer({ type: "mcq", optionCount: 4 }, [1])).toEqual({ ok: false });
  });

  it("scoreAttempt reports a partial response as correct with `partial`, and totals its marks", () => {
    const result = scoreAttempt([multiple([0, 2, 3]), multiple([1])], [[0, 2], [1]]);
    expect(result.score).toBe(2 + 4);
    expect(result.correct).toBe(2);
    expect(result.questions[0]).toMatchObject({ outcome: "correct", marks: 2, partial: true });
    expect(result.questions[1]).not.toHaveProperty("partial");
  });
});

describe("numerical keys: ranges, the integer rule, dropped questions", () => {
  it("a range key is inclusive", () => {
    const q = numeric({ answer: 2.33, low: 2.3, high: 2.35 });
    for (const ok of ["2.3", "2.30", "2.35", "2.33"]) expect(questionOutcome(q, ok), ok).toBe("correct");
    for (const bad of ["2.29", "2.36", "23"]) expect(questionOutcome(q, bad), bad).toBe("wrong");
  });

  it("integer questions take signed whole numbers only (a decimal is invalid, never rounded)", () => {
    const q = numeric({ integer: true });
    expect(normaliseAnswer(q, "12")).toEqual({ ok: true, value: "12" });
    expect(normaliseAnswer(q, "12.0")).toEqual({ ok: true, value: "12.0" });
    expect(normaliseAnswer(q, "-3")).toEqual({ ok: true, value: "-3" });
    expect(normaliseAnswer(q, "12.5")).toEqual({ ok: false });
    expect(normaliseAnswer(q, 12.5)).toEqual({ ok: false });
    expect(normaliseAnswer(q, [12])).toEqual({ ok: false });
    expect(questionOutcome(q, "12")).toBe("correct");
    expect(markResponse(q, "11")).toMatchObject({ outcome: "wrong", marks: -1 });
    // Without the rule a decimal is a plain (wrong) answer.
    expect(normaliseAnswer(numeric({}), "12.5")).toEqual({ ok: true, value: "12.5" });
  });

  it("a dropped question gives full marks to everyone, attempted or not", () => {
    const q = numeric({ dropped: true });
    expect(markResponse(q, null)).toMatchObject({ outcome: "unattempted", marks: 4, bonus: true });
    expect(markResponse(q, "99")).toMatchObject({ outcome: "correct", marks: 4, bonus: true });
    const result = scoreAttempt([q, numeric({})], [null, null]);
    expect(result.score).toBe(4);
    expect(result.questions[0].bonus).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------

function served(partial: Partial<QbServedQuestion> & Pick<QbServedQuestion, "id" | "type">): QbServedQuestion {
  return {
    index: 0,
    sectionId: "s",
    subject: "physics",
    chapterId: "phy-synthetic",
    format: "standard",
    answerFormat: null,
    stem: { en: "Synthetic stem", hi: "कृत्रिम" },
    options: partial.type === "numerical" ? [] : [0, 1, 2, 3].map((i) => ({ en: `o${i}`, hi: `o${i}` })),
    figures: [],
    passage: null,
    marking: { correct: 4, wrong: -1 },
    hiAvailable: true,
    hiMachine: false,
    ...partial,
  };
}

function review(id: string, answer: QbReviewItem["answer"], extra: Partial<QbReviewItem> = {}): QbReviewItem {
  return {
    id,
    index: 0,
    answer,
    dropped: false,
    correctedAt: null,
    solution: { en: "Synthetic solution", hi: "कृत्रिम हल" },
    solutionSource: "staff",
    sourceLabel: { en: "Aspire question bank", hi: "Aspire प्रश्न बैंक" },
    sourceKind: "aspire",
    adapted: false,
    difficulty: "medium",
    ...extra,
  };
}

describe("the ScorableTest adapter (served question + key → scoring)", () => {
  it("maps types, key shapes and section answer formats", () => {
    expect(scorableFromServed(served({ id: "a", type: "single" }), review("a", { kind: "single", index: 2 }))).toMatchObject({
      type: "mcq",
      answer: 2,
      optionCount: 4,
      topic: "phy-synthetic",
    });
    expect(scorableFromServed(served({ id: "b", type: "multiple" }), review("b", { kind: "multiple", indices: [3, 0] }))).toMatchObject({
      type: "multiple",
      correctOptions: [0, 3],
    });
    const integer = scorableFromServed(served({ id: "c", type: "numerical", answerFormat: "integer" }), review("c", { kind: "numerical", value: 7, integer: false }));
    expect(integer).toMatchObject({ type: "numerical", answer: 7, integer: true, tolerance: 0 });
    const decimal = scorableFromServed(served({ id: "d", type: "numerical", answerFormat: "decimal2" }), review("d", { kind: "numerical", value: 1.5, integer: false }));
    expect(decimal.tolerance).toBe(DECIMAL2_TOLERANCE);
    expect(questionOutcome(decimal, "1.51")).toBe("correct");
    expect(questionOutcome(decimal, "1.52")).toBe("wrong");
    const ranged = scorableFromServed(served({ id: "e", type: "numerical", answerFormat: "decimal2" }), review("e", { kind: "numerical", value: 2.33, low: 2.3, high: 2.35, integer: false }));
    expect(ranged).toMatchObject({ low: 2.3, high: 2.35, tolerance: 0 });
  });

  it("a dropped question gives full marks; a missing review item or key is a bank fault, never free marks", () => {
    expect(scorableFromServed(served({ id: "a", type: "single" }), review("a", null, { dropped: true })).dropped).toBe(true);
    expect(() => scorableFromServed(served({ id: "a", type: "single" }), undefined)).toThrow(PaperKeyMissingError);
    expect(() => scorableFromServed(served({ id: "a", type: "single" }), review("a", null))).toThrow(PaperKeyMissingError);
  });

  it("a whole-number key in a decimal2 section keeps decimal answers (the integer rule is the section's only)", () => {
    const q = served({ id: "w", type: "numerical", answerFormat: "decimal2" });
    const scorable = scorableFromServed(q, review("w", { kind: "numerical", value: 4, integer: true }));
    expect(scorable).toMatchObject({ answer: 4, tolerance: DECIMAL2_TOLERANCE });
    expect(scorable).not.toHaveProperty("integer");
    expect(normaliseAnswer(scorable, "3.75")).toEqual({ ok: true, value: "3.75" });
    expect(questionOutcome(scorable, "3.75")).toBe("wrong");
    expect(questionOutcome(scorable, "3.99")).toBe("correct");
    expect(questionOutcome(scorable, "4")).toBe("correct");
    // A format-less section: a whole-number key, a decimal answer is simply wrong (never a 422).
    const plain = scorableFromServed(served({ id: "p", type: "numerical", answerFormat: null }), review("p", { kind: "numerical", value: 4, integer: true }));
    expect(normaliseAnswer(plain, "4.5")).toEqual({ ok: true, value: "4.5" });
    expect(questionOutcome(plain, "4.5")).toBe("wrong");
    // The integer (keypad) section still refuses a decimal, whatever the key says.
    const keypad = scorableFromServed(served({ id: "k", type: "numerical", answerFormat: "integer" }), review("k", { kind: "numerical", value: 12, integer: true }));
    expect(normaliseAnswer(keypad, "12.5")).toEqual({ ok: false });
  });

  it("a decimal2 paper with a whole-number key scores a decimal answer instead of refusing the whole submission", () => {
    const decimalView = view({
      questions: [served({ id: "q1", index: 0, type: "single", sectionId: "a" }), served({ id: "q2", index: 1, type: "numerical", answerFormat: "decimal2", sectionId: "b", subject: "maths" })],
    });
    const key = [review("q1", { kind: "single", index: 1 }), review("q2", { kind: "numerical", value: 4, integer: true }, { index: 1 })];
    const paper: QbPaperRecord = { view: decimalView, userId: null, tieBreak: null, fullQuestionCount: 2 };
    const wrong = scorePaperAnswers(paper, key, [1, "3.75"], undefined, { released: true });
    const right = scorePaperAnswers(paper, key, [1, "3.99"], undefined, { released: true });
    expect(wrong.ok && wrong.scored.result.questions[1].outcome).toBe("wrong");
    expect(right.ok && right.scored.result.questions[1].outcome).toBe("correct");
  });

  it("review items keep the typed key; a dropped item has none", () => {
    expect(reviewItemFromQb(review("a", { kind: "multiple", indices: [1, 3] }))).toMatchObject({ correct: 1, answer: { kind: "multiple", indices: [1, 3] }, dropped: false });
    expect(reviewItemFromQb(review("a", { kind: "numerical", value: 2.5, integer: false }))).toMatchObject({ correct: 2.5 });
    expect(reviewItemFromQb(review("a", { kind: "single", index: 1 }, { dropped: true }))).toMatchObject({ answer: null, dropped: true });
  });
});

function view(extra: Partial<QbPaperView> = {}): QbPaperView {
  const questions = [
    served({ id: "q1", index: 0, type: "single", sectionId: "a" }),
    served({ id: "q2", index: 1, type: "numerical", answerFormat: "integer", sectionId: "b", subject: "maths", chapterId: "maths-synthetic" }),
  ];
  return {
    id: "AAAAAAAAAAAAAAAAAAAAAA",
    kind: "practice",
    slot: "jee-main",
    testId: "bp-jee-main",
    exam: "JEE_MAIN",
    setId: null,
    setPart: null,
    title: { en: "Synthetic", hi: "कृत्रिम" },
    partLabel: null,
    language: "en",
    durationMinutes: 60,
    compensatoryMinutes: 0,
    maxScore: 8,
    questionCount: 2,
    short: false,
    sample: false,
    windowId: null,
    createdAt: NOW,
    expiresAt: NOW + 14 * 24 * 60 * MIN,
    scored: false,
    composition: {
      total: 2,
      full: 2,
      ratio: 1,
      bySource: { official: 1, aspire: 1, sample: 0 },
      officialYears: [2025],
      officialShare: 0.5,
      adapted: 0,
      crossExam: 0,
      byDifficulty: { easy: 1, medium: 1, hard: 0 },
      byFormat: { standard: 2 },
      language: "en",
      hindiShortfall: 0,
      shortfall: [],
      relaxed: [],
    },
    sections: [],
    questions,
    patternNote: { en: "", hi: "" },
    ...extra,
  };
}

const record = (extra: Partial<QbPaperView> = {}): QbPaperRecord => ({ view: view(extra), userId: null, tieBreak: null, fullQuestionCount: 2 });
const KEY = [
  review("q1", { kind: "single", index: 1 }, { sourceKind: "official", sourceLabel: { en: "JEE Main 2025 · Synthetic · Q 1 (NTA)", hi: "x" }, difficulty: "easy" }),
  review("q2", { kind: "numerical", value: 5, integer: true }, { index: 1, correctedAt: NOW + MIN }),
];

describe("scoring a paper", () => {
  it("scores with question-bank subjects, chapters as topics, and paper metadata after submission", () => {
    const outcome = scorePaperAnswers(record(), KEY, [1, "4"], [30, 40], { released: true });
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.scored.result.score).toBe(4 - 1);
    expect(outcome.scored.result.subjects.map((s) => s.subject)).toEqual(["physics", "maths"]);
    expect(outcome.scored.result.topics.map((t) => t.topic)).toEqual(["phy-synthetic", "maths-synthetic"]);
    expect(outcome.scored.review.map((r) => r.id)).toEqual(["q1", "q2"]);
    const meta = outcome.scored.paper!;
    expect(meta).toMatchObject({ paperId: "AAAAAAAAAAAAAAAAAAAAAA", slot: "jee-main", short: false, sample: false, correctedAt: NOW + MIN, fullQuestionCount: 2 });
    expect(meta.questions[0]).toMatchObject({ sourceKind: "official", sourceLabel: { en: "JEE Main 2025 · Synthetic · Q 1 (NTA)" }, difficulty: "easy", chapterId: "phy-synthetic" });
  });

  it("validates answers against the served types (integer section: whole numbers only)", () => {
    expect(scorePaperAnswers(record(), KEY, [1, "4.5"], undefined, { released: true })).toEqual({ ok: false, fieldErrors: { answers: ["invalid"] } });
    expect(scorePaperAnswers(record(), KEY, [1], undefined, { released: true })).toEqual({ ok: false, fieldErrors: { answers: ["length"] } });
  });

  it("withholds the key while the release time has not come; source labels go out anyway", () => {
    const outcome = scorePaperAnswers(record(), KEY, [null, null], undefined, { released: false, releaseAt: NOW + 15 * MIN });
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.scored).toMatchObject({ review: [], solutionsReleased: false, solutionsReleaseAt: NOW + 15 * MIN });
    expect(outcome.scored.paper?.questions[0].sourceLabel.en).toMatch(/JEE Main 2025/);
  });

  it("question metadata follows the served order even when the review list does not", () => {
    expect(paperQuestionMeta(view(), [...KEY].reverse()).map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("a question missing from the review list is never labelled (no 'Aspire bank' default) and never scored", () => {
    expect(() => paperResultMeta(record(), [])).toThrow(PaperKeyMissingError);
    expect(() => paperQuestionMeta(view(), [KEY[0]])).toThrow(PaperKeyMissingError);
    expect(() => scorePaperAnswers(record(), [KEY[0]], [1, "5"], undefined, { released: true })).toThrow(PaperKeyMissingError);
    // A sample question keeps its own label and kind.
    const sample = [KEY[0], review("q2", { kind: "numerical", value: 5, integer: true }, { index: 1, sourceKind: "sample", sourceLabel: { en: "Sample question (written for this demo)", hi: "सैंपल प्रश्न" } })];
    expect(paperQuestionMeta(view(), sample)[1]).toMatchObject({ sourceKind: "sample", sourceLabel: { en: "Sample question (written for this demo)" } });
  });

  it("ranked papers hold the per-question source labels back until the key is released; practice papers do not", () => {
    const window = monthWindowAt(NOW);
    const releaseAt = Date.parse(window.endsAt) + (60 + 2) * MIN;
    const ranked = record({ kind: "ranked", windowId: window.id, testId: "bp-jee-main-ranked" });
    const during = scorePaperAnswers(ranked, KEY, [1, "5"], undefined, { released: false, releaseAt });
    if (!during.ok) throw new Error("expected ok");
    expect(during.scored.paper).toMatchObject({ sourcesWithheldUntil: releaseAt, composition: { bySource: { official: 1, aspire: 1 } } });
    expect(during.scored.paper?.questions[0]).toMatchObject({ sourceLabel: { en: "", hi: "" }, sourceKind: "official", sourceWithheld: true });
    expect(JSON.stringify(during.scored.paper)).not.toMatch(/JEE Main 2025/);
    const after = scorePaperAnswers(ranked, KEY, [1, "5"], undefined, { released: true });
    if (!after.ok) throw new Error("expected ok");
    expect(after.scored.paper).not.toHaveProperty("sourcesWithheldUntil");
    expect(after.scored.paper?.questions[0]).not.toHaveProperty("sourceWithheld");
    expect(after.scored.paper?.questions[0].sourceLabel.en).toMatch(/JEE Main 2025/);
  });

  it("statistics: dropped questions are left out; a partial response is attempted but not correct", () => {
    const paperView = view({
      questions: [
        served({ id: "s1", index: 0, type: "single" }),
        served({ id: "m1", index: 1, type: "multiple", subject: "chemistry", marking: { correct: 4, wrong: -1, partial: "per_correct_option" } }),
        served({ id: "n1", index: 2, type: "numerical", answerFormat: "integer", subject: "maths" }),
        served({ id: "s2", index: 3, type: "single" }),
      ],
    });
    const key = [
      review("s1", { kind: "single", index: 1 }),
      review("m1", { kind: "multiple", indices: [0, 2, 3] }, { index: 1 }),
      review("n1", null, { index: 2, dropped: true }),
      review("s2", { kind: "single", index: 0 }, { index: 3 }),
    ];
    const paper: QbPaperRecord = { view: paperView, userId: null, tieBreak: null, fullQuestionCount: 4 };
    // s1 right, m1 two of three options (+2, partial), n1 dropped and answered wrongly, s2 blank.
    const outcome = scorePaperAnswers(paper, key, [1, [0, 2], "99", null], [10, 20, 30, 0], { released: true });
    if (!outcome.ok) throw new Error("expected ok");
    expect(outcome.scored.result.questions[1]).toMatchObject({ outcome: "correct", partial: true });
    expect(outcome.scored.result.questions[2]).toMatchObject({ outcome: "correct", bonus: true });
    expect(paperStatsOutcomes(paperView, outcome.scored.result)).toEqual([
      { id: "s1", type: "single", outcome: "correct", timeSec: 10 },
      { id: "m1", type: "multiple", outcome: "wrong", timeSec: 20 },
      { id: "s2", type: "single", outcome: "unattempted", timeSec: 0 },
    ]);
  });

  it("ranked tie-break: a response to a dropped question is neither right nor wrong (marks still count)", () => {
    const steps = [
      { by: "subject_score", subject: "physics" },
      { by: "wrong_correct_ratio", subject: "all" },
    ] as const;
    const rankedView = view({ kind: "ranked", windowId: monthWindowAt(NOW).id, testId: "bp-jee-main-ranked" });
    const paper: QbPaperRecord = { view: rankedView, userId: "u", tieBreak: [...steps], fullQuestionCount: 2 };
    const key = [KEY[0], review("q2", null, { index: 1, dropped: true })];
    // q1 wrong; q2 dropped. Answering q2 (any value) must not turn the 1 wrong ÷ 0 correct into 1 ÷ 1.
    const answered = scorePaperAnswers(paper, key, [0, "77"], undefined, { released: true });
    const blank = scorePaperAnswers(paper, key, [0, null], undefined, { released: true });
    if (!answered.ok || !blank.ok) throw new Error("expected ok");
    expect(answered.scored.result.score).toBe(blank.scored.result.score);
    expect(paperTieBreak(paper, answered.scored.result)).toEqual(paperTieBreak(paper, blank.scored.result));
    expect(paperTieBreak(paper, answered.scored.result)).toEqual([-1, TIEBREAK_WORST]);
    expect(paperTieBreak(record(), answered.scored.result)).toBeNull();
  });

  it("projection: never for short or sample papers or exams without predictor tables", () => {
    const data = null;
    expect(projectPaperRankBand({ exam: "JEE_MAIN", short: true, sample: false, officialShare: 0, score: 10, maxScore: 20 }, data)).toBeNull();
    for (const input of [
      { exam: "JEE_MAIN", short: true, sample: false },
      { exam: "NEET", short: false, sample: true },
      { exam: "JEE_ADV", short: false, sample: false },
      { exam: "toString", short: false, sample: false },
    ]) {
      const test = paperScorableTest(record({ exam: input.exam as QbPaperView["exam"], short: input.short, sample: input.sample }), KEY);
      const outcome = scoreForScorable(test, [1, "5"], undefined, { released: true });
      expect(outcome.ok && outcome.scored.projection, JSON.stringify(input)).toBeNull();
    }
    // A full, non-sample JEE Main paper gets the (sample-table, labelled) projection with its past-year share.
    const full = scoreForScorable(paperScorableTest(record(), KEY), [1, "5"], undefined, { released: true });
    expect(full.ok && full.scored.projection).toMatchObject({ exam: "JEE_MAIN", officialShare: 0.5 });
  });

  it("the answer-lock hash depends on the answers only", () => {
    expect(answersHash([1, "5", [0, 2], null])).toBe(answersHash([1, "5", [0, 2], null]));
    expect(answersHash([1, "5"])).not.toBe(answersHash([1, "6"]));
    expect(answersHash([1])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("release and timing rules (plan §B10.1–B10.2)", () => {
  it("practice: key + solutions a quarter of the paper's time after it was made (at least 5 minutes)", () => {
    const paper = view({ durationMinutes: 180 });
    expect(paperRelease(paper, NOW + 44 * MIN)).toEqual({ released: false, releaseAt: NOW + 45 * MIN });
    expect(paperRelease(paper, NOW + 45 * MIN)).toEqual({ released: true });
    expect(paperRelease(view({ durationMinutes: 10 }), NOW + 4 * MIN)).toEqual({ released: false, releaseAt: NOW + 5 * MIN });
  });

  it("ranked: only when the month closes (plus the last attempts' time)", () => {
    const window = monthWindowAt(NOW);
    const paper = view({ kind: "ranked", windowId: window.id, durationMinutes: 180 });
    const releaseAt = Date.parse(window.endsAt) + (180 + 2) * MIN;
    expect(paperRelease(paper, NOW + 179 * MIN)).toEqual({ released: false, releaseAt });
    expect(paperRelease(paper, releaseAt)).toEqual({ released: true });
  });

  it("statistics only for plausible timing: between a quarter of the time and the limit + grace + compensatory", () => {
    const paper = view({ durationMinutes: 60, compensatoryMinutes: 20 });
    expect(plausiblePaperTiming(paper, NOW + 14 * MIN)).toBe(false);
    expect(plausiblePaperTiming(paper, NOW + minDurationMs(60))).toBe(true);
    expect(plausiblePaperTiming(paper, NOW + (60 + 2 + 20) * MIN)).toBe(true);
    expect(plausiblePaperTiming(paper, NOW + (60 + 2 + 20) * MIN + 1)).toBe(false);
  });

  it("QB_GENERATION_ENABLED: on by default, off for 0 / false / off", () => {
    expect(generationEnabled({})).toBe(true);
    expect(generationEnabled({ QB_GENERATION_ENABLED: "1" })).toBe(true);
    for (const off of ["0", "false", "OFF"]) expect(generationEnabled({ QB_GENERATION_ENABLED: off })).toBe(false);
  });
});

describe("monthly ranked windows (IST months)", () => {
  it("ids, bounds and the month list", () => {
    expect(monthWindowAt(Date.parse("2026-10-31T23:59:59+05:30"))).toEqual({
      id: "month-2026-10",
      startsAt: "2026-10-01T00:00:00+05:30",
      endsAt: "2026-10-31T23:59:59+05:30",
    });
    expect(monthWindowAt(Date.parse("2026-11-01T00:00:00+05:30")).id).toBe("month-2026-11");
    expect(monthWindowFromId("month-2027-02")).toEqual({ id: "month-2027-02", startsAt: "2027-02-01T00:00:00+05:30", endsAt: "2027-02-28T23:59:59+05:30" });
    expect(monthWindowFromId("month-2026-13")).toBeNull();
    expect(monthWindowFromId("week-2026-10-19")).toBeNull();
    expect(recentMonthWindows(NOW, 3).map((w) => w.id)).toEqual(["month-2026-09", "month-2026-10", "month-2026-11"]);
    expect(recentMonthWindows(Date.parse("2027-01-05T00:00:00+05:30"), 2).map((w) => w.id)).toEqual(["month-2026-12", "month-2027-01"]);
  });

  it("the ranked pseudo-definition reuses the weekly rules (leaderboard test, key locked until the month closes)", () => {
    const ranked = blueprintTestDefinition("jee-main", "ranked", { durationMinutes: 180, now: NOW });
    expect(ranked).toMatchObject({ id: "bp-jee-main-ranked", kind: "weekly", exam: "JEE_MAIN" });
    expect(isLeaderboardTest(ranked)).toBe(true);
    expect(solutionsLockedUntil(ranked, NOW)).toBe(Date.parse(monthWindowAt(NOW).endsAt) + (180 + 2) * MIN);
    const practice = blueprintTestDefinition("neet-ug", "practice", { durationMinutes: 180 });
    expect(practice).toMatchObject({ id: "bp-neet-ug", kind: "practice" });
    expect(isLeaderboardTest(practice)).toBe(false);
  });
});

describe("ranked boards: official tie-break, no time criterion", () => {
  const result = (subjects: { subject: string; score: number; correct: number; wrong: number }[]) => ({
    correct: subjects.reduce((s, x) => s + x.correct, 0),
    wrong: subjects.reduce((s, x) => s + x.wrong, 0),
    subjects,
  });

  it("vectors: subject marks (biology = botany + zoology) and −(wrong ÷ correct), higher is better", () => {
    const steps = [
      { by: "subject_score", subject: "biology" },
      { by: "subject_score", subject: "chemistry" },
      { by: "wrong_correct_ratio", subject: "all" },
      { by: "wrong_correct_ratio", subject: "physics" },
    ] as const;
    const r = result([
      { subject: "physics", score: 20, correct: 6, wrong: 4 },
      { subject: "chemistry", score: 30, correct: 8, wrong: 2 },
      { subject: "botany", score: 40, correct: 10, wrong: 0 },
      { subject: "zoology", score: 35, correct: 9, wrong: 1 },
    ]);
    expect(tieBreakVector(steps, r)).toEqual([75, 30, -Math.round((7 / 33) * 1e6) / 1e6, -Math.round((4 / 6) * 1e6) / 1e6]);
    expect(tieBreakVector([{ by: "wrong_correct_ratio", subject: "maths" }], result([{ subject: "maths", score: -2, correct: 0, wrong: 2 }]))).toEqual([TIEBREAK_WORST]);
    expect(tieBreakVector([{ by: "wrong_correct_ratio", subject: "maths" }], result([{ subject: "maths", score: 0, correct: 0, wrong: 0 }]))).toEqual([0]);
    expect(tieBreakVector(null, r)).toBeNull();
  });

  it("equal score and vector share a rank (listed by save time); the vector decides otherwise", () => {
    const entries = [
      { name: "late twin", score: 100, tiebreak: [40, -0.25], submittedAt: 3 },
      { name: "better maths", score: 100, tiebreak: [44, -0.5], submittedAt: 9 },
      { name: "early twin", score: 100, tiebreak: [40, -0.25], submittedAt: 1 },
      { name: "top", score: 120, tiebreak: [10, -1], submittedAt: 5 },
      { name: "fewer wrong", score: 100, tiebreak: [40, 0], submittedAt: 7 },
    ];
    const ranked = rankRankedEntries(entries);
    expect(ranked.map((e) => [e.name, e.rank])).toEqual([
      ["top", 1],
      ["better maths", 2],
      ["fewer wrong", 3],
      ["early twin", 4],
      ["late twin", 4],
    ]);
    expect(compareRankedEntries({ score: 5, tiebreak: [1] }, { score: 5, tiebreak: [1] })).toBe(0);
    // An attempt without a vector ranks after one with a vector at the same score.
    expect(compareRankedEntries({ score: 5, tiebreak: null }, { score: 5, tiebreak: [-9] })).toBeGreaterThan(0);
  });
});

describe("lead gate helpers for papers (plan §B10.6)", () => {
  const since = Date.parse("2026-11-01T00:00:00+05:30");

  it("neverGatedPaper uses the paper's server createdAt, never the browser's startedAt", () => {
    expect(neverGatedPaper(since, { createdAt: since - 1 }, {})).toBe(true);
    expect(neverGatedPaper(since, { createdAt: since + 1 }, {})).toBe(false);
    expect(neverGatedPaper(null, { createdAt: since - 1 }, {})).toBe(false);
    expect(neverGatedPaper(since, { createdAt: since + 1 }, { seen: true })).toBe(true);
  });

  it("tool use is keyed by the slot (bp-<slot>), with the exam slug and a 10-point band only", () => {
    expect(paperToolUse({ slot: "jee-adv", exam: "JEE_ADV" }, { score: 95, maxScore: 180 })).toEqual({
      tool: "mock-test",
      key: "bp-jee-adv",
      testId: "bp-jee-adv",
      exam: "jee-adv",
      scoreBand: "pct-50-59",
    });
    expect(mockExamSlug("JEE_MAIN")).toBe("jee-main");
  });
});

describe("test ids and titles (code constants, synchronous)", () => {
  it("parses practice, ranked and part ids; refuses others", () => {
    expect(parseBlueprintTest("bp-jee-main")).toEqual({ testId: "bp-jee-main", slot: "jee-main", mode: "practice", part: null });
    expect(parseBlueprintTest("bp-neet-ug-ranked")).toMatchObject({ slot: "neet-ug", mode: "ranked", part: null });
    expect(parseBlueprintTest("bp-jee-adv-p2")).toMatchObject({ slot: "jee-adv", mode: "practice", part: 2 });
    for (const bad of ["bp-unknown", "jee-main-sample", "bp-", "bp-jee-main-p0", ""]) expect(parseBlueprintTest(bad), bad).toBeNull();
    expect(isBlueprintTestId("bp-boh-class-10")).toBe(true);
    expect(blueprintTestIdFor("jee-adv", "practice", 1)).toBe("bp-jee-adv-p1");
  });

  it("mockTestTitle covers fixed and generated tests", () => {
    expect(mockTestTitle("neet-sample", "en")).toBe("NEET sample test");
    expect(mockTestTitle("bp-jee-main", "en")).toBe("JEE Main exam-pattern mock");
    expect(mockTestTitle("bp-jee-main-ranked", "en")).toBe("JEE Main exam-pattern mock · monthly ranked paper");
    expect(mockTestTitle("bp-jee-adv-p1", "hi")).toMatch(/प्रश्नपत्र 1/);
    expect(mockTestTitle("nope", "en")).toBeNull();
    expect(blueprintTestTitle({ slot: "neet-ug", mode: "ranked", part: null }).hi).toMatch(/[ऀ-ॿ]/);
  });
});

describe("request schemas", () => {
  it("answers may be option lists; paper id and token have fixed shapes", () => {
    const parsed = scoreRequestSchema.safeParse({
      testId: "bp-jee-main",
      answers: [1, "12", [0, 2], null],
      paperId: "A".repeat(22),
      paperToken: "b".repeat(43),
    });
    expect(parsed.success).toBe(true);
    expect(scoreRequestSchema.safeParse({ testId: "x", answers: [[10]] }).success).toBe(false);
    expect(scoreRequestSchema.safeParse({ testId: "x", answers: [Array.from({ length: 11 }, () => 1)] }).success).toBe(false);
    expect(scoreRequestSchema.safeParse({ testId: "x", answers: [], paperId: "short" }).success).toBe(false);
    expect(PAPER_ID.test("A".repeat(22))).toBe(true);
    expect(PAPER_TOKEN.test("A".repeat(42))).toBe(false);
  });
});
