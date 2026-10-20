import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/auth/roles";
import type { ScoreResult } from "@/lib/mocktest/types";

// Portal practice-tool data (M6 phase 2) against a fresh in-memory database per test, with real
// sessions read through getSession() (cookies() reads the test browser's jar). Synthetic accounts only.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { insertUser, setUserDisabled } = await import("@/lib/db/users");
const { createSession } = await import("@/lib/auth/sessions");
const { getSession } = await import("@/lib/auth/session");
const { linkTestParent, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { saveAttempt } = await import("@/lib/mocktest/store");
const { getVisibleMockTests } = await import("@/lib/mocktest/catalog");
const { saveState } = await import("@/lib/planner/server/store");
const { emptyState } = await import("@/lib/planner/state");
const { addDays, istDateKey } = await import("@/lib/planner/dates");
const { recordDoubtTopic } = await import("@/lib/ask/weak-topics");
const { loadLearnerTools, loadLinkedLearnersWithTools } = await import("./learner-tools");
const parentStudent = await import("@/app/api/parent/students/[studentId]/route");

// These tests never sign in with a password (sessions are created directly), so accounts get a
// placeholder hash instead of a real scrypt hash: keeps the file fast on a loaded machine.
const NO_PASSWORD = "not-a-password-hash";

async function account(role: Role, loginId: string) {
  return insertUser(getDb(), {
    role,
    loginId,
    displayName: `Name of ${loginId}`,
    passwordHash: NO_PASSWORD,
    mustChangePassword: false,
    now: Date.now(),
  });
}

/** The verified session for `userId`, read exactly as a portal page reads it. */
async function sessionOf(userId: string) {
  const browser = new TestBrowser(cookieState);
  browser.jar.set("aspire_session", createSession(userId).token);
  cookieState.jar = browser.jar;
  const session = await getSession();
  expect(session).not.toBeNull();
  return { session: session!, browser };
}

function addAttempt(userId: string, testId: string, score: number, correct: number, wrong: number, submittedAt: number) {
  const result = { score, maxScore: 60, correct, wrong, unattempted: 15 - correct - wrong } as ScoreResult;
  saveAttempt({
    userId,
    testId,
    windowId: null,
    attemptId: `attempt-${userId.slice(0, 8)}-${submittedAt}`,
    answers: [],
    timeSpentSec: [],
    result,
    timeTakenSec: 600,
    startedAt: submittedAt - 600_000,
    submittedAt,
    now: submittedAt,
  });
}

function addPlannerActivity(userId: string, activeDaysAgo: number[]) {
  const today = istDateKey(Date.now());
  const activity: Record<string, [number, number, number, 0 | 1]> = {};
  for (const ago of activeDaysAgo) activity[addDays(today, -ago)] = [40, 3, 5, 0];
  saveState(
    getDb(),
    userId,
    {
      ...emptyState(),
      updatedAt: Date.now(),
      settings: {
        exam: "neet",
        batch: "12",
        startDate: today,
        examDate: addDays(today, 90),
        dailyHours: 5,
        weakTopics: [],
        reminderMinutes: 1080,
        notifications: false,
      },
      activity,
    },
    Date.now(),
  );
}

let firstTestId: string;

// Database set-up per test (migrations + seed) can take a few seconds when the machine is busy.
vi.setConfig({ testTimeout: 20_000 });

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  resetDatabaseForTests();
  firstTestId = getVisibleMockTests()[0].id;
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

/** student1 (linked to parent) and student2 (not linked), each with their own activity. */
async function seed() {
  const student1 = await account("student", "learner.one");
  const student2 = await account("student", "learner.two");
  const parent = await account("parent", "parent.one");
  const admin = await account("admin", "admin.one");
  linkTestParent(parent.id, student1.id);
  const now = Date.now();
  addAttempt(student1.id, firstTestId, 32, 9, 2, now - 2 * 86_400_000);
  addAttempt(student1.id, firstTestId, 40, 11, 1, now - 86_400_000);
  addAttempt(student2.id, firstTestId, 12, 3, 9, now - 3600_000);
  addPlannerActivity(student1.id, [0, 1, 2]);
  recordDoubtTopic(student1.id, { subject: "physics", topic: "Projectile motion", difficulty: null }, now - 1000);
  recordDoubtTopic(student1.id, { subject: "physics", topic: "Projectile motion", difficulty: null }, now - 500);
  recordDoubtTopic(student1.id, { subject: "chemistry", topic: "Mole concept", difficulty: null }, now - 200);
  recordDoubtTopic(student2.id, { subject: "biology", topic: "Genetics", difficulty: null }, now - 100);
  return { student1, student2, parent, admin };
}

describe("loadLearnerTools: record-level access", () => {
  it("a student sees only their own mock tests, planner and doubt topics", async () => {
    const { student1, student2 } = await seed();
    const { session } = await sessionOf(student1.id);
    const tools = loadLearnerTools(session, student1.id, "en");
    expect(tools).not.toBeNull();
    expect(tools!.audience).toBe("student");
    const mock = tools!.mockTests;
    expect(mock.status).toBe("ready");
    if (mock.status !== "ready") return;
    expect(mock.totalAttempts).toBe(2);
    expect(mock.recent.map((a) => a.score)).toEqual([40, 32]); // newest first
    expect(mock.recent.every((a) => a.title.length > 0 && a.sample)).toBe(true);
    expect(mock.averageAccuracy).toBeCloseTo(20 / 23);
    expect(mock.best).toEqual([expect.objectContaining({ testId: firstTestId, bestScore: 40, attempts: 2 })]);
    expect(mock.badges).toContain("first-test");

    expect(tools!.planner).toMatchObject({ status: "ready", activeDaysLast30: 3, streak: { current: 3, todayDone: true } });
    if (tools!.planner.status === "ready") {
      expect(tools!.planner.xp).toEqual({ total: 120, thisWeek: expect.any(Number) });
      expect(tools!.planner.exam).toBe("neet");
    }

    const doubts = tools!.doubts;
    expect(doubts.status).toBe("ready");
    if (doubts.status !== "ready") return;
    expect(doubts.topics.map((t) => t.topic)).toEqual(["Projectile motion", "Mole concept"]);
    expect(doubts.totalDoubts).toBe(3);
    expect(JSON.stringify(tools)).not.toContain("Genetics");

    // Another student's id: nothing.
    expect(loadLearnerTools(session, student2.id, "en")).toBeNull();
  });

  it("a parent gets ONLY linked learners; an unlinked or unknown id gets nothing", async () => {
    const { student1, student2, parent } = await seed();
    const { session, browser } = await sessionOf(parent.id);
    expect(session.linkedStudentIds).toEqual([student1.id]);

    const learners = loadLinkedLearnersWithTools(session, "hi");
    expect(learners.map((l) => l.id)).toEqual([student1.id]);
    const tools = learners[0].tools;
    expect(tools.audience).toBe("parent");
    expect(tools.mockTests).toMatchObject({ status: "ready", totalAttempts: 2 });
    // Titles in the page's language.
    if (tools.mockTests.status === "ready") expect(tools.mockTests.recent[0].title).toBe(getVisibleMockTests()[0].title.hi);
    // Planner: counts only for parents (no XP, exam or exam date).
    expect(tools.planner).toMatchObject({ status: "ready", activeDaysLast30: 3, xp: null, exam: null, daysToExam: null });
    expect(JSON.stringify(tools)).not.toContain("Genetics");

    expect(loadLearnerTools(session, student2.id, "en")).toBeNull();
    expect(loadLearnerTools(session, "00000000-0000-4000-8000-000000000000", "en")).toBeNull();
    expect(loadLearnerTools(session, "../etc/passwd", "en")).toBeNull();
    // The portal API agrees: 403 for the unlinked learner.
    const response = await browser.send(
      parentStudent.GET,
      `/api/parent/students/${student2.id}`,
      {},
      params({ studentId: student2.id }),
    );
    expect(response.status).toBe(403);
  });

  it("a disabled linked learner is left out", async () => {
    const { student1, parent } = await seed();
    setUserDisabled(getDb(), student1.id, true, Date.now());
    const { session } = await sessionOf(parent.id);
    expect(loadLinkedLearnersWithTools(session, "en")).toEqual([]);
    expect(loadLearnerTools(session, student1.id, "en")).toBeNull();
  });

  it("admins and students get no learner lists, and admins no learner records", async () => {
    const { student1, admin } = await seed();
    const { session: adminSession } = await sessionOf(admin.id);
    expect(loadLearnerTools(adminSession, student1.id, "en")).toBeNull();
    expect(loadLinkedLearnersWithTools(adminSession, "en")).toEqual([]);
    const { session: studentSession } = await sessionOf(student1.id);
    expect(loadLinkedLearnersWithTools(studentSession, "en")).toEqual([]);
  });
});

describe("loadLearnerTools: empty and gated states", () => {
  it("a student with no activity gets empty states; Ask Aspire without a key is 'not connected'", async () => {
    const student = await account("student", "new.learner");
    const { session } = await sessionOf(student.id);
    const tools = loadLearnerTools(session, student.id, "en")!;
    expect(tools.mockTests).toMatchObject({ status: "ready", totalAttempts: 0, recent: [], best: [], badges: [] });
    expect(tools.planner).toEqual({ status: "empty" });
    expect(tools.doubts).toEqual({ status: "notConnected" });

    vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
    expect(loadLearnerTools(session, student.id, "en")!.doubts).toMatchObject({ status: "ready", connected: true, topics: [] });
  });

  it("production without sample content: mock tests and planner 'coming soon', stored doubt topics still shown", async () => {
    const { student1 } = await seed();
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    const { session } = await sessionOf(student1.id);
    const tools = loadLearnerTools(session, student1.id, "en")!;
    expect(tools.mockTests).toEqual({ status: "comingSoon" });
    expect(tools.planner).toEqual({ status: "comingSoon" });
    // Sample test titles never leak when the tests are hidden.
    expect(JSON.stringify(tools)).not.toMatch(/sample/i);
    expect(tools.doubts).toMatchObject({ status: "ready", connected: false, totalDoubts: 3 });
  });
});
