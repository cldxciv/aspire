import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Admin user-management APIs against a fresh in-memory database per test.
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
const { findUserById } = await import("@/lib/db/users");
const { upsertGrant } = await import("@/lib/db/super-admins");
const { ensureSuperAdminBootstrap } = await import("@/lib/auth/super-admin");
const { ensureAreasSeeded } = await import("@/lib/crm/routing/seed");
const { setAvailability } = await import("@/lib/crm/repo/staff-ops");
const { captureLead } = await import("@/lib/crm/capture");
const { CRM_ROLE_REQUIRED_MESSAGE } = await import("@/lib/console/people-types");
const { AUTH_MESSAGES } = await import("@/lib/auth/messages");
const { createTestUser, params, TestBrowser } = await import("@/lib/auth/testing/harness");
const login = await import("@/app/api/auth/login/route");
const me = await import("@/app/api/auth/me/route");
const changePassword = await import("@/app/api/auth/change-password/route");
const users = await import("./route");
const userById = await import("./[userId]/route");
const resetPassword = await import("./[userId]/reset-password/route");
const links = await import("./[userId]/links/[studentId]/route");
const audit = await import("../audit/route");
const parentStudents = await import("@/app/api/parent/students/route");
const parentStudent = await import("@/app/api/parent/students/[studentId]/route");

type Browser = InstanceType<typeof TestBrowser>;

// Synthetic accounts only.
const ADMIN = { role: "admin" as const, loginId: "admin.one", password: "admin-pass-2026" };

let ipCounter = 0;
function browser() {
  ipCounter += 1;
  return new TestBrowser(cookieState, `198.18.0.${ipCounter % 250}`);
}

async function signedIn(credentials: { loginId: string; password: string }): Promise<Browser> {
  const b = browser();
  const response = await b.send(login.POST, "/api/auth/login", { body: credentials });
  expect(response.status).toBe(200);
  return b;
}

async function asAdmin(): Promise<{ b: Browser; adminId: string }> {
  const admin = await createTestUser(ADMIN);
  return { b: await signedIn(ADMIN), adminId: admin.id };
}

const api = {
  list: (b: Browser, query = "") => b.send(users.GET, `/api/admin/users${query}`),
  create: (b: Browser, body: unknown, options = {}) => b.send(users.POST, "/api/admin/users", { body, ...options }),
  get: (b: Browser, userId: string) => b.send(userById.GET, `/api/admin/users/${userId}`, {}, params({ userId })),
  patch: (b: Browser, userId: string, body: unknown, options = {}) =>
    b.send(userById.PATCH, `/api/admin/users/${userId}`, { method: "PATCH", body, ...options }, params({ userId })),
  reset: (b: Browser, userId: string, options = {}) =>
    b.send(resetPassword.POST, `/api/admin/users/${userId}/reset-password`, { method: "POST", ...options }, params({ userId })),
  link: (b: Browser, userId: string, studentId: string, options = {}) =>
    b.send(links.PUT, `/api/admin/users/${userId}/links/${studentId}`, { method: "PUT", ...options }, params({ userId, studentId })),
  unlink: (b: Browser, userId: string, studentId: string, options = {}) =>
    b.send(links.DELETE, `/api/admin/users/${userId}/links/${studentId}`, { method: "DELETE", ...options }, params({ userId, studentId })),
  audit: (b: Browser, query = "") => b.send(audit.GET, `/api/admin/audit${query}`),
};

async function createUser(b: Browser, body: { role: string; displayName: string; loginId: string }) {
  const response = await api.create(b, body);
  expect(response.status).toBe(201);
  return (await response.json()).data as { user: { id: string; loginId: string }; temporaryPassword: string };
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("access control", () => {
  const someId = "00000000-0000-4000-8000-000000000000";
  const calls = (b: Browser) => [
    api.list(b),
    api.create(b, { role: "student", displayName: "X", loginId: "x.user" }),
    api.get(b, someId),
    api.patch(b, someId, { disabled: true }),
    api.reset(b, someId),
    api.link(b, someId, someId),
    api.unlink(b, someId, someId),
    api.audit(b),
  ];

  it("requires a session (401 for every endpoint)", async () => {
    for (const response of await Promise.all(calls(browser()))) {
      expect(response.status).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("forbids students and parents (403 for every endpoint)", async () => {
    await createTestUser({ role: "student", loginId: "learner.one", password: "learner-pass-2026" });
    await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-2026" });
    for (const credentials of [
      { loginId: "learner.one", password: "learner-pass-2026" },
      { loginId: "parent.one", password: "parent-pass-2026" },
    ]) {
      const b = await signedIn(credentials);
      for (const response of await Promise.all(calls(b))) expect(response.status).toBe(403);
    }
  });

  it("forbids an admin who still has a temporary password", async () => {
    await createTestUser({ ...ADMIN, mustChangePassword: true });
    const b = await signedIn(ADMIN);
    const response = await api.list(b);
    expect(response.status).toBe(403);
    expect((await response.json()).message).toMatch(/temporary password/);
  });

  it("refuses cross-origin writes even from an admin", async () => {
    const { b, adminId } = await asAdmin();
    const evil = { origin: "https://evil.example" };
    expect((await api.create(b, { role: "student", displayName: "X", loginId: "x.user" }, evil)).status).toBe(403);
    expect((await api.patch(b, adminId, { displayName: "Renamed" }, evil)).status).toBe(403);
    expect((await api.reset(b, adminId, evil)).status).toBe(403);
    expect((await api.link(b, adminId, adminId, evil)).status).toBe(403);
    expect(listAudit(getDb(), { limit: 50 }).filter((e) => e.action.startsWith("admin."))).toEqual([]);
  });
});

describe("create and list users", () => {
  it("creates a user with a temporary password the user must change", async () => {
    const { b, adminId } = await asAdmin();
    const { user, temporaryPassword } = await createUser(b, {
      role: "student",
      displayName: "  Asha   Verma ",
      loginId: " Asha.Verma ",
    });
    expect(user).toMatchObject({ role: "student", displayName: "Asha Verma", loginId: "asha.verma", mustChangePassword: true });
    expect(temporaryPassword).toMatch(/^[\w]{4}(-[\w]{4}){3}$/);

    // Only a hash is stored; listings never include it or the temporary password.
    const stored = findUserById(getDb(), user.id)!;
    expect(stored.passwordHash.startsWith("scrypt$")).toBe(true);
    const listing = await (await api.list(b)).text();
    expect(listing).not.toContain(temporaryPassword);
    expect(listing).not.toContain("scrypt$");
    expect(JSON.parse(listing).data.map((u: { loginId: string }) => u.loginId)).toEqual(["admin.one", "asha.verma"]);
    expect((await (await api.list(b, "?role=student")).json()).data).toHaveLength(1);
    expect((await api.list(b, "?role=superuser")).status).toBe(400);
    expect((await (await api.get(b, user.id)).json()).data.loginId).toBe("asha.verma");

    // The new user can sign in, is told to change the password, and is held back until they do.
    const learner = browser();
    const signIn = await learner.send(login.POST, "/api/auth/login", { body: { loginId: "asha.verma", password: temporaryPassword } });
    expect((await signIn.json()).data.mustChangePassword).toBe(true);
    const changed = await learner.send(changePassword.POST, "/api/auth/change-password", {
      body: { currentPassword: temporaryPassword, newPassword: "asha-own-password-1" },
    });
    expect(changed.status).toBe(200);

    const entry = listAudit(getDb(), { limit: 50 }).find((e) => e.action === "admin.user_create");
    expect(entry).toMatchObject({ actorId: adminId, target: user.id, details: { role: "student", loginId: "asha.verma" } });
  });

  it("rejects duplicate or invalid login ids and bad bodies with 422", async () => {
    const { b } = await asAdmin();
    await createUser(b, { role: "parent", displayName: "Parent", loginId: "parent.one" });
    const fieldErrors = async (body: unknown) => {
      const response = await api.create(b, body);
      expect(response.status).toBe(422);
      return (await response.json()).fieldErrors;
    };
    expect(await fieldErrors({ role: "parent", displayName: "Again", loginId: "PARENT.ONE" })).toEqual({
      loginId: [AUTH_MESSAGES.loginIdTaken],
    });
    expect(await fieldErrors({ role: "parent", displayName: "Bad", loginId: "a b" })).toHaveProperty("loginId");
    expect(await fieldErrors({ role: "parent", displayName: "Bad", loginId: "ab" })).toHaveProperty("loginId");
    expect(await fieldErrors({ role: "teacher", displayName: "Bad", loginId: "ok.user" })).toHaveProperty("role");
    expect(await fieldErrors({ role: "parent", displayName: "x".repeat(101), loginId: "ok.user" })).toHaveProperty("displayName");
  });
});

describe("disable / enable", () => {
  it("disabling signs the user out everywhere and blocks sign-in; enabling restores it", async () => {
    const { b, adminId } = await asAdmin();
    const learner = await createTestUser({ role: "student", loginId: "learner.one", password: "learner-pass-2026" });
    const learnerBrowser = await signedIn({ loginId: "learner.one", password: "learner-pass-2026" });

    const response = await api.patch(b, learner.id, { disabled: true });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ user: { disabled: true }, signedOutSessions: 1 });
    expect((await learnerBrowser.send(me.GET, "/api/auth/me")).status).toBe(401);
    const blocked = await browser().send(login.POST, "/api/auth/login", {
      body: { loginId: "learner.one", password: "learner-pass-2026" },
    });
    expect(blocked.status).toBe(401);
    expect((await blocked.json()).message).toBe(AUTH_MESSAGES.loginFailed);

    expect((await api.patch(b, learner.id, { disabled: false, displayName: "Learner Renamed" })).status).toBe(200);
    expect((await signedIn({ loginId: "learner.one", password: "learner-pass-2026" })).sessionToken).toBeDefined();
    expect(findUserById(getDb(), learner.id)?.displayName).toBe("Learner Renamed");

    const actions = listAudit(getDb(), { limit: 50, target: learner.id }).map((e) => [e.action, e.actorId]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ["admin.user_disable", adminId],
        ["admin.user_enable", adminId],
        ["admin.user_rename", adminId],
      ]),
    );
  });

  it("an admin cannot disable themselves, and the last super admin / active admin cannot be disabled", async () => {
    const { b, adminId } = await asAdmin();
    // The only admin is made super admin automatically (D-044); the last-super-admin rule comes first.
    const alone = await api.patch(b, adminId, { disabled: true });
    expect(alone.status).toBe(403);
    expect((await alone.json()).message).toBe(AUTH_MESSAGES.lastSuperAdmin);

    const second = await createTestUser({ role: "admin", loginId: "admin.two", password: "admin-two-pass-1" });
    const self = await api.patch(b, adminId, { disabled: true });
    expect(self.status).toBe(403);
    expect((await self.json()).message).toBe(AUTH_MESSAGES.lastSuperAdmin);

    // With a second super admin, the ordinary self-disable rule applies.
    upsertGrant(getDb(), { userId: second.id, via: "cli", by: null, now: Date.now() });
    const selfAgain = await api.patch(b, adminId, { disabled: true });
    expect(selfAgain.status).toBe(403);
    expect((await selfAgain.json()).message).toBe(AUTH_MESSAGES.selfDisable);

    // A super admin may disable the other super admin while one remains; afterwards admin.one is the last one again.
    expect((await api.patch(b, second.id, { disabled: true })).status).toBe(200);
    expect((await api.patch(b, adminId, { disabled: true })).status).toBe(403);
    expect(findUserById(getDb(), adminId)?.disabled).toBe(false);
  });

  it("an ordinary admin cannot rename, disable or reset a super admin, nor touch staff accounts (D-044, H1, Q7)", async () => {
    const { b: superAdmin, adminId } = await asAdmin();
    ensureSuperAdminBootstrap(getDb()); // the only admin becomes super admin (one-time bootstrap)
    await createTestUser({ role: "admin", loginId: "admin.two", password: "admin-two-pass-1" });
    const ordinary = await signedIn({ loginId: "admin.two", password: "admin-two-pass-1" });
    const staff = await createTestUser({ role: "staff", loginId: "staff.one", password: "staff-pass-2026" });

    for (const response of [await api.patch(ordinary, adminId, { disabled: true }), await api.patch(ordinary, adminId, { displayName: "Taken Over" }), await api.reset(ordinary, adminId)]) {
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe(AUTH_MESSAGES.superAdminTarget);
    }
    for (const response of [await api.patch(ordinary, staff.id, { disabled: true }), await api.reset(ordinary, staff.id)]) {
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe(AUTH_MESSAGES.staffSuperAdminOnly);
    }
    const create = await api.create(ordinary, { role: "staff", displayName: "New Staff", loginId: "staff.two" });
    expect(create.status).toBe(403);
    expect((await create.json()).message).toBe(AUTH_MESSAGES.staffSuperAdminOnly);
    expect(findUserById(getDb(), adminId)?.displayName).not.toBe("Taken Over");

    // The super admin keeps doing all of it.
    expect((await api.reset(superAdmin, staff.id)).status).toBe(200);
    expect((await api.patch(superAdmin, staff.id, { disabled: true })).status).toBe(200);
    // Ordinary admins keep their work for students and parents.
    const learner = await createTestUser({ role: "student", loginId: "learner.two", password: "learner-pass-2026" });
    expect((await api.reset(ordinary, learner.id)).status).toBe(200);
  });

  it("404 for an unknown user, 400 for a malformed id, 422 for an empty change", async () => {
    const { b } = await asAdmin();
    expect((await api.patch(b, "00000000-0000-4000-8000-000000000000", { disabled: true })).status).toBe(404);
    expect((await api.patch(b, "../etc", { disabled: true })).status).toBe(400);
    expect((await api.patch(b, "00000000-0000-4000-8000-000000000000", {})).status).toBe(422);
  });
});

describe("reset password", () => {
  it("issues a new temporary password once, revokes sessions and requires a change", async () => {
    const { b, adminId } = await asAdmin();
    const parent = await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-2026" });
    const parentBrowser = await signedIn({ loginId: "parent.one", password: "parent-pass-2026" });

    const response = await api.reset(b, parent.id);
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ user: { id: parent.id, mustChangePassword: true }, signedOutSessions: 1 });
    expect(typeof data.temporaryPassword).toBe("string");

    expect((await parentBrowser.send(me.GET, "/api/auth/me")).status).toBe(401);
    const old = await browser().send(login.POST, "/api/auth/login", { body: { loginId: "parent.one", password: "parent-pass-2026" } });
    expect(old.status).toBe(401);
    const fresh = await browser().send(login.POST, "/api/auth/login", {
      body: { loginId: "parent.one", password: data.temporaryPassword },
    });
    expect((await fresh.json()).data.mustChangePassword).toBe(true);

    const entry = listAudit(getDb(), { limit: 10, target: parent.id }).find((e) => e.action === "admin.password_reset");
    expect(entry).toMatchObject({ actorId: adminId, details: { revokedSessions: 1 } });
    expect(JSON.stringify(listAudit(getDb(), { limit: 100 }))).not.toContain(data.temporaryPassword);
  });

  it("lifts a sign-in lockout", async () => {
    const { b } = await asAdmin();
    const learner = await createTestUser({ role: "student", loginId: "learner.one", password: "learner-pass-2026" });
    for (let i = 0; i < 5; i += 1) {
      await browser().send(login.POST, "/api/auth/login", { body: { loginId: "learner.one", password: `wrong-${i}-pass` } });
    }
    const { data } = await (await api.reset(b, learner.id)).json();
    const response = await browser().send(login.POST, "/api/auth/login", {
      body: { loginId: "learner.one", password: data.temporaryPassword },
    });
    expect(response.status).toBe(200);
  }, 30_000);

  it("refuses an admin's own reset (403) and unknown users (404)", async () => {
    const { b, adminId } = await asAdmin();
    const self = await api.reset(b, adminId);
    expect(self.status).toBe(403);
    expect((await self.json()).message).toBe(AUTH_MESSAGES.selfReset);
    expect((await api.reset(b, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("parent ↔ student links and the parent record-level check", () => {
  it("links and unlinks, and the parent's access follows the links", async () => {
    const { b, adminId } = await asAdmin();
    const parent = await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-2026" });
    const kidA = await createTestUser({ role: "student", loginId: "kid.a", password: "kid-pass-aaaa", displayName: "Kid A" });
    const kidB = await createTestUser({ role: "student", loginId: "kid.b", password: "kid-pass-bbbb", displayName: "Kid B" });
    const parentBrowser = await signedIn({ loginId: "parent.one", password: "parent-pass-2026" });
    const getStudent = (studentId: string) =>
      parentBrowser.send(parentStudent.GET, `/api/parent/students/${studentId}`, {}, params({ studentId }));

    // No links yet: nothing listed, every record forbidden.
    expect((await (await parentBrowser.send(parentStudents.GET, "/api/parent/students")).json()).data).toEqual([]);
    expect((await getStudent(kidA.id)).status).toBe(403);

    const linked = await api.link(b, parent.id, kidA.id);
    expect(linked.status).toBe(200);
    expect((await linked.json()).data).toMatchObject({ linked: true, changed: true, parent: { linkedStudentIds: [kidA.id] } });
    expect((await (await api.link(b, parent.id, kidA.id)).json()).data.changed).toBe(false); // idempotent

    // Same session, new link: effective immediately (links are read per request).
    expect((await (await parentBrowser.send(parentStudents.GET, "/api/parent/students")).json()).data).toEqual([
      { id: kidA.id, displayName: "Kid A" },
    ]);
    const record = await getStudent(kidA.id);
    expect(record.status).toBe(200);
    expect((await record.json()).data).toEqual({
      id: kidA.id,
      displayName: "Kid A",
      notConnected: ["timetable", "results", "attendance"],
    });
    expect((await getStudent(kidB.id)).status).toBe(403);
    expect((await getStudent("../etc")).status).toBe(400);

    expect((await api.unlink(b, parent.id, kidA.id)).status).toBe(200);
    expect((await getStudent(kidA.id)).status).toBe(403);

    const actions = listAudit(getDb(), { limit: 10, target: parent.id })
      .filter((e) => e.action.startsWith("admin."))
      .map((e) => [e.action, e.actorId, e.details]);
    expect(actions).toEqual([
      ["admin.link_remove", adminId, { studentId: kidA.id }],
      ["admin.link_add", adminId, { studentId: kidA.id }],
    ]);
  });

  it("only links a parent account to a student account", async () => {
    const { b, adminId } = await asAdmin();
    const parent = await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-2026" });
    const kid = await createTestUser({ role: "student", loginId: "kid.a", password: "kid-pass-aaaa" });
    expect((await api.link(b, kid.id, parent.id)).status).toBe(422);
    expect((await api.link(b, parent.id, adminId)).status).toBe(422);
    expect((await api.link(b, parent.id, "00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});

describe("GET /api/admin/audit", () => {
  it("lists recent entries (newest first) without secrets, with a bounded limit", async () => {
    const { b } = await asAdmin();
    const { temporaryPassword } = await createUser(b, { role: "student", displayName: "Kid", loginId: "kid.one" });
    const response = await api.audit(b, "?limit=5");
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(temporaryPassword);
    expect(text).not.toContain("scrypt$");
    const entries = JSON.parse(text).data;
    expect(entries[0]).toMatchObject({ action: "admin.user_create" });
    expect(entries.map((e: { action: string }) => e.action)).toContain("auth.login");
    expect((await api.audit(b, "?limit=0")).status).toBe(400);
    expect((await api.audit(b, "?limit=500")).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------------------------
// Admin console 1b §5.L: the CRM role is required for staff logins; the list carries LR's facts.

describe("staff logins and the People list (admin console 1b)", () => {
  async function asSuperAdmin() {
    const signed = await asAdmin();
    ensureSuperAdminBootstrap(getDb()); // the only admin becomes super admin
    return signed;
  }

  it("a staff login without a CRM role is refused with a clear message, and nothing is created", async () => {
    const { b } = await asSuperAdmin();
    for (const crm of [undefined, {}, { areaIds: [] }, { centreSlugs: [] }]) {
      const response = await api.create(b, { role: "staff", displayName: "No Role", loginId: "no.role", ...(crm === undefined ? {} : { crm }) });
      expect(response.status, JSON.stringify(crm)).toBe(422);
      expect((await response.json()).fieldErrors).toEqual({ crm: [CRM_ROLE_REQUIRED_MESSAGE] });
    }
    expect(CRM_ROLE_REQUIRED_MESSAGE).toBe("Choose the CRM role.");
    const bad = await api.create(b, { role: "staff", displayName: "Bad Role", loginId: "bad.role", crm: { crmRole: "boss" } });
    expect(bad.status).toBe(422);
    const listed = (await (await api.list(b, "?role=staff")).json()).data as { loginId: string }[];
    expect(listed.map((u) => u.loginId)).toEqual([]);
    expect(listAudit(getDb(), { limit: 50 }).filter((e) => e.action === "admin.user_create")).toEqual([]);

    // With the role chosen it works, and no "counsellor, every centre" default is applied silently.
    const ok = await api.create(b, { role: "staff", displayName: "Area Head", loginId: "area.head", crm: { crmRole: "manager" } });
    expect(ok.status).toBe(201);
    expect((await ok.json()).data.user.crm).toMatchObject({ crmRole: "manager", centreSlugs: [], active: true });
  });

  it("the super-admin rule is unchanged: an ordinary admin still gets 403 before any role check", async () => {
    await asSuperAdmin();
    await createTestUser({ role: "admin", loginId: "admin.two", password: "admin-two-pass-1" });
    const ordinary = await signedIn({ loginId: "admin.two", password: "admin-two-pass-1" });
    for (const body of [
      { role: "staff", displayName: "New Staff", loginId: "staff.two" },
      { role: "staff", displayName: "New Staff", loginId: "staff.two", crm: { crmRole: "counsellor" } },
    ]) {
      const response = await api.create(ordinary, body);
      expect(response.status).toBe(403);
      expect((await response.json()).message).toBe(AUTH_MESSAGES.staffSuperAdminOnly);
    }
    // Other roles never need (or accept) CRM settings.
    expect((await api.create(ordinary, { role: "student", displayName: "Learner", loginId: "learner.x" })).status).toBe(201);
    expect((await api.create(ordinary, { role: "student", displayName: "Learner", loginId: "learner.y", crm: { crmRole: "manager" } })).status).toBe(422);
  });

  it("GET adds areas, away status and open enquiries to staff accounts only", async () => {
    const { b } = await asSuperAdmin();
    const now = Date.now();
    ensureAreasSeeded(getDb(), now);
    const created = await api.create(b, { role: "staff", displayName: "Hill Head", loginId: "hill.head", crm: { crmRole: "manager", areaIds: ["kangra", "chamba"] } });
    expect(created.status).toBe(201);
    const head = (await created.json()).data.user as { id: string; crm: Record<string, unknown> };
    // Areas come back in the areas' own order, with both names; nothing else yet.
    expect(head.crm).toMatchObject({ crmRole: "manager", active: true, awayUntil: null, openLeads: 0 });
    const areaIds = head.crm.areaIds as string[];
    expect([...areaIds].sort()).toEqual(["chamba", "kangra"]);
    const names = head.crm.areaNames as { id: string; en: string; hi: string; active: boolean }[];
    expect(names.map((area) => area.id)).toEqual(areaIds);
    for (const area of names) {
      expect(area.en).toMatch(/\S/);
      expect(area.hi).toMatch(/\S/);
      expect(area.active).toBe(true);
    }

    const plain = await createTestUser({ role: "staff", loginId: "no.membership", password: "staff-pass-2026" });
    // Away until a future time; open leads assigned to the head (lost and erased ones do not count).
    const until = now + 3 * 86_400_000;
    setAvailability(getDb(), { userId: head.id, awayUntil: until, note: null, actorId: null, now });
    const leadIds: string[] = [];
    for (const [index, phone] of ["9700000101", "9700000102", "9700000103", "9700000104"].entries()) {
      const result = captureLead({ source: "admissions", studentName: `Synthetic ${index}`, phone, consent: { textVersion: "2026-10-20.v2" } }, now);
      if (!result.ok) throw new Error(result.error);
      leadIds.push(result.leadId);
    }
    const db = getDb();
    for (const id of leadIds) db.prepare("UPDATE crm_leads SET assigned_to = ? WHERE id = ?").run(head.id, id);
    db.prepare("UPDATE crm_leads SET stage = 'lost' WHERE id = ?").run(leadIds[2]);
    db.prepare("UPDATE crm_leads SET erased_at = ? WHERE id = ?").run(now, leadIds[3]);

    const list = (await (await api.list(b)).json()).data as { id: string; role: string; crm?: Record<string, unknown> | null }[];
    const byId = new Map(list.map((u) => [u.id, u]));
    expect(byId.get(head.id)?.crm).toMatchObject({ awayUntil: new Date(until).toISOString(), openLeads: 2, areaIds });
    expect(byId.get(plain.id)?.crm).toBeNull();
    for (const account of list.filter((u) => u.role !== "staff")) expect(account).not.toHaveProperty("crm");
    // Only ids, names, counts and times: no family's phone number or name.
    const text = JSON.stringify(list);
    expect(text).not.toContain("9700000101");
    expect(text).not.toContain("Synthetic 0");

    // "Away" ends on its own once the time has passed.
    setAvailability(getDb(), { userId: head.id, awayUntil: now - 60_000, note: null, actorId: null, now: now - 120_000 });
    const after = (await (await api.list(b, "?role=staff")).json()).data as { id: string; crm: { awayUntil: string | null } | null }[];
    expect(after.find((u) => u.id === head.id)?.crm?.awayUntil).toBeNull();
  });
});
