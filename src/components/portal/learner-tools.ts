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
import { listAttemptsForStudent, summariseAttempts } from "@/lib/mocktest/store";
import { getPlannerSummary } from "@/lib/planner/server/summary";
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
  const mockTests =
    tests.size === 0
      ? buildMockTestsView({ attempts: [], summary: null, tests })
      : buildMockTestsView({ attempts: listAttemptsForStudent(studentId), summary: summariseAttempts(studentId), tests });

  // Mirrors the planner page: open when its syllabus is published or sample content is on.
  const plannerOpen = SYLLABUS_STATUS === "published" || showPlaceholderContent();
  const planner = plannerOpen
    ? buildPlannerView(getPlannerSummary(studentId), { audience, sample: SYLLABUS_STATUS !== "published" })
    : buildPlannerView(null, { audience, sample: false });

  const doubts = buildDoubtsView(getWeakTopicsFromDoubts(studentId, { limit: 100 }), getAskConfig().configured);

  return { audience, mockTests, planner, doubts };
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
