import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// Route handlers for /api/auth/**, run against a fresh in-memory database per test.
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
const { findSessionByTokenHash } = await import("@/lib/db/sessions");
const { findUserById, setUserDisabled } = await import("@/lib/db/users");
const { hashSessionToken } = await import("@/lib/auth/sessions");
const { SIGN_IN_LIMITS } = await import("@/lib/auth/throttle");
const { AUTH_MESSAGES } = await import("@/lib/auth/messages");
const { createTestUser, linkTestParent, TestBrowser } = await import("@/lib/auth/testing/harness");
const login = await import("./login/route");
const logout = await import("./logout/route");
const me = await import("./me/route");
const changePassword = await import("./change-password/route");
const studentMe = await import("@/app/api/student/me/route");

// Synthetic accounts only.
const STUDENT = { loginId: "learner.one", password: "learner-pass-2026", role: "student" as const };
const PARENT = { loginId: "parent.one", password: "parent-pass-2026", role: "parent" as const };

let consoleSpies: MockInstance[] = [];

function browser(ip?: string) {
  return new TestBrowser(cookieState, ip);
}

function signIn(b: InstanceType<typeof TestBrowser>, body: Record<string, unknown>, options = {}) {
  return b.send(login.POST, "/api/auth/login", { body, ...options });
}

async function expectLoginFailed(response: Response) {
  expect(response.status).toBe(401);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.getSetCookie()).toEqual([]);
  expect(await response.json()).toEqual({ ok: false, error: "unauthenticated", message: AUTH_MESSAGES.loginFailed });
}

function loggedLines(): string[] {
  return consoleSpies.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")));
}

beforeEach(() => {
  vi.stubEnv("AUTH_DB_PATH", ":memory:");
  resetDatabaseForTests();
  consoleSpies = (["info", "warn", "error", "log"] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetDatabaseForTests();
});

describe("POST /api/auth/login", () => {
  it("signs in: 200 with role, name and redirect, plus a hardened session cookie", async () => {
    const user = await createTestUser({ ...STUDENT, displayName: "Learner One" });
    const b = browser();
    const response = await signIn(b, { loginId: "  Learner.One ", password: STUDENT.password });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: true,
      data: { role: "student", displayName: "Learner One", mustChangePassword: false, redirectTo: "/student" },
    });

    const [cookie] = response.headers.getSetCookie();
    expect(cookie).toMatch(/^aspire_session=[A-Za-z0-9_-]{43};/);
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; SameSite=lax/i);
    expect(cookie).toMatch(/; Path=\//);
    expect(cookie).toMatch(/; Max-Age=604800/);
    expect(cookie).not.toMatch(/; Secure/i); // not production

    // The database holds the token's SHA-256 only.
    const token = b.sessionToken!;
    expect(findSessionByTokenHash(getDb(), hashSessionToken(token))?.userId).toBe(user.id);
    expect(JSON.stringify(getDb().prepare("SELECT * FROM sessions").all())).not.toContain(token);
  });

  it("marks the cookie Secure in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await createTestUser(STUDENT);
    const response = await signIn(browser(), { loginId: STUDENT.loginId, password: STUDENT.password });
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie()[0]).toMatch(/; Secure/i);
  });

  it("gives the same generic 401 for a wrong password, an unknown user, a disabled account and a role mismatch", async () => {
    await createTestUser(STUDENT);
    const disabled = await createTestUser({ role: "student", loginId: "learner.gone", password: "learner-pass-gone" });
    setUserDisabled(getDb(), disabled.id, true, Date.now());

    await expectLoginFailed(await signIn(browser("198.51.100.1"), { loginId: STUDENT.loginId, password: "wrong-password-1" }));
    await expectLoginFailed(await signIn(browser("198.51.100.2"), { loginId: "no.such.user", password: STUDENT.password }));
    await expectLoginFailed(await signIn(browser("198.51.100.3"), { loginId: "learner.gone", password: "learner-pass-gone" }));
    await expectLoginFailed(
      await signIn(browser("198.51.100.4"), { ...STUDENT, role: "parent" }), // right password, wrong tab
    );
    // The matching tab works.
    expect((await signIn(browser("198.51.100.5"), { ...STUDENT, role: "student" })).status).toBe(200);
  });

  it("does the same scrypt work for unknown users (no fast path)", async () => {
    await createTestUser(STUDENT);
    const time = async (body: Record<string, unknown>, ip: string) => {
      const start = performance.now();
      await signIn(browser(ip), body);
      return performance.now() - start;
    };
    await time({ loginId: "warm.up", password: "warm-up-password" }, "198.51.100.9"); // builds the dummy hash once
    const known = await time({ loginId: STUDENT.loginId, password: "wrong-password-1" }, "198.51.100.10");
    const unknown = await time({ loginId: "no.such.user", password: "wrong-password-1" }, "198.51.100.11");
    // Both paths run one full verification; allow generous jitter, but no order-of-magnitude gap.
    expect(unknown).toBeGreaterThan(known / 4);
  });

  it("locks a login id after 5 failures in 10 minutes, even for the right password, and for unknown ids too", async () => {
    await createTestUser(STUDENT);
    for (let i = 0; i < SIGN_IN_LIMITS.perLoginId; i += 1) {
      await expectLoginFailed(await signIn(browser(`198.51.100.${20 + i}`), { loginId: STUDENT.loginId, password: `wrong-${i}-password` }));
    }
    const locked = await signIn(browser("198.51.100.99"), { loginId: STUDENT.loginId, password: STUDENT.password });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await locked.json()).toMatchObject({ ok: false, error: "rate_limited" });

    // Unknown ids are throttled identically, so a 429 reveals nothing about existence.
    for (let i = 0; i < SIGN_IN_LIMITS.perLoginId; i += 1) {
      await signIn(browser(`198.51.101.${i}`), { loginId: "ghost.user", password: `wrong-${i}-password` });
    }
    expect((await signIn(browser("198.51.101.99"), { loginId: "ghost.user", password: "x".repeat(12) })).status).toBe(429);
  }, 30_000);

  it("limits failures per client IP across login ids", async () => {
    const b = browser("192.0.2.77");
    for (let i = 0; i < SIGN_IN_LIMITS.perIp; i += 1) {
      await expectLoginFailed(await signIn(b, { loginId: `someone.${i}`, password: "wrong-password-x" }));
    }
    expect((await signIn(b, { loginId: "someone.else", password: "wrong-password-x" })).status).toBe(429);
    // Another IP is unaffected.
    await expectLoginFailed(await signIn(browser("192.0.2.78"), { loginId: "someone.else", password: "wrong-password-x" }));
  }, 30_000);

  it("clears a login id's failures after a successful sign-in", async () => {
    await createTestUser(STUDENT);
    for (let i = 0; i < SIGN_IN_LIMITS.perLoginId - 1; i += 1) {
      await signIn(browser(`198.51.102.${i}`), { loginId: STUDENT.loginId, password: `wrong-${i}-password` });
    }
    expect((await signIn(browser(), { loginId: STUDENT.loginId, password: STUDENT.password })).status).toBe(200);
    for (let i = 0; i < SIGN_IN_LIMITS.perLoginId - 1; i += 1) {
      await expectLoginFailed(await signIn(browser(`198.51.103.${i}`), { loginId: STUDENT.loginId, password: `again-${i}-wrong` }));
    }
    expect((await signIn(browser(), { loginId: STUDENT.loginId, password: STUDENT.password })).status).toBe(200);
  }, 30_000);

  it.each([
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["Origin: null", { origin: "null" }],
    ["no Origin and no Sec-Fetch-Site", { origin: null }],
    ["Sec-Fetch-Site: cross-site", { headers: { "sec-fetch-site": "cross-site" } }],
  ])("refuses %s with 403 before checking credentials", async (_label, options) => {
    await createTestUser(STUDENT);
    const response = await signIn(browser(), { loginId: STUDENT.loginId, password: STUDENT.password }, options);
    expect(response.status).toBe(403);
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(await response.json()).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("rejects non-JSON (415), oversized (413), malformed (400) and incomplete (422) bodies", async () => {
    const b = browser();
    const send = (options: Parameters<typeof b.send>[2]) => b.send(login.POST, "/api/auth/login", options);
    expect((await send({ body: "loginId=a&password=b", contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await send({ body: { loginId: "a", password: "b".repeat(5000) } })).status).toBe(413);
    expect((await send({ body: "{not json" })).status).toBe(400);
    expect((await send({ body: "[1,2]" })).status).toBe(400);
    const incomplete = await send({ body: { loginId: " " } });
    expect(incomplete.status).toBe(422);
    expect((await incomplete.json()).fieldErrors).toMatchObject({
      loginId: ["Enter your login ID."],
      password: ["Enter your password."],
    });
    expect((await send({ body: { loginId: "a.b", password: "c", role: "superuser" } })).status).toBe(422);
  });

  it("honours `next` only inside the user's own portal", async () => {
    await createTestUser(STUDENT);
    const redirect = async (next: string) =>
      (await (await signIn(browser(), { ...STUDENT, next })).json()).data.redirectTo;
    expect(await redirect("/student/timetable")).toBe("/student/timetable");
    expect(await redirect("/admin")).toBe("/student");
    expect(await redirect("https://evil.example/student")).toBe("/student");
    expect(await redirect("//evil.example")).toBe("/student");
  });

  it("rotates the session: signing in again revokes the browser's previous session", async () => {
    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    const first = b.sessionToken!;
    await signIn(b, STUDENT);
    const second = b.sessionToken!;
    expect(second).not.toBe(first);
    expect(findSessionByTokenHash(getDb(), hashSessionToken(first))).toBeNull();
    expect(findSessionByTokenHash(getDb(), hashSessionToken(second))).not.toBeNull();
  });

  it("reports mustChangePassword for a temporary password", async () => {
    await createTestUser({ ...STUDENT, mustChangePassword: true });
    const body = await (await signIn(browser(), STUDENT)).json();
    expect(body.data.mustChangePassword).toBe(true);
  });
});

describe("POST /api/auth/logout", () => {
  it("deletes the session row and expires the cookie", async () => {
    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    const token = b.sessionToken!;

    const response = await b.send(logout.POST, "/api/auth/logout", { method: "POST" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { signedOut: true } });
    expect(response.headers.getSetCookie()[0]).toMatch(/^aspire_session=;.*Max-Age=0/);
    expect(b.sessionToken).toBeUndefined();
    expect(findSessionByTokenHash(getDb(), hashSessionToken(token))).toBeNull();

    // Replaying the old cookie no longer works.
    b.jar.set("aspire_session", token);
    expect((await b.send(me.GET, "/api/auth/me")).status).toBe(401);
  });

  it("is idempotent for signed-out callers and refuses cross-origin requests", async () => {
    expect((await browser().send(logout.POST, "/api/auth/logout", { method: "POST" })).status).toBe(200);

    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    const response = await b.send(logout.POST, "/api/auth/logout", { method: "POST", origin: "https://evil.example" });
    expect(response.status).toBe(403);
    expect((await b.send(me.GET, "/api/auth/me")).status).toBe(200); // still signed in
  });
});

describe("GET /api/auth/me", () => {
  it("401 when signed out (and clears a stale cookie)", async () => {
    const b = browser();
    expect((await b.send(me.GET, "/api/auth/me")).status).toBe(401);
    b.jar.set("aspire_session", "C".repeat(43));
    const response = await b.send(me.GET, "/api/auth/me");
    expect(response.status).toBe(401);
    expect(response.headers.getSetCookie()[0]).toMatch(/Max-Age=0/);
  });

  it("returns the account (parents: linked learners' names) and never a hash", async () => {
    const parent = await createTestUser({ ...PARENT, displayName: "Parent One" });
    const kid = await createTestUser({ role: "student", loginId: "kid.one", password: "kid-pass-2026", displayName: "Kid One" });
    linkTestParent(parent.id, kid.id);
    const b = browser();
    await signIn(b, PARENT);

    const response = await b.send(me.GET, "/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.data).toMatchObject({
      id: parent.id,
      role: "parent",
      displayName: "Parent One",
      loginId: "parent.one",
      mustChangePassword: false,
      linkedStudents: [{ id: kid.id, displayName: "Kid One" }],
    });
    expect(typeof body.data.sessionExpiresAt).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/scrypt|password_hash|passwordHash/);
  });
});

describe("POST /api/auth/change-password", () => {
  const send = (b: InstanceType<typeof TestBrowser>, body: unknown, options = {}) =>
    b.send(changePassword.POST, "/api/auth/change-password", { body, ...options });

  it("requires a session and the same origin", async () => {
    expect((await send(browser(), { currentPassword: "a", newPassword: "b" })).status).toBe(401);
    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    expect(
      (await send(b, { currentPassword: STUDENT.password, newPassword: "new-password-2026" }, { origin: "https://evil.example" }))
        .status,
    ).toBe(403);
  });

  it("checks the current password and the policy", async () => {
    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    const fieldErrors = async (body: unknown) => {
      const response = await send(b, body);
      expect(response.status).toBe(422);
      return (await response.json()).fieldErrors;
    };
    expect(await fieldErrors({ currentPassword: "not-my-password", newPassword: "new-password-2026" })).toEqual({
      currentPassword: [AUTH_MESSAGES.wrongCurrentPassword],
    });
    expect(await fieldErrors({ currentPassword: STUDENT.password, newPassword: "short" })).toHaveProperty("newPassword");
    expect(await fieldErrors({ currentPassword: STUDENT.password, newPassword: "x".repeat(129) })).toHaveProperty("newPassword");
    expect(await fieldErrors({ currentPassword: STUDENT.password, newPassword: "LEARNER.ONE" })).toHaveProperty("newPassword");
    expect(await fieldErrors({ currentPassword: STUDENT.password, newPassword: STUDENT.password })).toEqual({
      newPassword: [AUTH_MESSAGES.samePassword],
    });
  });

  it("changes the password, clears the temporary flag and signs out every other session", async () => {
    const user = await createTestUser({ ...STUDENT, mustChangePassword: true });
    const laptop = browser("203.0.113.1");
    const phone = browser("203.0.113.2");
    await signIn(laptop, STUDENT);
    await signIn(phone, STUDENT);

    // While the temporary password is unchanged, portal data is refused.
    const blocked = await laptop.send(studentMe.GET, "/api/student/me");
    expect(blocked.status).toBe(403);

    const response = await send(laptop, { currentPassword: STUDENT.password, newPassword: "brand-new-pass-2026" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { passwordChanged: true, otherSessionsSignedOut: 1 } });
    expect(findUserById(getDb(), user.id)?.mustChangePassword).toBe(false);

    expect((await laptop.send(me.GET, "/api/auth/me")).status).toBe(200);
    expect((await phone.send(me.GET, "/api/auth/me")).status).toBe(401);
    expect((await laptop.send(studentMe.GET, "/api/student/me")).status).toBe(200);

    await expectLoginFailed(await signIn(browser("203.0.113.3"), STUDENT));
    expect((await signIn(browser("203.0.113.4"), { loginId: STUDENT.loginId, password: "brand-new-pass-2026" })).status).toBe(200);
  });

  it("throttles wrong current passwords (5 per 10 minutes)", async () => {
    await createTestUser(STUDENT);
    const b = browser();
    await signIn(b, STUDENT);
    for (let i = 0; i < 5; i += 1) {
      expect((await send(b, { currentPassword: `wrong-${i}-password`, newPassword: "new-password-2026" })).status).toBe(422);
    }
    expect((await send(b, { currentPassword: STUDENT.password, newPassword: "new-password-2026" })).status).toBe(429);
  }, 30_000);
});

describe("no secrets in responses or logs", () => {
  it("never echoes a password, hash or token in any body or log line", async () => {
    const user = await createTestUser(STUDENT);
    const storedHash = findUserById(getDb(), user.id)!.passwordHash;
    const b = browser();
    const bodies: string[] = [];
    const record = async (response: Response) => {
      bodies.push(await response.clone().text());
      return response;
    };

    await record(await signIn(b, { loginId: STUDENT.loginId, password: "wrong-password-secret" }));
    await record(await signIn(b, { loginId: "unknown.person", password: "unknown-password-secret" }));
    await record(await signIn(b, STUDENT));
    const token = b.sessionToken!;
    await record(await b.send(me.GET, "/api/auth/me"));
    await record(await send(b, { currentPassword: "wrong-current-secret", newPassword: "next-password-secret" }));
    await record(await send(b, { currentPassword: STUDENT.password, newPassword: "next-password-secret" }));
    await record(await b.send(logout.POST, "/api/auth/logout", { method: "POST" }));

    const haystack = [...bodies, ...loggedLines()].join("\n");
    expect(loggedLines().length).toBeGreaterThan(0);
    for (const secret of [
      STUDENT.password,
      "wrong-password-secret",
      "unknown-password-secret",
      "wrong-current-secret",
      "next-password-secret",
      storedHash,
      token,
      hashSessionToken(token),
    ]) {
      expect(haystack).not.toContain(secret);
    }
    expect(haystack).not.toContain("scrypt$");
    // Log lines carry no login ids or IPs either.
    expect(loggedLines().join("\n")).not.toMatch(/learner\.one|unknown\.person|203\.0\.113/);
  });

  function send(b: InstanceType<typeof TestBrowser>, body: unknown) {
    return b.send(changePassword.POST, "/api/auth/change-password", { body });
  }
});
