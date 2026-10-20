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

  it("an admin cannot disable themselves, and the last active admin cannot be disabled", async () => {
    const { b, adminId } = await asAdmin();
    const alone = await api.patch(b, adminId, { disabled: true });
    expect(alone.status).toBe(403);
    expect((await alone.json()).message).toBe(AUTH_MESSAGES.lastAdmin);

    const second = await createTestUser({ role: "admin", loginId: "admin.two", password: "admin-two-pass-1" });
    const self = await api.patch(b, adminId, { disabled: true });
    expect(self.status).toBe(403);
    expect((await self.json()).message).toBe(AUTH_MESSAGES.selfDisable);

    // Disabling the other admin is fine; afterwards admin.one is the last one again.
    expect((await api.patch(b, second.id, { disabled: true })).status).toBe(200);
    expect((await api.patch(b, adminId, { disabled: true })).status).toBe(403);
    expect(findUserById(getDb(), adminId)?.disabled).toBe(false);
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
