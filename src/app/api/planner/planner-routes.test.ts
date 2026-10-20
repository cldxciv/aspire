import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/planner/* route handlers against a fresh in-memory database per test. Synthetic accounts only.
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
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { istDateKey, addDays } = await import("@/lib/planner/dates");
const { emptyState } = await import("@/lib/planner/state");
const { getPlannerSummary } = await import("@/lib/planner/server/summary");
const login = await import("@/app/api/auth/login/route");
const stateRoute = await import("./state/route");
const leaderboardRoute = await import("./leaderboard/route");
const iconRoute = await import("./icon/route");

const PASSWORD = "planner-pass-2026";

async function signedIn(loginId: string, role: "student" | "parent" = "student", displayName?: string) {
  const user = await createTestUser({ role, loginId, password: PASSWORD, displayName });
  const b = new TestBrowser(cookieState);
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return { user, b };
}

function stateWith(activity: Record<string, [number, number, number, 0 | 1]>) {
  const today = istDateKey(Date.now());
  return {
    ...emptyState(),
    updatedAt: Date.now(),
    settings: {
      exam: "neet",
      batch: "12",
      startDate: today,
      examDate: addDays(today, 120),
      dailyHours: 5,
      weakTopics: ["bio-genetics"],
      reminderMinutes: 1080,
      notifications: false,
    },
    activity,
  };
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  for (const level of ["info", "warn", "error", "log"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("/api/planner/state", () => {
  it("is for signed-in students only", async () => {
    const guest = new TestBrowser(cookieState);
    expect((await guest.send(stateRoute.GET, "/api/planner/state")).status).toBe(401);
    expect((await guest.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: emptyState() } })).status).toBe(401);
    const { b: parent } = await signedIn("parent.planner", "parent");
    expect((await parent.send(stateRoute.GET, "/api/planner/state")).status).toBe(403);
  });

  it("returns an empty document, an opaque owner tag and a nickname suggestion", async () => {
    const { user, b } = await signedIn("riya.planner", "student", "Riya Sharma");
    const response = await b.send(stateRoute.GET, "/api/planner/state");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({
      state: null,
      savedAt: null,
      leaderboard: { optedIn: false, nickname: null, suggestedNickname: "Riya S." },
    });
    expect(body.data.owner).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(body)).not.toContain(user.id);
    expect(JSON.stringify(body)).not.toContain("riya.planner");
  });

  it("saves the student's own document and clamps inflated XP to the plan (QA-SEC-M6 L8)", async () => {
    const { user, b } = await signedIn("save.planner");
    const today = istDateKey(Date.now());
    const sent = stateWith({ [today]: [5000, 1, 0, 0], [addDays(today, 3)]: [10, 1, 0, 0] });
    const put = await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: sent } });
    expect(put.status).toBe(200);
    // One ticked block of today's plan is worth at most 10 XP (a learn / practice block).
    expect((await put.json()).data.weeklyXp).toBe(10);

    const body = await (await b.send(stateRoute.GET, "/api/planner/state")).json();
    expect(body.data.state.settings).toEqual(sent.settings);
    expect(body.data.state.activity).toEqual({ [today]: [10, 1, 0, 0] });
    expect(getDb().prepare("SELECT day, xp FROM planner_daily WHERE user_id = ?").all(user.id)).toEqual([{ day: today, xp: 10 }]);

    // Another student never sees it.
    const { b: other } = await signedIn("other.planner");
    expect((await (await other.send(stateRoute.GET, "/api/planner/state")).json()).data.state).toBeNull();
  });

  it("caps a hand-edited day to its plan: blocks, reviews and XP per day (QA-SEC-M6 L8)", async () => {
    const { user, b } = await signedIn("caps.planner");
    const today = istDateKey(Date.now());
    const { planForSettings } = await import("@/lib/planner/server/plausible");
    const { XP } = await import("@/lib/planner/progress");
    const sent = stateWith({ [today]: [100_000, 100, 2000, 1], [addDays(today, -1)]: [100_000, 100, 2000, 1] });
    const plan = planForSettings(sent.settings as never)!;
    const day = plan.days[0];
    const blockXp = day.blocks.reduce((sum, block) => sum + XP.block[block.kind], 0);
    const put = await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: sent } });
    expect(put.status).toBe(200);
    const rows = getDb().prepare("SELECT day, xp, blocks, reviews FROM planner_daily WHERE user_id = ? ORDER BY day").all(user.id);
    const busiest = Math.max(...plan.days.map((d) => d.blocks.length));
    expect(rows).toEqual([
      // Before this plan started: no more blocks than the plan's busiest day.
      { day: addDays(today, -1), xp: expect.any(Number), blocks: busiest, reviews: 200 },
      { day: today, xp: Math.min(XP.maxDailyXp, blockXp + XP.maxReviewsPerDay * XP.review + XP.dailyGoalBonus), blocks: day.blocks.length, reviews: 200 },
    ]);
    expect(Number(rows[0].xp)).toBeLessThanOrEqual(XP.maxDailyXp);
  });

  it("rejects cross-origin, non-JSON, oversized and invalid bodies", async () => {
    const { b } = await signedIn("guarded.planner");
    const valid = { state: stateWith({}) };
    expect((await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: valid, origin: "https://evil.example" })).status).toBe(403);
    expect((await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: "x", contentType: "text/plain" })).status).toBe(415);
    expect((await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: { ...emptyState(), pad: "x".repeat(70_000) } } })).status).toBe(413);
    expect((await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: { ...emptyState(), v: 9 } } })).status).toBe(422);
    expect((await b.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: { ...emptyState(), cards: { "Bad Id": [250, 1, 1, 0, "2026-10-20"] } } } })).status).toBe(422);
  });
});

describe("/api/planner/leaderboard", () => {
  it("is opt-in and shows nicknames only", async () => {
    const today = istDateKey(Date.now());
    const { user: a, b: alice } = await signedIn("alice.planner", "student", "Alice Kumar");
    const { b: bob } = await signedIn("bob.planner", "student", "Bob Singh");
    await alice.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: stateWith({ [today]: [10, 1, 0, 0] }) } });
    await bob.send(stateRoute.PUT, "/api/planner/state", { method: "PUT", body: { state: stateWith({ [today]: [20, 2, 0, 0] }) } });

    let board = (await (await alice.send(leaderboardRoute.GET, "/api/planner/leaderboard")).json()).data;
    expect(board.entries).toEqual([]);
    expect(board.me).toEqual({ optedIn: false, nickname: null, rank: null, xp: null });

    const bad = await alice.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname: "alice 9876543210" } });
    expect(bad.status).toBe(422);
    expect((await bad.json()).fieldErrors.nickname).toHaveLength(1);
    expect((await alice.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true } })).status).toBe(422);

    const ok = await alice.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname: "  Star   Gazer " } });
    expect((await ok.json()).data).toEqual({ optedIn: true, nickname: "Star Gazer" });

    board = (await (await bob.send(leaderboardRoute.GET, "/api/planner/leaderboard")).json()).data;
    expect(board.entries).toEqual([{ rank: 1, nickname: "Star Gazer", xp: 10, me: false }]);
    expect(board.participants).toBe(1);
    expect(board.me.rank).toBeNull();
    const text = JSON.stringify(board);
    for (const secret of [a.id, "alice.planner", "Alice", "Kumar", "bob.planner"]) expect(text).not.toContain(secret);

    await bob.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname: "Bobby" } });
    board = (await (await alice.send(leaderboardRoute.GET, "/api/planner/leaderboard")).json()).data;
    expect(board.entries.map((e: { nickname: string; rank: number; me: boolean }) => [e.rank, e.nickname, e.me])).toEqual([
      [1, "Bobby", false],
      [2, "Star Gazer", true],
    ]);
    expect(board.me).toMatchObject({ optedIn: true, nickname: "Star Gazer", rank: 2, xp: 10 });

    // Disabled accounts drop off; leaving deletes the row.
    setUserDisabled(getDb(), (await import("@/lib/db/users")).findUserByLoginId(getDb(), "bob.planner")!.id, true, Date.now());
    board = (await (await alice.send(leaderboardRoute.GET, "/api/planner/leaderboard")).json()).data;
    expect(board.entries).toHaveLength(1);
    const left = await alice.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: false } });
    expect((await left.json()).data).toEqual({ optedIn: false, nickname: null });
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM planner_leaderboard WHERE user_id = ?").get(a.id)).toEqual({ n: 0 });
  });

  it("never accepts the student's own login id as a nickname (QA-SEC-M6, D-034)", async () => {
    const { user, b } = await signedIn("riya.k", "student", "Riya Kapoor");
    for (const nickname of ["riya.k", "Riya K", "RIYA_K fan"]) {
      const response = await b.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname } });
      expect(response.status, nickname).toBe(422);
      expect((await response.json()).fieldErrors.nickname).toHaveLength(1);
    }
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM planner_leaderboard WHERE user_id = ?").get(user.id)).toEqual({ n: 0 });
    // The suggestion ("Riya K.") contains the login id once squashed, so none is offered.
    expect((await (await b.send(stateRoute.GET, "/api/planner/state")).json()).data.leaderboard.suggestedNickname).toBeNull();
    const ok = await b.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname: "Comet" } });
    expect(ok.status).toBe(200);
  });

  it("refuses guests and other roles", async () => {
    const guest = new TestBrowser(cookieState);
    expect((await guest.send(leaderboardRoute.GET, "/api/planner/leaderboard")).status).toBe(401);
    const { b: parent } = await signedIn("parent2.planner", "parent");
    expect((await parent.send(leaderboardRoute.PUT, "/api/planner/leaderboard", { method: "PUT", body: { optIn: true, nickname: "Parent P" } })).status).toBe(403);
  });
});

describe("planner summary (parent / portal)", () => {
  it("returns counts only, from the server copy", async () => {
    const today = istDateKey(Date.now());
    const { user, b } = await signedIn("summary.planner");
    expect(getPlannerSummary(user.id)).toMatchObject({ hasPlan: false, streak: { current: 0 }, lastSyncedAt: null });
    await b.send(stateRoute.PUT, "/api/planner/state", {
      method: "PUT",
      body: { state: stateWith({ [today]: [20, 2, 0, 0], [addDays(today, -1)]: [10, 1, 0, 0], [addDays(today, -40)]: [10, 1, 0, 0] }) },
    });
    const summary = getPlannerSummary(user.id);
    expect(summary).toMatchObject({
      hasPlan: true,
      exam: "neet",
      daysToExam: 120,
      streak: { current: 2, todayDone: true },
      activeDaysLast30: 2,
      blocksDoneLast30: 3,
      lastActiveDate: today,
    });
    expect(summary.xp.total).toBe(40);
    expect(summary.last30Days).toHaveLength(30);
    expect(JSON.stringify(summary)).not.toContain("bio-genetics");
  });
});

describe("/api/planner/icon", () => {
  it("draws a PNG at the manifest sizes", async () => {
    const b = new TestBrowser(cookieState);
    const response = await b.send(iconRoute.GET, "/api/planner/icon?size=192");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
  });
});
