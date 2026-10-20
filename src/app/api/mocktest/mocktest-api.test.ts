import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AttemptStart,
  CertificateVerification,
  LeaderboardData,
  MocktestProfile,
  SavedAttemptDetail,
  SavedAttemptSummary,
  ScoredAttempt,
} from "@/lib/mocktest/types";

// /api/mocktest/** route handlers against a fresh in-memory database per test (synthetic accounts only).
// Sign-ins hash passwords with scrypt, which is slow when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 });
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
const { setUserDisabled } = await import("@/lib/db/users");
const { listAudit } = await import("@/lib/db/audit");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { MOCK_QUESTIONS, MOCK_TESTS } = await import("@/content/mocktest");
const { resetMocktestLimitersForTests } = await import("@/lib/mocktest/service");
const { consumeStart, createStart, listAttemptsForStudent, summariseAttempts } = await import("@/lib/mocktest/store");
const { formatVerifyId } = await import("@/lib/mocktest/timing");
const login = await import("@/app/api/auth/login/route");
const score = await import("./score/route");
const start = await import("./start/route");
const attempts = await import("./attempts/route");
const profile = await import("./profile/route");
const leaderboard = await import("./leaderboard/route");
const verify = await import("./verify/[id]/route");
const adminProfile = await import("@/app/api/admin/mocktest/profile/[userId]/route");
const leadGate = await import("@/app/api/lead-gate/route");
const { isLeadGateResponse } = await import("@/components/lead-gate/lead-gate-client");
const { LEAD_GATE_CONSENT_VERSION } = await import("@/lib/lead-gate/contract");

const PASSWORD = "mock-test-pass-2026";
const QUESTION = new Map(MOCK_QUESTIONS.map((q) => [q.id, q]));
const NEET = MOCK_TESTS.find((t) => t.id === "neet-sample")!;
const NEET_IDS = NEET.sections.flatMap((s) => s.questionIds);
const NEET_KEY = NEET_IDS.map((id) => QUESTION.get(id)!.answer);
const WEEKLY = MOCK_TESTS.find((t) => t.kind === "weekly")!;
const WEEKLY_IDS = WEEKLY.sections.flatMap((s) => s.questionIds);
const FIRST_WINDOW = WEEKLY.windows![0];
const LAST_WINDOW = WEEKLY.windows![WEEKLY.windows!.length - 1];
/** Wednesday of the first sample week (inside week-2026-10-19). */
const IN_WINDOW = Date.parse("2026-10-21T10:00:00+05:30");
const MINUTE = 60_000;

type Browser = InstanceType<typeof TestBrowser>;

let ipCounter = 0;
function browser(ip?: string): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, ip ?? `203.0.113.${(ipCounter % 200) + 20}`);
}

async function signedIn(
  role: "student" | "parent" | "admin",
  loginId: string,
  displayName?: string,
): Promise<{ b: Browser; userId: string }> {
  const user = await createTestUser({ role, loginId, password: PASSWORD, displayName });
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return { b, userId: user.id };
}

/** NEET: `correct` right answers first, then `wrong` wrong ones, rest blank. */
function neetAnswers(correct: number, wrong = 0): (number | null)[] {
  return NEET_KEY.map((answer, i) => (i < correct ? answer : i < correct + wrong ? (answer + 1) % 4 : null));
}

/** Weekly test: the first `correct` answers right, the rest blank. MCQ 4 marks, numerical 4 marks. */
function weeklyAnswers(correct: number): (number | string | null)[] {
  return WEEKLY_IDS.map((id, i) => {
    if (i >= correct) return null;
    const q = QUESTION.get(id)!;
    return q.type === "numerical" ? String(q.answer) : q.answer;
  });
}

function body(testId: string, answers: (number | string | null)[], extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    testId,
    attemptId: `attempt-${Math.random().toString(36).slice(2, 12)}`,
    answers,
    timeSpentSec: answers.map(() => 20),
    startedAt: now - 20 * MINUTE,
    submittedAt: now - 1000,
    ...extra,
  };
}

async function json<T>(response: Response) {
  return (await response.json()) as { ok: boolean; data: T; error?: string; fieldErrors?: Record<string, string[]> };
}

type Saved = { attempt: SavedAttemptSummary; scored: ScoredAttempt };

async function startToken(b: Browser, testId = WEEKLY.id): Promise<AttemptStart> {
  const response = await b.send(start.POST, "/api/mocktest/start", { body: { testId } });
  expect(response.status).toBe(201);
  return (await json<AttemptStart>(response)).data;
}

async function save(b: Browser, payload: Record<string, unknown>): Promise<Saved> {
  const response = await b.send(attempts.POST, "/api/mocktest/attempts", { body: payload });
  expect([200, 201]).toContain(response.status);
  return (await json<Saved>(response)).data;
}

/** Start now, wait `minutes` (fake clock), save. */
async function timedAttempt(b: Browser, answers: (number | string | null)[], minutes: number, extra: Record<string, unknown> = {}) {
  const { token } = await startToken(b);
  vi.setSystemTime(Date.now() + minutes * MINUTE);
  return save(b, body(WEEKLY.id, answers, { startToken: token, ...extra }));
}

async function joinBoard(b: Browser, nickname: string, extra: Record<string, unknown> = {}) {
  const response = await b.send(profile.PUT, "/api/mocktest/profile", {
    method: "PUT",
    body: { nickname, district: null, school: null, showSchool: false, leaderboardOptIn: true, ...extra },
  });
  expect(response.status, nickname).toBe(200);
}

async function board(query = "", b: Browser = browser()) {
  return json<LeaderboardData>(await b.send(leaderboard.GET, `/api/mocktest/leaderboard?test=${WEEKLY.id}${query}`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(IN_WINDOW);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
  resetDatabaseForTests();
  resetMocktestLimitersForTests();
  for (const level of ["info", "warn", "error", "log"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("POST /api/mocktest/score", () => {
  it("practice test: scores from the answer key and releases solutions; a client score is ignored", async () => {
    const response = await browser().send(score.POST, "/api/mocktest/score", {
      body: { testId: NEET.id, answers: neetAnswers(10, 5), timeSpentSec: NEET_IDS.map(() => 30), score: 160, result: { score: 160 } },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const { data } = await json<ScoredAttempt>(response);
    expect(data.result.score).toBe(10 * 4 - 5);
    expect(data.result.maxScore).toBe(160);
    expect(data.result.correct).toBe(10);
    expect(data.result.wrong).toBe(5);
    expect(data.solutionsReleased).toBe(true);
    expect(data.solutionsReleaseAt).toBeNull();
    expect(data.review).toHaveLength(40);
    expect(data.review[0]).toMatchObject({ id: NEET_IDS[0], correct: NEET_KEY[0] });
    expect(data.review[0].solution.hi).toMatch(/[ऀ-ॿ]/);
    expect(data.sample).toBe(true);
    if (data.projection) expect(data.projection.sample).toBe(true);
  });

  it("weekly test in its window: per-question outcomes only, no correct options or solutions (M1)", async () => {
    const response = await browser().send(score.POST, "/api/mocktest/score", { body: { testId: WEEKLY.id, answers: WEEKLY_IDS.map(() => null) } });
    expect(response.status).toBe(200);
    const raw = await response.text();
    const data = (JSON.parse(raw) as { data: ScoredAttempt }).data;
    expect(data.solutionsReleased).toBe(false);
    expect(data.review).toEqual([]);
    // The sample windows run back to back, so the key stays locked until the last one is over.
    expect(data.solutionsReleaseAt).toBe(Date.parse(LAST_WINDOW.endsAt) + (WEEKLY.durationMinutes + 2) * MINUTE);
    expect(data.result.questions.map((q) => q.outcome)).toEqual(WEEKLY_IDS.map(() => "unattempted"));
    expect(raw).not.toContain('"solution"');
    // Answering shows right / wrong per question — still no key.
    const partly = await json<ScoredAttempt>(
      await browser().send(score.POST, "/api/mocktest/score", { body: { testId: WEEKLY.id, answers: weeklyAnswers(3) } }),
    );
    expect(partly.data.result.questions.slice(0, 4).map((q) => q.outcome)).toEqual(["correct", "correct", "correct", "unattempted"]);
    expect(partly.data.review).toEqual([]);
  });

  it("weekly test after its last window (and its last attempts) closed: the key is released", async () => {
    vi.setSystemTime(Date.parse(LAST_WINDOW.endsAt) + (WEEKLY.durationMinutes + 3) * MINUTE);
    const { data } = await json<ScoredAttempt>(
      await browser().send(score.POST, "/api/mocktest/score", { body: { testId: WEEKLY.id, answers: weeklyAnswers(0) } }),
    );
    expect(data.solutionsReleased).toBe(true);
    expect(data.review).toHaveLength(WEEKLY_IDS.length);
  });

  it("rejects malformed answers (422), a wrong count (422), unknown tests (404) and cross-origin calls (403)", async () => {
    const b = browser();
    expect((await b.send(score.POST, "/api/mocktest/score", { body: { testId: NEET.id, answers: NEET_IDS.map(() => 7) } })).status).toBe(422);
    expect((await b.send(score.POST, "/api/mocktest/score", { body: { testId: NEET.id, answers: [0] } })).status).toBe(422);
    expect((await b.send(score.POST, "/api/mocktest/score", { body: { testId: "nope", answers: [] } })).status).toBe(404);
    const cross = await b.send(score.POST, "/api/mocktest/score", { body: { testId: NEET.id, answers: neetAnswers(1) }, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    expect((await b.send(score.POST, "/api/mocktest/score", { body: "x", contentType: "text/plain" })).status).toBe(415);
  });

  it("production mode (no placeholder content): sample tests do not exist", async () => {
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect((await browser().send(score.POST, "/api/mocktest/score", { body: { testId: NEET.id, answers: neetAnswers(40) } })).status).toBe(404);
    expect((await browser().send(start.POST, "/api/mocktest/start", { body: { testId: WEEKLY.id } })).status).toBe(404);
    expect((await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=${WEEKLY.id}`)).status).toBe(404);
  });
});

describe("lead gate on POST /api/mocktest/score (docs/lead-gate-plan.md §5.7)", () => {
  const SCORE = "/api/mocktest/score";
  /** 09:30 IST on the test day: IN_WINDOW is half an hour later. */
  const SINCE = "2026-10-21T04:00:00Z";
  let phoneCounter = 0;

  function gateOn(extra: Record<string, string> = {}) {
    vi.stubEnv("LEAD_GATE", "required");
    vi.stubEnv("LEAD_GATE_SECRET", "mocktest-gate-secret-0123456789abcdefghij");
    // No sample-data setting: the demo's sample tests are gated too (owner decision 21 Oct 2026).
    for (const [name, value] of Object.entries(extra)) vi.stubEnv(name, value);
  }

  /** Shares contact details once on this browser (POST /api/lead-gate) → pass cookie. */
  async function unlock(b: Browser) {
    phoneCounter += 1;
    const response = await b.send(leadGate.POST, "/api/lead-gate", {
      body: {
        studentName: "Mock Gate Student",
        phone: `98100 2${String(phoneCounter).padStart(4, "0")}`,
        currentClass: "class-12",
        submittedBy: "parent",
        consent: true,
        consentVersion: LEAD_GATE_CONSENT_VERSION,
        tool: "mock-test",
        website: "",
      },
    });
    expect(response.status).toBe(201);
    expect(b.jar.has("aspire_tool_pass")).toBe(true);
  }

  const neet = (extra: Record<string, unknown> = {}) => ({ testId: NEET.id, answers: neetAnswers(10, 5), timeSpentSec: NEET_IDS.map(() => 30), ...extra });

  function toolUses(): Record<string, unknown>[] {
    return getDb()
      .prepare("SELECT meta FROM crm_activities WHERE type = 'tool_use' ORDER BY id")
      .all()
      .map((row) => JSON.parse(String(row.meta)) as Record<string, unknown>);
  }

  it("locked guest: the gate 401 and nothing scored, for sample and weekly tests alike", async () => {
    gateOn();
    for (const payload of [neet({ record: true }), { testId: WEEKLY.id, answers: weeklyAnswers(3) }]) {
      const response = await browser().send(score.POST, SCORE, { body: payload });
      expect(response.status).toBe(401);
      expect(isLeadGateResponse(response)).toBe(true);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ ok: false, error: "unauthenticated", gate: "lead" });
      expect(body).not.toHaveProperty("data");
    }
    expect(toolUses()).toEqual([]);
  });

  it("a result this browser already showed (`seen`) is scored again without contact details, with or without LEAD_GATE_SINCE", async () => {
    for (const extra of [{}, { LEAD_GATE_SINCE: SINCE }] as Record<string, string>[]) {
      gateOn(extra);
      const later = { startedAt: IN_WINDOW - 10 * MINUTE };
      const seen = await browser().send(score.POST, SCORE, { body: neet({ ...later, seen: true }) });
      expect(seen.status).toBe(200);
      expect((await json<ScoredAttempt>(seen)).data.result.score).toBe(35);
      // Not seen (no local score yet): the gate.
      expect((await browser().send(score.POST, SCORE, { body: neet(later) })).status).toBe(401);
      // A malformed flag is ignored, never a 422.
      expect((await browser().send(score.POST, SCORE, { body: neet({ ...later, seen: "yes" }) })).status).toBe(401);
      // Without a pass nothing is noted, even if a hand-made request adds `record`.
      expect((await browser().send(score.POST, SCORE, { body: neet({ seen: true, record: true }) })).status).toBe(200);
    }
    expect(toolUses()).toEqual([]);
  });

  it("the body is read (JSON, at most 16 KB) before the gate decides; same-origin and the IP limit come first", async () => {
    gateOn();
    expect((await browser().send(score.POST, SCORE, { body: "x", contentType: "text/plain" })).status).toBe(415);
    expect((await browser().send(score.POST, SCORE, { body: neet(), origin: "https://evil.example" })).status).toBe(403);
    // Sample tests get the gate with nothing but LEAD_GATE=required and a secret.
    expect(isLeadGateResponse(await browser().send(score.POST, SCORE, { body: neet() }))).toBe(true);
  });

  it("gate off or optional: scored exactly as before", async () => {
    gateOn({ LEAD_GATE: "" });
    expect((await browser().send(score.POST, SCORE, { body: neet() })).status).toBe(200);
    gateOn({ LEAD_GATE: "optional" });
    const response = await browser().send(score.POST, SCORE, { body: neet({ record: true }) });
    expect(response.status).toBe(200);
    expect((await json<ScoredAttempt>(response)).data.result.score).toBe(35);
    expect(toolUses()).toEqual([]);
  });

  it("signed-in students and parents skip the gate, and nothing is noted for account holders", async () => {
    gateOn();
    for (const role of ["student", "parent"] as const) {
      const { b } = await signedIn(role, `${role}.gate`);
      expect((await b.send(score.POST, SCORE, { body: neet({ record: true }) })).status).toBe(200);
    }
    expect(toolUses()).toEqual([]);
  });

  it("earlier attempts are never gated: a start before LEAD_GATE_SINCE is scored; a later or unknown one is not", async () => {
    gateOn({ LEAD_GATE_SINCE: SINCE });
    const before = await browser().send(score.POST, SCORE, { body: neet({ startedAt: IN_WINDOW - 45 * MINUTE }) });
    expect(before.status).toBe(200);
    expect((await json<ScoredAttempt>(before)).data.result.score).toBe(35);
    for (const startedAt of [IN_WINDOW - 10 * MINUTE, undefined, "yesterday", -5]) {
      const response = await browser().send(score.POST, SCORE, { body: neet(startedAt === undefined ? {} : { startedAt }) });
      expect(response.status, String(startedAt)).toBe(401);
    }
    // Malformed answers of an earlier attempt are still a validation error, not a gate.
    expect((await browser().send(score.POST, SCORE, { body: neet({ startedAt: IN_WINDOW - 45 * MINUTE, answers: [0] }) })).status).toBe(422);
  });

  it("a pass unlocks; only a first scoring (record) notes the test, exam and a 10-point band — never the score", async () => {
    gateOn();
    const b = browser();
    await unlock(b);
    const first = await b.send(score.POST, SCORE, { body: neet({ record: true }) });
    expect(first.status).toBe(200);
    expect((await json<ScoredAttempt>(first)).data.result.score).toBe(35);
    // Re-opening the result or printing it sends no `record`: nothing more is noted.
    expect((await b.send(score.POST, SCORE, { body: neet() })).status).toBe(200);
    let uses = toolUses();
    expect(uses).toHaveLength(1);
    expect(uses[0]).toEqual({
      tool: "mock-test",
      key: NEET.id,
      exam: "neet",
      testId: NEET.id,
      scoreBand: "pct-20-29",
      uses: 1,
      lastAt: new Date(IN_WINDOW).toISOString(),
    });
    expect(JSON.stringify(uses)).not.toMatch(/"score"|answers|35/);
    // Another first scoring the same day merges into the same entry.
    await b.send(score.POST, SCORE, { body: neet({ record: true, answers: neetAnswers(40) }) });
    uses = toolUses();
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ uses: 2, scoreBand: "pct-90-100" });
  });

  it("LEAD_GATE_RECORD_USE=off: a pass still unlocks but nothing is noted", async () => {
    gateOn({ LEAD_GATE_RECORD_USE: "off" });
    const b = browser();
    await unlock(b);
    expect((await b.send(score.POST, SCORE, { body: neet({ record: true }) })).status).toBe(200);
    expect(toolUses()).toEqual([]);
  });

  it("a dead pass cookie gets the gate and is cleared", async () => {
    gateOn();
    const b = browser();
    b.jar.set("aspire_tool_pass", "lg1.not-a-real-pass.1999999999.c2ln");
    const response = await b.send(score.POST, SCORE, { body: neet() });
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie().join("\n")).toMatch(/aspire_tool_pass=;.*Max-Age=0/i);
    expect(b.jar.has("aspire_tool_pass")).toBe(false);
  });
});

describe("POST /api/mocktest/start (M1)", () => {
  it("weekly test: a signed-in student gets a leaderboard start; guests and other roles get a practice start", async () => {
    const guest = await startToken(browser());
    expect(guest).toMatchObject({ leaderboard: false, windowId: FIRST_WINDOW.id, startedAt: IN_WINDOW, minSeconds: 450, maxSeconds: 32 * 60 });
    expect(guest.token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const parent = await signedIn("parent", "parent.start");
    expect((await startToken(parent.b)).leaderboard).toBe(false);
    const student = await signedIn("student", "student.start");
    const mine = await startToken(student.b);
    expect(mine).toMatchObject({ leaderboard: true, windowId: FIRST_WINDOW.id });
    // Only the token's hash is stored.
    const rows = getDb().prepare("SELECT token_hash, user_id FROM mocktest_starts").all();
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain(mine.token!);
    expect(rows.filter((r) => r.user_id === student.userId)).toHaveLength(1);
  });

  it("practice tests have no leaderboard: no token, nothing stored; cross-origin is refused", async () => {
    const practice = await startToken(browser(), NEET.id);
    expect(practice).toMatchObject({ token: null, leaderboard: false, windowId: null });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM mocktest_starts").get()).toEqual({ n: 0 });
    const cross = await browser().send(start.POST, "/api/mocktest/start", { body: { testId: WEEKLY.id }, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
    expect((await browser().send(start.POST, "/api/mocktest/start", { body: { testId: "nope" } })).status).toBe(404);
  });

  it("outside every window the start is practice", async () => {
    vi.setSystemTime(Date.parse(FIRST_WINDOW.startsAt) - 60 * MINUTE);
    const s = await signedIn("student", "student.early");
    expect(await startToken(s.b)).toMatchObject({ leaderboard: false, windowId: null });
  });
});

describe("start token lifecycle and server timing (M1)", () => {
  it("valid: the server measures the duration itself; the browser's clock is ignored", async () => {
    const s = await signedIn("student", "student.valid");
    const { attempt, scored } = await timedAttempt(s.b, weeklyAnswers(5), 12, { startedAt: Date.now() - 1000, submittedAt: Date.now() });
    expect(attempt).toMatchObject({ leaderboard: true, practiceReason: null, serverDurationSec: 12 * 60, windowId: FIRST_WINDOW.id, score: 20 });
    expect(attempt.verifyId).toMatch(/^[0-9a-f]{16}$/);
    // The student's own saved attempt comes back with its solutions, even inside the window.
    expect(scored.solutionsReleased).toBe(true);
    expect(scored.review).toHaveLength(WEEKLY_IDS.length);
  });

  it("used: a start counts for one saved attempt only", async () => {
    const s = await signedIn("student", "student.used");
    const { token } = await startToken(s.b);
    vi.setSystemTime(Date.now() + 10 * MINUTE);
    expect((await save(s.b, body(WEEKLY.id, weeklyAnswers(2), { startToken: token }))).attempt.leaderboard).toBe(true);
    const again = await save(s.b, body(WEEKLY.id, weeklyAnswers(15), { startToken: token }));
    expect(again.attempt).toMatchObject({ leaderboard: false, practiceReason: "start_invalid" });
  });

  it("a retried save (same attempt id) returns the first row and leaves the start alone", async () => {
    const s = await signedIn("student", "student.retry");
    const { token } = await startToken(s.b);
    vi.setSystemTime(Date.now() + 10 * MINUTE);
    const payload = body(WEEKLY.id, weeklyAnswers(4), { startToken: token });
    const first = await s.b.send(attempts.POST, "/api/mocktest/attempts", { body: payload });
    expect(first.status).toBe(201);
    const second = await s.b.send(attempts.POST, "/api/mocktest/attempts", { body: payload });
    expect(second.status).toBe(200);
    expect((await json<Saved>(second)).data.attempt.leaderboard).toBe(true);
    expect(listAttemptsForStudent(s.userId)).toHaveLength(1);
  });

  it("expired: saved after the time limit + grace is practice (too slow)", async () => {
    const s = await signedIn("student", "student.slow");
    const { attempt } = await timedAttempt(s.b, weeklyAnswers(15), WEEKLY.durationMinutes + 3);
    expect(attempt).toMatchObject({ leaderboard: false, practiceReason: "too_slow", serverDurationSec: (WEEKLY.durationMinutes + 3) * 60, score: 60 });
  });

  it("too fast: saved before the minimum time is practice — still saved and scored, never rejected", async () => {
    const s = await signedIn("student", "student.fast");
    const { attempt, scored } = await timedAttempt(s.b, weeklyAnswers(15), 2);
    expect(attempt).toMatchObject({ leaderboard: false, practiceReason: "too_fast", serverDurationSec: 120, score: 60 });
    expect(scored.result.score).toBe(60);
  });

  it("other user: another student's start is refused for them and stays usable by its owner", async () => {
    const a = await signedIn("student", "student.owner");
    const b = await signedIn("student", "student.thief");
    const { token } = await startToken(a.b);
    vi.setSystemTime(Date.now() + 10 * MINUTE);
    expect((await save(b.b, body(WEEKLY.id, weeklyAnswers(15), { startToken: token }))).attempt.practiceReason).toBe("start_invalid");
    expect((await save(a.b, body(WEEKLY.id, weeklyAnswers(3), { startToken: token }))).attempt.leaderboard).toBe(true);
  });

  it("guest start, then sign in: practice (signed_out_start); no token: practice (no_start)", async () => {
    const s = await signedIn("student", "student.late");
    const { token } = await startToken(browser());
    vi.setSystemTime(Date.now() + 10 * MINUTE);
    expect((await save(s.b, body(WEEKLY.id, weeklyAnswers(1), { startToken: token }))).attempt.practiceReason).toBe("signed_out_start");
    expect((await save(s.b, body(WEEKLY.id, weeklyAnswers(1)))).attempt.practiceReason).toBe("no_start");
    expect((await save(s.b, body(NEET.id, neetAnswers(1)))).attempt.practiceReason).toBe("practice_test");
  });

  it("store: unknown, used, other user, other test, guest and ok", async () => {
    const one = await createTestUser({ role: "student", loginId: "store.one", password: PASSWORD });
    const two = await createTestUser({ role: "student", loginId: "store.two", password: PASSWORD });
    const now = Date.now();
    const { token } = createStart({ userId: one.id, test: WEEKLY, windowId: FIRST_WINDOW.id, now });
    const guest = createStart({ userId: null, test: WEEKLY, windowId: FIRST_WINDOW.id, now }).token;
    expect(consumeStart({ token: null, userId: one.id, testId: WEEKLY.id, now })).toEqual({ status: "missing" });
    expect(consumeStart({ token: "x".repeat(32), userId: one.id, testId: WEEKLY.id, now })).toEqual({ status: "unknown" });
    expect(consumeStart({ token, userId: one.id, testId: NEET.id, now })).toEqual({ status: "other_test" });
    expect(consumeStart({ token, userId: two.id, testId: WEEKLY.id, now })).toEqual({ status: "other_user" });
    expect(consumeStart({ token: guest, userId: one.id, testId: WEEKLY.id, now })).toEqual({ status: "guest" });
    expect(consumeStart({ token, userId: one.id, testId: WEEKLY.id, now })).toEqual({ status: "ok", startedAt: now, windowId: FIRST_WINDOW.id });
    expect(consumeStart({ token, userId: one.id, testId: WEEKLY.id, now })).toEqual({ status: "used" });
  });
});

describe("/api/mocktest/attempts", () => {
  it("guests get 401; parents and admins get 403", async () => {
    expect((await browser().send(attempts.GET, "/api/mocktest/attempts")).status).toBe(401);
    expect((await browser().send(attempts.POST, "/api/mocktest/attempts", { body: body(NEET.id, neetAnswers(1)) })).status).toBe(401);
    const parent = await signedIn("parent", "parent.mock");
    expect((await parent.b.send(attempts.GET, "/api/mocktest/attempts")).status).toBe(403);
    expect((await parent.b.send(attempts.POST, "/api/mocktest/attempts", { body: body(NEET.id, neetAnswers(1)) })).status).toBe(403);
    const admin = await signedIn("admin", "admin.mock");
    expect((await admin.b.send(attempts.GET, "/api/mocktest/attempts")).status).toBe(403);
  });

  it("re-scores on the server, ignores the client's score and de-duplicates by attempt id", async () => {
    const { b, userId } = await signedIn("student", "student.mock");
    const payload = body(NEET.id, neetAnswers(20, 10), { score: 160, correct: 40 });
    const first = await b.send(attempts.POST, "/api/mocktest/attempts", { body: payload });
    expect(first.status).toBe(201);
    const { data } = await json<Saved>(first);
    expect(data.attempt.score).toBe(20 * 4 - 10);
    expect(data.attempt.correct).toBe(20);
    expect(data.attempt.practiceReason).toBe("practice_test");
    expect(data.scored.result.score).toBe(70);
    expect((await b.send(attempts.POST, "/api/mocktest/attempts", { body: payload })).status).toBe(200);
    expect(listAttemptsForStudent(userId)).toHaveLength(1);
    expect(summariseAttempts(userId)).toMatchObject({ totalAttempts: 1, testsTaken: 1, badges: ["first-test"] });
  });

  it("browser times are the student's own record: impossible ones are tidied, never trusted or rejected", async () => {
    const { b } = await signedIn("student", "student.times");
    const now = Date.now();
    const future = await save(b, body(NEET.id, neetAnswers(1), { startedAt: now + 60 * MINUTE, submittedAt: now + 90 * MINUTE }));
    expect(future.attempt.submittedAt).toBeLessThanOrEqual(now);
    expect(future.attempt.startedAt).toBeLessThanOrEqual(future.attempt.submittedAt);
  });

  it("students only ever see their own attempts; their own saved attempt has solutions (M1)", async () => {
    const one = await signedIn("student", "student.one");
    const two = await signedIn("student", "student.two");
    const saved = await save(one.b, body(WEEKLY.id, weeklyAnswers(5)));
    const id = saved.attempt.id;

    const own = await json<SavedAttemptDetail>(await one.b.send(attempts.GET, `/api/mocktest/attempts?id=${id}`));
    expect(own.data.answers).toHaveLength(WEEKLY_IDS.length);
    expect(own.data.scored.solutionsReleased).toBe(true);
    expect(own.data.scored.review).toHaveLength(WEEKLY_IDS.length);
    expect(own.data.verifyId).toBe(saved.attempt.verifyId);

    expect((await two.b.send(attempts.GET, `/api/mocktest/attempts?id=${id}`)).status).toBe(404);
    const list = await json<{ attempts: SavedAttemptSummary[] }>(await two.b.send(attempts.GET, "/api/mocktest/attempts"));
    expect(list.data.attempts).toEqual([]);
  });
});

describe("leaderboard and profiles (D-034, QA-SEC-M6)", () => {
  it("ranks server-timed attempts only, by score then SERVER time; nicknames only, schools never on rows", async () => {
    const a = await signedIn("student", "learner.alpha");
    const b = await signedIn("student", "learner.beta");
    const c = await signedIn("student", "learner.gamma");
    const d = await signedIn("student", "learner.delta");
    const e = await signedIn("student", "learner.epsilon");
    await joinBoard(a.b, "Comet", { district: "kangra", school: "Hidden Valley School", showSchool: true });
    await joinBoard(b.b, "Nebula", { district: "una", school: "Hidden Valley School", showSchool: true });
    await joinBoard(c.b, "Quasar", { district: "una" });
    await joinBoard(d.b, "Pulsar", { school: "Hidden Valley School", showSchool: true });
    await joinBoard(e.b, "Meteor", { district: "una" });

    // Same score: Nebula's attempt took less SERVER time than Comet's, whatever their browsers claim.
    await timedAttempt(a.b, weeklyAnswers(10), 15, { startedAt: Date.now() - 1000, submittedAt: Date.now() });
    await timedAttempt(b.b, weeklyAnswers(10), 9, { startedAt: Date.now() - 3 * 60 * MINUTE });
    await timedAttempt(d.b, weeklyAnswers(5), 10);
    // Too fast → practice, not on the board.
    await timedAttempt(c.b, weeklyAnswers(15), 1);
    // No server start → practice, not on the board.
    await save(e.b, body(WEEKLY.id, weeklyAnswers(15)));

    const response = await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=${WEEKLY.id}`);
    expect(response.status).toBe(200);
    const raw = await response.text();
    for (const secret of ["learner.alpha", "learner.beta", a.userId, b.userId, "Quasar", "Meteor", "Hidden Valley", "school"]) {
      expect(raw).not.toContain(secret);
    }
    const data = (JSON.parse(raw) as { data: LeaderboardData }).data;
    expect(data.windowId).toBe(FIRST_WINDOW.id);
    expect(data.entries).toEqual([
      { rank: 1, nickname: "Nebula", district: "una", score: 40, timeTakenSec: 9 * 60 },
      { rank: 2, nickname: "Comet", district: "kangra", score: 40, timeTakenSec: 15 * 60 },
      { rank: 3, nickname: "Pulsar", district: null, score: 20, timeTakenSec: 10 * 60 },
    ]);
    expect(data.me).toBeNull();

    // Schools only as totals, and only with at least 3 students.
    const schools = await board("&view=schools");
    expect(schools.data.groups).toEqual([{ rank: 1, name: "Hidden Valley School", participants: 3, bestScore: 40, averageScore: 33.3 }]);
    expect(schools.data.entries).toEqual([]);
    await joinBoard(d.b, "Pulsar", { school: null, showSchool: false });
    expect((await board("&view=schools")).data.groups).toEqual([]);

    expect((await board("&district=una")).data.entries.map((x) => x.nickname)).toEqual(["Nebula"]);
    expect((await board("&view=districts")).data.groups.map((g) => [g.name, g.participants])).toEqual([
      ["kangra", 1],
      ["una", 1],
    ]);
    expect((await board("", a.b)).data.me).toEqual({ rank: 2, total: 3 });

    // Opting out removes a student; a disabled account disappears too.
    await joinBoard(b.b, "Nebula", { leaderboardOptIn: false });
    setUserDisabled(getDb(), a.userId, true, Date.now());
    expect((await board()).data.entries.map((x) => x.nickname)).toEqual(["Pulsar"]);

    expect((await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=${WEEKLY.id}&district=delhi`)).status).toBe(400);
    expect((await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=${WEEKLY.id}&window=week-1999-01-01`)).status).toBe(400);
  });

  it("only the first attempt saved since the window opened counts — a practice save first means no entry", async () => {
    const one = await signedIn("student", "learner.first");
    const two = await signedIn("student", "learner.second");
    await joinBoard(one.b, "First Light");
    await joinBoard(two.b, "Second Wind");
    await timedAttempt(one.b, weeklyAnswers(4), 10);
    await timedAttempt(one.b, weeklyAnswers(15), 10); // a better second attempt: ignored
    await timedAttempt(two.b, weeklyAnswers(15), 3); // too fast: practice, and it shows the solutions …
    await timedAttempt(two.b, weeklyAnswers(15), 10); // … so a later timed attempt does not count either
    expect((await board()).data.entries.map((x) => [x.nickname, x.score])).toEqual([["First Light", 16]]);
    // Other windows are separate boards.
    const other = WEEKLY.windows![3];
    expect((await board(`&window=${other.id}`)).data.entries).toEqual([]);
  });

  it("practice tests have no leaderboard (404)", async () => {
    const response = await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=${NEET.id}`);
    expect(response.status).toBe(404);
  });

  it("profile: students only, validated nickname; login id and real name refused (L6)", async () => {
    expect((await browser().send(profile.GET, "/api/mocktest/profile")).status).toBe(401);
    const parent = await signedIn("parent", "parent.profile");
    expect((await parent.b.send(profile.GET, "/api/mocktest/profile")).status).toBe(403);

    const s = await signedIn("student", "riya.k", "Riya Kumari Sharma");
    expect((await json<MocktestProfile | null>(await s.b.send(profile.GET, "/api/mocktest/profile"))).data).toBeNull();
    const put = (body: Record<string, unknown>) => s.b.send(profile.PUT, "/api/mocktest/profile", { method: "PUT", body });
    const base = { district: null, school: null, showSchool: false, leaderboardOptIn: true };
    expect((await json(await put({ ...base, nickname: "Riya.K" }))).fieldErrors).toEqual({ nickname: ["login_id"] });
    for (const nickname of ["Riya Sharma", "sharma riya", "RiyaSharma 07", "Kumari Riya", "RIYA_SHARMA"]) {
      const response = await put({ ...base, nickname });
      expect(response.status, nickname).toBe(422);
      expect((await json(response)).fieldErrors, nickname).toEqual({ nickname: ["real_name"] });
    }
    expect((await json(await put({ ...base, nickname: "Riya 9876543210" }))).fieldErrors?.nickname).toEqual(["digits"]);
    expect((await put({ ...base, nickname: "Riya", district: "goa" })).status).toBe(422);
    const ok = await json<MocktestProfile>(await put({ ...base, nickname: "Riya S.", district: "mandi" }));
    expect(ok.data).toEqual({ nickname: "Riya S.", district: "mandi", school: null, showSchool: false, leaderboardOptIn: true });
    expect((await put({ ...base, nickname: "Mountain Fox" })).status).toBe(200);
    const cross = await s.b.send(profile.PUT, "/api/mocktest/profile", { method: "PUT", body: { ...base, nickname: "Fox" }, origin: "https://evil.example" });
    expect(cross.status).toBe(403);
  });

  it("profile: a login id with '@' is refused too, without its punctuation (QA-SEC-M6)", async () => {
    const s = await signedIn("student", "tara@hp1", "Tara Negi");
    const put = (nickname: string) =>
      s.b.send(profile.PUT, "/api/mocktest/profile", {
        method: "PUT",
        body: { nickname, district: null, school: null, showSchool: false, leaderboardOptIn: true },
      });
    expect((await json(await put("tara hp1"))).fieldErrors).toEqual({ nickname: ["login_id"] });
    expect((await json(await put("Tara.HP1 x"))).fieldErrors).toEqual({ nickname: ["login_id"] });
    expect((await put("Tara H.")).status).toBe(200);
  });

  it("a nickname saved before the real-name rule is kept off the public board", async () => {
    const s = await signedIn("student", "old.profile", "Asha Thakur");
    await joinBoard(s.b, "Comet");
    getDb().prepare("UPDATE mocktest_profiles SET nickname = 'Asha Thakur' WHERE user_id = ?").run(s.userId);
    await timedAttempt(s.b, weeklyAnswers(3), 10);
    expect((await board()).data.entries).toEqual([]);
  });
});

describe("DELETE /api/admin/mocktest/profile/:userId (L6)", () => {
  const remove = (b: Browser, userId: string, options = {}) =>
    b.send(adminProfile.DELETE, `/api/admin/mocktest/profile/${userId}`, { method: "DELETE", ...options }, params({ userId }));

  it("an admin removes a student from every board; audited without the nickname", async () => {
    const admin = await signedIn("admin", "admin.moderator");
    const s = await signedIn("student", "learner.flagged");
    await joinBoard(s.b, "Some Nick");
    await timedAttempt(s.b, weeklyAnswers(6), 10);
    expect((await board()).data.entries).toHaveLength(1);

    const response = await remove(admin.b, s.userId);
    expect(response.status).toBe(200);
    expect((await json<{ removed: boolean }>(response)).data).toEqual({ removed: true });
    expect((await board()).data.entries).toEqual([]);
    expect((await json<MocktestProfile | null>(await s.b.send(profile.GET, "/api/mocktest/profile"))).data).toBeNull();
    expect(listAttemptsForStudent(s.userId)).toHaveLength(1);

    const audit = listAudit(getDb(), { limit: 10, target: s.userId });
    expect(audit[0]).toMatchObject({ actorId: admin.userId, action: "admin.mocktest_profile_remove", details: { removed: true, wasOptedIn: true } });
    expect(JSON.stringify(audit)).not.toContain("Some Nick");

    // Idempotent: nothing left to remove.
    expect((await json<{ removed: boolean }>(await remove(admin.b, s.userId))).data).toEqual({ removed: false });
  });

  it("is admin only (401 / 403), same-origin, and 404 for accounts that are not students", async () => {
    const s = await signedIn("student", "learner.self");
    const parent = await signedIn("parent", "parent.moderator");
    const admin = await signedIn("admin", "admin.second");
    await joinBoard(s.b, "Stays Put");
    expect((await remove(browser(), s.userId)).status).toBe(401);
    expect((await remove(s.b, s.userId)).status).toBe(403);
    expect((await remove(parent.b, s.userId)).status).toBe(403);
    expect((await remove(admin.b, s.userId, { origin: "https://evil.example" })).status).toBe(403);
    expect((await remove(admin.b, parent.userId)).status).toBe(404);
    expect((await remove(admin.b, "no-such-user")).status).toBe(404);
    expect((await remove(admin.b, "bad id!")).status).toBe(400);
    expect((await json<MocktestProfile | null>(await s.b.send(profile.GET, "/api/mocktest/profile"))).data?.nickname).toBe("Stays Put");
  });
});

describe("GET /api/mocktest/verify/:id (L7)", () => {
  const check = (id: string) => browser().send(verify.GET, `/api/mocktest/verify/${id}`, {}, params({ id }));

  it("confirms test, date and score band — no name; the nickname only after opting in", async () => {
    const s = await signedIn("student", "learner.cert", "Kavya Rana");
    const { attempt } = await timedAttempt(s.b, weeklyAnswers(11), 10);
    const response = await check(attempt.verifyId!);
    expect(response.status).toBe(200);
    const raw = await response.text();
    for (const secret of ["Kavya", "Rana", "learner.cert", s.userId, attempt.id, '"score"']) expect(raw).not.toContain(secret);
    const data = (JSON.parse(raw) as { data: CertificateVerification }).data;
    expect(data).toEqual({
      testId: WEEKLY.id,
      testTitle: WEEKLY.title,
      savedAt: Date.now(),
      scoreBand: "70-79",
      sample: true,
      nickname: null,
    });
    await joinBoard(s.b, "Snow Leopard");
    expect((await json<CertificateVerification>(await check(formatVerifyId(attempt.verifyId!)))).data.nickname).toBe("Snow Leopard");
    await joinBoard(s.b, "Snow Leopard", { leaderboardOptIn: false });
    expect((await json<CertificateVerification>(await check(attempt.verifyId!))).data.nickname).toBeNull();
  });

  it("unknown ids are 404, malformed ones 400; hidden tests are not confirmed", async () => {
    expect((await check("0123456789abcdef")).status).toBe(404);
    expect((await check("not-an-id")).status).toBe(400);
    const s = await signedIn("student", "learner.hidden");
    const { attempt } = await save(s.b, body(NEET.id, neetAnswers(3)));
    expect((await check(attempt.verifyId!)).status).toBe(200);
    vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
    expect((await check(attempt.verifyId!)).status).toBe(404);
  });
});
