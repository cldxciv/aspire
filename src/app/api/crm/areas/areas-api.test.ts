import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The lead-routing routes (docs/lead-routing-plan.md §21; LR-ROUTING) against a fresh in-memory
// database per test, through the real auth (sign-in, session cookie, same-origin checks).
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
// The SLA seam is LR-SLA's: never depend on its answers here.
vi.mock("@/lib/crm/sla", () => ({
  startSlaClock: vi.fn(() => false),
  onContactLogged: vi.fn(),
  closeSlaClock: vi.fn(),
  recomputeOpenClocks: vi.fn(() => 0),
}));

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { listAudit } = await import("@/lib/db/audit");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const { findLeadRouting } = await import("@/lib/crm/repo/areas-core");
const { upsertMember } = await import("@/lib/crm/repo/areas");
const { leadOpsRequests } = await import("@/components/crm/lead-ops-api");
const login = await import("@/app/api/auth/login/route");
const areas = await import("./route");
const area = await import("./[areaId]/route");
const members = await import("./[areaId]/members/route");
const aliases = await import("./[areaId]/aliases/route");
const merge = await import("./merge/route");
const setup = await import("./setup-from-centre/route");
const resolve = await import("./resolve/route");
const unmatched = await import("./unmatched/route");
const reroute = await import("./reroute/route");
const reassign = await import("./reassign/route");
const person = await import("./people/[userId]/route");
const availability = await import("../availability/route");
const leadArea = await import("../leads/[leadId]/area/route");
const routing = await import("../settings/routing/route");

type Browser = InstanceType<typeof TestBrowser>;

vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
let ipCounter = 0;

function browser(): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.51.100.${ipCounter % 250}`);
}

async function signedIn(loginId: string): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD } });
  expect(response.status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crmRole: "counsellor" | "manager") {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD });
  writeStaffMembership(getDb(), user.id, user.id, { crmRole, centreSlugs: [], active: true }, Date.now());
  return user;
}

let numberCounter = 0;
function capture(district: string) {
  numberCounter += 1;
  const result = captureLead(
    { source: "admissions", studentName: "Synthetic Student", phone: `96000${String(numberCounter).padStart(5, "0")}`, district, consent: { textVersion: "test-v1" } },
    Date.now(),
  );
  if (!result.ok) throw new Error("capture failed");
  return result;
}

/** Sends a `leadOpsRequests` builder's request through the matching handler. */
function call(
  b: Browser,
  handler: (request: never, ctx: never) => Promise<Response>,
  request: { path: string; method: string; body?: unknown },
  ctx?: unknown,
  options: { origin?: string | null } = {},
) {
  return b.send(handler as never, request.path, { method: request.method, body: request.body, ...options }, ctx as never);
}

/** Every SUPER-ADMIN-ONLY write (and read), with harmless bodies. */
function superAdminCalls(b: Browser, ids: { userId: string; leadId: string }) {
  return [
    call(b, areas.POST, leadOpsRequests.createArea({ nameEn: "North", nameHi: "उत्तर" })),
    call(b, area.PATCH, leadOpsRequests.updateArea("kangra", { nameEn: "Kangra" }), params({ areaId: "kangra" })),
    call(b, members.PUT, leadOpsRequests.setAreaMembers("kangra", [{ userId: ids.userId }]), params({ areaId: "kangra" })),
    call(b, aliases.POST, leadOpsRequests.addAreaAlias("kangra", { label: "Pathankot", kind: "border" }), params({ areaId: "kangra" })),
    call(b, aliases.DELETE, leadOpsRequests.removeAreaAlias("kangra", "palampur"), params({ areaId: "kangra" })),
    call(b, merge.POST, leadOpsRequests.mergeAreas({ from: "chamba", into: "kangra", people: [] })),
    call(b, setup.POST, leadOpsRequests.setupFromCentre({ centreSlug: "kullu", headIds: [], executiveIds: [ids.userId], headsTakeCalls: false })),
    call(b, reroute.POST, leadOpsRequests.rerouteOpenLeads()),
    call(b, unmatched.GET, leadOpsRequests.unmatchedPlaces()),
    call(b, person.PUT, { path: `/api/crm/areas/people/${ids.userId}`, method: "PUT", body: { areaIds: ["kangra"] } }, params({ userId: ids.userId })),
    call(b, routing.PUT, leadOpsRequests.setRoutingMode("legacy", 0)),
  ];
}

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

describe("who may call the area routes", () => {
  it("enforces the super-admin guard on every write, on the server", async () => {
    const owner = await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    // The first CRM call while only one admin exists makes them the bootstrap super admin (D-044).
    expect((await call(sa, areas.GET, leadOpsRequests.listAreas())).status).toBe(200);
    await createTestUser({ role: "admin", loginId: "plain.admin", password: PASSWORD });
    const exec = await staffUser("exec.one", "counsellor");
    await staffUser("head.one", "manager");
    const { leadId } = capture("Palampur");
    const ids = { userId: exec.id, leadId };

    for (const response of await Promise.all(superAdminCalls(browser(), ids))) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    for (const loginId of ["plain.admin", "head.one", "exec.one"]) {
      const b = await signedIn(loginId);
      for (const response of await Promise.all(superAdminCalls(b, ids))) expect(response.status).toBe(403);
    }
    expect(listAudit(getDb(), { limit: 100 }).filter((entry) => entry.action.startsWith("crm.area"))).toEqual([]);

    // Writes need the site's own origin, even for a super admin.
    const crossSite = await call(sa, areas.POST, leadOpsRequests.createArea({ nameEn: "North", nameHi: "उत्तर" }), undefined, { origin: "https://evil.example" });
    expect(crossSite.status).toBe(403);

    // The super admin gets through every one.
    const statuses = [];
    for (const response of await Promise.all(superAdminCalls(sa, ids))) statuses.push(response.status);
    // 409 / 422 are the services' own answers (e.g. a place name another area uses), never the guard.
    expect(statuses, JSON.stringify(statuses)).toEqual(statuses.map((status) => (status < 400 || status === 409 || status === 422 ? status : -1)));
    expect(statuses[0]).toBe(201);
    expect(listAudit(getDb(), { limit: 100 }).some((entry) => entry.action === "crm.area_create" && entry.actorId === owner.id)).toBe(true);
  });

  it("lets area heads and admins read the areas; never counsellors", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    await staffUser("exec.one", "counsellor");
    await staffUser("head.one", "manager");
    const head = await signedIn("head.one");
    const exec = await signedIn("exec.one");
    const list = await call(head, areas.GET, leadOpsRequests.listAreas());
    expect(list.status).toBe(200);
    const body = (await list.json()) as { data: { id: string; nameHi: string }[] };
    expect(body.data).toHaveLength(12);
    expect(body.data.find((item) => item.id === "solan")?.nameHi).toBe("सोलन");
    expect((await call(exec, areas.GET, leadOpsRequests.listAreas())).status).toBe(403);
    const resolved = await call(head, resolve.GET, leadOpsRequests.resolvePlace("Nahan"));
    expect((await resolved.json()).data).toMatchObject({ areaId: "sirmaur", outcome: "area", match: "town" });
    expect((await call(exec, resolve.GET, leadOpsRequests.resolvePlace("Nahan"))).status).toBe(403);
    const mode = await call(head, routing.GET, leadOpsRequests.getRoutingSettings());
    expect((await mode.json()).data).toMatchObject({ key: "routing", value: { mode: "areas" }, version: 0, isDefault: true });
    expect((await call(exec, routing.GET, leadOpsRequests.getRoutingSettings())).status).toBe(403);
  });
});

describe("what the super admin does on the Areas page", () => {
  it("sets up a centre, maps an unmatched place, and reroutes — answering with the envelope", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const sa = await signedIn("owner.sa");
    const head = await staffUser("head.dh", "manager");
    const exec = await staffUser("exec.dh", "counsellor");

    const set = await call(sa, setup.POST, leadOpsRequests.setupFromCentre({ centreSlug: "dharamshala", headIds: [head.id], executiveIds: [exec.id], headsTakeCalls: false }));
    expect(set.status).toBe(200);
    expect((await set.json()).data).toEqual({ areaIds: ["chamba", "kangra"], heads: 1, executives: 1 });

    const waiting = capture("Pathankot, Punjab");
    expect(waiting.assigneeId).toBeNull();
    const list = await call(sa, unmatched.GET, leadOpsRequests.unmatchedPlaces());
    expect((await list.json()).data).toEqual([{ key: "pathankotpunjab", sample: "Pathankot, Punjab", count: 1, open: 1, outcomes: ["outside_hp"] }]);
    const mapped = await call(
      sa,
      aliases.POST,
      { path: "/api/crm/areas/kangra/aliases", method: "POST", body: { label: "Pathankot", kind: "border", placeKey: "pathankotpunjab" } },
      params({ areaId: "kangra" }),
    );
    expect(mapped.status).toBe(201);
    expect((await mapped.json()).data).toMatchObject({ rerouted: 1, assigned: 1 });
    expect(findLeadRouting(getDb(), waiting.leadId)?.areaId).toBe("kangra");

    const taken = await call(sa, aliases.POST, leadOpsRequests.addAreaAlias("una", { label: "Pathankot", kind: "border" }), params({ areaId: "una" }));
    expect(taken.status).toBe(409);
    const invalid = await call(sa, aliases.POST, { path: "/api/crm/areas/kangra/aliases", method: "POST", body: { label: "X", kind: "planet" } }, params({ areaId: "kangra" }));
    expect(invalid.status).toBe(422);
    const tooBig = await call(sa, members.PUT, { path: "/api/crm/areas/kangra/members", method: "PUT", body: { members: [], pad: "x".repeat(40 * 1024) } }, params({ areaId: "kangra" }));
    expect(tooBig.status).toBe(413);

    const rerouted = await call(sa, reroute.POST, leadOpsRequests.rerouteOpenLeads());
    expect((await rerouted.json()).data).toMatchObject({ checked: 0 });

    const conflict = await call(sa, routing.PUT, leadOpsRequests.setRoutingMode("legacy", 3));
    expect(conflict.status).toBe(409);
    const saved = await call(sa, routing.PUT, leadOpsRequests.setRoutingMode("legacy", 0));
    expect((await saved.json()).data).toMatchObject({ value: { mode: "legacy" }, version: 1 });
  });
});

describe("area heads: availability, bulk reassign, a lead's area", () => {
  it("applies the per-person rights on the server", async () => {
    await createTestUser({ role: "admin", loginId: "owner.sa", password: PASSWORD });
    const headUser = await staffUser("head.k", "manager");
    const from = await staffUser("exec.from", "counsellor");
    const to = await staffUser("exec.to", "counsellor");
    const outsider = await staffUser("exec.out", "counsellor");
    const now = Date.now();
    // The first capture seeds the 12 districts; the memberships come after it.
    const kangraLead = capture("Palampur");
    for (const [areaId, userId] of [
      ["kangra", headUser.id],
      ["kangra", from.id],
      ["kangra", to.id],
      ["kullu", outsider.id],
    ] as const) {
      upsertMember(getDb(), { areaId, userId, centreSlug: null, takesLeads: false, actorId: null, now });
    }
    getDb().prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(from.id, kangraLead.leadId);

    const head = await signedIn("head.k");
    const exec = await signedIn("exec.from");
    const until = new Date(now + 3 * 86_400_000).toISOString();

    expect((await call(exec, availability.PUT, leadOpsRequests.setAvailability({ userId: from.id, awayUntil: until, note: "Leave" }))).status).toBe(200);
    expect((await call(exec, availability.PUT, leadOpsRequests.setAvailability({ userId: to.id, awayUntil: until }))).status).toBe(403);
    expect((await call(head, availability.PUT, leadOpsRequests.setAvailability({ userId: from.id, awayUntil: null }))).status).toBe(200);
    expect((await call(head, availability.PUT, leadOpsRequests.setAvailability({ userId: outsider.id, awayUntil: until }))).status).toBe(403);
    const tooFar = await call(head, availability.PUT, leadOpsRequests.setAvailability({ userId: from.id, awayUntil: new Date(now + 90 * 86_400_000).toISOString() }));
    expect(tooFar.status).toBe(422);

    expect((await call(head, reassign.POST, leadOpsRequests.reassignLeads({ fromUserId: outsider.id, scope: "open" }))).status).toBe(403);
    expect((await call(exec, reassign.POST, leadOpsRequests.reassignLeads({ fromUserId: from.id, scope: "open" }))).status).toBe(403);
    const moved = await call(head, reassign.POST, leadOpsRequests.reassignLeads({ fromUserId: from.id, scope: "open", toUserId: to.id }));
    expect((await moved.json()).data).toEqual({ moved: 1, unassigned: 0 });

    expect((await call(exec, leadArea.PATCH, leadOpsRequests.changeLeadArea(kangraLead.leadId, "kullu"), params({ leadId: kangraLead.leadId }))).status).toBe(403);
    const changed = await call(head, leadArea.PATCH, leadOpsRequests.changeLeadArea(kangraLead.leadId, "kullu"), params({ leadId: kangraLead.leadId }));
    expect(changed.status).toBe(200);
    expect((await changed.json()).data).toMatchObject({ leadId: kangraLead.leadId, areaId: "kullu" });
    expect((await call(head, leadArea.PATCH, leadOpsRequests.changeLeadArea("bad id!", null), params({ leadId: "bad id!" }))).status).toBe(400);

    const audit = JSON.stringify(listAudit(getDb(), { limit: 100 }));
    expect(audit).not.toContain("Leave");
    expect(audit).not.toContain("Palampur");
  });
});
