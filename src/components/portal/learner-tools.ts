import "server-only";

import { SYLLABUS_STATUS } from "@/content/planner/syllabus";
import type { Locale } from "@/i18n/config";
import { getAskConfig } from "@/lib/ask/config";
import { getWeakTopicsFromDoubts } from "@/lib/ask/weak-topics";
import { getLinkedStudents } from "@/lib/auth/accounts";
import { canAccessStudentRecord } from "@/lib/auth/policy";
import type { Session } from "@/lib/auth/roles";
import { showPlaceholderContent } from "@/lib/content-mode";
import { getVisibleMockTests, isSampleTest } from "@/lib/mocktest/catalog";
import { mockTestTitle, parseBlueprintTest } from "@/lib/mocktest/resolve";
import { listAttemptsForStudent, summariseAttempts } from "@/lib/mocktest/store";
import { getPlannerSummary } from "@/lib/planner/server/summary";
import { qbDb } from "@/lib/qb/db";
import {
  buildDoubtsView,
  buildMockTestsView,
  buildPlannerView,
  type LearnerTools,
  type ToolAudience,
  type VisibleTest,
} from "./learner-tools-view";

/**
 * Portal data from the M6 student tools (docs/m6-plan.md, D-032 – D-035), loaded on the server
 * for ONE learner AFTER the record-level check (`canAccessStudentRecord`): a student only for
 * themself, a parent only for a learner linked to their account, everyone else (admins) never.
 * Request-time only (the planner summary reads the clock): call from inside `<PortalGate>`.
 */
export function loadLearnerTools(session: Session, studentId: string, locale: Locale): LearnerTools | null {
  if (!canAccessStudentRecord(session, studentId)) return null;
  const audience: ToolAudience = session.role === "parent" ? "parent" : "student";

  const tests = new Map<string, VisibleTest>(
    getVisibleMockTests().map((test) => [test.id, { title: test.title[locale], sample: isSampleTest(test) }]),
  );
  const attempts = listAttemptsForStudent(studentId);
  // Exam-pattern papers ("bp-<slot>…", docs/question-bank-plan.md §B14): titled from code constants
  // (`mockTestTitle`), opened on their exam's result page. "Sample" is per paper, from the paper's
  // own flag: ranked papers never use sample questions (§B10.3), and in production no paper does.
  for (const attempt of attempts) {
    if (tests.has(attempt.testId)) continue;
    const ref = parseBlueprintTest(attempt.testId);
    if (!ref) continue;
    const title = mockTestTitle(attempt.testId, locale);
    if (title) tests.set(attempt.testId, { title, sample: false, examSlot: ref.slot });
  }
  const sampleAttempts = samplePaperAttempts(attempts.filter((a) => tests.get(a.testId)?.examSlot !== undefined).map((a) => a.id));
  const mockTests =
    tests.size === 0
      ? buildMockTestsView({ attempts: [], summary: null, tests })
      : buildMockTestsView({ attempts, summary: summariseAttempts(studentId), tests, sampleAttempts });

  // Mirrors the planner page: open when its syllabus is published or sample content is on.
  const plannerOpen = SYLLABUS_STATUS === "published" || showPlaceholderContent();
  const planner = plannerOpen
    ? buildPlannerView(getPlannerSummary(studentId), { audience, sample: SYLLABUS_STATUS !== "published" })
    : buildPlannerView(null, { audience, sample: false });

  const doubts = buildDoubtsView(getWeakTopicsFromDoubts(studentId, { limit: 100 }), getAskConfig().configured);

  return { audience, mockTests, planner, doubts };
}

/**
 * Saved attempts (of the ids given) whose practice paper had sample questions, read from the paper
 * itself (`qb_papers.sample` through `qb_attempt_papers`; linked papers are never pruned). One query.
 */
function samplePaperAttempts(attemptIds: readonly string[]): Set<string> {
  if (attemptIds.length === 0) return new Set();
  const rows = qbDb()
    .prepare(
      `SELECT ap.attempt_id FROM qb_attempt_papers ap JOIN qb_papers p ON p.id = ap.paper_id
       WHERE p.sample = 1 AND p.kind = 'practice' AND ap.attempt_id IN (${attemptIds.map(() => "?").join(", ")})`,
    )
    .all(...attemptIds);
  return new Set(rows.map((row) => String(row.attempt_id)));
}

export type LinkedLearnerTools = { id: string; displayName: string; tools: LearnerTools };

/**
 * The signed-in parent's linked, enabled learners (from `parent_links`, by the session's own user
 * id), each with tool data. A learner is included only when the session also passes the record
 * check, so a stale or forged id never yields data. Not a parent → `[]`.
 */
export function loadLinkedLearnersWithTools(session: Session, locale: Locale): LinkedLearnerTools[] {
  if (session.role !== "parent") return [];
  return getLinkedStudents(session.userId).flatMap((learner) => {
    const tools = loadLearnerTools(session, learner.id, locale);
    return tools ? [{ id: learner.id, displayName: learner.displayName, tools }] : [];
  });
}
