import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /api/crm/** and the staff parts of /api/admin/users against a fresh in-memory database per test.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("@/lib/auth/testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));
// A passthrough spy on the routing seam: the admin users API's CALLS are checked, never the seam's answers.
vi.mock("@/lib/crm/routing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/routing")>();
  return { ...actual, setUserAreas: vi.fn(actual.setUserAreas) };
});

const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { setUserAreas } = await import("@/lib/crm/routing");
const { listAudit } = await import("@/lib/db/audit");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const { captureLead, writeStaffMembership } = await import("@/lib/crm");
const { resetCrmRateLimitersForTests } = await import("@/lib/crm/http");
const login = await import("@/app/api/auth/login/route");
const changePassword = await import("@/app/api/auth/change-password/route");
const adminUsers = await import("@/app/api/admin/users/route");
const adminUser = await import("@/app/api/admin/users/[userId]/route");
const studentMe = await import("@/app/api/student/me/route");
const parentStudents = await import("@/app/api/parent/students/route");
const me = await import("./me/route");
const leads = await import("./leads/route");
const lead = await import("./leads/[leadId]/route");
const notes = await import("./leads/[leadId]/notes/route");
const contacts = await import("./leads/[leadId]/contacts/route");
const leadTasks = await import("./leads/[leadId]/tasks/route");
const erase = await import("./leads/[leadId]/erase/route");
const tasks = await import("./tasks/route");
const task = await import("./tasks/[taskId]/route");
const reports = await import("./reports/route");
const exportCsv = await import("./export/route");
const staff = await import("./staff/route");
const staffMember = await import("./staff/[userId]/route");
const rules = await import("./rules/route");
const crmHome = await import("@/app/[lang]/(portal)/crm/home/route");

type Browser = InstanceType<typeof TestBrowser>;

// Each test signs several accounts in (scrypt): give them room when the full suite runs in parallel.
vi.setConfig({ testTimeout: 60_000 });

const PASSWORD = "synthetic-pass-2026";
let ipCounter = 0;

function browser(): Browser {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.51.100.${ipCounter % 250}`);
}

async function signedIn(loginId: string, role?: string): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: { loginId, password: PASSWORD, ...(role ? { role } : {}) } });
  expect(response.status).toBe(200);
  return b;
}

async function staffUser(loginId: string, crm: { crmRole: "counsellor" | "manager"; centreSlugs?: string[] } | null, options = {}) {
  const user = await createTestUser({ role: "staff", loginId, password: PASSWORD, ...options });
  if (crm) {
    writeStaffMembership(getDb(), user.id, user.id, { crmRole: crm.crmRole, centreSlugs: crm.centreSlugs ?? [], active: true }, Date.now());
  }
  return user;
}

function lead1(phone: string, centreSlug: string) {
  const result = captureLead(
    {
      source: "admissions",
      studentName: "Synthetic Student",
      phone,
      centreSlug,
      programInterest: "jee",
      consent: { textVersion: "test-v1" },
    },
    Date.now(),
  );
  if (!result.ok) throw new Error("capture failed");
  return result;
}

const api = {
  me: (b: Browser) => b.send(me.GET, "/api/crm/me"),
  list: (b: Browser, query = "") => b.send(leads.GET, `/api/crm/leads${query}`),
  create: (b: Browser, body: unknown, options = {}) => b.send(leads.POST, "/api/crm/leads", { body, ...options }),
  get: (b: Browser, leadId: string) => b.send(lead.GET, `/api/crm/leads/${leadId}`, {}, params({ leadId })),
  patch: (b: Browser, leadId: string, body: unknown, options = {}) =>
    b.send(lead.PATCH, `/api/crm/leads/${leadId}`, { method: "PATCH", body, ...options }, params({ leadId })),
  note: (b: Browser, leadId: string, body: unknown, options = {}) =>
    b.send(notes.POST, `/api/crm/leads/${leadId}/notes`, { body, ...options }, params({ leadId })),
  contact: (b: Browser, leadId: string, body: unknown) =>
    b.send(contacts.POST, `/api/crm/leads/${leadId}/contacts`, { body }, params({ leadId })),
  addTask: (b: Browser, leadId: string, body: unknown) =>
    b.send(leadTasks.POST, `/api/crm/leads/${leadId}/tasks`, { body }, params({ leadId })),
  erase: (b: Browser, leadId: string, options = {}) =>
    b.send(erase.POST, `/api/crm/leads/${leadId}/erase`, { body: { confirm: true }, ...options }, params({ leadId })),
  tasks: (b: Browser, query = "") => b.send(tasks.GET, `/api/crm/tasks${query}`),
  doneTask: (b: Browser, taskId: string) =>
    b.send(task.PATCH, `/api/crm/tasks/${taskId}`, { method: "PATCH", body: { done: true } }, params({ taskId })),
  reports: (b: Browser, query = "") => b.send(reports.GET, `/api/crm/reports${query}`),
  export: (b: Browser, query = "") => b.send(exportCsv.GET, `/api/crm/export${query}`),
  staff: (b: Browser) => b.send(staff.GET, "/api/crm/staff"),
  putStaff: (b: Browser, userId: string, body: unknown) =>
    b.send(staffMember.PUT, `/api/crm/staff/${userId}`, { method: "PUT", body }, params({ userId })),
  rules: (b: Browser) => b.send(rules.GET, "/api/crm/rules"),
  putRules: (b: Browser, body: unknown) => b.send(rules.PUT, "/api/crm/rules", { method: "PUT", body }),
};

/** Every CRM endpoint once, with harmless bodies (ids that may or may not exist). */
function everyEndpoint(b: Browser, ids: { leadId: string; taskId: string; userId: string }) {
  return [
    api.me(b),
    api.list(b),
    api.create(b, { source: "walk_in", studentName: "Walk In", phone: "9876511111", consent: true }),
    api.get(b, ids.leadId),
    api.patch(b, ids.leadId, { stage: "contacted" }),
    api.note(b, ids.leadId, { body: "note" }),
    api.contact(b, ids.leadId, { channel: "call", outcome: "busy" }),
    api.addTask(b, ids.leadId, { title: "Call", dueAt: new Date(Date.now() + 3600_000).toISOString() }),
    api.erase(b, ids.leadId),
    api.tasks(b),
    api.doneTask(b, ids.taskId),
    api.reports(b),
    api.export(b),
    api.staff(b),
    api.putStaff(b, ids.userId, { crmRole: "counsellor" }),
    api.rules(b),
    api.putRules(b, { rules: [] }),
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

describe("who may call the CRM APIs", () => {
  it("denies guests (401), students, parents, staff without a membership and pending temporary passwords (403)", async () => {
    await createTestUser({ role: "student", loginId: "learner.one", password: PASSWORD });
    await createTestUser({ role: "parent", loginId: "parent.one", password: PASSWORD });
    await createTestUser({ role: "admin", loginId: "admin.temp", password: PASSWORD, mustChangePassword: true });
    const bare = await staffUser("staff.bare", null);
    await staffUser("staff.temp", { crmRole: "manager" }, { mustChangePassword: true });
    const { leadId } = lead1("9876500001", "shimla");
    const ids = { leadId, taskId: "task-1", userId: bare.id };

    for (const response of await Promise.all(everyEndpoint(browser(), ids))) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    }
    for (const loginId of ["learner.one", "parent.one", "admin.temp", "staff.bare", "staff.temp"]) {
      const b = await signedIn(loginId);
      for (const response of await Promise.all(everyEndpoint(b, ids))) expect(response.status).toBe(403);
    }
    expect(listAudit(getDb(), { limit: 100 }).filter((e) => e.action.startsWith("crm.") && e.action !== "crm.lead_capture" && e.action !== "crm.staff_upsert")).toEqual([]);
  });

  it("keeps staff out of every other portal API", async () => {
    await staffUser("couns.a", { crmRole: "counsellor" });
    const b = await signedIn("couns.a", "staff");
    expect((await b.send(studentMe.GET, "/api/student/me")).status).toBe(403);
    expect((await b.send(parentStudents.GET, "/api/parent/students")).status).toBe(403);
    expect((await b.send(adminUsers.GET, "/api/admin/users")).status).toBe(403);
  });

  it("applies the role matrix for counsellors, scoped / unscoped managers and admins", async () => {
    await createTestUser({ role: "admin", loginId: "admin.one", password: PASSWORD });
    const couns = await staffUser("couns.a", { crmRole: "counsellor", centreSlugs: ["shimla"] });
    await staffUser("couns.h", { crmRole: "counsellor", centreSlugs: ["hamirpur"] });
    const mgrShimla = await staffUser("mgr.shimla", { crmRole: "manager", centreSlugs: ["shimla"] });
    await staffUser("mgr.all", { crmRole: "manager" });
    const shimla = lead1("9876500011", "shimla");
    const hamirpur = lead1("9876500012", "hamirpur");
    expect(shimla.assigneeId).toBe(couns.id);

    const bc = await signedIn("couns.a", "staff");
    const bm = await signedIn("mgr.shimla", "staff");
    const ball = await signedIn("mgr.all", "staff");
    const ba = await signedIn("admin.one", "admin");

    // /me
    expect((await (await api.me(bc)).json()).data).toMatchObject({
      viewer: { role: "counsellor", centreSlugs: ["shimla"] },
      permissions: { canExport: false, canAssign: false },
    });
    expect((await (await api.me(ba)).json()).data.viewer.role).toBe("admin");

    // Inbox scope.
    const ids = async (b: Browser) => (await (await api.list(b)).json()).data.items.map((l: { id: string }) => l.id).sort();
    expect(await ids(bc)).toEqual([shimla.leadId]);
    expect(await ids(bm)).toEqual([shimla.leadId]);
    expect(await ids(ball)).toEqual([shimla.leadId, hamirpur.leadId].sort());
    expect(await ids(ba)).toEqual([shimla.leadId, hamirpur.leadId].sort());
    expect((await api.list(bc, "?page=0")).status).toBe(400);

    // Record-level: other leads are 404 for every verb.
    expect((await api.get(bc, hamirpur.leadId)).status).toBe(404);
    expect((await api.patch(bc, hamirpur.leadId, { stage: "contacted" })).status).toBe(404);
    expect((await api.note(bc, hamirpur.leadId, { body: "x" })).status).toBe(404);
    expect((await api.contact(bc, hamirpur.leadId, { channel: "call", outcome: "busy" })).status).toBe(404);
    expect((await api.get(bm, hamirpur.leadId)).status).toBe(404);
    expect((await api.get(bc, "bad id!")).status).toBe(400);

    // Own lead: full work loop.
    const detail = await api.get(bc, shimla.leadId);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toMatchObject({ id: shimla.leadId, phone: "+919876500011", activities: expect.any(Array) });
    expect((await api.patch(bc, shimla.leadId, { stage: "lost" })).status).toBe(422);
    expect((await api.patch(bc, shimla.leadId, { stage: "counselling_booked" })).status).toBe(200);
    expect((await api.patch(bc, shimla.leadId, { assigneeId: mgrShimla.id })).status).toBe(403);
    expect((await api.note(bc, shimla.leadId, { body: "Spoke to the family" })).status).toBe(201);
    expect((await api.contact(bc, shimla.leadId, { channel: "whatsapp", outcome: "message_sent" })).status).toBe(201);
    const created = await api.addTask(bc, shimla.leadId, { title: "Call back", dueAt: new Date(Date.now() + 3600_000).toISOString() });
    expect(created.status).toBe(201);
    const taskId = (await created.json()).data.id as string;
    expect((await (await api.tasks(bc, "?range=today")).json()).data.length).toBeLessThanOrEqual(1);
    expect((await api.tasks(bc, "?range=someday")).status).toBe(400);
    expect((await api.doneTask(bc, taskId)).status).toBe(200);
    expect((await api.reports(bc)).status).toBe(200);
    expect((await api.reports(bc, "?from=nope")).status).toBe(400);

    // Manager / admin only.
    expect((await api.export(bc)).status).toBe(403);
    expect((await api.staff(bc)).status).toBe(403);
    expect((await api.rules(bc)).status).toBe(403);
    expect((await api.erase(bc, shimla.leadId)).status).toBe(403);
    expect((await api.erase(bm, shimla.leadId)).status).toBe(403);
    expect((await api.putStaff(bm, couns.id, { crmRole: "manager" })).status).toBe(403);
    expect((await api.putRules(bm, { rules: [] })).status).toBe(403);
    expect((await api.staff(bm)).status).toBe(200);
    expect((await api.rules(bm)).status).toBe(200);
    const staffList = (await (await api.staff(bm)).json()).data;
    expect(staffList[0].loginId).toBeUndefined();
    expect((await (await api.staff(ba)).json()).data.map((s: { loginId: string }) => s.loginId)).toContain("couns.a");

    const csv = await api.export(bm, "?stage=counselling_booked");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(csv.headers.get("content-disposition")).toMatch(/^attachment; filename="aspire-leads-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(csv.headers.get("cache-control")).toBe("no-store");
    const text = await csv.text();
    expect(text).toContain(`"'+919876500011"`);
    expect(text).not.toContain("9876500012");

    // Admin: staff + rules + erase.
    expect((await api.putStaff(ba, couns.id, { crmRole: "counsellor", centreSlugs: ["shimla", "kullu"] })).status).toBe(200);
    expect((await api.putRules(ba, { rules: [{ centreSlug: "shimla", memberIds: [couns.id] }] })).status).toBe(200);
    expect((await api.putRules(ba, { rules: [{ centreSlug: "shimla", memberIds: ["nobody"] }] })).status).toBe(422);
    const erased = await api.erase(ba, hamirpur.leadId);
    expect(erased.status).toBe(200);
    expect((await api.note(ba, hamirpur.leadId, { body: "x" })).status).toBe(409);
  });

  it("lead routing: query parameters only narrow — an area head's ?area= outside their areas is 403 (M2)", async () => {
    const head = await staffUser("head.kangra", { crmRole: "manager" });
    const db = getDb();
    const now = Date.now();
    for (const [id, en, hi] of [["kangra", "Kangra", "कांगड़ा"], ["shimla", "Shimla", "शिमला"]]) {
      db.prepare("INSERT INTO crm_areas (id, name_en, name_hi, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(id, en, hi, now, now);
    }
    db.prepare("INSERT INTO crm_area_members (area_id, user_id, created_at) VALUES ('kangra', ?, ?)").run(head.id, now);
    db.prepare("INSERT INTO crm_staff_scope (user_id, mode, set_at) VALUES (?, 'areas', ?)").run(head.id, now);
    const b = await signedIn("head.kangra", "staff");
    expect((await api.list(b, "?area=shimla")).status).toBe(403);
    expect((await api.list(b, "?area=kangra")).status).toBe(200);
    expect((await api.list(b, "?area=none&sla=overdue")).status).toBe(200);
    // The CSV export answers the same way.
    expect((await api.export(b, "?area=shimla")).status).toBe(403);
    expect((await api.export(b, "?area=kangra")).status).toBe(200);
    expect((await (await api.me(b)).json()).data.viewer).toMatchObject({ role: "manager", areaScope: { areaIds: ["kangra"], centreSlugs: [] } });
  });

  it("enforces same-origin, JSON-only and body size on writes", async () => {
    await staffUser("couns.a", { crmRole: "counsellor", centreSlugs: ["shimla"] });
    const { leadId } = lead1("9876500021", "shimla");
    const b = await signedIn("couns.a", "staff");
    expect((await api.note(b, leadId, { body: "x" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await api.note(b, leadId, "body=x", { contentType: "text/plain" })).status).toBe(415);
    expect((await api.note(b, leadId, { body: "x".repeat(9000) })).status).toBe(413);
    expect((await api.note(b, leadId, { body: "x", extra: true })).status).toBe(422);
    expect((await api.create(b, { source: "walk_in", phone: "9876500022", consent: false })).status).toBe(422);
  });

  it("rate-limits writes per user", async () => {
    await staffUser("couns.a", { crmRole: "counsellor", centreSlugs: ["shimla"] });
    const { leadId } = lead1("9876500031", "shimla");
    const b = await signedIn("couns.a", "staff");
    const statuses: number[] = [];
    for (let i = 0; i < 121; i += 1) statuses.push((await api.note(b, leadId, { body: `n${i}` })).status);
    expect(statuses.slice(0, 120).every((status) => status === 201)).toBe(true);
    const limited = await api.note(b, leadId, { body: "one more" });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("staff accounts via /api/admin/users", () => {
  it("creates a staff account with its CRM membership, lists it, and the account lands on Today's calls", async () => {
    const adminRecord = await createTestUser({ role: "admin", loginId: "admin.one", password: PASSWORD });
    const ba = await signedIn("admin.one", "admin");
    const created = await ba.send(adminUsers.POST, "/api/admin/users", {
      body: { role: "staff", displayName: "Centre Manager", loginId: "mgr.shimla", crm: { crmRole: "manager", centreSlugs: ["shimla"] } },
    });
    expect(created.status).toBe(201);
    const { user, temporaryPassword } = (await created.json()).data;
    expect(user).toMatchObject({ role: "staff", crm: { crmRole: "manager", centreSlugs: ["shimla"], active: true } });

    const listed = (await (await ba.send(adminUsers.GET, "/api/admin/users?role=staff")).json()).data;
    expect(listed).toHaveLength(1);
    expect(listed[0].crm).toMatchObject({ crmRole: "manager" });
    const one = (await (await ba.send(adminUser.GET, `/api/admin/users/${user.id}`, {}, params({ userId: user.id }))).json()).data;
    expect(one.crm.centreSlugs).toEqual(["shimla"]);

    // A staff login must name its CRM role (admin console 1b §5.L). CRM settings on other roles are refused.
    const plain = await ba.send(adminUsers.POST, "/api/admin/users", { body: { role: "staff", displayName: "Counsellor", loginId: "couns.new" } });
    expect(plain.status).toBe(422);
    expect((await plain.json()).fieldErrors).toEqual({ crm: ["Choose the CRM role."] });
    const wrong = await ba.send(adminUsers.POST, "/api/admin/users", {
      body: { role: "student", displayName: "Learner", loginId: "learner.x", crm: { crmRole: "manager" } },
    });
    expect(wrong.status).toBe(422);
    const badScope = await ba.send(adminUsers.POST, "/api/admin/users", {
      body: { role: "staff", displayName: "Bad", loginId: "bad.scope", crm: { crmRole: "manager", centreSlugs: ["Not A Slug!"] } },
    });
    expect(badScope.status).toBe(422);
    // Lead routing: unknown areas are a 422 (never a 500), and nothing is created (P2).
    const badArea = await ba.send(adminUsers.POST, "/api/admin/users", {
      body: { role: "staff", displayName: "No Area", loginId: "no.area", crm: { crmRole: "counsellor", areaIds: ["nowhere"] } },
    });
    expect(badArea.status).toBe(422);
    expect((await badArea.json()).fieldErrors).toHaveProperty(["crm.areaIds"]);
    expect((await (await ba.send(adminUsers.GET, "/api/admin/users?role=staff")).json()).data.map((u: { loginId: string }) => u.loginId)).not.toContain("no.area");
    // `crm.areaIds: []` still reaches the seam (an explicit `areas` scope: assigned leads only, §13.5);
    // a body without `areaIds` (the legacy form) never does.
    vi.mocked(setUserAreas).mockClear();
    const noAreas = await ba.send(adminUsers.POST, "/api/admin/users", {
      body: { role: "staff", displayName: "Head None", loginId: "head.none", crm: { crmRole: "manager", areaIds: [] } },
    });
    expect(noAreas.status).toBe(201);
    const noAreasId = (await noAreas.json()).data.user.id;
    expect(setUserAreas).toHaveBeenCalledTimes(1);
    expect(setUserAreas).toHaveBeenCalledWith(expect.anything(), noAreasId, [], expect.objectContaining({ actorId: adminRecord.id }));
    const legacyForm = await ba.send(adminUsers.POST, "/api/admin/users", { body: { role: "staff", displayName: "Legacy", loginId: "legacy.form", crm: { crmRole: "manager" } } });
    expect(legacyForm.status).toBe(201);
    expect(setUserAreas).toHaveBeenCalledTimes(1);

    const audit = listAudit(getDb(), { limit: 50 });
    expect(audit.find((e) => e.action === "crm.staff_upsert" && e.target === user.id)).toMatchObject({
      actorId: adminRecord.id,
      details: { crmRole: "manager", centres: "shimla", active: true },
    });

    // The new staff member signs in on the Staff tab, changes the temporary password, lands on their
    // role home (/crm/home answers 307 to the right page; admin console 1b §5.A).
    const bs = browser();
    const signIn = await bs.send(login.POST, "/api/auth/login", {
      body: { loginId: "mgr.shimla", password: temporaryPassword, role: "staff", next: "/admin" },
    });
    expect((await signIn.json()).data).toMatchObject({ role: "staff", redirectTo: "/crm/home", mustChangePassword: true });
    expect((await api.me(bs)).status).toBe(403); // temporary password pending
    await bs.send(changePassword.POST, "/api/auth/change-password", {
      body: { currentPassword: temporaryPassword, newPassword: "manager-own-password-1" },
    });
    expect((await api.me(bs)).status).toBe(200);

    // The Admin tab also accepts staff accounts; student / parent tabs do not.
    const viaAdminTab = await browser().send(login.POST, "/api/auth/login", {
      body: { loginId: "mgr.shimla", password: "manager-own-password-1", role: "admin", next: "/crm/leads" },
    });
    expect((await viaAdminTab.json()).data).toMatchObject({ role: "staff", redirectTo: "/crm/leads" });
    const viaStudentTab = await browser().send(login.POST, "/api/auth/login", {
      body: { loginId: "mgr.shimla", password: "manager-own-password-1", role: "student" },
    });
    expect(viaStudentTab.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------------------------
// Admin console Phase 1b (docs/admin-phase-1b-plan.md §4.3, §5.A).

describe("admin console 1b: inbox filters and the role home", () => {
  it("GET /api/crm/leads accepts contact=none, signups=hide and created=…; other values are ignored", async () => {
    await createTestUser({ role: "admin", loginId: "admin.one", password: PASSWORD });
    lead1("9876500041", "shimla");
    const called = lead1("9876500042", "shimla");
    const ba = await signedIn("admin.one", "admin");
    expect((await api.contact(ba, called.leadId, { channel: "call", outcome: "busy" })).status).toBe(201);
    const total = async (query: string) => {
      const response = await api.list(ba, query);
      expect(response.status, query).toBe(200);
      return (await response.json()).data.total as number;
    };
    expect(await total("")).toBe(2);
    expect(await total("?contact=none")).toBe(1);
    expect(await total("?signups=hide")).toBe(2);
    expect(await total("?created=week")).toBe(2);
    expect(await total("?created=over24h")).toBe(0);
    expect(await total("?stage=new&contact=none&signups=hide&created=over24h")).toBe(0);
    expect(await total("?centre=shimla&contact=none")).toBe(1);
    expect(await total("?contact=all&signups=show&created=yesterday")).toBe(2);
  });

  it("GET /[lang]/crm/home answers 307 to each role's home, in the page's language", async () => {
    await createTestUser({ role: "admin", loginId: "admin.one", password: PASSWORD });
    await createTestUser({ role: "admin", loginId: "admin.temp", password: PASSWORD, mustChangePassword: true });
    await staffUser("mgr.one", { crmRole: "manager" });
    await staffUser("couns.one", { crmRole: "counsellor" });
    const qbOnly = await staffUser("qb.only", null);
    await staffUser("staff.bare", null);
    getDb()
      .prepare("INSERT INTO qb_members (user_id, qb_role, subjects, active, created_at, updated_at) VALUES (?, 'author', '[]', 1, ?, ?)")
      .run(qbOnly.id, Date.now(), Date.now());

    const home = async (b: Browser, lang: "en" | "hi" = "en") => {
      const response = await b.send(crmHome.GET, `/${lang}/crm/home`, {}, params({ lang }));
      expect(response.status).toBe(307);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      return response.headers.get("location");
    };
    expect(await home(browser())).toBe("/login?next=%2Fcrm%2Fhome");
    expect(await home(browser(), "hi")).toBe("/hi/login?next=%2Fcrm%2Fhome");
    expect(await home(await signedIn("admin.one", "admin"))).toBe("/admin");
    expect(await home(await signedIn("admin.one", "admin"), "hi")).toBe("/hi/admin");
    expect(await home(await signedIn("mgr.one", "staff"))).toBe("/crm/dashboard");
    expect(await home(await signedIn("couns.one", "staff"), "hi")).toBe("/hi/crm/today");
    expect(await home(await signedIn("qb.only", "staff"))).toBe("/admin/questions");
    expect(await home(await signedIn("staff.bare", "staff"))).toBe("/crm");
    expect(await home(await signedIn("admin.temp", "admin"))).toBe("/account/password?next=%2Fcrm%2Fhome");
  });
});

describe("prerender bail-outs (Cache Components)", () => {
  it.each(["HANGING_PROMISE_REJECTION", "DYNAMIC_SERVER_USAGE", "NEXT_PRERENDER_INTERRUPTED"])(
    "every CRM GET re-throws %s untouched and logs nothing",
    async (digest) => {
      const { connection } = await import("next/server");
      const calls: ((b: Browser) => Promise<Response>)[] = [
        (b) => api.me(b),
        (b) => api.list(b),
        (b) => api.get(b, "lead-1"),
        (b) => api.tasks(b),
        (b) => api.reports(b),
        (b) => api.export(b),
        (b) => api.staff(b),
        (b) => api.rules(b),
      ];
      for (const call of calls) {
        const bailout = Object.assign(new Error(`simulated ${digest}`), { digest });
        vi.mocked(connection).mockRejectedValueOnce(bailout);
        const b = browser();
        b.jar.set("aspire_session", "x".repeat(43));
        await expect(call(b)).rejects.toBe(bailout);
      }
      for (const level of ["info", "warn", "error"] as const) expect(console[level]).not.toHaveBeenCalled();
    },
  );
});
