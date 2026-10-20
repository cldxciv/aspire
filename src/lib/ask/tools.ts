import "server-only";

import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages";
import { z } from "zod";

import { MOCK_EXAMS } from "@/content/mocktest/types";
import { MOCK_MINUTES, SYLLABUS_STATUS } from "@/content/planner/syllabus";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getVisibleMockTests, summariseTest } from "@/lib/mocktest/catalog";
import { diffDays, isDateKey, istDateKey } from "@/lib/planner/dates";
import { generatePlan, PLAN_LIMITS } from "@/lib/planner/plan";
import { EXAM_IDS, type DayKind, type ExamId } from "@/lib/planner/types";
import { getPredictorData } from "@/lib/predictor/data";
import { INPUT_MODES, PREDICTOR_EXAMS, predictRankBand, type Range } from "@/lib/predictor/engine";

import type { MockTestsCard, PlanCard, RankBandCard, RanchoToolCard } from "./cards";
import type { AskLanguage } from "./constants";

/**
 * Aspire's student tools that Rancho can use while answering (server-side Claude tool use in
 * /api/ask; docs/ask-aspire.md → "Rancho's tools"). Each tool is PURE server code over data the
 * site already shows: no database writes, no network, no personal data. A result is two things:
 *
 * - `content`: compact JSON for the model (what it may say), and
 * - `card`: the `RanchoToolCard` (./cards) the chat UIs render beside the answer, or null when
 *   there is nothing honest to show (no data yet, bad input, a date in the past…).
 *
 * Visibility follows the tool pages exactly: sample (placeholder) predictor tables, mock tests
 * and planner content are used only while showPlaceholderContent() is on (dev / demo), and are
 * always flagged `sample` so Rancho calls them sample data.
 *
 * The definitions below are constant (same bytes on every request) so they stay inside the
 * prompt-cache prefix together with the system prompt. Inputs are tiny (≤ 3 short fields), so
 * `eager_input_streaming` is left off: the API buffers and validates them, and zod checks them
 * again here before anything runs.
 */

export const ASK_TOOL_NAMES = ["predict_rank", "find_mock_tests", "plan_countdown"] as const;
export type AskToolName = (typeof ASK_TOOL_NAMES)[number];

/** Most mock tests listed in one result / card. */
export const MAX_MOCK_TESTS = 3;

const PREDICTOR_HREF = "/tools/predictor";
const MOCK_TESTS_HREF = "/tools/mock-tests";
const LEADERBOARD_HREF = "/tools/mock-tests/leaderboard";
const PLANNER_HREF = "/tools/planner";

// ---------------------------------------------------------------------------------------------
// Definitions sent to the model (stable: never build these per request)

export const ASK_TOOLS: readonly BetaTool[] = [
  {
    name: "predict_rank",
    description:
      "Estimate a rank band for a JEE Main, NEET-UG or Brain of Himachal (BOH, Aspire's scholarship test) score or percentile with Aspire's rank predictor. It uses the general category and the common (all-India) rank list; category, PwD and home-state ranks and college options are only on the full predictor page. Returns the rank band, the percentile range, the data year and whether the tables are sample data, or not_available when the predictor has no data for that exam yet. Use it only when the student has given their exam and a score or percentile. The band is an estimate, never a promise.",
    input_schema: {
      type: "object",
      properties: {
        exam: {
          type: "string",
          enum: [...PREDICTOR_EXAMS],
          description: "jee-main = JEE Main, neet-ug = NEET-UG, boh = Brain of Himachal.",
        },
        mode: {
          type: "string",
          enum: [...INPUT_MODES],
          description: "score = marks in the paper; percentile = NTA percentile (0 to 100).",
        },
        value: { type: "number", description: "The score or percentile exactly as the student gave it." },
      },
      required: ["exam", "mode", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "find_mock_tests",
    description:
      "List up to 3 of Aspire's free online mock tests that the student can take on Aspire's website, optionally for one exam and one kind. Returns each test's title, exam, kind, number of questions, duration, maximum marks and whether it is a sample test, or not_available when no tests are published yet.",
    input_schema: {
      type: "object",
      properties: {
        exam: {
          type: "string",
          enum: [...MOCK_EXAMS],
          description: "JEE_MAIN = JEE Main, NEET = NEET-UG, BOH = Brain of Himachal. Leave out for every exam.",
        },
        kind: {
          type: "string",
          enum: ["practice", "weekly"],
          description: "practice = take it any time; weekly = the All-Himachal weekly mock with a leaderboard. Leave out for both.",
        },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: "plan_countdown",
    description:
      "Count the days left until the student's exam date (India time) and outline how Aspire's study planner would split that time: study weeks, the weekly revision / mock-test / catch-up day, the final revision phase and the light last day. Use it only with an exam date the student gave you; never guess an official exam date. Returns no outline when the date is today, has passed, or is more than about three years away.",
    input_schema: {
      type: "object",
      properties: {
        exam: {
          type: "string",
          enum: [...EXAM_IDS],
          description:
            "jee-main = JEE Main, jee-advanced = JEE Advanced, neet = NEET-UG, boh = Brain of Himachal, foundation = Class 9 or 10 school exams.",
        },
        examDate: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "The exam date the student gave, as YYYY-MM-DD.",
        },
      },
      required: ["exam", "examDate"],
      additionalProperties: false,
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Input validation (the model's tool input is untrusted)

export const predictRankInputSchema = z.object({
  exam: z.enum(PREDICTOR_EXAMS),
  mode: z.enum(INPUT_MODES),
  value: z.number().finite(),
});

export const findMockTestsInputSchema = z.object({
  exam: z.enum(MOCK_EXAMS).optional(),
  kind: z.enum(["practice", "weekly"]).optional(),
});

export const planCountdownInputSchema = z.object({
  exam: z.enum(EXAM_IDS),
  examDate: z.string().refine(isDateKey, "Use a real calendar date as YYYY-MM-DD."),
});

// ---------------------------------------------------------------------------------------------
// Execution

export interface AskToolContext {
  /** Answer language: card text (mock-test titles, plan outline) follows it. */
  language: AskLanguage;
  /** Epoch ms ("today" in India time for plan_countdown). */
  now: number;
}

export interface AskToolOutcome {
  /** JSON text for the tool_result block. */
  content: string;
  /** True for invalid input (sent as `is_error` so the model can correct itself or ask). */
  isError: boolean;
  /** Card for the chat UI; only for a successful result with something to show. */
  card: RanchoToolCard | null;
}

function result(data: Record<string, unknown>, card: RanchoToolCard | null = null): AskToolOutcome {
  return { content: JSON.stringify(data), isError: false, card };
}

function failure(data: Record<string, unknown>): AskToolOutcome {
  return { content: JSON.stringify(data), isError: true, card: null };
}

function invalidInput(error: z.ZodError): AskToolOutcome {
  const issues = error.issues.slice(0, 5).map((issue) => ({ field: issue.path.join(".") || "input", problem: issue.message }));
  return failure({ status: "invalid_input", issues, message: "Fix the input, or ask the student for the missing detail." });
}

const SAMPLE_NOTE = "Sample data, not official: tell the student plainly that this is only an illustration.";

/** Percentile range as the predictor page shows it: 2 decimals, rounded outward. */
function roundPercentile(range: Range): { min: number; max: number } {
  return { min: Math.floor(range.low * 100) / 100, max: Math.ceil(range.high * 100) / 100 };
}

export function predictRank(raw: unknown): AskToolOutcome {
  const parsed = predictRankInputSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error);
  const input = parsed.data;
  // Same visibility as /tools/predictor: null in production while only sample tables exist.
  const prediction = predictRankBand({ exam: input.exam, mode: input.mode, value: input.value }, getPredictorData());
  if (prediction.status === "not-loaded") {
    return result({
      status: "not_available",
      exam: input.exam,
      message: "Aspire's rank predictor has no data for this exam yet. Say so honestly; do not estimate a rank yourself.",
    });
  }
  if (prediction.status === "invalid") {
    return failure({
      status: "invalid_input",
      issues: prediction.issues.map((issue) => ({
        field: issue.field,
        problem: issue.code,
        ...(issue.min !== undefined ? { min: issue.min } : {}),
        ...(issue.max !== undefined ? { max: issue.max } : {}),
      })),
      message: "The value is outside what this exam allows (see min / max), or this exam has no percentile mode. Ask the student to check it.",
    });
  }
  const band = { min: prediction.crl.low, max: prediction.crl.high };
  const percentile = roundPercentile(prediction.percentile);
  const card: RankBandCard = {
    kind: "rank_band",
    exam: prediction.exam,
    input: { mode: input.mode, value: input.value },
    band,
    percentile,
    sample: prediction.sample,
    href: PREDICTOR_HREF,
  };
  return result(
    {
      status: "ok",
      exam: prediction.exam,
      dataYear: prediction.year,
      sample: prediction.sample,
      input: { mode: input.mode, value: input.value },
      rankBand: band,
      percentileRange: percentile,
      basis: "General category, common (all-India) rank list. Category, PwD and home-state ranks and college options are on the full predictor.",
      note: `${prediction.sample ? `${SAMPLE_NOTE} ` : ""}A rank band is an estimate, not a promise. The student sees this result as a card with a link to the full predictor.`,
    },
    card,
  );
}

export function findMockTests(raw: unknown, context: Pick<AskToolContext, "language">): AskToolOutcome {
  const parsed = findMockTestsInputSchema.safeParse(raw ?? {});
  if (!parsed.success) return invalidInput(parsed.error);
  const { exam, kind } = parsed.data;
  // Same visibility as /tools/mock-tests: sample tests only while placeholder content is on.
  const visible = getVisibleMockTests();
  if (visible.length === 0) {
    return result({
      status: "not_available",
      message: "Aspire's online mock tests are not published yet. Say so honestly and do not suggest a specific test.",
    });
  }
  const matching = visible.filter((test) => (!exam || test.exam === exam) && (!kind || test.kind === kind));
  if (matching.length === 0) {
    return result({
      status: "none_matching",
      filter: { ...(exam ? { exam } : {}), ...(kind ? { kind } : {}) },
      availableExams: [...new Set(visible.map((test) => test.exam))],
      message: "No visible mock test matches this filter. Say so; you may offer the tests for the available exams instead.",
    });
  }
  const tests = matching.slice(0, MAX_MOCK_TESTS).map(summariseTest);
  const card: MockTestsCard = {
    kind: "mock_tests",
    tests: tests.map((test) => ({
      id: test.id,
      title: test.title[context.language],
      exam: test.exam,
      questions: test.questionCount,
      minutes: test.durationMinutes,
      sample: test.sample,
      href: `${MOCK_TESTS_HREF}/${test.id}`,
    })),
    leaderboardHref: LEADERBOARD_HREF,
  };
  const anySample = tests.some((test) => test.sample);
  return result(
    {
      status: "ok",
      count: tests.length,
      moreAvailable: matching.length > tests.length,
      tests: tests.map((test) => ({
        title: test.title[context.language],
        exam: test.exam,
        kind: test.kind,
        questions: test.questionCount,
        minutes: test.durationMinutes,
        maxMarks: test.maxScore,
        sample: test.sample,
        summary: test.summary[context.language],
      })),
      note: `${anySample ? "These are sample tests written for the demo, not Aspire's official papers: say so. " : ""}The tests are free on Aspire's website; the student sees them as a card with a start link for each and a leaderboard link.`,
    },
    card,
  );
}

// --- plan_countdown --------------------------------------------------------------------------

type OutlineKind = Extract<DayKind, "revision" | "mock" | "buffer">;

/** Plan day numbers: day 1 is today (India time), the last day is the day before the exam. */
const OUTLINE_TEXT: Readonly<
  Record<
    AskLanguage,
    {
      main: (to: number) => string;
      weekly: (kinds: OutlineKind[]) => string;
      final: (from: number, to: number, mocks: boolean) => string;
      lastDay: (day: number) => string;
    }
  >
> = {
  en: {
    main: (to) => `Days 1–${to}: learn and practise every topic, 6 study days a week`,
    weekly: (kinds) => {
      const label: Record<OutlineKind, string> = { revision: "revision", mock: "mock-test", buffer: "catch-up" };
      const names = kinds.map((kind) => label[kind]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names.at(-1)}` : names[0];
      return `Every 7th day: a ${list} day${names.length > 1 ? ", in turn" : ""}`;
    },
    final: (from, to, mocks) =>
      `${from === to ? `Day ${from}` : `Days ${from}–${to}`}: revise every topic${mocks ? ", with a mock test every 3rd day" : ""}`,
    lastDay: (day) =>
      day === 1 ? "Today (the day before the exam): light revision only" : `Day ${day} (the day before the exam): light revision only`,
  },
  hi: {
    main: (to) => `दिन 1–${to}: हर विषय पढ़ें और अभ्यास करें, हफ़्ते में 6 दिन पढ़ाई`,
    weekly: (kinds) => {
      const label: Record<OutlineKind, string> = { revision: "रिवीज़न", mock: "मॉक टेस्ट", buffer: "कैच-अप" };
      const names = kinds.map((kind) => label[kind]);
      const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} या ${names.at(-1)}` : names[0];
      return `हर 7वाँ दिन: ${names.length > 1 ? "बारी-बारी से " : ""}${list} का दिन`;
    },
    final: (from, to, mocks) =>
      `${from === to ? `दिन ${from}` : `दिन ${from}–${to}`}: हर विषय का रिवीज़न${mocks ? ", हर तीसरे दिन मॉक टेस्ट" : ""}`,
    lastDay: (day) =>
      day === 1 ? "आज (परीक्षा से एक दिन पहले): सिर्फ़ हल्का रिवीज़न" : `दिन ${day} (परीक्षा से एक दिन पहले): सिर्फ़ हल्का रिवीज़न`,
  },
};

/**
 * The planner's own phase structure for `today … examDate − 1` (src/lib/planner/plan.ts run with
 * no topics: day kinds and phases depend only on the number of days), summarised in a few lines.
 */
export function planOutline(exam: ExamId, today: string, examDate: string, language: AskLanguage) {
  const plan = generatePlan(
    { exam, batch: "12", startDate: today, examDate, dailyHours: 6 },
    { topics: [], mockMinutes: MOCK_MINUTES[exam] },
  );
  const days = plan.days;
  const count = (kind: DayKind) => days.filter((day) => day.kind === kind).length;
  const mainDays = days.filter((day) => !day.finalPhase).length;
  const weeklyKinds: OutlineKind[] = [];
  for (const day of days) {
    if (day.finalPhase || day.kind === "study" || day.kind === "light") continue;
    const kind = day.kind as OutlineKind;
    if (!weeklyKinds.includes(kind)) weeklyKinds.push(kind);
  }
  const finalMocks = days.some((day) => day.finalPhase && day.kind === "mock");
  const lastIsLight = days.at(-1)?.kind === "light";
  // Final revision days, without the light last day (it gets its own line).
  const revisionTo = days.length - (lastIsLight ? 1 : 0);
  const text = OUTLINE_TEXT[language];

  const outline: string[] = [];
  if (mainDays > 0) outline.push(text.main(mainDays));
  if (weeklyKinds.length > 0) outline.push(text.weekly(weeklyKinds));
  if (revisionTo > mainDays) outline.push(text.final(mainDays + 1, revisionTo, finalMocks));
  if (lastIsLight) outline.push(text.lastDay(days.length));

  return {
    outline,
    counts: {
      studyDays: count("study"),
      revisionDays: count("revision"),
      mockTestDays: count("mock"),
      catchUpDays: count("buffer"),
      lightDays: count("light"),
    },
    finalPhaseStart: plan.summary.finalPhaseStart,
  };
}

export function planCountdown(raw: unknown, context: AskToolContext): AskToolOutcome {
  const parsed = planCountdownInputSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed.error);
  const { exam, examDate } = parsed.data;
  const today = istDateKey(context.now);
  const daysLeft = diffDays(today, examDate);
  const base = { exam, examDate, todayInIndia: today, daysLeft };

  if (daysLeft < 0) {
    return result({ ...base, status: "date_passed", message: "That date has already passed in India time. Ask the student to check the exam date." });
  }
  if (daysLeft === 0) {
    return result({ ...base, status: "exam_today", message: "The exam is today (India time). No plan; a calm word of encouragement fits." });
  }
  if (daysLeft > PLAN_LIMITS.maxDays) {
    return result({
      ...base,
      status: "too_far",
      message: "The study planner covers up to about three years. Give the day count only and suggest coming back closer to the exam.",
    });
  }
  // Same visibility as /tools/planner: its syllabus map and plan template are samples until Aspire approves them.
  const plannerAvailable = SYLLABUS_STATUS === "published" || showPlaceholderContent();
  if (!plannerAvailable) {
    return result({
      ...base,
      status: "ok",
      plannerAvailable: false,
      message: "Aspire's study planner is not available yet, so there is no outline. Give the day count only.",
    });
  }
  const sample = SYLLABUS_STATUS !== "published";
  const { outline, counts, finalPhaseStart } = planOutline(exam, today, examDate, context.language);
  const card: PlanCard = { kind: "plan", exam, examDate, daysLeft, outline, href: PLANNER_HREF };
  return result(
    {
      ...base,
      status: "ok",
      plannerAvailable: true,
      sample,
      outline,
      days: counts,
      finalRevisionFrom: finalPhaseStart,
      note: `Day 1 of the outline is today. This is the planner's general suggestion for the time left, not Aspire's official schedule${sample ? ", and the planner's syllabus and template are still sample content" : ""}. The student can make a personal day-by-day plan (their class, hours a day, weak topics) in the full planner, linked from the card.`,
    },
    card,
  );
}

/** Runs one tool call. Never throws: a bug becomes an error result the model can explain. */
export function runAskTool(name: string, input: unknown, context: AskToolContext): AskToolOutcome {
  try {
    switch (name) {
      case "predict_rank":
        return predictRank(input);
      case "find_mock_tests":
        return findMockTests(input, context);
      case "plan_countdown":
        return planCountdown(input, context);
      default:
        return failure({ status: "unknown_tool", message: `There is no tool named ${JSON.stringify(name.slice(0, 40))}.` });
    }
  } catch {
    return failure({ status: "tool_failed", message: "The tool failed. Tell the student it is not working right now and suggest the tool page." });
  }
}
