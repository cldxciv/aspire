import "server-only";

import { z } from "zod";

import { getWeakTopicsFromDoubts } from "@/lib/ask/weak-topics";
import { adminGetUser } from "@/lib/auth/accounts";
import { summariseAttempts } from "@/lib/mocktest/store";
import { getPlannerSummary } from "@/lib/planner/server/summary";

import { isoOrNull, recordIdSchema } from "./common";
import { defineTool, fail, READ_ONLY } from "./types";

/**
 * `get_student_progress`: counts and labels only, from the stores the student and parent portals
 * use (mock tests, planner, Ask Aspire weak topics). Never answers, plan contents, flashcards,
 * nicknames, schools, question text, photos or model answers.
 */

const WEAK_TOPIC_LIMIT = 10;

export const getStudentProgress = defineTool({
  name: "get_student_progress",
  title: "Get student progress summary",
  description:
    "Summarises one STUDENT account's activity on the website's study tools (counts and labels only): " +
    "mock tests (attempts, tests taken, average accuracy 0–1, best score per test id, longest streak, badges), " +
    "study planner (has a plan, exam, days to exam, streak, XP, activity in the last 30 days), " +
    `and up to ${WEAK_TOPIC_LIMIT} 'weak topics' (subject + short topic label + how many doubts were asked in Ask Aspire). ` +
    "Only data saved from signed-in devices exists (guest use stays in the browser). Students are minors: use this only for the admin task at hand " +
    "and do not copy it elsewhere. studentId comes from list_accounts (role student).",
  scope: "read",
  inputSchema: z.object({ studentId: recordIdSchema.describe("Student account id.") }),
  annotations: READ_ONLY,
  run(args, ctx) {
    const user = adminGetUser(args.studentId);
    if (!user) return fail("not_found", "No account has this id. Use list_accounts with role student.");
    if (user.role !== "student") return fail("not_a_student", `This account is a ${user.role}, not a student.`);

    const mock = summariseAttempts(user.id);
    const planner = getPlannerSummary(user.id, ctx.now);
    const weakTopics = getWeakTopicsFromDoubts(user.id, { limit: WEAK_TOPIC_LIMIT }).map((topic) => ({
      subject: topic.subject,
      topic: topic.topic,
      doubts: topic.count,
      lastAskedAt: topic.lastSeen,
    }));

    const data = {
      student: { id: user.id, displayName: user.displayName, disabled: user.disabled },
      mockTests: {
        totalAttempts: mock.totalAttempts,
        testsTaken: mock.testsTaken,
        lastAttemptAt: isoOrNull(mock.lastAttemptAt),
        averageAccuracy: mock.averageAccuracy === null ? null : Math.round(mock.averageAccuracy * 1000) / 1000,
        bestByTest: mock.bestByTest.map((test) => ({
          testId: test.testId,
          bestScore: test.bestScore,
          maxScore: test.maxScore,
          attempts: test.attempts,
        })),
        longestStreakDays: mock.longestStreakDays,
        badges: [...mock.badges],
      },
      planner: {
        hasPlan: planner.hasPlan,
        exam: planner.exam,
        examDate: planner.examDate,
        daysToExam: planner.daysToExam,
        streak: { ...planner.streak },
        xp: { ...planner.xp },
        activeDaysLast30: planner.activeDaysLast30,
        blocksDoneLast30: planner.blocksDoneLast30,
        reviewsLast30: planner.reviewsLast30,
        lastActiveDate: planner.lastActiveDate,
        lastSyncedAt: isoOrNull(planner.lastSyncedAt),
      },
      askWeakTopics: weakTopics,
    };
    const accuracy = data.mockTests.averageAccuracy === null ? "n/a" : `${Math.round(data.mockTests.averageAccuracy * 100)}%`;
    return {
      ok: true,
      summary:
        `Student "${user.displayName}": ${mock.totalAttempts} mock-test attempt(s) (accuracy ${accuracy}); ` +
        `planner ${planner.hasPlan ? `active, streak ${planner.streak.current} day(s), ${planner.activeDaysLast30} active day(s) in the last 30` : "not set up"}; ` +
        `${weakTopics.length} weak topic(s) from Ask Aspire.`,
      data,
    };
  },
});
