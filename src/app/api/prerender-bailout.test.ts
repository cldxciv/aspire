import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// Regression (lead report, `next build` with Cache Components): GET handlers are
// prerendered at build time, where `connection()` / `cookies()` reject with Next's
// internal control-flow errors. The handlers' try/catch must re-throw those instead of
// logging an auth error and answering 500.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { connection } = await import("next/server");
const { resetDatabaseForTests } = await import("@/lib/db/connection");
const { params, TestBrowser } = await import("@/lib/auth/testing/harness");
const me = await import("./auth/me/route");
const adminUsers = await import("./admin/users/route");
const adminUser = await import("./admin/users/[userId]/route");
const adminAudit = await import("./admin/audit/route");
const session = await import("./session/route");
const studentMe = await import("./student/me/route");

/** Shapes Next uses for prerender bail-outs (matched by `digest`, like unstable_rethrow does). */
function frameworkError(digest: string) {
  return Object.assign(new Error(`simulated ${digest}`), { digest });
}

const handlers: [string, (b: InstanceType<typeof TestBrowser>) => Promise<Response>][] = [
  ["GET /api/auth/me", (b) => b.send(me.GET, "/api/auth/me")],
  ["GET /api/admin/users", (b) => b.send(adminUsers.GET, "/api/admin/users")],
  [
    "GET /api/admin/users/:id",
    (b) => b.send(adminUser.GET, "/api/admin/users/u-1", {}, params({ userId: "u-1" })),
  ],
  ["GET /api/admin/audit", (b) => b.send(adminAudit.GET, "/api/admin/audit")],
  ["GET /api/session", (b) => b.send(session.GET, "/api/session")],
  ["GET /api/student/me", (b) => b.send(studentMe.GET, "/api/student/me")],
];

let logs: MockInstance[] = [];

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  logs = (["info", "warn", "error"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe.each(["HANGING_PROMISE_REJECTION", "DYNAMIC_SERVER_USAGE", "NEXT_PRERENDER_INTERRUPTED"])(
  "prerender bail-out %s",
  (digest) => {
    it.each(handlers)("%s re-throws it untouched and logs nothing", async (_name, call) => {
      const bailout = frameworkError(digest);
      vi.mocked(connection).mockRejectedValueOnce(bailout);
      await expect(call(new TestBrowser(cookieState))).rejects.toBe(bailout);
      for (const spy of logs) expect(spy).not.toHaveBeenCalled();
    });
  },
);

describe("application errors", () => {
  it("still become a generic 500 with a secret-free log line", async () => {
    vi.mocked(connection).mockRejectedValueOnce(new TypeError("database exploded: secret details"));
    const response = await new TestBrowser(cookieState).send(me.GET, "/api/auth/me");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: "server_error" });
    const lines = logs.flatMap((spy) => spy.mock.calls.map((call) => String(call[0])));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "auth", action: "me", outcome: "error", reason: "exception_TypeError" });
    expect(lines[0]).not.toContain("secret details");
  });
});
