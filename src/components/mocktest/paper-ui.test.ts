import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The request-time sections call `connection()`, which needs a Next request outside tests.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

import ExamPatternMockPage from "@/app/[lang]/(site)/tools/mock-tests/exam/[slot]/page";
import ExamPatternResultPage, { generateMetadata as resultMetadata } from "@/app/[lang]/(site)/tools/mock-tests/exam/[slot]/result/page";
import MockTestsPage from "@/app/[lang]/(site)/tools/mock-tests/page";
import { chapterLabelsFor } from "@/components/mocktest/chapter-labels";
import { ExamPatternList, ExamPatternMocks, type ExamPatternItem } from "@/components/mocktest/ExamPatternSection";
import { startErrorText } from "@/components/mocktest/ExamStart";
import { GeneratedMockRunner } from "@/components/mocktest/GeneratedMockRunner";
import { PaperResultBody } from "@/components/mocktest/PaperResultView";
import { paperReportBody, paperSaveBody, paperScoreBody } from "@/components/mocktest/paper-client";
import {
  accuracyByDifficulty,
  applyKeypadKey,
  asksContactBeforePaper,
  chapterLabelOf,
  chapterStrengths,
  compositionSummary,
  estimatedShortMinutes,
  examStatus,
  examStatusText,
  filterNumericTyping,
  keyHasOption,
  keypadKeys,
  keyText,
  negativeMarksBySubject,
  numericAnswerValue,
  numericInputIssue,
  paperAnswerText,
  paperBanners,
  paperDeadline,
  paperLatestEnd,
  paperTimeWarning,
  passageRange,
  questionLanguage,
  reviewLanguage,
  runnerPaper,
  sectionRows,
  serverClockOffset,
  startableLanguages,
  startControls,
  STRENGTH_MIN_QUESTIONS,
  toggleOption,
  yearsText,
  type KeypadKey,
} from "@/components/mocktest/paper-model";
import {
  activeAfterSubmit,
  activePaperFromStart,
  activePaperKey,
  addPaperAttempt,
  addRecentPaper,
  clearActivePaper,
  initialPaperState,
  isActivePaper,
  isPaperLocalAttempt,
  listPaperAttempts,
  MAX_PAPER_ATTEMPTS,
  MAX_RECENT_PAPERS,
  paperProgressId,
  readActivePaper,
  readRecentPapers,
  rememberRecentPaper,
  setSiblings,
  validRecentPapers,
  writeActivePaper,
  type ActivePaper,
  type PaperLocalAttempt,
} from "@/components/mocktest/paper-store";
import { RankedBoards } from "@/components/mocktest/RankedBoards";
import { LocaleProvider } from "@/i18n/client";
import type { Locale } from "@/i18n/config";
import { messagesFor } from "@/i18n/messages";
import { paperRelease, setQbPaperPortForTests, submitPaper, type QbPaperPort } from "@/lib/mocktest/generated";
import { writeProgress } from "@/lib/mocktest/local-store";
import { normaliseAnswer, scoreAttempt, type ScorableQuestion } from "@/lib/mocktest/scoring";
import { FakeQbPort } from "@/lib/mocktest/testing/fake-qb-port";
import type { PaperReadinessView, PaperResultMeta } from "@/lib/mocktest/types";
import type { QbPaperComposition, QbPaperView, QbSlot, QbSubject } from "@/lib/qb/types";
import { setTestLang, withTestLang } from "@/test/root-params-stub";

/**
 * Exam-pattern mocks, student side (QB-MOCKTEST-UI, docs/question-bank-plan.md §B14 package 5): the
 * pure helpers behind the exam page, the generated-paper runner and its result page, browser storage
 * (active paper, progress, recent papers), the request bodies, and the server-rendered states of
 * the list section, the exam page, the result page and the ranked boards (en + hi). Interactive flows
 * (start → gate → paper → submit → result) are on the manual checklist; the APIs have their own tests.
 */

vi.setConfig({ testTimeout: 30_000 });

const T = { en: messagesFor("en", "mocktest"), hi: messagesFor("hi", "mocktest") };
const textOf = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ");
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

function inLocale(locale: Locale, child: ReactNode): string {
  return renderToStaticMarkup(createElement(LocaleProvider, { locale } as ComponentProps<typeof LocaleProvider>, child));
}

async function renderPage(lang: Locale, page: () => Promise<ReactNode>): Promise<string> {
  return withTestLang(lang, async () => inLocale(lang, await page()));
}

/** An in-memory `localStorage` behind a stubbed `window`. */
function stubStorage(): Map<string, string> {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  vi.stubGlobal("window", { localStorage: storage });
  return map;
}

const PAPER_ID = "AbCdEfGhIjKlMnOpQrStUv"; // 22
const PAPER_ID_2 = "ZyXwVuTsRqPoNmLkJiHgFe"; // 22
const TOKEN = "t".repeat(43);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  setQbPaperPortForTests(null);
  setTestLang("en");
});

// ---------------------------------------------------------------------------------------------

describe("numerical answers: whole-number keypad and two-decimal box", () => {
  it("whole-number sections take signed integers only; the server accepts every value the box keeps", () => {
    for (const ok of ["12", "-3", "−3", " 0 ", "+7", "123456789012"]) expect(numericInputIssue(ok, "integer"), ok).toBeNull();
    expect(numericInputIssue("", "integer")).toBeNull(); // not answered
    expect(numericInputIssue("-", "integer")).toBeNull(); // still typing
    expect(numericInputIssue("2.5", "integer")).toBe("integer");
    expect(numericInputIssue("2.", "integer")).toBe("integer");
    expect(numericInputIssue("abc", "integer")).toBe("format");
    expect(numericInputIssue("1-2", "integer")).toBe("format");
    expect(numericInputIssue("1234567890123", "integer")).toBe("length");
    expect(numericAnswerValue(" −12 ", "integer")).toBe("-12");
    expect(numericAnswerValue("+7", "integer")).toBe("7");
    expect(numericAnswerValue("2.5", "integer")).toBeNull();
    expect(numericAnswerValue("-", "integer")).toBeNull();
    expect(numericAnswerValue("", "integer")).toBeNull();
    for (const typed of ["12", "-3", "−40", "+7", "0"]) {
      const value = numericAnswerValue(typed, "integer");
      expect(normaliseAnswer({ type: "numerical", integer: true }, value)).toEqual({ ok: true, value });
    }
  });

  it("two-decimal sections refuse a third decimal instead of rounding it silently", () => {
    for (const ok of ["2.35", "-0.5", ".5", "2.", "12", "−1.25"]) expect(numericInputIssue(ok, "decimal2"), ok).toBeNull();
    expect(numericInputIssue("2.345", "decimal2")).toBe("decimals");
    expect(numericInputIssue("2..3", "decimal2")).toBe("format");
    expect(numericInputIssue(".", "decimal2")).toBeNull();
    expect(numericAnswerValue(".", "decimal2")).toBeNull();
    expect(numericAnswerValue("2.345", "decimal2")).toBeNull();
    for (const typed of ["2.35", "-0.5", ".5", "2."]) {
      const value = numericAnswerValue(typed, "decimal2");
      expect(value).not.toBeNull();
      expect(normaliseAnswer({ type: "numerical" }, value).ok, typed).toBe(true);
    }
  });

  it("typing keeps digits, signs and points only (the typographic minus becomes '-')", () => {
    expect(filterNumericTyping("1a2−3")).toBe("12-3");
    expect(filterNumericTyping("4,5 m")).toBe("45");
    expect(filterNumericTyping("9".repeat(20))).toHaveLength(12);
  });

  it("the on-screen keypad: digits, sign toggle, one point (decimals only), backspace, clear, length cap", () => {
    const press = (keys: KeypadKey[], format: "integer" | "decimal2", start = "") => keys.reduce((v, k) => applyKeypadKey(v, k, format), start);
    expect(press(["1", "2"], "integer")).toBe("12");
    expect(press(["1", "2", "-"], "integer")).toBe("-12");
    expect(press(["1", "2", "-", "-"], "integer")).toBe("12");
    expect(press(["-", "5"], "integer")).toBe("-5");
    expect(press(["0", "5"], "integer")).toBe("5");
    expect(press(["-", "0", "5"], "integer")).toBe("-5");
    expect(press([".", "5"], "integer")).toBe("5"); // no point on a whole-number keypad
    expect(press([".", "5"], "decimal2")).toBe("0.5");
    expect(press(["2", ".", "3", "5", "7"], "decimal2")).toBe("2.35");
    expect(press(["2", ".", "."], "decimal2")).toBe("2.");
    expect(press(["backspace"], "decimal2", "2.35")).toBe("2.3");
    expect(press(["backspace"], "integer", "-5")).toBe("");
    expect(press(["clear"], "integer", "-512")).toBe("");
    expect(press(Array.from({ length: 20 }, () => "9" as KeypadKey), "integer")).toHaveLength(12);
    expect(keypadKeys("integer")).not.toContain(".");
    expect(keypadKeys("decimal2")).toContain(".");
    for (const format of ["integer", "decimal2"] as const) expect(keypadKeys(format)).toEqual(expect.arrayContaining(["0", "9", "-", "backspace", "clear"]));
  });
});

describe("one-or-more-correct answers", () => {
  it("checkboxes give sorted, distinct option indices; nothing ticked is 'not answered'", () => {
    expect(toggleOption(undefined, 2)).toEqual([2]);
    expect(toggleOption([2], 0)).toEqual([0, 2]);
    expect(toggleOption([0, 2], 2)).toEqual([0]);
    expect(toggleOption([0], 0)).toBeNull();
    expect(toggleOption(1, 3)).toEqual([1, 3]);
  });
});

describe("the server decides when a paper ends", () => {
  const created = Date.parse("2026-10-22T10:00:00+05:30");
  const MIN = 60_000;

  it("a paper (or Paper 1) ends its time after the server made it, whatever the device or a reload says", () => {
    const part = { createdAt: created, durationMinutes: 180, compensatoryMinutes: 0 };
    expect(paperDeadline(part, { startedAt: created + 30 * MIN })).toBe(created + 180 * MIN);
    expect(paperDeadline({ ...part, compensatoryMinutes: 60 }, { startedAt: created })).toBe(created + 240 * MIN);
  });

  it("Paper 2 of a pair starts when the student starts it, but never ends after the time the server allows", () => {
    const p1 = { createdAt: created, durationMinutes: 180, compensatoryMinutes: 0 };
    const p2 = { createdAt: created, durationMinutes: 180, compensatoryMinutes: 0 };
    expect(paperDeadline(p2, { startedAt: created + 200 * MIN, earlier: [p1] })).toBe(created + 380 * MIN);
    // Started late: the latest end is P1's time + a one-hour break + P2's time.
    expect(paperDeadline(p2, { startedAt: created + 300 * MIN, earlier: [p1] })).toBe(created + 420 * MIN);
  });

  it("the device clock is corrected only when it is clearly wrong (the Date header has 1 s resolution)", () => {
    const local = Date.parse("2026-10-22T04:30:00Z");
    expect(serverClockOffset(null, local, local + 200)).toBe(0);
    expect(serverClockOffset("not a date", local, local + 200)).toBe(0);
    expect(serverClockOffset(new Date(local + 5_000).toUTCString(), local, local)).toBe(0);
    expect(serverClockOffset(new Date(local + 120_000).toUTCString(), local, local)).toBe(120_000);
    expect(serverClockOffset(new Date(local - 600_000).toUTCString(), local, local)).toBe(-600_000);
  });

  it("time warnings at 30, 15, 5 and 1 minutes, once each; the smallest when several are crossed at once", () => {
    const m = (minutes: number) => minutes * 60_000;
    expect(paperTimeWarning(m(31), m(29))).toBe(30);
    expect(paperTimeWarning(m(16), m(14.9))).toBe(15);
    expect(paperTimeWarning(m(5) + 1000, m(5))).toBe(5);
    expect(paperTimeWarning(61_000, 59_000)).toBe(1);
    expect(paperTimeWarning(m(31), m(4))).toBe(5);
    expect(paperTimeWarning(m(29), m(28))).toBeNull();
    expect(paperTimeWarning(10_000, 0)).toBeNull(); // time up is announced separately
  });
});

// ---------------------------------------------------------------------------------------------

function readinessView(level: "full" | "short" | "thin", extra: Partial<PaperReadinessView> = {}): PaperReadinessView {
  const composition: QbPaperComposition = {
    total: level === "short" ? 38 : 75,
    full: 75,
    ratio: level === "short" ? 38 / 75 : 1,
    bySource: { official: 31, aspire: 44, sample: 0 },
    officialYears: [2026, 2024, 2025],
    officialShare: 31 / 75,
    adapted: 2,
    crossExam: 0,
    byDifficulty: { easy: 23, medium: 37, hard: 15 },
    byFormat: { standard: 75 },
    language: "en",
    hindiShortfall: 0,
    shortfall: [],
    relaxed: [],
  };
  return {
    slot: "jee-main",
    exam: "JEE_MAIN",
    available: true,
    reason: null,
    readiness: {
      level,
      servable: level === "full" ? 75 : level === "short" ? 38 : 20,
      full: 75,
      variety: 3.4,
      byLanguage: { en: level, hi: "thin" },
      sections: [],
      ranked: { available: false, windowId: null, closesAt: null },
    },
    full: { questionCount: 75, maxScore: 300, durationMinutes: 180 },
    languages: ["en", "hi"],
    compensatoryMinutes: 60,
    composition: level === "thin" ? null : composition,
    sample: false,
    pattern: null,
    ranked: { mode: "monthly", available: false, windowId: null, closesAt: null, signedIn: false },
    ...extra,
  };
}

describe("readiness in honest words", () => {
  it("full, a labelled shorter set ('38 of 75 questions, about 90 minutes'), or 'coming soon: X of Y'", () => {
    const tp = T.en.paper;
    const full = examStatus(readinessView("full"));
    expect(full).toEqual({ kind: "full", questions: 75, minutes: 180 });
    expect(examStatusText(full, false, tp)).toBe("Ready: a full-length paper of 75 questions and 180 minutes.");
    const short = examStatus(readinessView("short"));
    expect(short).toEqual({ kind: "short", questions: 38, full: 75, minutes: 90 });
    expect(examStatusText(short, false, tp)).toContain("38 of 75 questions, about 90 minutes");
    expect(examStatusText(short, false, tp)).toContain("never ranked and get no rank projection");
    const thin = examStatus(readinessView("thin"));
    expect(thin).toEqual({ kind: "thin", have: 20, need: 75 });
    expect(examStatusText(thin, false, tp)).toBe("Coming soon: the question bank has 20 of the 75 approved questions a paper needs.");
    expect(examStatusText(examStatus({ ...readinessView("full"), available: false, reason: "no_blueprint" }), false, tp)).toBe(tp.statusText.unpublished);
    expect(examStatusText(examStatus({ ...readinessView("full"), available: false, reason: "no_blueprint" }), true, tp)).toBe(tp.statusText.placeholder);
    expect(examStatus({ ...readinessView("full"), available: false, reason: "disabled" })).toEqual({ kind: "off" });
    // Hindi: same facts, placeholders filled.
    expect(examStatusText(short, false, T.hi.paper)).toContain("75 में से 38 प्रश्न");
  });

  it("a shorter set's time follows the generator: full time × share, to 5 minutes, at least 10", () => {
    expect(estimatedShortMinutes(180, 0.5)).toBe(90);
    expect(estimatedShortMinutes(180, 0.52)).toBe(95);
    expect(estimatedShortMinutes(20, 0.1)).toBe(10);
  });

  it("the contact form comes before papers of 60 minutes or more (judged on the expected length)", () => {
    expect(asksContactBeforePaper({ kind: "full", questions: 75, minutes: 180 })).toBe(true);
    expect(asksContactBeforePaper({ kind: "short", questions: 20, full: 75, minutes: 60 })).toBe(true);
    expect(asksContactBeforePaper({ kind: "short", questions: 15, full: 75, minutes: 45 })).toBe(false);
    expect(asksContactBeforePaper({ kind: "thin", have: 1, need: 75 })).toBe(true);
  });

  it("a language the bank is thin in is not offered", () => {
    expect(startableLanguages(readinessView("full"))).toEqual(["en"]);
    expect(startableLanguages({ ...readinessView("full"), available: false })).toEqual([]);
  });

  it("the ranked paper can start while practice is thin: 'I have read the instructions' moves to the ranked start", () => {
    const openRanked = { mode: "monthly" as const, available: true, windowId: "2026-10", closesAt: null, signedIn: true };
    // This month's ranked paper reserves questions, so practice can be thin while ranked is open.
    expect(startControls(readinessView("thin", { ranked: openRanked }))).toEqual({ practice: false, ranked: true, agreeIn: "ranked" });
    expect(startControls(readinessView("full", { ranked: openRanked }))).toEqual({ practice: true, ranked: true, agreeIn: "practice" });
    expect(startControls(readinessView("short"))).toEqual({ practice: true, ranked: false, agreeIn: "practice" });
    expect(startControls(readinessView("thin", { ranked: { ...openRanked, signedIn: false } }))).toEqual({ practice: false, ranked: false, agreeIn: null });
    expect(startControls(readinessView("thin", { ranked: { ...openRanked, mode: "off" } })).agreeIn).toBeNull();
    expect(startControls(null)).toEqual({ practice: false, ranked: false, agreeIn: null });
  });

  it("composition: official papers with their years, Aspire's bank, Aspire's difficulty mix", () => {
    const summary = compositionSummary(readinessView("full").composition!);
    expect(summary).toMatchObject({ total: 75, official: 31, aspire: 44, sample: 0, years: "2024–2026", adapted: 2 });
    expect(summary.difficulty).toEqual({ easy: 23, medium: 37, hard: 15 });
    expect(yearsText([2025])).toBe("2025");
    expect(yearsText([])).toBe("");
  });
});

// ---------------------------------------------------------------------------------------------

async function fakePaper(options: ConstructorParameters<typeof FakeQbPort>[0] = {}): Promise<{ port: FakeQbPort; view: QbPaperView; token: string | null }> {
  const port = new FakeQbPort(options);
  const made = await port.createPaper({
    slot: "jee-main",
    mode: "practice",
    userId: null,
    language: "en",
    compensatory: false,
    recent: [],
    placeholderMode: false,
    now: Date.parse("2026-10-22T10:00:00+05:30"),
  });
  if (!made.ok) throw new Error("fake paper");
  return { port, view: made.papers[0].view, token: made.token };
}

describe("the runner's copy of a paper (no answers, solutions or sources)", () => {
  const FORBIDDEN = ["answer", "solution", "sourceLabel", "sourceKind", "difficulty", "source", "claimedSource", "aspireRef", "importId", "adapted", "createdBy", "approvedBy", "key"];

  it("keeps the question paper only, even if a payload ever carried more", async () => {
    const { view } = await fakePaper();
    const tainted = {
      ...view,
      questions: view.questions.map((q) => ({
        ...q,
        answer: { kind: "single", index: 1 },
        solution: { en: "LEAKED SOLUTION", hi: "" },
        sourceLabel: { en: "JEE Main 2024 · LEAKED", hi: "" },
        sourceKind: "official",
        difficulty: "hard",
        source: { kind: "official", claimedSource: "LEAKED" },
        claimedSource: "LEAKED",
        aspireRef: "LEAKED",
        importId: "LEAKED",
        figures: [{ id: "a".repeat(32), slot: "solution", alt: { en: "LEAKED figure", hi: "" }, width: 10, height: 10 }],
      })),
    } as unknown as QbPaperView;
    const safe = runnerPaper(tainted);
    const json = JSON.stringify(safe);
    expect(json).not.toContain("LEAKED");
    for (const q of safe.questions) for (const key of FORBIDDEN) expect(Object.keys(q), key).not.toContain(key);
    expect(safe.questions.map((q) => q.stem.en)).toEqual(view.questions.map((q) => q.stem.en));
    expect(safe.questionCount).toBe(view.questions.length);
  });

  it("the paper payload the runner receives has no source labels or keys either", async () => {
    const { view } = await fakePaper();
    const json = JSON.stringify(view);
    expect(json).not.toMatch(/sourceLabel|"solution"|"answer"|Synthetic solution|NTA\)/);
  });

  it("question language: the student's choice, the paper's language, English when Hindi is missing", () => {
    const both = { hiAvailable: true, hiMachine: false };
    const none = { hiAvailable: false, hiMachine: false };
    const machine = { hiAvailable: false, hiMachine: true };
    expect(questionLanguage(both, "hi")).toBe("hi");
    expect(questionLanguage(both, "hi", "en")).toBe("en");
    expect(questionLanguage(none, "hi")).toBe("en");
    expect(questionLanguage(none, "en", "hi")).toBe("en");
    // Machine Hindi only when asked for explicitly (a secondary, labelled toggle).
    expect(questionLanguage(machine, "en", "hi")).toBe("hi");
    expect(questionLanguage(machine, "hi")).toBe("en");
    // The result review follows the same rule and says when the Hindi shown is a machine draft.
    expect(reviewLanguage(machine, "hi")).toEqual({ lang: "en", machine: false });
    expect(reviewLanguage(machine, "hi", "hi")).toEqual({ lang: "hi", machine: true });
    expect(reviewLanguage(both, "en", "hi")).toEqual({ lang: "hi", machine: false });
    expect(reviewLanguage(none, "en", "hi")).toEqual({ lang: "en", machine: false });
  });

  it("paragraph questions name their range", () => {
    const passage = { id: "p1", stem: { en: "", hi: "" }, figures: [] };
    const qs = [
      { index: 0, passage: null },
      { index: 1, passage },
      { index: 2, passage },
    ];
    expect(passageRange(qs, "p1")).toEqual({ first: 2, last: 3 });
    expect(passageRange(qs, "missing")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------

describe("result aggregations (after submission only)", () => {
  const MARK = { correct: 4, wrong: -1 };
  const questions: ScorableQuestion<QbSubject>[] = [
    { id: "q1", subject: "physics", topic: "phy-a", type: "mcq", optionCount: 4, answer: 0, marking: MARK },
    { id: "q2", subject: "physics", topic: "phy-a", type: "mcq", optionCount: 4, answer: 1, marking: MARK },
    { id: "q3", subject: "physics", topic: "phy-a", type: "mcq", optionCount: 4, answer: 2, marking: MARK },
    { id: "q4", subject: "chemistry", topic: "chem-b", type: "multiple", optionCount: 4, answer: 0, correctOptions: [0, 2], marking: { ...MARK, partial: "per_correct_option" } },
    { id: "q5", subject: "maths", topic: "math-c", type: "numerical", answer: 12, integer: true, marking: MARK },
    { id: "q6", subject: "maths", topic: "math-c", type: "numerical", answer: 3, dropped: true, marking: MARK },
  ];
  const result = scoreAttempt(questions, [0, 2, null, [0], "11", null], [30, 40, 0, 50, 60, 0]);
  const meta = {
    questions: [
      { id: "q1", difficulty: "easy" },
      { id: "q2", difficulty: "medium" },
      { id: "q3", difficulty: "hard" },
      { id: "q4", difficulty: "medium" },
      { id: "q5", difficulty: "easy" },
      { id: "q6", difficulty: null },
    ],
  } as unknown as Pick<PaperResultMeta, "questions">;

  it("accuracy by difficulty: a partly correct answer is attempted, not correct; dropped questions are left out", () => {
    expect(accuracyByDifficulty(result, meta)).toEqual([
      { difficulty: "easy", total: 2, attempted: 2, correct: 1, wrong: 1, accuracy: 0.5 },
      { difficulty: "medium", total: 2, attempted: 2, correct: 0, wrong: 1, accuracy: 0 },
      { difficulty: "hard", total: 1, attempted: 0, correct: 0, wrong: 0, accuracy: null },
    ]);
  });

  it("marks lost to negative marking, per subject in paper order (partial marks are never a loss)", () => {
    expect(negativeMarksBySubject(result)).toEqual([
      { subject: "physics", lost: 1, wrong: 1 },
      { subject: "maths", lost: 1, wrong: 1 },
    ]);
  });

  it(`chapter strength only with ${STRENGTH_MIN_QUESTIONS} or more questions`, () => {
    const { shown, tooFew } = chapterStrengths(result);
    expect(shown.map((t) => [t.topic, t.total])).toEqual([["phy-a", 3]]);
    expect(tooFew).toBe(2);
  });

  it("section-wise rows from the served sections", () => {
    const sections = [
      { id: "phy", start: 0, count: 3, marking: MARK, label: { en: "Physics", hi: "भौतिकी" } },
      { id: "chem", start: 3, count: 1, marking: MARK, label: { en: "Chemistry", hi: "रसायन" } },
      { id: "math", start: 4, count: 2, marking: MARK, label: { en: "Mathematics", hi: "गणित" } },
    ] as unknown as Parameters<typeof sectionRows>[0];
    const rows = sectionRows(sections, result);
    expect(rows.map((r) => [r.sectionId, r.correct, r.wrong, r.unattempted, r.score, r.maxScore, r.timeSec])).toEqual([
      ["phy", 1, 1, 1, 3, 12, 70],
      ["chem", 1, 0, 0, 1, 4, 50],
      // The dropped question: full marks to everyone, outcome "not attempted" when left blank.
      ["math", 0, 1, 1, 3, 8, 60],
    ]);
    expect(rows.reduce((sum, r) => sum + r.score, 0)).toBe(result.score);
  });

  it("banners: sample, shorter set, compensatory time, adapted, key correction, mostly past-year paper", () => {
    const base = { sample: false, short: false, questions: [{ adapted: false }], correctedAt: null } as unknown as Pick<PaperResultMeta, "sample" | "short" | "questions" | "correctedAt">;
    expect(paperBanners({ meta: base, compensatoryMinutes: 0, officialShare: 0.5 })).toEqual([]);
    expect(paperBanners({ meta: base, compensatoryMinutes: 0, officialShare: null })).toEqual([]);
    const all = { sample: true, short: true, questions: [{ adapted: true }], correctedAt: 1 } as unknown as typeof base;
    expect(paperBanners({ meta: all, compensatoryMinutes: 20, officialShare: 0.6 })).toEqual(["sample", "short", "compensatory", "adapted", "corrected", "officialShare"]);
  });

  it("answer keys and responses as text", () => {
    expect(keyText({ kind: "single", index: 1 }, "en", "{low} to {high}")).toBe("(B)");
    expect(keyText({ kind: "multiple", indices: [0, 2, 3] }, "en", "{low} to {high}")).toBe("(A) (C) (D)");
    expect(keyText({ kind: "numerical", value: 12, integer: true, unit: { en: "m", hi: "मी" } }, "hi", "{low} से {high}")).toBe("12 मी");
    expect(keyText({ kind: "numerical", value: 2.33, low: 2.3, high: 2.35, integer: false }, "en", "{low} to {high}")).toBe("2.3 to 2.35");
    expect(keyText({ kind: "numerical", value: -3, integer: true }, "en", "{low} to {high}")).toBe("−3");
    expect(keyText(null, "en", "")).toBe("");
    expect(keyText({ kind: "numerical", value: 4, integer: true }, "en", "", undefined, { en: "s", hi: "से" })).toBe("4 s");
    expect(keyHasOption({ kind: "multiple", indices: [0, 2] }, 2)).toBe(true);
    expect(keyHasOption({ kind: "single", index: 1 }, 2)).toBe(false);
    expect(paperAnswerText({ type: "multiple" }, [0, 2], "en")).toBe("(A) (C)");
    expect(paperAnswerText({ type: "single" }, 1, "en")).toBe("(B)");
    expect(paperAnswerText({ type: "numerical", unit: { en: "m", hi: "मी" } }, "-3", "en")).toBe("−3 m");
    expect(paperAnswerText({ type: "single" }, null, "en")).toBe("");
  });

  it("chapter names: the seeded chapters (incl. every sample topic) in both languages, else a readable id", () => {
    const labels = chapterLabelsFor("jee-main");
    expect(labels["phy-kinematics"]).toEqual({ en: "Kinematics", hi: expect.any(String) });
    expect(Object.values(labels).every((l) => l.en.trim() !== "")).toBe(true);
    expect(chapterLabelsFor("neet-ug")).not.toHaveProperty("math-quadratic");
    expect(chapterLabelOf("phy-kinematics", labels, "en")).toBe("Kinematics");
    expect(chapterLabelOf("x", { x: { en: "Only English", hi: "" } }, "hi")).toBe("Only English");
    expect(chapterLabelOf("chem-p-block_new", {}, "en")).toBe("chem p block new");
  });
});

// ---------------------------------------------------------------------------------------------

describe("browser storage: the same paper after a reload, the last 5 papers, submitted parts", () => {
  beforeEach(() => {
    stubStorage();
  });

  function active(overrides: Partial<ActivePaper> = {}): ActivePaper {
    const created = Date.parse("2026-10-22T10:00:00+05:30");
    return {
      v: 1,
      slot: "jee-adv",
      mode: "practice",
      token: TOKEN,
      setId: "set-1",
      language: "en",
      parts: [
        { id: PAPER_ID, testId: "bp-jee-adv-p1", part: 1, createdAt: created, durationMinutes: 180, compensatoryMinutes: 0, questionCount: 48 },
        { id: PAPER_ID_2, testId: "bp-jee-adv-p2", part: 2, createdAt: created, durationMinutes: 180, compensatoryMinutes: 0, questionCount: 54 },
      ],
      current: 0,
      attempts: [null, null],
      clockOffsetMs: 0,
      savedAt: created,
      ...overrides,
    };
  }

  it("the active paper is kept per exam under a versioned key and validated when read back", () => {
    expect(activePaperKey("jee-main")).toBe("aspire.mocktest.v1.activePaper.jee-main");
    expect(paperProgressId(PAPER_ID)).toBe(`paper-${PAPER_ID}`);
    const paper = active();
    expect(isActivePaper(paper, "jee-adv")).toBe(true);
    expect(isActivePaper(paper, "jee-main")).toBe(false);
    expect(isActivePaper({ ...paper, token: "short" }, "jee-adv")).toBe(false);
    expect(isActivePaper({ ...paper, mode: "ranked" }, "jee-adv")).toBe(false); // ranked papers have no token
    expect(isActivePaper({ ...paper, mode: "ranked", token: null }, "jee-adv")).toBe(true);
    expect(isActivePaper({ ...paper, current: 2 }, "jee-adv")).toBe(false);
    expect(isActivePaper({ ...paper, parts: [{ ...paper.parts[0], id: "bad" }] }, "jee-adv")).toBe(false);
    writeActivePaper(paper);
    expect(readActivePaper("jee-adv")).toEqual(paper);
    expect(readActivePaper("jee-main")).toBeNull();
    clearActivePaper("jee-adv");
    expect(readActivePaper("jee-adv")).toBeNull();
  });

  it("practice and ranked papers are kept apart: starting a practice paper never hides an unfinished ranked one", () => {
    expect(activePaperKey("jee-main", "ranked")).toBe("aspire.mocktest.v1.activePaper.jee-main.ranked");
    const practice = active({ slot: "jee-main", setId: null, parts: [active().parts[0]], attempts: [null] });
    const ranked = { ...practice, mode: "ranked" as const, token: null, parts: [{ ...practice.parts[0], id: PAPER_ID_2, testId: "bp-jee-main-ranked" }] };
    writeActivePaper(ranked);
    writeActivePaper(practice);
    expect(readActivePaper("jee-main", "ranked")).toEqual(ranked);
    expect(readActivePaper("jee-main", "practice")).toEqual(practice);
    expect(readActivePaper("jee-main")).toEqual(practice);
    clearActivePaper("jee-main", "practice");
    expect(readActivePaper("jee-main", "ranked")).toEqual(ranked);
    // A record under the wrong key is never read as the other mode.
    window.localStorage.setItem(activePaperKey("jee-main"), JSON.stringify(ranked));
    expect(readActivePaper("jee-main", "practice")).toBeNull();
  });

  it("a new paper becomes the active paper (token for practice, none for ranked); parts advance as they are submitted", async () => {
    const { view, token } = await fakePaper();
    const practice = activePaperFromStart({ token, setId: null, papers: [view] }, { slot: "jee-main", mode: "practice", language: "en", clockOffsetMs: 0, now: 1 });
    expect(isActivePaper(practice, "jee-main")).toBe(true);
    expect(practice.parts[0]).toMatchObject({ id: view.id, testId: "bp-jee-main", questionCount: 6, durationMinutes: 60 });
    const ranked = activePaperFromStart({ token: TOKEN, setId: null, papers: [view] }, { slot: "jee-main", mode: "ranked", language: "en", clockOffsetMs: 0, now: 1 });
    expect(ranked.token).toBeNull();

    const pair = active();
    const first = activeAfterSubmit(pair, "attempt-p1-0001");
    expect(first.done).toBe(false);
    expect(first.active.current).toBe(1);
    expect(first.active.attempts).toEqual(["attempt-p1-0001", null]);
    const second = activeAfterSubmit(first.active, "attempt-p2-0001");
    expect(second.done).toBe(true);
    expect(second.active.attempts).toEqual(["attempt-p1-0001", "attempt-p2-0001"]);
  });

  it("a reload resumes the same paper part with its answers; a new part gets the server's deadline", () => {
    const pair = active({ clockOffsetMs: 120_000 });
    const paper = { id: PAPER_ID, createdAt: pair.parts[0].createdAt, durationMinutes: 180, compensatoryMinutes: 0, questions: Array.from({ length: 48 }) } as unknown as QbPaperView;
    const now = pair.parts[0].createdAt + 10 * 60_000;
    const fresh = initialPaperState(paper, pair, now);
    // Server deadline (made + 180 min) on this device's clock (server is 2 minutes ahead).
    expect(fresh.deadline).toBe(pair.parts[0].createdAt + 180 * 60_000 - 120_000);
    expect(fresh.testId).toBe(`paper-${PAPER_ID}`);
    fresh.answers[3] = 2;
    writeProgress(fresh);
    expect(window.localStorage.getItem(`aspire.mocktest.v1.progress.paper-${PAPER_ID}`)).not.toBeNull();
    const again = initialPaperState(paper, pair, now + 60_000);
    expect(again.attemptId).toBe(fresh.attemptId);
    expect(again.answers[3]).toBe(2);
    expect(again.deadline).toBe(fresh.deadline);

    // Paper 2: its own time from when it is started, within the server's limit.
    const second = { ...pair, current: 1 };
    const paper2 = { ...paper, id: PAPER_ID_2, questions: Array.from({ length: 54 }) } as unknown as QbPaperView;
    const start2 = pair.parts[0].createdAt + 200 * 60_000;
    expect(initialPaperState(paper2, second, start2).deadline).toBe(start2 + 180 * 60_000);
  });

  it("a device clock moved after the start never adds time on resume (the offset is measured again when the paper opens)", () => {
    const HOUR = 3600_000;
    const pair = active({ clockOffsetMs: 0 });
    const created = pair.parts[0].createdAt;
    const paper = { id: PAPER_ID, createdAt: created, durationMinutes: 180, compensatoryMinutes: 0, questions: Array.from({ length: 48 }) } as unknown as QbPaperView;
    const fresh = initialPaperState(paper, pair, created + 10 * 60_000);
    writeProgress(fresh);
    // Tab closed, device clock set back one hour, paper resumed: the server is now 1 h ahead of the device.
    const resumed = initialPaperState(paper, { ...pair, clockOffsetMs: HOUR }, created + 20 * 60_000 - HOUR);
    expect(resumed.deadline).toBe(created + 180 * 60_000 - HOUR);
    expect(resumed.answers).toEqual(fresh.answers);
    // Clock put right again: the same server end, nothing lost either.
    expect(initialPaperState(paper, pair, created + 30 * 60_000).deadline).toBe(created + 180 * 60_000);

    // Paper 2 (started at +200 min): its saved end stays, but never after the server's latest end.
    const second = { ...pair, current: 1 };
    const paper2 = { ...paper, id: PAPER_ID_2, questions: Array.from({ length: 54 }) } as unknown as QbPaperView;
    const start2 = created + 200 * 60_000;
    const p2 = initialPaperState(paper2, second, start2);
    writeProgress(p2);
    expect(initialPaperState(paper2, second, start2 + 60_000).deadline).toBe(start2 + 180 * 60_000);
    const latest = paperLatestEnd(paper2, [pair.parts[0]]);
    expect(latest).toBe(created + 420 * 60_000);
    expect(initialPaperState(paper2, { ...second, clockOffsetMs: 2 * HOUR }, start2).deadline).toBe(latest - 2 * HOUR);
  });

  it("the last 5 papers are kept for the guest's next paper (newest first, no duplicates, malformed refused)", () => {
    const ids = Array.from({ length: 7 }, (_, i) => `${"p".repeat(21)}${i}`);
    let list: { id: string; token: string }[] = [];
    for (const id of ids) list = addRecentPaper(list, { id, token: TOKEN });
    expect(list).toHaveLength(MAX_RECENT_PAPERS);
    expect(list[0].id).toBe(ids[6]);
    expect(addRecentPaper(list, { id: ids[4], token: TOKEN }).map((r) => r.id).slice(0, 2)).toEqual([ids[4], ids[6]]);
    expect(addRecentPaper(list, { id: "short", token: TOKEN })).toEqual(list);
    expect(validRecentPapers([{ id: ids[0], token: TOKEN }, { id: ids[0], token: TOKEN }, { id: 1 }, "x", null])).toEqual([{ id: ids[0], token: TOKEN }]);
    for (const id of ids) rememberRecentPaper({ id, token: TOKEN });
    expect(readRecentPapers().map((r) => r.id)).toEqual(ids.slice(2).reverse());
  });

  it("submitted parts are kept on this device (at most 30) and a pair's parts find each other", () => {
    const attempt = (n: number, extra: Partial<PaperLocalAttempt> = {}): PaperLocalAttempt => ({
      id: `attempt-${String(n).padStart(4, "0")}`,
      slot: "jee-adv",
      testId: "bp-jee-adv-p1",
      paperId: PAPER_ID,
      setId: null,
      part: null,
      mode: "practice",
      token: TOKEN,
      language: "en",
      answers: [0, null],
      timeSpentSec: [10, 0],
      startedAt: 1,
      submittedAt: 2 + n,
      submitReason: "manual",
      questionCount: 2,
      maxScore: 8,
      durationMinutes: 180,
      compensatoryMinutes: 0,
      ...extra,
    });
    expect(isPaperLocalAttempt(attempt(1))).toBe(true);
    expect(isPaperLocalAttempt({ ...attempt(1), answers: [0] })).toBe(false);
    expect(isPaperLocalAttempt({ ...attempt(1), paperId: "x" })).toBe(false);
    for (let n = 0; n < MAX_PAPER_ATTEMPTS + 5; n += 1) addPaperAttempt(attempt(n));
    expect(listPaperAttempts()).toHaveLength(MAX_PAPER_ATTEMPTS);
    const p2 = attempt(100, { setId: "set-9", part: 2, testId: "bp-jee-adv-p2" });
    const p1 = attempt(101, { setId: "set-9", part: 1 });
    expect(setSiblings(p2, [p2, attempt(5), p1]).map((a) => a.part)).toEqual([1, 2]);
    expect(setSiblings(attempt(5), [p2, p1])).toEqual([]);
  });
});

describe("requests of the result page", () => {
  const attempt: PaperLocalAttempt = {
    id: "attempt-0001",
    slot: "jee-main",
    testId: "bp-jee-main",
    paperId: PAPER_ID,
    setId: null,
    part: null,
    mode: "practice",
    token: TOKEN,
    language: "en",
    answers: [1, "12", null],
    timeSpentSec: [20, 30, 0],
    startedAt: 1000,
    submittedAt: 2000,
    submitReason: "manual",
    questionCount: 3,
    maxScore: 12,
    durationMinutes: 60,
    compensatoryMinutes: 0,
  };

  it("/score: the paper and its token; `record` only on the first scoring, `seen` once a score was shown", () => {
    expect(paperScoreBody(attempt, true)).toEqual({
      testId: "bp-jee-main",
      paperId: PAPER_ID,
      paperToken: TOKEN,
      answers: [1, "12", null],
      timeSpentSec: [20, 30, 0],
      startedAt: 1000,
      record: true,
    });
    const seen = paperScoreBody({ ...attempt, score: 0 }, true);
    expect(seen).toMatchObject({ seen: true });
    expect(seen).not.toHaveProperty("record");
    expect(paperScoreBody(attempt, false)).not.toHaveProperty("record");
  });

  it("/attempts saves with the attempt id (ranked papers: no token, the session opens them)", () => {
    expect(paperSaveBody(attempt)).toMatchObject({ attemptId: "attempt-0001", paperId: PAPER_ID, paperToken: TOKEN, submittedAt: 2000 });
    expect(paperSaveBody({ ...attempt, mode: "ranked", token: null })).not.toHaveProperty("paperToken");
  });

  it("'Report a problem' sends the question, the kind and a trimmed note only", () => {
    expect(paperReportBody({ token: TOKEN, questionId: "q1", kind: "wrong_answer", note: "  key says B  " })).toEqual({
      token: TOKEN,
      questionId: "q1",
      kind: "wrong_answer",
      note: "key says B",
    });
    expect(paperReportBody({ token: null, questionId: "q1", kind: "other", note: "   " })).toEqual({ questionId: "q1", kind: "other" });
    expect(paperReportBody({ token: null, questionId: "q1", kind: "other", note: "x".repeat(600) }).note).toHaveLength(500);
  });

  it("a refused start says why in the student's words", () => {
    const tp = T.en.paper.errors;
    const common = T.en.common;
    expect(startErrorText({ status: 409, reason: "bank_thin" }, tp, common)).toBe(tp.bankThin);
    expect(startErrorText({ status: 409, reason: "ranked_unavailable" }, tp, common)).toBe(tp.rankedUnavailable);
    expect(startErrorText({ status: 401, reason: null }, tp, common)).toBe(tp.rankedSignIn);
    expect(startErrorText({ status: 422, reason: null, fieldErrors: { language: ["unsupported"] } }, tp, common)).toBe(tp.language);
    expect(startErrorText({ status: 429, reason: null }, tp, common)).toBe(tp.rateLimited);
    expect(startErrorText({ status: 503, reason: null }, tp, common)).toBe(tp.off);
    expect(startErrorText({ status: 0, reason: null }, tp, common)).toBe(common.networkError);
  });
});

// ---------------------------------------------------------------------------------------------
// Server-rendered states

function item(slot: QbSlot, view: PaperReadinessView | null): ExamPatternItem {
  if (!view) return { slot, view: null };
  // The bank's view has no `signedIn` (the readiness route adds it).
  const { signedIn: _signedIn, ...ranked } = view.ranked;
  void _signedIn;
  return { slot, view: { ...view, slot, ranked } };
}

describe("the exam-pattern section on /tools/mock-tests", () => {
  it.each(["en", "hi"] as const)("%s: full, shorter, coming soon and unpublished exams in honest words, with localised links", (lang) => {
    const tp = T[lang].paper;
    const items = [
      item("jee-main", readinessView("full")),
      item("neet-ug", readinessView("short", { sample: true })),
      item("jee-adv", readinessView("thin")),
      item("boh-class-10", { ...readinessView("full"), available: false, reason: "no_blueprint", readiness: null, full: null, ranked: { mode: "off", available: false, windowId: null, closesAt: null, signedIn: false } }),
    ];
    const html = inLocale(lang, createElement(ExamPatternList, { items, t: T[lang], locale: lang }));
    const text = textOf(html);
    expect(html).toContain('data-exam-status="full"');
    expect(html).toContain('data-exam-status="short"');
    expect(html).toContain('data-exam-status="thin"');
    expect(html).toContain('data-exam-status="unpublished"');
    expect(text).toContain(examStatusText({ kind: "short", questions: 38, full: 75, minutes: 90 }, false, tp));
    expect(text).toContain(examStatusText({ kind: "thin", have: 20, need: 75 }, false, tp));
    expect(text).toContain(tp.statusText.placeholder); // BOH: pattern not confirmed
    expect(text).toContain(tp.sample);
    expect(text).toContain(tp.list.ranked);
    const prefix = lang === "hi" ? "/hi" : "";
    for (const slot of ["jee-main", "neet-ug", "jee-adv", "boh-class-10"]) expect(html).toContain(`href="${prefix}/tools/mock-tests/exam/${slot}"`);
    expect(text).not.toMatch(/\b(undefined|NaN|null)\b/);
  });

  it("an exam the bank could not be read for is 'coming soon', never 'ready'", () => {
    const html = inLocale("en", createElement(ExamPatternList, { items: [item("jee-main", null)], t: T.en, locale: "en" }));
    expect(html).toContain('data-exam-status="unpublished"');
    expect(html).not.toContain(T.en.paper.status.full);
  });

  it("reads each exam's readiness from the bank at request time", async () => {
    setQbPaperPortForTests(new FakeQbPort({ short: true, thin: ["jee-adv"] }));
    const html = inLocale("en", await ExamPatternMocks({ t: T.en, locale: "en" }));
    expect(count(html, /data-exam-status="short"/g)).toBe(3);
    expect(count(html, /data-exam-status="thin"/g)).toBe(1);
    expect(textOf(html)).toContain("Practice set: shorter than the real exam (6 of 6 questions");
  });

  it("generation switched off: every exam says so; a failing bank shows a notice, not a broken list", async () => {
    vi.stubEnv("QB_GENERATION_ENABLED", "0");
    const off = inLocale("en", await ExamPatternMocks({ t: T.en, locale: "en" }));
    expect(count(off, /data-exam-status="off"/g)).toBe(4);
    vi.unstubAllEnvs();
    const broken = { readiness: async () => { throw new Error("db down"); } } as unknown as QbPaperPort;
    setQbPaperPortForTests(broken);
    const failed = inLocale("en", await ExamPatternMocks({ t: T.en, locale: "en" }));
    expect(failed).toContain(T.en.paper.list.error);
  });

  it.each(["true", "false"])("the list page carries the section (SHOW_PLACEHOLDER_CONTENT=%s), one h1", async (flag) => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", flag);
    setQbPaperPortForTests(new FakeQbPort());
    for (const lang of ["en", "hi"] as const) {
      const html = await renderPage(lang, () => MockTestsPage());
      expect(count(html, /<h1[\s>]/g)).toBe(1);
      expect(textOf(html)).toContain(T[lang].paper.list.title);
      expect(html).toContain('id="exam-mocks"');
    }
  });
});

const slotProps = (slot: string, lang: Locale = "en") => ({ params: Promise.resolve({ lang, slot }) }) as unknown as PageProps<"/[lang]/tools/mock-tests/exam/[slot]">;

describe("the exam page (static: pattern and rules; the start panel loads in the browser)", () => {
  it.each(["en", "hi"] as const)("%s: one h1, the official pattern with its sources, the rules, localised links", async (lang) => {
    const tp = T[lang].paper;
    for (const slot of ["jee-main", "neet-ug", "jee-adv", "boh-class-10"] as const) {
      const html = await renderPage(lang, () => ExamPatternMockPage(slotProps(slot, lang)));
      const text = textOf(html);
      expect(count(html, /<h1[\s>]/g), slot).toBe(1);
      expect(text).toContain(tp.pattern.title);
      expect(text).toContain(tp.how.mix);
      expect(text).toContain(tp.rules.timer);
      expect(text).toContain(tp.start.loading); // the client panel before it mounts
      expect(text).not.toMatch(/\b(undefined|NaN)\b/);
      for (const [, href] of html.matchAll(/href="(\/[^"]*)"/g)) {
        if (/^\/(?:_next|images|assets|api)\//.test(href)) continue;
        if (lang === "hi") expect(href, href).toMatch(/^\/hi(\/|$|#|\?)/);
        else expect(href, href).not.toMatch(/^\/hi(\/|$)/);
      }
    }
  });

  it("JEE Main: 3 × (20 single + 5 whole-number numerical), +4 / −1, official NTA documents; BOH says it is a placeholder", async () => {
    const tp = T.en.paper;
    const html = await renderPage("en", () => ExamPatternMockPage(slotProps("jee-main")));
    const text = textOf(html);
    expect(text).toContain("Paper 1: 75 questions · 180 min · 300 marks");
    expect(text).toContain(`5 × ${tp.pattern.types.integer} · +4 / −1`);
    expect(text).toContain(`20 × ${tp.pattern.types.single} · +4 / −1`);
    expect(html).toContain('href="https://nta.ac.in/Download/Notice/Notice_20251019125337.pdf"');
    expect(text).toContain(tp.rules.rankedRelease);
    const adv = textOf(await renderPage("en", () => ExamPatternMockPage(slotProps("jee-adv"))));
    expect(adv).toContain("Paper 2: 54 questions · 180 min · 180 marks");
    expect(adv).toContain(tp.pattern.partial);
    expect(adv).toContain(tp.rules.parts);
    expect(adv).not.toContain(tp.rules.rankedRelease);
    const boh = textOf(await renderPage("en", () => ExamPatternMockPage(slotProps("boh-class-10"))));
    expect(boh).toContain(tp.pattern.placeholder);
  });

  it("an unknown slot is a real 404", async () => {
    await expect(renderPage("en", () => ExamPatternMockPage(slotProps("jee-mains")))).rejects.toThrow();
    await expect(renderPage("en", () => ExamPatternResultPage(slotProps("nope") as never))).rejects.toThrow();
  });

  it("the result page: one h1, never indexed, the result loads in the browser", async () => {
    for (const lang of ["en", "hi"] as const) {
      const html = await renderPage(lang, () => ExamPatternResultPage(slotProps("neet-ug", lang) as never));
      expect(count(html, /<h1[\s>]/g)).toBe(1);
      expect(textOf(html)).toContain(T[lang].paper.result.title);
    }
    const meta = await resultMetadata(slotProps("neet-ug") as never);
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("monthly ranked boards on the leaderboard page", () => {
  it("lists only exams whose ranked paper has been sat, with the honest note; 'coming soon' when nothing exists", async () => {
    const port = new FakeQbPort({ rankedOff: ["jee-adv", "boh-class-10"] });
    setQbPaperPortForTests(port);
    expect(inLocale("en", await RankedBoards({ t: T.en, locale: "en", weeklyCount: 2 }))).toBe("");
    const empty = inLocale("en", await RankedBoards({ t: T.en, locale: "en", weeklyCount: 0 }));
    expect(empty).toContain(T.en.comingSoon.title);

    await port.createPaper({ slot: "neet-ug", mode: "ranked", userId: "student-1", language: "en", compensatory: false, recent: [], placeholderMode: false, now: Date.now() });
    for (const lang of ["en", "hi"] as const) {
      const html = inLocale(lang, await RankedBoards({ t: T[lang], locale: lang, weeklyCount: 0 }));
      const text = textOf(html);
      expect(count(html, /<h2[\s>]/g)).toBeGreaterThanOrEqual(1);
      expect(text).toContain(T[lang].paper.leaderboard.title);
      expect(text).toContain(T[lang].paper.leaderboard.note);
      expect(text).toContain(T[lang].paper.leaderboard.rules);
    }
  });
});

describe("the generated-paper runner (first render)", () => {
  beforeEach(() => {
    stubStorage();
  });

  async function runnerHtml(current: number, lang: Locale = "en") {
    const { view, token } = await fakePaper();
    const paper = runnerPaper(view);
    const start = activePaperFromStart({ token, setId: null, papers: [paper] }, { slot: "jee-main", mode: "practice", language: "en", clockOffsetMs: 0, now: view.createdAt });
    const state = initialPaperState(paper, start, view.createdAt + 60_000);
    writeProgress({ ...state, current, visited: state.visited.map((_, i) => i <= current) });
    return inLocale(lang, createElement(GeneratedMockRunner, { paper, active: start, t: T[lang], onSubmitted: () => undefined }));
  }

  it("a test screen with the server's timer, section tabs, palette (44 px targets) and the question, but no key or source", async () => {
    const html = await runnerHtml(0);
    const text = textOf(html);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('role="timer"');
    expect(html).toContain('aria-live="assertive"');
    expect(text).toContain("Question 1 of 6");
    expect(text).toContain(T.en.paper.runner.typeSingle);
    expect(text).toContain(T.en.paper.runner.instructions);
    expect(count(html, /type="radio"/g)).toBe(4);
    for (const label of ["phy-a", "chem-m", "math-int", "math-dec"]) expect(text).toContain(label);
    expect(html).toContain("p-1 "); // palette buttons: 36 px swatch + 4 px padding
    expect(html).not.toMatch(/Synthetic solution|NTA\)|sourceLabel/);
    expect(html).toMatch(/role="timer"[^>]*aria-label="Time left \d{2}:\d{2}/);
  });

  it("one-or-more-correct questions use checkboxes and say how partial marks work", async () => {
    const text = textOf(await runnerHtml(3));
    expect(text).toContain(T.en.paper.runner.typeMultiple);
    expect(text).toContain(T.en.paper.runner.partial);
    expect(count(await runnerHtml(3), /type="checkbox"/g)).toBe(4);
  });

  it("whole-number answers get the signed keypad; two-decimal answers also a point; Hindi with 'English prevails'", async () => {
    const integer = await runnerHtml(4);
    expect(textOf(integer)).toContain(T.en.paper.runner.integerHint);
    expect(integer).toContain('inputMode="numeric"');
    expect(integer).toContain(`aria-label="${T.en.paper.runner.keyMinus}"`);
    expect(integer).not.toContain(`aria-label="${T.en.paper.runner.keyPoint}"`);
    const decimal = await runnerHtml(5);
    expect(decimal).toContain('inputMode="decimal"');
    expect(decimal).toContain(`aria-label="${T.en.paper.runner.keyPoint}"`);
    expect(textOf(decimal)).toContain(T.en.paper.runner.englishPrevails);
    const hindi = textOf(await runnerHtml(4, "hi"));
    expect(hindi).toContain(T.hi.paper.runner.integerHint);
  });
});

describe("the result of a generated paper (first render)", () => {
  async function scoredPaper(minutesAfter: number, options: ConstructorParameters<typeof FakeQbPort>[0] = {}) {
    const { port, view, token } = await fakePaper(options);
    const now = view.createdAt + minutesAfter * 60_000;
    const record = (await port.loadPaper(view.id, { token }, now))!;
    const submission = await submitPaper(port, record, { answers: [1, 0, null, [0], "12", "2.33"], timeSpentSec: [30, 40, 0, 50, 60, 70], release: paperRelease(view, now), now });
    if (!submission.ok) throw new Error("fake scoring");
    return { view, token, scored: submission.outcome.scored };
  }

  function render(input: Awaited<ReturnType<typeof scoredPaper>>, lang: Locale = "en") {
    const attempt: PaperLocalAttempt = {
      id: "attempt-result-01",
      slot: "jee-main",
      testId: input.view.testId,
      paperId: input.view.id,
      setId: null,
      part: null,
      mode: "practice",
      token: input.token,
      language: "en",
      answers: [1, 0, null, [0], "12", "2.33"],
      timeSpentSec: [30, 40, 0, 50, 60, 70],
      startedAt: input.view.createdAt,
      submittedAt: input.view.createdAt + 60_000,
      submitReason: "manual",
      questionCount: 6,
      maxScore: input.view.maxScore,
      durationMinutes: 60,
      compensatoryMinutes: 0,
    };
    return inLocale(
      lang,
      createElement(PaperResultBody, {
        slot: "jee-main",
        t: T[lang],
        attempt,
        initial: { scored: input.scored, saved: null, paper: input.view },
        chapterLabels: {},
        focusOnMount: false,
      }),
    );
  }

  it("score, section-wise, difficulty, negative marks; sources and difficulty after submission; key held until the release time", async () => {
    const tp = T.en.paper.result;
    const early = await scoredPaper(1);
    expect(early.scored.solutionsReleased).toBe(false);
    const html = render(early);
    const text = textOf(html);
    expect(text).toContain(`${early.scored.result.score} / ${early.scored.result.maxScore}`);
    expect(text).toContain(tp.sectionsTitle);
    expect(text).toContain(tp.difficultyTitle);
    expect(text).toContain(tp.negativeTitle);
    expect(text).toContain(tp.solutionsLockedTitle);
    expect(text).toContain("JEE Main 2025 · Synthetic shift · Q 1 (NTA)"); // source label, after submission
    expect(text).toContain(tp.difficulty.easy);
    expect(text).not.toContain(`${tp.correctAnswer}:`);
    expect(text).not.toContain("Synthetic solution");
    expect(count(html, new RegExp(tp.report, "g"))).toBe(6);
    expect(text).not.toMatch(/\b(undefined|NaN)\b/);

    const released = render(await scoredPaper(20));
    expect(textOf(released)).toContain(`${tp.correctAnswer}: (B)`);
    expect(textOf(released)).toContain(`${tp.correctAnswer}: (A) (C) (D)`);
    expect(textOf(released)).toContain(`${tp.correctAnswer}: 2.3 to 2.35 m`);
    expect(textOf(released)).not.toContain(tp.solutionsLockedTitle);
  });

  it("a shorter sample set carries its honest banners and no rank projection", async () => {
    const tp = T.en.paper.result;
    const input = await scoredPaper(20, { short: true, sample: true });
    expect(input.scored.projection).toBeNull();
    const text = textOf(render(input));
    expect(text).toContain(tp.banners.sample);
    expect(text).toContain("Practice set: shorter than the real exam (6 of 12 questions, 60 minutes)");
    expect(text).not.toContain(T.en.result.projectionTitle);
    const hindi = textOf(render(input, "hi"));
    expect(hindi).toContain(T.hi.paper.result.banners.sample);
  });
});
