import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/crm/dashboard (LR-SLA; docs/lead-routing-plan.md §16, §21) against a fresh in-memory
// database, through the real auth: area heads scoped (an area outside → 403), admins all,
// counsellors never.
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
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { setUserAreas } = await import("@/lib/crm/routing");
const { leadOpsRequests } = await import("@/components/crm/lead-ops-api");
const login = await import("@/app/api/auth/login/route");
const dashboard = await import("./route");

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

async function staffUser(loginId: string, crmRole: "counsellor" | "manager", areaIds: string[]) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs: [], active: true }, Date.now());
  expect(setUserAreas(getDb(), user.id, areaIds, { actorId: user.id, now: Date.now() })).toEqual({ ok: true });
  return user;
}

let number = 0;
function capture(district: string) {
  number += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96200${String(number).padStart(5, "0")}`, district, consent: { textVersion: "test-v1" } },
    Date.now(),
  );
  if (!result.ok) throw new Error("capture failed");
}

const get = (b: Browser, request: { path: string; method: string }) => b.send(dashboard.GET as never, request.path, { method: request.method });

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

describe("GET /api/crm/dashboard", () => {
  it("scopes heads to their areas, refuses other areas (M2), and never answers counsellors", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    expect((await get(sa, leadOpsRequests.dashboard())).status).toBe(200); // bootstrap super admin
    await staffUser("head.kangra", "manager", ["kangra"]);
    await staffUser("exec.kangra", "counsellor", ["kangra"]);
    await staffUser("exec.solan", "counsellor", ["solan"]);
    capture("Palampur");
    capture("Baddi");

    expect((await get(browser(), leadOpsRequests.dashboard())).status).toBe(401);
    expect((await get(await signedIn("exec.kangra"), leadOpsRequests.dashboard())).status).toBe(403);

    const head = await signedIn("head.kangra");
    const own = await get(head, leadOpsRequests.dashboard());
    expect(own.status).toBe(200);
    expect(own.headers.get("cache-control")).toBe("no-store");
    const ownData = (await own.json()).data;
    expect(ownData.scope.areaIds).toEqual(["kangra", "chamba"]);
    expect(ownData.now).toMatchObject({ callNow: 1 });
    expect(ownData.now.unassignedNoArea).toBeUndefined();
    expect(ownData.meta).toBeUndefined();
    expect((await get(head, leadOpsRequests.dashboard({ area: "solan" }))).status).toBe(403);
    expect((await get(head, leadOpsRequests.dashboard({ area: "kangra" }))).status).toBe(200);

    const all = (await (await get(sa, leadOpsRequests.dashboard({ area: undefined }))).json()).data;
    expect(all.scope.areaIds).toBe("all");
    expect(all.now).toMatchObject({ callNow: 2, unassignedNoArea: 0, toolSignups: 0 });
    const hindi = (await (await get(sa, { path: "/api/crm/dashboard?lang=hi", method: "GET" })).json()).data;
    expect(hindi.byArea.map((row: { label?: string }) => row.label).sort()).toEqual(["कांगड़ा", "सोलन"].sort());
  });

  it("rejects malformed ranges and area ids with 400", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    const now = Date.now();
    expect((await get(sa, leadOpsRequests.dashboard({ from: "yesterday" }))).status).toBe(400);
    expect((await get(sa, leadOpsRequests.dashboard({ from: new Date(now).toISOString(), to: new Date(now - 1000).toISOString() }))).status).toBe(400);
    expect((await get(sa, leadOpsRequests.dashboard({ from: new Date(now - 400 * 86_400_000).toISOString(), to: new Date(now).toISOString() }))).status).toBe(400);
    expect((await get(sa, { path: "/api/crm/dashboard?area=kan%27gra", method: "GET" })).status).toBe(400);
    const range = await get(sa, leadOpsRequests.dashboard({ from: new Date(now - 7 * 86_400_000).toISOString(), to: new Date(now).toISOString() }));
    expect(range.status).toBe(200);
    expect((await range.json()).data.range).toEqual({ from: new Date(now - 7 * 86_400_000).toISOString(), to: new Date(now).toISOString() });
  });
});
