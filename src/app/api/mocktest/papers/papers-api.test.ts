import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CertificateVerification,
  LeaderboardData,
  PaperReadinessView,
  PaperStart,
  SavedAttemptSummary,
  SavedPaperAttemptDetail,
  ScoredAttempt,
} from "@/lib/mocktest/types";
import type { QbPaperView, QbSubject } from "@/lib/qb/types";

// Generated (exam-pattern) papers through /api/mocktest/** (docs/question-bank-plan.md §B9–B10, QB-MOCKTEST-API).
// The question bank sits behind `QbPaperPort`; these tests use the in-memory FakeQbPort (synthetic
// questions only) with the real mock-test store on a fresh in-memory database per test.
vi.setConfig({ testTimeout: 60_000 });
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
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { MOCK_QUESTIONS, MOCK_TESTS } = await import("@/content/mocktest");
const { mocktestLimiters, resetMocktestLimitersForTests } = await import("@/lib/mocktest/service");
const { rescoreAttemptsAfterCorrection, setQbPaperPortForTests } = await import("@/lib/mocktest/generated");
const { listAttemptsForStudent, summariseAttempts } = await import("@/lib/mocktest/store");
const { monthWindowAt } = await import("@/lib/mocktest/timing");
const { FakeQbPort, FAKE_CORRECT_ANSWERS, FAKE_MAX_SCORE } = await import("@/lib/mocktest/testing/fake-qb-port");
const login = await import("@/app/api/auth/login/route");
const papers = await import("./route");
const readiness = await import("./readiness/route");
const paper = await import("./[id]/route");
const report = await import("./[id]/report/route");
const score = await import("../score/route");
const attempts = await import("../attempts/route");
const leaderboard = await import("../leaderboard/route");
const profile = await import("../profile/route");
const verify = await import("../verify/[id]/route");
const leadGate = await import("@/app/api/lead-gate/route");
const { LEAD_GATE_CONSENT_VERSION } = await import("@/lib/lead-gate/contract");

const PASSWORD = "paper-test-pass-2026";
const MIN = 60_000;
/** Tuesday 10 November 2026, 10:00 IST. */
const NOW = Date.parse("2026-11-10T10:00:00+05:30");
const WRONG_TOKEN = "x".repeat(43);

type Browser = InstanceType<typeof TestBrowser>;
type FakePort = InstanceType<typeof FakeQbPort>;
let fake: FakePort;

let ipCounter = 0;
function browser(ip?: string): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, ip ?? `198.51.100.${(ipCounter % 200) + 20}`);
}

async function signedIn(role: "student" | "parent" | "admin", loginId: string): Promise<{ b: Browser; userId: string }> {
  const user = await createTestUser({ role, loginId, password: PASSWORD });
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return { b, userId: user.id };
}

async function loginAs(loginId: string): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return b;
}

async function json<T>(response: Response) {
  return (await response.json()) as { ok: boolean; data: T; error?: string; reason?: string; fieldErrors?: Record<string, string[]>; readiness?: unknown };
}

async function create(b: Browser, body: Record<string, unknown> = {}) {
  const response = await b.send(papers.POST, "/api/mocktest/papers", { body: { slot: "jee-main", ...body } });
  return { status: response.status, ...(await json<PaperStart>(response)) };
}

async function practicePaper(b: Browser = browser(), body: Record<string, unknown> = {}): Promise<{ b: Browser; token: string; paper: QbPaperView }> {
  const created = await create(b, body);
  expect(created.status).toBe(201);
  return { b, token: created.data.token as string, paper: created.data.papers[0] };
}

function scoreBody(p: QbPaperView, answers: unknown[], extra: Record<string, unknown> = {}) {
  return { testId: p.testId, paperId: p.id, answers, timeSpentSec: answers.map(() => 30), ...extra };
}

async function scorePaper(b: Browser, p: QbPaperView, token: string | null, answers: unknown[], extra: Record<string, unknown> = {}) {
  const response = await b.send(score.POST, "/api/mocktest/score", { body: scoreBody(p, answers, token ? { paperToken: token, ...extra } : extra) });
  return { status: response.status, ...(await json<ScoredAttempt<QbSubject>>(response)) };
}

function attemptBody(p: QbPaperView, answers: unknown[], extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    ...scoreBody(p, answers),
    attemptId: `attempt-${Math.random().toString(36).slice(2, 12)}`,
    startedAt: now - 20 * MIN,
    submittedAt: now - 1000,
    ...extra,
  };
}

async function save(b: Browser, body: Record<string, unknown>) {
  const response = await b.send(attempts.POST, "/api/mocktest/attempts", { body });
  return { status: response.status, ...(await json<{ attempt: SavedAttemptSummary; scored: ScoredAttempt<QbSubject> }>(response)) };
}

async function joinBoard(b: Browser, nickname: string) {
  const response = await b.send(profile.PUT, "/api/mocktest/profile", {
    method: "PUT",
    body: { nickname, district: null, school: null, showSchool: false, leaderboardOptIn: true },
  });
  expect(response.status, nickname).toBe(200);
}

async function rankedBoard(query = "") {
  const response = await browser().send(leaderboard.GET, `/api/mocktest/leaderboard?test=bp-jee-main-ranked${query}`);
  return { status: response.status, ...(await json<LeaderboardData>(response)) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "true");
  resetDatabaseForTests();
  resetMocktestLimitersForTests();
  fake = new FakeQbPort();
  setQbPaperPortForTests(fake);
  for (const level of ["info", "warn", "error", "log"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  setQbPaperPortForTests(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("practice papers: generate → resume → score", () => {
  it("a new paper every attempt; resume needs the token; the runner payload has no answers or staff fields", async () => {
    const { b, token, paper: p } = await practicePaper();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p).toMatchObject({ kind: "practice", testId: "bp-jee-main", slot: "jee-main", short: false, sample: false });
    const second = await practicePaper(b);
    expect(second.paper.id).not.toBe(p.id);
    expect(second.paper.questions.map((q) => q.id)).not.toEqual(p.questions.map((q) => q.id));

    const resumed = await b.send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers: { "x-paper-token": token } }, params({ id: p.id }));
    expect(resumed.status).toBe(200);
    expect(resumed.headers.get("cache-control")).toBe("no-store");
    const raw = await resumed.text();
    const view = (JSON.parse(raw) as { data: QbPaperView }).data;
    expect(view.id).toBe(p.id);
    expect(view.questions.map((q) => q.id)).toEqual(p.questions.map((q) => q.id));
    // Payload whitelist (plan §B10.1): no key, solution, source, difficulty or staff fields.
    expect(raw).not.toMatch(/"answer"|"solution"|"sourceLabel"|"source"|"difficulty"|"claimedSource"|"aspireRef"|"importId"|"createdBy"|"approvedBy"/);

    for (const headers of [{}, { "x-paper-token": WRONG_TOKEN }, { "x-paper-token": second.token }] as Record<string, string>[]) {
      const response = await browser().send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers }, params({ id: p.id }));
      expect(response.status, JSON.stringify(headers)).toBe(404);
    }
    expect((await browser().send(paper.GET, "/api/mocktest/papers/short", {}, params({ id: "short" }))).status).toBe(400);
  });

  it("scores from the key with source labels after submission; wrong token and expired paper → 404", async () => {
    const { b, token, paper: p } = await practicePaper();
    vi.setSystemTime(NOW + 20 * MIN);
    const result = await scorePaper(b, p, token, [...FAKE_CORRECT_ANSWERS], { score: 999 });
    expect(result.status).toBe(200);
    expect(result.data.result).toMatchObject({ score: FAKE_MAX_SCORE, maxScore: FAKE_MAX_SCORE, correct: 6 });
    expect(result.data.solutionsReleased).toBe(true);
    expect(result.data.review).toHaveLength(6);
    expect(result.data.paper?.questions.map((q) => q.sourceKind)).toEqual(["official", "aspire", "official", "aspire", "official", "aspire"]);
    expect(result.data.paper?.questions[0].sourceLabel.en).toMatch(/^JEE Main 2025/);
    expect(result.data.result.subjects.map((s) => s.subject)).toEqual(["physics", "chemistry", "maths"]);

    expect((await scorePaper(browser(), p, WRONG_TOKEN, [...FAKE_CORRECT_ANSWERS])).status).toBe(404);
    // A guest's token never opens another paper.
    const other = await practicePaper();
    expect((await scorePaper(browser(), p, other.token, [...FAKE_CORRECT_ANSWERS])).status).toBe(404);

    vi.setSystemTime(NOW + 15 * 24 * 60 * MIN);
    expect((await scorePaper(b, p, token, [...FAKE_CORRECT_ANSWERS])).status).toBe(404);
    expect((await b.send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers: { "x-paper-token": token } }, params({ id: p.id }))).status).toBe(404);
  });

  it("partial marking, the integer rule and ranges through the API", async () => {
    const { b, token, paper: p } = await practicePaper();
    vi.setSystemTime(NOW + 20 * MIN);
    // Physics: right, wrong, blank; chemistry: 2 of 3 correct options (+2); maths: integer wrong (−1), decimal in range (+4).
    const result = await scorePaper(b, p, token, [1, 0, null, [2, 0], "-3", "2.35"]);
    expect(result.status).toBe(200);
    expect(result.data.result.questions.map((q) => q.marks)).toEqual([4, -1, 0, 2, -1, 4]);
    expect(result.data.result.questions[3].partial).toBe(true);
    // A decimal in the integer-keypad section is not a valid answer.
    const fresh = await practicePaper(b);
    expect((await scorePaper(b, fresh.paper, fresh.token, [1, 2, 3, [0], "12.5", null])).status).toBe(422);
  });

  it("answer lock: the same answers re-score, different ones → 409; statistics once, only when plausibly timed", async () => {
    const { b, token, paper: p } = await practicePaper();
    vi.setSystemTime(NOW + 20 * MIN);
    const answers = [1, 2, null, null, "12", null];
    expect((await scorePaper(b, p, token, answers)).status).toBe(200);
    expect(fake.recordCalls).toEqual([p.id]);
    expect(fake.recordInputs[0]).toMatchObject({ score: 12, maxScore: FAKE_MAX_SCORE, now: NOW + 20 * MIN });
    expect(fake.recordInputs[0].questions.map((q) => [q.type, q.outcome])).toEqual([
      ["single", "correct"],
      ["single", "correct"],
      ["single", "unattempted"],
      ["multiple", "unattempted"],
      ["numerical", "correct"],
      ["numerical", "unattempted"],
    ]);
    const again = await scorePaper(b, p, token, answers);
    expect(again.status).toBe(200);
    expect(again.data.result.score).toBe(12);
    expect(fake.recordCalls).toEqual([p.id]);
    const changed = await scorePaper(b, p, token, [1, 2, 3, null, "12", null]);
    expect(changed.status).toBe(409);
    expect(changed).toMatchObject({ ok: false, error: "bad_request", reason: "paper_already_scored" });

    // Too fast (1 minute after the paper was made): scored, but no statistics.
    const quick = await practicePaper(b);
    vi.setSystemTime(Date.now() + 1 * MIN);
    expect((await scorePaper(b, quick.paper, quick.token, answers)).status).toBe(200);
    expect(fake.recordCalls).toEqual([p.id]);
  });

  it("key and solutions only after a quarter of the paper's time; per-question outcomes straight away", async () => {
    const { b, token, paper: p } = await practicePaper();
    vi.setSystemTime(NOW + 10 * MIN);
    const early = await scorePaper(b, p, token, [1, null, null, null, null, null]);
    expect(early.status).toBe(200);
    expect(early.data).toMatchObject({ review: [], solutionsReleased: false, solutionsReleaseAt: NOW + 15 * MIN });
    expect(early.data.result.questions.map((q) => q.outcome)).toEqual(["correct", "unattempted", "unattempted", "unattempted", "unattempted", "unattempted"]);
    expect(early.data.paper?.questions).toHaveLength(6);
    vi.setSystemTime(NOW + 15 * MIN);
    const later = await scorePaper(b, p, token, [1, null, null, null, null, null]);
    expect(later.data.solutionsReleased).toBe(true);
    expect(later.data.review[0]).toMatchObject({ correct: 1, answer: { kind: "single", index: 1 }, solution: { en: "Synthetic solution 1." } });
  });

  it("validation: a bp- test needs its paper; a paper id with a fixed test or another paper's test id is refused", async () => {
    const { b, token, paper: p } = await practicePaper();
    const noPaper = await b.send(score.POST, "/api/mocktest/score", { body: { testId: "bp-jee-main", answers: [] } });
    expect(noPaper.status).toBe(422);
    expect((await json(noPaper)).fieldErrors).toEqual({ paperId: ["required"] });
    const fixed = await b.send(score.POST, "/api/mocktest/score", { body: { testId: "neet-sample", answers: [], paperId: p.id, paperToken: token } });
    expect((await json(fixed)).fieldErrors).toEqual({ testId: ["invalid"] });
    expect((await scorePaper(b, { ...p, testId: "bp-neet-ug" }, token, [...FAKE_CORRECT_ANSWERS])).status).toBe(404);
    expect((await scorePaper(b, p, token, [1, 2])).status).toBe(422);
  });
});

describe("POST /api/mocktest/papers rules", () => {
  it("thin bank → 409 bank_thin with readiness; readiness answers first (no gate); unknown slot 404", async () => {
    fake = new FakeQbPort({ thin: ["neet-ug"] });
    setQbPaperPortForTests(fake);
    vi.stubEnv("LEAD_GATE", "required");
    vi.stubEnv("LEAD_GATE_SECRET", "paper-gate-secret-0123456789abcdefghijk");
    const ready = await browser().send(readiness.GET, "/api/mocktest/papers/readiness?slot=neet-ug&language=hi");
    expect(ready.status).toBe(200);
    expect((await json<PaperReadinessView>(ready)).data).toMatchObject({ slot: "neet-ug", available: true, readiness: { level: "thin" }, ranked: { signedIn: false } });
    const thin = await create(browser(), { slot: "neet-ug" });
    expect(thin.status).toBe(409);
    expect(thin.reason).toBe("bank_thin");
    expect(thin.readiness).toMatchObject({ level: "thin" });
    const unknown = await create(browser(), { slot: "nope" });
    expect(unknown.status).toBe(422);
    expect(unknown.fieldErrors).toHaveProperty("slot");
    expect((await browser().send(readiness.GET, "/api/mocktest/papers/readiness?slot=nope")).status).toBe(404);
    expect((await browser().send(readiness.GET, "/api/mocktest/papers/readiness?slot=jee-main&language=fr")).status).toBe(400);
  });

  it("QB_GENERATION_ENABLED=0: readiness says disabled, papers 503", async () => {
    vi.stubEnv("QB_GENERATION_ENABLED", "0");
    const ready = await json<PaperReadinessView>(await browser().send(readiness.GET, "/api/mocktest/papers/readiness?slot=jee-main"));
    expect(ready.data).toMatchObject({ available: false, reason: "disabled", exam: "JEE_MAIN", readiness: null });
    expect((await create(browser())).status).toBe(503);
    expect(fake.createCalls).toEqual([]);
  });

  it("a guest's recent papers are passed for exclusion; a student's history is read on the server; a bad list is ignored", async () => {
    const recent = [{ id: "A".repeat(22), token: "b".repeat(43) }];
    await create(browser(), { recent });
    expect(fake.createCalls[0]).toMatchObject({ userId: null, recent, placeholderMode: true, language: "en" });
    const s = await signedIn("student", "paper.history");
    await create(s.b, { recent, language: "hi" });
    expect(fake.createCalls[1]).toMatchObject({ userId: s.userId, recent: [], language: "hi" });
    expect((await create(browser(), { recent: [{ id: "short", token: "x" }] })).status).toBe(201);
    expect(fake.createCalls[2]).toMatchObject({ recent: [] });
  });

  it("short and sample papers carry their banner data and never a projection", async () => {
    fake = new FakeQbPort({ short: true });
    setQbPaperPortForTests(fake);
    const short = await practicePaper();
    expect(short.paper).toMatchObject({ short: true, composition: { ratio: 0.5, full: 12, relaxed: ["shortened"] } });
    expect(short.paper.sections[0]).toMatchObject({ count: 3, fullCount: 6 });
    vi.setSystemTime(NOW + 20 * MIN);
    const scored = await scorePaper(short.b, short.paper, short.token, [...FAKE_CORRECT_ANSWERS]);
    expect(scored.data.projection).toBeNull();
    expect(scored.data.paper).toMatchObject({ short: true, fullQuestionCount: 12 });

    fake = new FakeQbPort({ sample: true });
    setQbPaperPortForTests(fake);
    const sample = await practicePaper();
    vi.setSystemTime(Date.now() + 20 * MIN);
    const sampled = await scorePaper(sample.b, sample.paper, sample.token, [...FAKE_CORRECT_ANSWERS]);
    expect(sampled.data).toMatchObject({ sample: true, projection: null });
    expect(sampled.data.paper?.questions.every((q) => q.sourceKind === "sample")).toBe(true);

    // A full, non-sample JEE Main paper gets the indicative projection with its past-year share.
    fake = new FakeQbPort({ officialShare: 0.6 });
    setQbPaperPortForTests(fake);
    const full = await practicePaper();
    vi.setSystemTime(Date.now() + 20 * MIN);
    const projected = await scorePaper(full.b, full.paper, full.token, [...FAKE_CORRECT_ANSWERS]);
    expect(projected.data.projection).toMatchObject({ exam: "JEE_MAIN", officialShare: 0.6 });
  });

  it("a saved shorter practice set verifies as shorter; the best score pairs its score and maximum from one paper", async () => {
    fake = new FakeQbPort({ short: true });
    setQbPaperPortForTests(fake);
    const s = await signedIn("student", "paper.shortset");
    const first = await practicePaper(s.b);
    vi.setSystemTime(NOW + 20 * MIN);
    const saved = await save(s.b, attemptBody(first.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: first.token }));
    expect(saved.status).toBe(201);
    const verifyId = saved.data.attempt.verifyId as string;
    const verified = await json<CertificateVerification>(await browser().send(verify.GET, `/api/mocktest/verify/${verifyId}`, {}, params({ id: verifyId })));
    expect(verified.data).toMatchObject({ testId: "bp-jee-main", short: true, questionCount: 6, fullQuestionCount: 12 });

    // Two practice papers of the same exam-pattern test with different lengths (as stored rows):
    // 10 / 12 (83 %) is the best, never "14 / 24 from one paper, the maximum of another".
    const second = await practicePaper(s.b);
    vi.setSystemTime(Date.now() + 20 * MIN);
    const other = await save(s.b, attemptBody(second.paper, [1, 2, 3, [1], "11", "2.33"], { paperToken: second.token }));
    expect(other.data.attempt.score).toBe(14);
    getDb().prepare("UPDATE mocktest_attempts SET score = 10, max_score = 12 WHERE id = ?").run(saved.data.attempt.id);
    expect(summariseAttempts(s.userId).bestByTest).toEqual([{ testId: "bp-jee-main", bestScore: 10, maxScore: 12, attempts: 2 }]);
  });

  it("rate limits: 150 papers per IP per 10 minutes, 10 per signed-in student per hour", async () => {
    const lab = browser("198.51.100.250");
    for (let i = 0; i < 150; i += 1) expect((await create(lab)).status).toBe(201);
    const blocked = await lab.send(papers.POST, "/api/mocktest/papers", { body: { slot: "jee-main" } });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);

    const s = await signedIn("student", "paper.limit");
    for (let i = 0; i < 10; i += 1) expect((await create(s.b)).status).toBe(201);
    expect((await create(s.b)).status).toBe(429);
  });

  it("rate limits: 600 papers per IP per day, whatever the 10-minute windows", async () => {
    const lab = browser("198.51.100.253");
    for (let batch = 0; batch < 4; batch += 1) {
      mocktestLimiters.papers.reset(); // as if 10 minutes had passed
      for (let i = 0; i < 150; i += 1) expect((await create(lab)).status).toBe(201);
    }
    mocktestLimiters.papers.reset();
    expect((await create(lab)).status).toBe(429);
  });

  it("rate limits: readiness 300 per IP per 10 minutes; reports 20 per IP per hour", async () => {
    const b = browser("198.51.100.251");
    for (let i = 0; i < 300; i += 1) expect((await b.send(readiness.GET, "/api/mocktest/papers/readiness?slot=jee-main")).status).toBe(200);
    expect((await b.send(readiness.GET, "/api/mocktest/papers/readiness?slot=jee-main")).status).toBe(429);

    const { token, paper: p } = await practicePaper(browser());
    const reporter = browser("198.51.100.252");
    const body = { token, questionId: p.questions[0].id, kind: "other" };
    for (let i = 0; i < 20; i += 1) expect((await reporter.send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body }, params({ id: p.id }))).status).toBe(201);
    expect((await reporter.send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body }, params({ id: p.id }))).status).toBe(429);
  });
});

describe("report a problem", () => {
  it("stores the question, version, paper, kind and note — no account, no IP; the question must be in the paper", async () => {
    const s = await signedIn("student", "paper.reporter");
    const { paper: p } = await practicePaper(s.b);
    // The owner needs no token.
    const response = await s.b.send(
      report.POST,
      `/api/mocktest/papers/${p.id}/report`,
      { body: { questionId: p.questions[2].id, kind: "wrong_answer", note: " Option C looks right " } },
      params({ id: p.id }),
    );
    expect(response.status).toBe(201);
    expect(fake.reports).toEqual([
      { questionId: p.questions[2].id, version: 1, paperId: p.id, kind: "wrong_answer", note: "Option C looks right", createdAt: NOW },
    ]);
    expect(JSON.stringify(fake.reports)).not.toContain(s.userId);
    expect(JSON.stringify(fake.reports)).not.toMatch(/198\.51\.100|userId|"ip"/);

    const unknown = await s.b.send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body: { questionId: "q_elsewhere", kind: "other" } }, params({ id: p.id }));
    expect(unknown.status).toBe(422);
    const guest = await browser().send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body: { questionId: p.questions[0].id, kind: "other", token: WRONG_TOKEN } }, params({ id: p.id }));
    expect(guest.status).toBe(404);
    const cross = await s.b.send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body: { questionId: p.questions[0].id, kind: "other" }, origin: "https://evil.example" }, params({ id: p.id }));
    expect(cross.status).toBe(403);
    expect(fake.reports).toHaveLength(1);
  });
});

describe("monthly ranked papers", () => {
  it("signed-in students only; one paper per student per month (a repeat resumes it); no compensatory time", async () => {
    expect((await create(browser(), { mode: "ranked" })).status).toBe(401);
    const parent = await signedIn("parent", "paper.parent");
    expect((await create(parent.b, { mode: "ranked" })).status).toBe(403);
    const s = await signedIn("student", "paper.ranked");
    expect((await create(s.b, { mode: "ranked", compensatory: true })).fieldErrors).toEqual({ compensatory: ["practice_only"] });
    const first = await create(s.b, { mode: "ranked" });
    expect(first.status).toBe(201);
    expect(first.data).toMatchObject({ token: null, resumed: false });
    expect(first.data.papers[0]).toMatchObject({ kind: "ranked", testId: "bp-jee-main-ranked", windowId: monthWindowAt(NOW).id });
    const again = await create(s.b, { mode: "ranked" });
    expect(again.status).toBe(200);
    expect(again.data).toMatchObject({ resumed: true, token: null });
    expect(again.data.papers[0].id).toBe(first.data.papers[0].id);
    // Opens with the owner's session only.
    const id = first.data.papers[0].id;
    expect((await s.b.send(paper.GET, `/api/mocktest/papers/${id}`, {}, params({ id }))).status).toBe(200);
    expect((await browser().send(paper.GET, `/api/mocktest/papers/${id}`, {}, params({ id }))).status).toBe(404);

    fake = new FakeQbPort({ rankedOff: ["jee-main"], rankedUnavailable: ["neet-ug"] });
    setQbPaperPortForTests(fake);
    expect((await create(s.b, { mode: "ranked" })).reason).toBe("ranked_off");
    expect((await create(s.b, { mode: "ranked", slot: "neet-ug" })).reason).toBe("ranked_unavailable");
  });

  it("/score refuses ranked papers (409 use_attempts): no answer-key oracle while the month runs", async () => {
    const s = await signedIn("student", "paper.oracle");
    const { data } = await create(s.b, { mode: "ranked" });
    const p = data.papers[0];
    vi.setSystemTime(NOW + 30 * MIN);
    const refused = await scorePaper(s.b, p, null, [...FAKE_CORRECT_ANSWERS]);
    expect(refused.status).toBe(409);
    expect(refused.reason).toBe("use_attempts");
    expect(fake.recordCalls).toEqual([]);
    // Someone else cannot even find it.
    expect((await scorePaper(browser(), p, null, [...FAKE_CORRECT_ANSWERS])).status).toBe(404);
  });

  it("saved once, on the month's board under its own test id; key held until the month closes; practice never blocks", async () => {
    const a = await signedIn("student", "paper.alpha");
    await joinBoard(a.b, "Nebula");
    // A practice paper saved FIRST (test id bp-jee-main) …
    const practice = await practicePaper(a.b);
    vi.setSystemTime(NOW + 20 * MIN);
    const practiceSave = await save(a.b, attemptBody(practice.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: practice.token }));
    expect(practiceSave.status).toBe(201);
    expect(practiceSave.data.attempt).toMatchObject({ testId: "bp-jee-main", leaderboard: false, practiceReason: "practice_test", paperId: practice.paper.id });

    // … then the ranked paper of the month.
    const ranked = (await create(a.b, { mode: "ranked" })).data.papers[0];
    vi.setSystemTime(Date.now() + 30 * MIN);
    const answers = [1, 2, 3, [1], "11", "2.33"];
    const saved = await save(a.b, attemptBody(ranked, answers));
    expect(saved.status).toBe(201);
    expect(saved.data.attempt).toMatchObject({ testId: "bp-jee-main-ranked", leaderboard: true, windowId: monthWindowAt(NOW).id, score: 14, paperId: ranked.id });
    const window = monthWindowAt(NOW);
    expect(saved.data.scored).toMatchObject({ review: [], solutionsReleased: false, solutionsReleaseAt: Date.parse(window.endsAt) + (60 + 2) * MIN });
    // While the month's board is live no per-question source label goes out (an official label points at a public key).
    expect(saved.data.scored.paper).toMatchObject({ sourcesWithheldUntil: Date.parse(window.endsAt) + (60 + 2) * MIN });
    expect(saved.data.scored.paper?.questions.every((q) => q.sourceLabel.en === "" && q.sourceWithheld === true)).toBe(true);
    expect(JSON.stringify(saved.data.scored.paper)).not.toMatch(/JEE Main 2025/);
    expect(fake.recordCalls).toEqual([practice.paper.id, ranked.id]);

    // Saved once: another attempt id → 409; the same attempt id (a retry) → 200 with the first row.
    const again = await save(a.b, attemptBody(ranked, answers));
    expect(again.status).toBe(409);
    expect(again.reason).toBe("paper_already_saved");
    const retryBody = attemptBody(ranked, answers, { attemptId: "attempt-retry-1" });
    const b2 = await signedIn("student", "paper.beta");
    const other = (await create(b2.b, { mode: "ranked" })).data.papers[0];
    expect(other.questions.map((q) => q.id)).toEqual(ranked.questions.map((q) => q.id));
    vi.setSystemTime(Date.now() + 5 * MIN);
    expect((await save(b2.b, { ...retryBody, paperId: other.id })).status).toBe(201);
    expect((await save(b2.b, { ...retryBody, paperId: other.id })).status).toBe(200);

    const board = await rankedBoard();
    expect(board.status).toBe(200);
    expect(board.data).toMatchObject({ testId: "bp-jee-main-ranked", ranked: true, windowId: window.id, maxScore: FAKE_MAX_SCORE, total: 1 });
    expect(board.data.entries.map((e) => [e.nickname, e.score])).toEqual([["Nebula", 14]]);
    // The practice id has no board.
    expect((await browser().send(leaderboard.GET, "/api/mocktest/leaderboard?test=bp-jee-main")).status).toBe(404);

    // Before the month closes the owner's saved attempt keeps the key back …
    const during = await json<SavedPaperAttemptDetail>(await a.b.send(attempts.GET, `/api/mocktest/attempts?id=${saved.data.attempt.id}`));
    expect(during.data).toMatchObject({ paperId: ranked.id, scored: { solutionsReleased: false, review: [] } });
    // … and shows it once the month (and its last attempts) are over (a fresh sign-in: sessions expire).
    vi.setSystemTime(Date.parse(window.endsAt) + 63 * MIN);
    const later = await loginAs("paper.alpha");
    const detail = await json<SavedPaperAttemptDetail>(await later.send(attempts.GET, `/api/mocktest/attempts?id=${saved.data.attempt.id}`));
    expect(detail.data).toMatchObject({ paperId: ranked.id, scored: { solutionsReleased: true } });
    expect(detail.data.scored.review).toHaveLength(6);
    expect(detail.data.scored.paper?.questions[0].sourceLabel.en).toMatch(/^JEE Main 2025/);
    expect(detail.data.scored.paper).not.toHaveProperty("sourcesWithheldUntil");
  });

  it("the official tie-break decides equal scores; equal vectors share a rank whatever the time taken", async () => {
    const players = [
      { login: "paper.p1", nick: "Nebula", answers: [...FAKE_CORRECT_ANSWERS], minutes: 40 },
      { login: "paper.p2", nick: "Comet", answers: [1, 2, 3, [1], "11", "2.33"], minutes: 50 },
      { login: "paper.p3", nick: "Pulsar", answers: [1, 2, 3, [1], "11", "2.33"], minutes: 20 },
      { login: "paper.p4", nick: "Quasar", answers: [1, 2, 0, [0, 2, 3], "11", "2.33"], minutes: 16 },
    ];
    for (const player of players) {
      vi.setSystemTime(NOW);
      const s = await signedIn("student", player.login);
      await joinBoard(s.b, player.nick);
      const p = (await create(s.b, { mode: "ranked" })).data.papers[0];
      vi.setSystemTime(NOW + player.minutes * MIN);
      expect((await save(s.b, attemptBody(p, player.answers))).data.attempt.leaderboard).toBe(true);
    }
    const board = await rankedBoard();
    // Comet and Pulsar: 14 each, physics 12, same wrong ÷ correct → a shared rank 2 although Pulsar
    // took 20 minutes and Comet 50 (time is not a criterion); listed by save time. Quasar: 14 too,
    // but physics 7 → rank 4.
    expect(board.data.entries.map((e) => [e.rank, e.nickname, e.score])).toEqual([
      [1, "Nebula", 24],
      [2, "Pulsar", 14],
      [2, "Comet", 14],
      [4, "Quasar", 14],
    ]);
  });
});

describe("answer-key corrections re-score saved attempts", () => {
  it("a corrected key and a dropped question update stored scores, the board and the verification page", async () => {
    const s = await signedIn("student", "paper.corrected");
    await joinBoard(s.b, "Nebula");
    const p = (await create(s.b, { mode: "ranked" })).data.papers[0];
    vi.setSystemTime(NOW + 30 * MIN);
    // Chemistry [1] is wrong (−1), the integer answer 11 is wrong (−1): 12 − 1 − 1 + 4 = 14.
    const saved = await save(s.b, attemptBody(p, [1, 2, 3, [1], "11", "2.33"]));
    expect(saved.data.attempt.score).toBe(14);
    const untouched = await practicePaper(s.b);

    // The official key turns out to be {B} for the chemistry question.
    fake.corrections.set(p.questions[3].id, { kind: "answer", answer: { kind: "multiple", indices: [1] }, at: NOW + 40 * MIN });
    vi.setSystemTime(NOW + 45 * MIN);
    expect(await rescoreAttemptsAfterCorrection(p.questions[3].id)).toEqual({ attempts: 1 });
    expect(listAttemptsForStudent(s.userId).find((x) => x.id === saved.data.attempt.id)?.score).toBe(19);
    expect((await rankedBoard()).data.entries[0].score).toBe(19);

    // Dropped: full marks to everyone for the integer question.
    fake.corrections.set(p.questions[4].id, { kind: "dropped", at: NOW + 50 * MIN });
    vi.setSystemTime(NOW + 55 * MIN);
    expect(await rescoreAttemptsAfterCorrection(p.questions[4].id)).toEqual({ attempts: 1 });
    expect((await rankedBoard()).data.entries[0].score).toBe(24);
    // Nothing to do the second time; papers without the question are untouched.
    expect(await rescoreAttemptsAfterCorrection(p.questions[4].id)).toEqual({ attempts: 0 });
    expect(await rescoreAttemptsAfterCorrection(untouched.paper.questions[0].id)).toEqual({ attempts: 0 });

    const detail = await json<SavedPaperAttemptDetail>(await s.b.send(attempts.GET, `/api/mocktest/attempts?id=${saved.data.attempt.id}`));
    expect(detail.data.scored.result.score).toBe(24);
    expect(detail.data.rescoredAt).toBe(NOW + 55 * MIN);
    expect(detail.data.scored.paper?.correctedAt).toBe(NOW + 50 * MIN);
    expect(detail.data.scored.result.questions[4]).toMatchObject({ bonus: true, marks: 4 });

    const verifyId = saved.data.attempt.verifyId as string;
    const verified = await json<CertificateVerification>(await browser().send(verify.GET, `/api/mocktest/verify/${verifyId}`, {}, params({ id: verifyId })));
    expect(verified.data).toMatchObject({
      testId: "bp-jee-main-ranked",
      testTitle: { en: "JEE Main exam-pattern mock · monthly ranked paper" },
      scoreBand: "90-100",
      sample: false,
      nickname: "Nebula",
      rescoredAt: NOW + 55 * MIN,
      short: false,
      questionCount: 6,
      fullQuestionCount: 6,
    });
  });

  it("a paper whose review list misses a served question is skipped (logged), never given free marks", async () => {
    const s = await signedIn("student", "paper.gap");
    const p = (await create(s.b, { mode: "ranked" })).data.papers[0];
    vi.setSystemTime(NOW + 30 * MIN);
    const saved = await save(s.b, attemptBody(p, [1, 2, 3, [1], "11", "2.33"]));
    expect(saved.data.attempt.score).toBe(14);
    const reviewItems = fake.reviewItems.bind(fake);
    fake.reviewItems = async (paper) => (await reviewItems(paper)).filter((item) => item.id !== p.questions[1].id);
    fake.corrections.set(p.questions[3].id, { kind: "answer", answer: { kind: "multiple", indices: [1] }, at: NOW + 40 * MIN });
    expect(await rescoreAttemptsAfterCorrection(p.questions[3].id)).toEqual({ attempts: 0 });
    expect(listAttemptsForStudent(s.userId)[0].score).toBe(14);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"reason":"paper_key_missing"'));
    // Viewing the attempt is a server error (fixed log code), not a re-score with free marks.
    const detail = await s.b.send(attempts.GET, `/api/mocktest/attempts?id=${saved.data.attempt.id}`);
    expect(detail.status).toBe(500);
  });
});

describe("lead gate on paper scoring (plan §B10.6)", () => {
  const SINCE = "2026-11-10T04:00:00Z"; // 09:30 IST, half an hour before NOW
  let phoneCounter = 0;

  function gateOn(extra: Record<string, string> = {}) {
    vi.stubEnv("LEAD_GATE", "required");
    vi.stubEnv("LEAD_GATE_SECRET", "paper-gate-secret-0123456789abcdefghijk");
    for (const [name, value] of Object.entries(extra)) vi.stubEnv(name, value);
  }

  async function unlock(b: Browser) {
    phoneCounter += 1;
    const response = await b.send(leadGate.POST, "/api/lead-gate", {
      body: {
        studentName: "Paper Gate Student",
        phone: `98100 3${String(phoneCounter).padStart(4, "0")}`,
        currentClass: "class-12",
        submittedBy: "parent",
        consent: true,
        consentVersion: LEAD_GATE_CONSENT_VERSION,
        tool: "mock-test",
        website: "",
      },
    });
    expect(response.status).toBe(201);
  }

  function toolUses(): Record<string, unknown>[] {
    return getDb()
      .prepare("SELECT meta FROM crm_activities WHERE type = 'tool_use' ORDER BY id")
      .all()
      .map((row) => JSON.parse(String(row.meta)) as Record<string, unknown>);
  }

  it("the gate applies; 'started before LEAD_GATE_SINCE' uses the paper's server createdAt, not the browser's word", async () => {
    gateOn({ LEAD_GATE_SINCE: SINCE });
    // Made after the switch-on: a browser claiming an earlier start is still gated.
    const { b, token, paper: p } = await practicePaper();
    vi.setSystemTime(NOW + 20 * MIN);
    const claimed = await scorePaper(b, p, token, [...FAKE_CORRECT_ANSWERS], { startedAt: Date.parse(SINCE) - 60 * MIN });
    expect(claimed.status).toBe(401);
    expect(fake.recordCalls).toEqual([]);
    // `seen` (this browser already shows the result) still counts.
    expect((await scorePaper(b, p, token, [...FAKE_CORRECT_ANSWERS], { seen: true })).status).toBe(200);

    // Made before the switch-on: never gated.
    vi.setSystemTime(Date.parse(SINCE) - 30 * MIN);
    const early = await practicePaper();
    vi.setSystemTime(NOW + 25 * MIN);
    expect((await scorePaper(early.b, early.paper, early.token, [...FAKE_CORRECT_ANSWERS])).status).toBe(200);
    // Ranked papers answer 409 before any gate.
    const s = await signedIn("student", "paper.gate.ranked");
    const ranked = (await create(s.b, { mode: "ranked" })).data.papers[0];
    expect((await scorePaper(s.b, ranked, null, [...FAKE_CORRECT_ANSWERS])).status).toBe(409);
  });

  it("with a pass, the first scoring notes bp-<slot>, the exam and a 10-point band — never the paper id or score", async () => {
    gateOn();
    const b = browser();
    await unlock(b);
    const { token, paper: p } = await practicePaper(b);
    vi.setSystemTime(NOW + 20 * MIN);
    expect((await scorePaper(b, p, token, [1, 2, 3, null, null, null], { record: true })).status).toBe(200);
    expect((await scorePaper(b, p, token, [1, 2, 3, null, null, null])).status).toBe(200);
    const uses = toolUses();
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ tool: "mock-test", key: "bp-jee-main", testId: "bp-jee-main", exam: "jee-main", scoreBand: "pct-50-59" });
    expect(JSON.stringify(uses)).not.toContain(p.id);
  });

  it("/attempts: a ranked paper's save (its first scoring) gets the same gate; nothing is locked, recorded, saved or ranked until details are shared", async () => {
    gateOn();
    const s = await signedIn("student", "paper.gate.save");
    await joinBoard(s.b, "Nebula");
    const ranked = (await create(s.b, { mode: "ranked" })).data.papers[0];
    vi.setSystemTime(NOW + 30 * MIN);
    const body = attemptBody(ranked, [...FAKE_CORRECT_ANSWERS]);
    const refused = await s.b.send(attempts.POST, "/api/mocktest/attempts", { body });
    expect(refused.status).toBe(401);
    expect(refused.headers.get("x-lead-gate")).toBe("required");
    const refusedBody = (await refused.json()) as Record<string, unknown>;
    expect(refusedBody).toMatchObject({ ok: false, error: "unauthenticated", gate: "lead" });
    expect(refusedBody).not.toHaveProperty("data");
    // A hand-made `seen` does not skip it: the server knows this paper was never scored.
    expect((await save(s.b, { ...body, seen: true })).status).toBe(401);
    expect((await fake.loadPaperTrusted(ranked.id))?.view.scored).toBe(false);
    expect(fake.recordCalls).toEqual([]);
    expect(listAttemptsForStudent(s.userId)).toEqual([]);
    expect((await rankedBoard()).data.total).toBe(0);
    // Unknown or not yours stays a 404, before the gate (as on /score).
    expect((await save(s.b, { ...body, paperId: "A".repeat(22) })).status).toBe(404);

    await unlock(s.b);
    const saved = await save(s.b, body);
    expect(saved.status).toBe(201);
    expect(saved.data.attempt).toMatchObject({ testId: "bp-jee-main-ranked", leaderboard: true, score: FAKE_MAX_SCORE, paperId: ranked.id });
    expect(fake.recordCalls).toEqual([ranked.id]);
    expect((await rankedBoard()).data.total).toBe(1);
    // A save never notes tool use.
    expect(toolUses()).toEqual([]);
  });

  it("/attempts: an already scored paper (answers locked) and a paper made before LEAD_GATE_SINCE are never gated; a browser's earlier start and `seen` are not", async () => {
    gateOn({ LEAD_GATE_SINCE: SINCE });
    const s = await signedIn("student", "paper.gate.practice");
    const fresh = await practicePaper(s.b);
    vi.setSystemTime(NOW + 20 * MIN);
    // Never scored: a hand-made save would be its first scoring → the gate, whatever start the browser claims.
    const claimed = await save(s.b, attemptBody(fresh.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: fresh.token, startedAt: Date.parse(SINCE) - 60 * MIN }));
    expect(claimed.status).toBe(401);
    expect((await fake.loadPaperTrusted(fresh.paper.id))?.view.scored).toBe(false);
    // Scored once through /score (the result page) → the save that follows is never gated …
    expect((await scorePaper(s.b, fresh.paper, fresh.token, [...FAKE_CORRECT_ANSWERS], { seen: true })).status).toBe(200);
    const saved = await save(s.b, attemptBody(fresh.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: fresh.token }));
    expect(saved.status).toBe(201);
    expect(saved.data.attempt).toMatchObject({ testId: "bp-jee-main", score: FAKE_MAX_SCORE, paperId: fresh.paper.id });
    // … and different answers meet the answer lock, not a fresh score.
    expect((await save(s.b, attemptBody(fresh.paper, [0, 0, 0, null, null, null], { paperToken: fresh.token }))).status).toBe(409);

    // `seen` on a save of a paper that was never scored is a claim the server knows to be false: ignored.
    const other = await practicePaper(s.b);
    vi.setSystemTime(Date.now() + 20 * MIN);
    expect((await save(s.b, attemptBody(other.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: other.token, seen: true }))).status).toBe(401);
    expect((await fake.loadPaperTrusted(other.paper.id))?.view.scored).toBe(false);

    // A paper made before the switch-on (server createdAt): never gated.
    vi.setSystemTime(Date.parse(SINCE) - 30 * MIN);
    const early = await practicePaper();
    vi.setSystemTime(NOW + 60 * MIN);
    expect((await save(s.b, attemptBody(early.paper, [...FAKE_CORRECT_ANSWERS], { paperToken: early.token }))).status).toBe(201);
    expect(listAttemptsForStudent(s.userId)).toHaveLength(2);
  });
});

describe("JEE numerical marking fix (+4 / 0 → +4 / −1, bulletin §2.4.2)", () => {
  it("the sample now marks a wrong numerical −1; an attempt saved before the fix keeps its stored score", async () => {
    vi.setSystemTime(Date.parse("2026-10-21T10:00:00+05:30"));
    const s = await signedIn("student", "paper.legacy");
    const test = MOCK_TESTS.find((t) => t.id === "jee-main-sample")!;
    const ids = test.sections.flatMap((section) => section.questionIds);
    const byId = new Map(MOCK_QUESTIONS.map((q) => [q.id, q]));
    const numericalIndex = ids.findIndex((id) => byId.get(id)?.type === "numerical");
    const answers = ids.map((_, i) => (i === numericalIndex ? "987654" : null));
    const body = { testId: test.id, attemptId: "attempt-legacy-1", answers, timeSpentSec: answers.map(() => 10), startedAt: Date.now() - 20 * MIN, submittedAt: Date.now() - 1000 };
    const saved = (await save(s.b, body)).data.attempt;
    expect(saved.score).toBe(-1);
    // Simulate an attempt saved before the fix (stored with the old +4 / 0 marking).
    getDb().prepare("UPDATE mocktest_attempts SET score = 0 WHERE id = ?").run(saved.id);
    const legacy = await json<{ scored: ScoredAttempt }>(await s.b.send(attempts.GET, `/api/mocktest/attempts?id=${saved.id}`));
    expect(legacy.data.scored.result.score).toBe(0);
    getDb().prepare("UPDATE mocktest_attempts SET score = -1 WHERE id = ?").run(saved.id);
    const current = await json<{ scored: ScoredAttempt }>(await s.b.send(attempts.GET, `/api/mocktest/attempts?id=${saved.id}`));
    expect(current.data.scored.result.score).toBe(-1);
  });
});
