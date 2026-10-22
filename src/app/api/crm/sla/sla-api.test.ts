import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET /api/crm/sla and /api/crm/sla/summary (LR-SLA; docs/lead-routing-plan.md §15, §21) against a
// fresh in-memory database, through the real auth. `after()` runs its callback at once here, and
// the Meta seam is a spy: the summary must nudge it and survive it throwing.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
  after: vi.fn((task: () => void) => task()),
}));
vi.mock("@/lib/crm/meta", async (original) => ({ ...(await original<object>()), kickMetaProcessing: vi.fn() }));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { createTestUser, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { kickMetaProcessing } = await import("@/lib/crm/meta");
const { setUserAreas } = await import("@/lib/crm/routing");
const { leadOpsRequests } = await import("@/components/crm/lead-ops-api");
const login = await import("@/app/api/auth/login/route");
const sla = await import("./route");
const summary = await import("./summary/route");

type Browser = InstanceType<typeof TestBrowser>;
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
const DAY = 86_400_000;
let ip = 0;
const browser = (): Browser => new TestBrowser(cookieState, `198.51.100.${(ip += 1) % 250}`);

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  expect((await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } })).status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager", areaIds: string[] = []) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs: [], active: true }, Date.now());
  if (areaIds.length > 0) expect(setUserAreas(getDb(), user.id, areaIds, { actorId: user.id, now: Date.now() })).toEqual({ ok: true });
  return user;
}

let number = 0;
/** A lead that arrived three days ago: its first call is long overdue and escalated. */
function oldLead(district?: string) {
  number += 1;
  const now = Date.now();
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96100${String(number).padStart(5, "0")}`, district, consent: { textVersion: "test-v1" } },
    now,
    { arrivedAt: now - 3 * DAY },
  );
  if (!result.ok) throw new Error("capture failed");
  return result;
}

const get = (b: Browser, handler: (request: never) => Promise<Response>, request: { path: string; method: string }) =>
  b.send(handler as never, request.path, { method: request.method });

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  resetCrmRateLimitersForTests();
  vi.mocked(kickMetaProcessing).mockReset();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

async function world() {
  await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
  const sa = await signedIn("owner.sa");
  expect((await get(sa, summary.GET, leadOpsRequests.slaSummary())).status).toBe(200); // bootstrap super admin
  await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
  const head = await staffUser("head.kangra", "manager", ["kangra"]);
  const exec = await staffUser("exec.kangra", "counsellor", ["kangra"]);
  const kangra = oldLead("Palampur");
  const nowhere = oldLead();
  return { sa, head, exec, kangra, nowhere };
}

describe("GET /api/crm/sla?view=…", () => {
  it("answers each role only the views it may open (403 beyond, 400 for junk, 401 signed out)", async () => {
    const w = await world();
    const exec = await signedIn("exec.kangra");
    const head = await signedIn("head.kangra");
    const plain = await signedIn("plain.admin");
    const status = async (b: Browser, view: string) => (await get(b, sla.GET, { path: `/api/crm/sla?view=${view}`, method: "GET" })).status;

    expect(await status(browser(), "mine")).toBe(401);
    expect(await status(exec, "mine")).toBe(200);
    for (const view of ["area", "escalated", "unassigned", "tool_signups"]) expect(await status(exec, view), view).toBe(403);
    expect(await status(head, "area")).toBe(200);
    for (const view of ["escalated", "unassigned", "tool_signups"]) expect(await status(head, view), view).toBe(403);
    expect(await status(plain, "area")).toBe(200);
    expect(await status(plain, "escalated")).toBe(403);
    for (const view of ["mine", "area", "escalated", "unassigned", "tool_signups"]) expect(await status(w.sa, view), view).toBe(200);
    expect(await status(w.sa, "everything")).toBe(400);

    const mine = await get(exec, sla.GET, leadOpsRequests.slaQueue("mine"));
    expect(mine.headers.get("cache-control")).toBe("no-store");
    const body = (await mine.json()) as { data: { view: string; items: { leadId: string; phoneLast4: string; clock: { state: string } }[]; total: number } };
    expect(body.data).toMatchObject({ view: "mine", total: 1, items: [{ leadId: w.kangra.leadId, clock: { state: "escalated" } }] });
    expect(JSON.stringify(body)).not.toMatch(/\+91\d{10}|96100\d{5}/);
    const escalated = await get(w.sa, sla.GET, leadOpsRequests.slaQueue("escalated"));
    expect(((await escalated.json()) as { data: { total: number } }).data.total).toBe(2);
  });
});

describe("GET /api/crm/sla/summary", () => {
  it("gives each role its part, and nudges Meta processing after the response", async () => {
    const w = await world();
    const exec = await (await get(await signedIn("exec.kangra"), summary.GET, leadOpsRequests.slaSummary())).json();
    expect(exec.data.mine).toMatchObject({ callNow: 1, overdue: 1 });
    expect(exec.data.area).toBeUndefined();
    expect(exec.data.sa).toBeUndefined();

    const head = await (await get(await signedIn("head.kangra"), summary.GET, { path: "/api/crm/sla/summary?lang=hi", method: "GET" })).json();
    expect(head.data.area.areas).toEqual([{ id: "kangra", name: "कांगड़ा", overdue: 1, unassigned: 0 }]);
    expect(head.data.sa).toBeUndefined();

    vi.mocked(kickMetaProcessing).mockClear();
    const sa = await get(w.sa, summary.GET, leadOpsRequests.slaSummary());
    const body = await sa.json();
    // The no-area lead found nobody (the only executive works in Kangra): it waits in the Unassigned queue.
    expect(body.data.sa).toMatchObject({ escalated: 2, unassignedNoArea: 1, toolSignups: 0, meta: null });
    expect(body.data.area.areas).toEqual([{ id: "none", name: "", overdue: 1, unassigned: 0 }]);
    expect(kickMetaProcessing).toHaveBeenCalledWith("summary");

    vi.mocked(kickMetaProcessing).mockImplementation(() => {
      throw new Error("boom");
    });
    expect((await get(w.sa, summary.GET, leadOpsRequests.slaSummary())).status).toBe(200);
    expect((await get(browser(), summary.GET, leadOpsRequests.slaSummary())).status).toBe(401);
  });
});
