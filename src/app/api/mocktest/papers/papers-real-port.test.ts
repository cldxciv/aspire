import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CertificateVerification, LeaderboardData, PaperStart, SavedAttemptSummary, ScoredAttempt } from "@/lib/mocktest/types";
import type { QbPaperView, QbSubject, QbViewer } from "@/lib/qb/types";

// The REAL question-bank port (src/lib/mocktest/qb-port.ts → QB-CORE-B src/lib/qb/papers.ts,
// figures.ts, corrections.ts) behind /api/mocktest/** and /api/qb/figures, on a fresh in-memory
// database per test (the same connection as the mock-test store). The bank is stocked with the
// CORE-B test helpers: SYNTHETIC questions only ("Synthetic item 7"), never text from a real paper.
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
const { resetMocktestLimitersForTests } = await import("@/lib/mocktest/service");
const { setQbPaperPortForTests } = await import("@/lib/mocktest/generated");
const { createQbPaperPort } = await import("@/lib/mocktest/qb-port");
const { listAttemptsForStudent } = await import("@/lib/mocktest/store");
const { qbDb } = await import("@/lib/qb/db");
const { paperReviewItems } = await import("@/lib/qb/papers");
const { createCorrection } = await import("@/lib/qb/corrections");
const { adminViewer, approved, chapter, confirm, numericalContent, publish, smallJeeMain, T0 } = await import("@/lib/qb/qb-testing");
const login = await import("@/app/api/auth/login/route");
const papers = await import("./route");
const paper = await import("./[id]/route");
const report = await import("./[id]/report/route");
const score = await import("../score/route");
const attempts = await import("../attempts/route");
const leaderboard = await import("../leaderboard/route");
const profile = await import("../profile/route");
const verify = await import("../verify/[id]/route");
const figureRoute = await import("@/app/api/qb/figures/[id]/route");

const PASSWORD = "real-port-pass-2026";
const MIN = 60_000;
/** One minute after the CORE-B helpers' T0 (22 Oct 2026, 11:30 IST): month-2026-10. */
const NOW = T0 + MIN;
const WRONG_TOKEN = "x".repeat(43);
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"),
);

type Browser = InstanceType<typeof TestBrowser>;
let admin: QbViewer;
let figureDir: string | null = null;
let ipCounter = 0;

function browser(): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, `203.0.113.${(ipCounter % 200) + 20}`);
}

async function signedIn(loginId: string): Promise<{ b: Browser; userId: string }> {
  const user = await createTestUser({ role: "student", loginId, password: PASSWORD });
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return { b, userId: user.id };
}

async function json<T>(response: Response) {
  return (await response.json()) as { ok: boolean; data: T; error?: string; reason?: string };
}

async function create(b: Browser, body: Record<string, unknown> = {}) {
  const response = await b.send(papers.POST, "/api/mocktest/papers", { body: { slot: "jee-main", ...body } });
  return { status: response.status, raw: await response.clone().text(), ...(await json<PaperStart>(response)) };
}

/** The bank's own key for a paper, in the request format (option index / numerical text). */
function keyAnswers(p: QbPaperView): (number | string)[] {
  return paperReviewItems(p.id, Date.now(), qbDb(getDb())).map((item) => {
    const answer = item.answer;
    if (!answer) throw new Error("no key");
    return answer.kind === "single" ? answer.index : answer.kind === "numerical" ? String(answer.value) : answer.indices;
  }) as (number | string)[];
}

async function scorePaper(b: Browser, p: QbPaperView, token: string | null, answers: unknown[]) {
  const body = { testId: p.testId, paperId: p.id, answers, timeSpentSec: answers.map(() => 30), ...(token ? { paperToken: token } : {}) };
  const response = await b.send(score.POST, "/api/mocktest/score", { body });
  return { status: response.status, ...(await json<ScoredAttempt<QbSubject>>(response)) };
}

async function save(b: Browser, p: QbPaperView, answers: unknown[]) {
  const now = Date.now();
  const body = {
    testId: p.testId,
    paperId: p.id,
    answers,
    timeSpentSec: answers.map(() => 30),
    attemptId: `attempt-${Math.random().toString(36).slice(2, 12)}`,
    startedAt: now - 20 * MIN,
    submittedAt: now - 1000,
  };
  const response = await b.send(attempts.POST, "/api/mocktest/attempts", { body });
  return { status: response.status, ...(await json<{ attempt: SavedAttemptSummary; scored: ScoredAttempt<QbSubject> }>(response)) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  vi.stubEnv("SHOW_PLACEHOLDER_CONTENT", "false");
  resetDatabaseForTests();
  resetMocktestLimitersForTests();
  const db = qbDb(getDb());
  admin = adminViewer(db);
  chapter(db, admin, "phy-a", "physics");
  chapter(db, admin, "phy-b", "physics");
  confirm(db, admin, "JEE_MAIN");
  publish(db, admin, "jee-main", smallJeeMain);
  for (const difficulty of ["easy", "medium", "hard"] as const) {
    for (let i = 0; i < 6; i += 1) approved(db, admin, { chapterId: i % 2 ? "phy-a" : "phy-b", difficulty });
    for (let i = 0; i < 4; i += 1) {
      approved(db, admin, { chapterId: i % 2 ? "phy-a" : "phy-b", difficulty, content: numericalContent({ kind: "numerical", value: 3 + i, integer: true }) });
    }
  }
  // The real mapping, on the test's connection (no seeding: the bank above is the whole bank).
  setQbPaperPortForTests(createQbPaperPort(() => qbDb(getDb())));
  for (const level of ["info", "warn", "error", "log"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  setQbPaperPortForTests(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
  if (figureDir) rmSync(figureDir, { recursive: true, force: true });
  figureDir = null;
});

describe("practice papers on the real bank", () => {
  it("runner payload whitelist, token check, answer lock, statistics once, expiry", async () => {
    const b = browser();
    const created = await create(b);
    expect(created.status).toBe(201);
    const p = created.data.papers[0];
    const token = created.data.token as string;
    expect(p).toMatchObject({ kind: "practice", testId: "bp-jee-main", questionCount: 6, scored: false });
    expect(created.raw).not.toMatch(/"answer"|"solution"|"sourceLabel"|"source"|"difficulty"|"claimedSource"|"aspireRef"|"importId"|"createdBy"|"approvedBy"|"TEST"/);

    // Token check (constant time in the bank): a wrong token and no token are both 404.
    expect((await browser().send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers: { "x-paper-token": WRONG_TOKEN } }, params({ id: p.id }))).status).toBe(404);
    expect((await browser().send(paper.GET, `/api/mocktest/papers/${p.id}`, {}, params({ id: p.id }))).status).toBe(404);
    expect((await b.send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers: { "x-paper-token": token } }, params({ id: p.id }))).status).toBe(200);
    expect((await scorePaper(browser(), p, WRONG_TOKEN, keyAnswers(p))).status).toBe(404);

    // Scored from the bank's key; source labels and difficulty after submission.
    vi.setSystemTime(NOW + 20 * MIN);
    const key = keyAnswers(p);
    const first = await scorePaper(b, p, token, key);
    expect(first.status).toBe(200);
    expect(first.data.result).toMatchObject({ score: 24, maxScore: 24, correct: 6 });
    expect(first.data.paper?.questions[0]).toMatchObject({ sourceKind: "aspire", sourceLabel: { en: expect.stringMatching(/\S/) } });
    // Answer lock: same answers re-score, different ones → 409.
    expect((await scorePaper(b, p, token, key)).status).toBe(200);
    const changed = await scorePaper(b, p, token, [key[0] === 0 ? 1 : 0, ...key.slice(1)]);
    expect(changed).toMatchObject({ status: 409, reason: "paper_already_scored" });
    // Statistics recorded once (compare-and-set in the bank), one row per served question.
    const db = getDb();
    expect(db.prepare("SELECT stats_recorded_at FROM qb_papers WHERE id = ?").get(p.id)).toEqual({ stats_recorded_at: NOW + 20 * MIN });
    expect(db.prepare("SELECT SUM(scored_n) AS n, SUM(correct_n) AS c FROM qb_item_stats").get()).toEqual({ n: 6, c: 6 });

    // A guest paper expires after 14 days (unless a saved attempt uses it).
    vi.setSystemTime(NOW + 15 * 24 * 60 * MIN);
    expect((await scorePaper(b, p, token, key)).status).toBe(404);
  });

  it("report a problem stores the served version, the paper and the kind — never the reporter", async () => {
    const b = browser();
    const created = await create(b);
    const p = created.data.papers[0];
    const token = created.data.token as string;
    const questionId = p.questions[1].id;
    const send = (body: Record<string, unknown>, who: Browser = b) => who.send(report.POST, `/api/mocktest/papers/${p.id}/report`, { body }, params({ id: p.id }));
    expect((await send({ token, questionId, kind: "wrong_answer", note: " Synthetic note " })).status).toBe(201);
    expect((await send({ token: WRONG_TOKEN, questionId, kind: "other" }, browser())).status).toBe(404);
    const rows = getDb().prepare("SELECT * FROM qb_reports").all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ question_id: questionId, version: 1, paper_id: p.id, kind: "wrong_answer", note: "Synthetic note", status: "open" });
    expect(Object.keys(rows[0]).some((column) => /user|ip|account/i.test(column))).toBe(false);
  });
});

describe("monthly ranked papers on the real bank", () => {
  it("one per student per month (a repeat resumes it); owner only; saved once on the board; labels held back; a key correction re-scores it", async () => {
    const s = await signedIn("real.ranked");
    const put = await s.b.send(profile.PUT, "/api/mocktest/profile", {
      method: "PUT",
      body: { nickname: "Nebula", district: null, school: null, showSchool: false, leaderboardOptIn: true },
    });
    expect(put.status).toBe(200);
    expect((await create(browser(), { mode: "ranked" })).status).toBe(401);
    const first = await create(s.b, { mode: "ranked" });
    expect(first.status).toBe(201);
    const p = first.data.papers[0];
    expect(p).toMatchObject({ kind: "ranked", testId: "bp-jee-main-ranked", windowId: "month-2026-10" });
    expect(first.data.token).toBeNull();
    const again = await create(s.b, { mode: "ranked" });
    expect(again).toMatchObject({ status: 200, data: { resumed: true } });
    expect(again.data.papers[0].id).toBe(p.id);
    // Ranked papers open with the owner's session only (no token works).
    expect((await browser().send(paper.GET, `/api/mocktest/papers/${p.id}`, { headers: { "x-paper-token": WRONG_TOKEN } }, params({ id: p.id }))).status).toBe(404);
    // /score is not an answer-key oracle for a live board.
    expect(await scorePaper(s.b, p, null, keyAnswers(p))).toMatchObject({ status: 409, reason: "use_attempts" });

    vi.setSystemTime(NOW + 30 * MIN);
    const key = keyAnswers(p);
    const answers = [key[0] === 0 ? 1 : 0, ...key.slice(1)];
    const saved = await save(s.b, p, answers);
    expect(saved.status).toBe(201);
    expect(saved.data.attempt).toMatchObject({ testId: "bp-jee-main-ranked", leaderboard: true, windowId: "month-2026-10", score: 19 });
    expect(saved.data.scored.paper?.questions.every((q) => q.sourceLabel.en === "" && q.sourceWithheld === true)).toBe(true);
    expect(saved.data.scored.review).toEqual([]);
    expect((await save(s.b, p, answers)).reason).toBe("paper_already_saved");
    const board = await json<LeaderboardData>(await browser().send(leaderboard.GET, "/api/mocktest/leaderboard?test=bp-jee-main-ranked"));
    expect(board.data).toMatchObject({ ranked: true, windowId: "month-2026-10", maxScore: 24 });
    expect(board.data.entries.map((e) => [e.nickname, e.score])).toEqual([["Nebula", 19]]);

    // The bank's correction service re-scores the saved attempt through the mock-test side.
    const firstQuestion = p.questions[0];
    const corrected = await createCorrection(admin, { questionId: firstQuestion.id, kind: "answer", answer: { kind: "single", index: answers[0] as number }, reason: "Synthetic key fix." }, NOW + 40 * MIN, qbDb(getDb()));
    expect(corrected.ok && corrected.data.rescoredAttempts).toBe(1);
    expect(listAttemptsForStudent(s.userId)[0].score).toBe(24);
    const verifyId = saved.data.attempt.verifyId as string;
    const verified = await json<CertificateVerification>(await browser().send(verify.GET, `/api/mocktest/verify/${verifyId}`, {}, params({ id: verifyId })));
    expect(verified.data).toMatchObject({ testId: "bp-jee-main-ranked", scoreBand: "90-100", short: false, questionCount: 6, fullQuestionCount: 6 });
    expect(verified.data.rescoredAt).toEqual(expect.any(Number));
  });
});

describe("figures on the real bank", () => {
  it("only a figure referenced by an approved version (≥ 1) is public", async () => {
    figureDir = mkdtempSync(join(tmpdir(), "qb-real-port-figures-"));
    vi.stubEnv("QB_FIGURE_DIR", figureDir);
    const id = "f".repeat(32);
    writeFileSync(join(figureDir, `${id}.png`), PNG);
    const db = getDb();
    db.prepare("INSERT INTO qb_figures (id, mime, width, height, size, created_by, created_at) VALUES (?, 'image/png', 1, 1, ?, NULL, ?)").run(id, PNG.byteLength, NOW);
    db.prepare("INSERT INTO qb_figure_refs (figure_id, question_id, version) VALUES (?, 'q_synthetic', 0)").run(id);
    const get = () => figureRoute.GET(new Request(`http://localhost:3000/api/qb/figures/${id}`, { headers: { "x-forwarded-for": "203.0.113.7" } }), { params: Promise.resolve({ id }) });
    expect((await get()).status).toBe(404);
    db.prepare("INSERT INTO qb_figure_refs (figure_id, question_id, version) VALUES (?, 'q_synthetic', 1)").run(id);
    const served = await get();
    expect(served.status).toBe(200);
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(PNG);
    expect(served.headers.get("content-type")).toBe("image/png");
  });
});
