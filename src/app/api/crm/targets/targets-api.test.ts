import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET / PUT /api/crm/targets (1B-NUMBERS; docs/admin-phase-1b-plan.md §5.B, §7, §8) against a
// fresh in-memory database, through the real auth (sign-in, session cookie, same-origin checks).
// Synthetic people and numbers only.
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
const { listAudit } = await import("@/lib/db/audit");
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { currentSession } = await import("@/lib/crm/console/session");
const { targetsRequests } = await import("@/components/console/targets/api");
const login = await import("@/app/api/auth/login/route");
const targets = await import("./route");

type Browser = InstanceType<typeof TestBrowser>;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
let ip = 0;
const browser = (): Browser => new TestBrowser(cookieState, `198.51.100.${(ip += 1) % 250}`);

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager", centreSlugs: string[] = []) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs, active: true }, Date.now());
  return user;
}

const call = (b: Browser, handler: (request: never) => Promise<Response>, request: { path: string; method: string; body?: unknown }, options: { origin?: string | null } = {}) =>
  b.send(handler as never, request.path, { method: request.method, body: request.body, ...options });

/** The bootstrap super admin (the only admin when it first signs in), a plain admin, an area head (Shimla) and a counsellor. */
async function people() {
  const owner = await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
  const sa = await signedIn("owner.sa");
  expect((await call(sa, targets.GET, targetsRequests.get())).status).toBe(200); // bootstraps the super admin grant
  await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
  await staffUser("head.shimla", "manager", ["shimla"]);
  await staffUser("exec.one", "counsellor");
  return { owner, sa };
}

const targetAudit = () => listAudit(getDb(), { limit: 100 }).filter((entry) => entry.action === "settings.targets_update");
const session = () => currentSession(Date.now()).key;
const cells = [
  { centreSlug: "shimla", program: "jee" as const, value: 40 },
  { centreSlug: "hamirpur", program: "any" as const, value: 25 },
];

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("GET /api/crm/targets", () => {
  it("answers CRM admins and area heads (their centres); never counsellors or strangers", async () => {
    const { sa } = await people();
    expect((await call(sa, targets.PUT, targetsRequests.save(session(), "admissions", cells, null))).status).toBe(200);

    const anonymous = await call(browser(), targets.GET, targetsRequests.get());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await call(await signedIn("exec.one"), targets.GET, targetsRequests.get())).status).toBe(403);

    const plain = await call(await signedIn("plain.admin"), targets.GET, targetsRequests.get(session()));
    expect(plain.status).toBe(200);
    expect((await plain.json()).data).toMatchObject({ period: session(), cells: [expect.anything(), expect.anything()] });

    const head = await call(await signedIn("head.shimla"), targets.GET, targetsRequests.get(session()));
    expect(head.status).toBe(200);
    expect((await head.json()).data.cells).toEqual([{ centreSlug: "shimla", program: "jee", metric: "admissions", value: 40 }]);

    const month = await call(sa, targets.GET, { path: "/api/crm/targets?period=M2026-11", method: "GET" });
    expect(month.status).toBe(422);
  });
});

describe("PUT /api/crm/targets", () => {
  it("lets only super admins save (403 for admins, area heads, counsellors and other origins)", async () => {
    const { sa } = await people();
    const body = targetsRequests.save(session(), "admissions", cells, null);
    for (const loginId of ["plain.admin", "head.shimla", "exec.one"]) {
      expect((await call(await signedIn(loginId), targets.PUT, body)).status, loginId).toBe(403);
    }
    expect((await call(sa, targets.PUT, body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(browser(), targets.PUT, body)).status).toBe(401);
    expect(targetAudit()).toEqual([]);
    expect(getDb().prepare("SELECT COUNT(*) AS n FROM crm_targets").get()?.n).toBe(0);
  });

  it("saves with the version it loaded, refuses a stale one (409), validates strictly and audits counts only", async () => {
    const { owner, sa } = await people();
    const saved = await call(sa, targets.PUT, targetsRequests.save(session(), "admissions", cells, null));
    expect(saved.status).toBe(200);
    const grid = (await saved.json()).data;
    expect(grid).toMatchObject({ period: session(), updatedAt: expect.any(String), updatedBy: expect.any(String) });
    expect(grid.cells).toHaveLength(2);
    expect(targetAudit()).toEqual([expect.objectContaining({ actorId: owner.id, target: session(), details: { period: session(), metric: "admissions", cells: 2 } })]);

    // Someone saved meanwhile (this browser still holds "no targets yet") → 409, nothing written.
    const stale = await call(sa, targets.PUT, targetsRequests.save(session(), "admissions", [], null));
    expect(stale.status).toBe(409);
    expect(targetAudit()).toHaveLength(1);

    for (const bad of [
      { period: "M2026-11", metric: "admissions", cells: [], expectedUpdatedAt: grid.updatedAt },
      { period: session(), metric: "monthly", cells: [], expectedUpdatedAt: grid.updatedAt },
      { period: session(), metric: "admissions", cells: [{ centreSlug: "shimla", program: "jee", value: -1 }], expectedUpdatedAt: grid.updatedAt },
      { period: session(), metric: "admissions", cells: [{ centreSlug: "shimla", program: "medical", value: 1 }], expectedUpdatedAt: grid.updatedAt },
      { period: session(), metric: "admissions", cells: [], expectedUpdatedAt: grid.updatedAt, extra: true },
    ]) {
      const invalid = await call(sa, targets.PUT, { path: "/api/crm/targets", method: "PUT", body: bad });
      expect(invalid.status, JSON.stringify(bad)).toBe(422);
    }
    expect(targetAudit()).toHaveLength(1);

    // With the version it loaded, an unknown centre slug saves (the real centre list is pending).
    const next = await call(sa, targets.PUT, targetsRequests.save(session(), "admissions", [{ centreSlug: "new-centre", program: "any", value: 5 }], grid.updatedAt));
    expect(next.status).toBe(200);
    expect((await next.json()).data.cells).toEqual([{ centreSlug: "new-centre", program: "any", metric: "admissions", value: 5 }]);
    expect(targetAudit()).toHaveLength(2);
  });
});
