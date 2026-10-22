import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET / PUT /api/crm/settings/speed (LR-SLA; docs/lead-routing-plan.md §21) against a fresh
// in-memory database, through the real auth (sign-in, session cookie, same-origin checks).
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
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { DEFAULT_CALLING_HOURS, DEFAULT_SPEED_RULE } = await import("@/lib/crm/lead-ops-types");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { leadOpsRequests } = await import("@/components/crm/lead-ops-api");
const login = await import("@/app/api/auth/login/route");
const speed = await import("./route");

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

async function staffUser(loginId: string, crmRole: "counsellor" | "manager") {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs: [], active: true }, Date.now());
  return user;
}

const call = (b: Browser, handler: (request: never) => Promise<Response>, request: { path: string; method: string; body?: unknown }, options: { origin?: string | null } = {}) =>
  b.send(handler as never, request.path, { method: request.method, body: request.body, ...options });

const ruleBody = (firstCallMinutes: number, expected: number) =>
  leadOpsRequests.saveSpeedSettings({ speedRule: { ...DEFAULT_SPEED_RULE, firstCallMinutes }, expectedVersion: { speedRule: expected } });

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

describe("GET /api/crm/settings/speed", () => {
  it("lets area heads and admins read (defaults, version 0); never counsellors or strangers", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    await staffUser("head.one", "manager");
    await staffUser("exec.one", "counsellor");
    const anonymous = await call(browser(), speed.GET, leadOpsRequests.getSpeedSettings());
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("cache-control")).toBe("no-store");
    expect(anonymous.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect((await call(await signedIn("exec.one"), speed.GET, leadOpsRequests.getSpeedSettings())).status).toBe(403);
    const head = await call(await signedIn("head.one"), speed.GET, leadOpsRequests.getSpeedSettings());
    expect(head.status).toBe(200);
    expect((await head.json()).data).toMatchObject({
      callingHours: { key: "calling_hours", value: DEFAULT_CALLING_HOURS, version: 0, isDefault: true },
      speedRule: { key: "speed_rule", value: DEFAULT_SPEED_RULE, version: 0, isDefault: true },
    });
  });
});

describe("PUT /api/crm/settings/speed (super admins only, on the server)", () => {
  it("refuses everyone else with 403 and writes nothing", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    expect((await call(sa, speed.GET, leadOpsRequests.getSpeedSettings())).status).toBe(200); // bootstrap super admin
    await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
    await staffUser("head.one", "manager");
    await staffUser("exec.one", "counsellor");
    expect((await call(browser(), speed.PUT, ruleBody(30, 0))).status).toBe(401);
    for (const loginId of ["plain.admin", "head.one", "exec.one"]) {
      const response = await call(await signedIn(loginId), speed.PUT, ruleBody(30, 0));
      expect(response.status, loginId).toBe(403);
    }
    expect((await call(sa, speed.PUT, ruleBody(30, 0), { origin: "https://evil.example" })).status).toBe(403);
    expect(listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.settings_update")).toEqual([]);
  });

  it("saves with the optimistic lock, recomputes open clocks, audits key + version; 409 / 422 / 413", async () => {
    const owner = await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    await staffUser("exec.one", "counsellor");
    const captured = captureLead({ source: "admissions", studentName: "Synthetic Student", phone: "9600000001", consent: { textVersion: "test-v1" } }, Date.now());
    expect(captured.ok).toBe(true);

    const saved = await call(sa, speed.PUT, ruleBody(30, 0));
    expect(saved.status).toBe(200);
    expect((await saved.json()).data).toMatchObject({ speedRule: { version: 1, value: { firstCallMinutes: 30 } }, callingHours: { version: 0 }, recomputed: 1 });
    expect(listAudit(getDb(), { limit: 50 }).filter((entry) => entry.action === "crm.settings_update")).toEqual([
      expect.objectContaining({ actorId: owner.id, target: "speed_rule", details: { key: "speed_rule", version: 1 } }),
    ]);

    expect((await call(sa, speed.PUT, ruleBody(45, 0))).status).toBe(409);
    const invalid = await call(sa, speed.PUT, ruleBody(2, 1));
    expect(invalid.status).toBe(422);
    expect(Object.keys((await invalid.json()).fieldErrors)).toContain("speedRule.firstCallMinutes");
    const noVersion = await call(sa, speed.PUT, { path: "/api/crm/settings/speed", method: "PUT", body: { speedRule: DEFAULT_SPEED_RULE, expectedVersion: {} } });
    expect(noVersion.status).toBe(422);
    const huge = await call(sa, speed.PUT, {
      path: "/api/crm/settings/speed",
      method: "PUT",
      body: { callingHours: { ...DEFAULT_CALLING_HOURS, note: "x".repeat(40 * 1024) }, expectedVersion: { callingHours: 0 } },
    });
    expect(huge.status).toBe(413);

    const hours = await call(sa, speed.PUT, leadOpsRequests.saveSpeedSettings({ callingHours: { ...DEFAULT_CALLING_HOURS, closedDates: ["2026-12-25"] }, expectedVersion: { callingHours: 0 } }));
    expect(hours.status).toBe(200);
    expect((await hours.json()).data.callingHours).toMatchObject({ version: 1, value: { closedDates: ["2026-12-25"] } });
  });
});
