/**
 * Pure builders and shapes for the portal's practice-tool panels (M6 phase 2). No I/O: the
 * server loader (`learner-tools.ts`) authorises access first, reads the stores and hands the
 * rows to these functions, so the rules here are unit-testable without a database.
 *
 * Honesty (D-032): only stored activity is shown. Nothing is estimated, ranked or projected, and
 * attempts on tests that are not visible in this build (e.g. sample tests in production) are left
 * out rather than shown with their sample titles.
 */
import { htmlLang, type Locale } from "@/i18n/config";
import type { WeakTopic } from "@/lib/ask/weak-topics";
import type { AskSubject } from "@/lib/db/features/ask";
import { computeBadges, longestStreakDays, type BadgeId } from "@/lib/mocktest/badges";
import type { AttemptsSummary, SavedAttemptSummary } from "@/lib/mocktest/types";
import type { DateKey } from "@/lib/planner/dates";
import type { PlannerSummary } from "@/lib/planner/server/summary";
import type { ExamId } from "@/lib/planner/types";

export type ToolAudience = "student" | "parent";

/** A mock test visible in this build: its title in the page's language and whether it is sample content. */
export type VisibleTest = { title: string; sample: boolean };

export type MockAttemptView = {
  id: string;
  testId: string;
  title: string;
  sample: boolean;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  /** correct ÷ (correct + wrong), 0–1; null when no question was answered. */
  accuracy: number | null;
  submittedAt: number;
};

export type MockBestView = { testId: string; title: string; sample: boolean; bestScore: number; maxScore: number; attempts: number };

export type MockTestsView =
  /** No mock test is visible in this build (production while only sample tests exist). */
  | { status: "comingSoon" }
  | {
      status: "ready";
      totalAttempts: number;
      testsTaken: number;
      averageAccuracy: number | null;
      longestStreakDays: number;
      recent: MockAttemptView[];
      best: MockBestView[];
      badges: BadgeId[];
      /** Any listed attempt is on a sample test (show the sample note). */
      anySample: boolean;
    };

export type PlannerView =
  | { status: "comingSoon" }
  /** Never saved a plan or any activity from a signed-in device. */
  | { status: "empty" }
  | {
      status: "ready";
      /** The planner's syllabus / plan template is still sample content (D-032). */
      sample: boolean;
      streak: { current: number; best: number; todayDone: boolean };
      activeDaysLast30: number;
      blocksDoneLast30: number;
      reviewsLast30: number;
      /** Oldest first; `active` only (no per-day XP). */
      last30Days: { date: DateKey; active: boolean }[];
      lastActiveDate: DateKey | null;
      /** Students only (parents get counts only): XP, target exam and days to it. */
      xp: { total: number; thisWeek: number } | null;
      exam: ExamId | null;
      daysToExam: number | null;
    };

export type DoubtTopicView = { subject: AskSubject; topic: string; count: number; lastSeen: number };

export type DoubtsView =
  /** Ask Aspire has no API key on this server and the learner has no stored topics. */
  | { status: "notConnected" }
  | {
      status: "ready";
      connected: boolean;
      totalDoubts: number;
      topicCount: number;
      bySubject: { subject: AskSubject; count: number }[];
      /** Most-asked first (ties: most recent first). */
      topics: DoubtTopicView[];
    };

export type LearnerTools = {
  audience: ToolAudience;
  mockTests: MockTestsView;
  planner: PlannerView;
  doubts: DoubtsView;
};

export const RECENT_ATTEMPTS_LIMIT = 10;
export const TOP_TOPICS_LIMIT = 10;
const SUBJECT_ORDER: readonly AskSubject[] = ["physics", "chemistry", "maths", "biology"];

function accuracyOf(correct: number, wrong: number): number | null {
  const answered = correct + wrong;
  return answered > 0 ? correct / answered : null;
}

export function buildMockTestsView({
  attempts,
  summary,
  tests,
}: {
  /** Newest first (listAttemptsForStudent). */
  attempts: readonly SavedAttemptSummary[];
  summary: AttemptsSummary | null;
  /** Visible tests by id, in catalog order. */
  tests: ReadonlyMap<string, VisibleTest>;
}): MockTestsView {
  if (tests.size === 0) return { status: "comingSoon" };
  const visible = attempts.filter((attempt) => tests.has(attempt.testId));
  const noneHidden = summary !== null && visible.length === attempts.length;

  const recent: MockAttemptView[] = visible.slice(0, RECENT_ATTEMPTS_LIMIT).map((attempt) => {
    const test = tests.get(attempt.testId) as VisibleTest;
    return {
      id: attempt.id,
      testId: attempt.testId,
      title: test.title,
      sample: test.sample,
      score: attempt.score,
      maxScore: attempt.maxScore,
      correct: attempt.correct,
      wrong: attempt.wrong,
      unattempted: attempt.unattempted,
      accuracy: accuracyOf(attempt.correct, attempt.wrong),
      submittedAt: attempt.submittedAt,
    };
  });

  // Best per test: from the summary when every attempt is on a visible test, else from the visible rows.
  const bestById = new Map<string, { bestScore: number; maxScore: number; attempts: number }>();
  if (noneHidden && summary) {
    for (const entry of summary.bestByTest) bestById.set(entry.testId, entry);
  } else {
    for (const attempt of visible) {
      const entry = bestById.get(attempt.testId);
      bestById.set(attempt.testId, {
        bestScore: Math.max(entry?.bestScore ?? Number.NEGATIVE_INFINITY, attempt.score),
        maxScore: attempt.maxScore,
        attempts: (entry?.attempts ?? 0) + 1,
      });
    }
  }
  const best: MockBestView[] = [...tests].flatMap(([testId, test]) => {
    const entry = bestById.get(testId);
    return entry ? [{ testId, title: test.title, sample: test.sample, ...entry }] : [];
  });

  let totals: { totalAttempts: number; testsTaken: number; averageAccuracy: number | null; longestStreakDays: number; badges: BadgeId[] };
  if (noneHidden && summary) {
    totals = {
      totalAttempts: summary.totalAttempts,
      testsTaken: summary.testsTaken,
      averageAccuracy: summary.averageAccuracy,
      longestStreakDays: summary.longestStreakDays,
      badges: summary.badges,
    };
  } else {
    const correct = visible.reduce((sum, a) => sum + a.correct, 0);
    const wrong = visible.reduce((sum, a) => sum + a.wrong, 0);
    const times = visible.map((a) => a.submittedAt);
    totals = {
      totalAttempts: visible.length,
      testsTaken: new Set(visible.map((a) => a.testId)).size,
      averageAccuracy: accuracyOf(correct, wrong),
      longestStreakDays: longestStreakDays(times),
      // Leaderboard badges may come from hidden tests, so only activity badges are recomputed here.
      badges: computeBadges({ attemptTimes: times }),
    };
  }

  return {
    status: "ready",
    ...totals,
    recent,
    best,
    anySample: recent.some((a) => a.sample) || best.some((b) => b.sample),
  };
}

export function buildPlannerView(
  summary: PlannerSummary | null,
  { audience, sample }: { audience: ToolAudience; sample: boolean },
): PlannerView {
  if (!summary) return { status: "comingSoon" };
  if (!summary.hasPlan && summary.xp.total === 0 && summary.streak.best === 0 && summary.lastActiveDate === null) {
    return { status: "empty" };
  }
  const student = audience === "student";
  return {
    status: "ready",
    sample,
    streak: { ...summary.streak },
    activeDaysLast30: summary.activeDaysLast30,
    blocksDoneLast30: summary.blocksDoneLast30,
    reviewsLast30: summary.reviewsLast30,
    last30Days: summary.last30Days.map(({ date, active }) => ({ date, active })),
    lastActiveDate: summary.lastActiveDate,
    xp: student ? { ...summary.xp } : null,
    exam: student ? summary.exam : null,
    daysToExam: student ? summary.daysToExam : null,
  };
}

export function buildDoubtsView(topics: readonly WeakTopic[], connected: boolean): DoubtsView {
  if (!connected && topics.length === 0) return { status: "notConnected" };
  const bySubject = SUBJECT_ORDER.map((subject) => ({
    subject,
    count: topics.filter((t) => t.subject === subject).reduce((sum, t) => sum + t.count, 0),
  })).filter((entry) => entry.count > 0);
  return {
    status: "ready",
    connected,
    totalDoubts: bySubject.reduce((sum, entry) => sum + entry.count, 0),
    topicCount: topics.length,
    bySubject,
    topics: topics.slice(0, TOP_TOPICS_LIMIT).map((t) => ({
      subject: t.subject,
      topic: t.topic,
      count: t.count,
      lastSeen: Date.parse(t.lastSeen),
    })),
  };
}

export type ActivityItem =
  | { kind: "mockTest"; at: number; title: string; sample: boolean; score: number; maxScore: number }
  | { kind: "planner"; at: number }
  | { kind: "doubt"; at: number; subject: AskSubject; topic: string };

/** Noon IST on a planner day, so it sorts and formats as that calendar day. */
export function dateKeyInstant(key: DateKey): number {
  return Date.parse(`${key}T12:00:00+05:30`);
}

/** The learner's latest practice-tool activity, newest first (parent "Updates" page). */
export function buildActivity(tools: LearnerTools, limit = 8): ActivityItem[] {
  const items: ActivityItem[] = [];
  if (tools.mockTests.status === "ready") {
    for (const a of tools.mockTests.recent) {
      items.push({ kind: "mockTest", at: a.submittedAt, title: a.title, sample: a.sample, score: a.score, maxScore: a.maxScore });
    }
  }
  if (tools.planner.status === "ready" && tools.planner.lastActiveDate) {
    items.push({ kind: "planner", at: dateKeyInstant(tools.planner.lastActiveDate) });
  }
  if (tools.doubts.status === "ready") {
    for (const t of tools.doubts.topics) items.push({ kind: "doubt", at: t.lastSeen, subject: t.subject, topic: t.topic });
  }
  return items.filter((item) => Number.isFinite(item.at)).sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------------------------------------------------------------------------------------------
// Formatting (India Standard Time, the page's language)

export function formatPortalDate(epochMs: number, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang[locale], { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(epochMs);
}

export function formatPortalDateKey(key: DateKey, locale: Locale): string {
  return formatPortalDate(dateKeyInstant(key), locale);
}

export function formatPercent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale], { style: "percent", maximumFractionDigits: 0 }).format(fraction);
}

export function formatCount(value: number, locale: Locale): string {
  return new Intl.NumberFormat(htmlLang[locale]).format(value);
}
