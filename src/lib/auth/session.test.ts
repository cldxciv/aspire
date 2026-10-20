import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// connection() needs a live Next request; cookies() reads the test jar instead.
const cookieState = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock("next/headers", async () => {
  const { cookieStore } = await import("./testing/harness");
  return { cookies: async () => cookieStore(cookieState) };
});
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const { connection } = await import("next/server");
const { getDb, resetDatabaseForTests } = await import("@/lib/db/connection");
const { findSessionByTokenHash } = await import("@/lib/db/sessions");
const { setUserDisabled } = await import("@/lib/db/users");
const { AUTH_COOKIE_NAME } = await import("./config");
const { getCurrentSession, getSession } = await import("./session");
const {
  createSession,
  hashSessionToken,
  resolveSessionToken,
  revokeSessionToken,
  revokeUserSessions,
  SESSION_ABSOLUTE_MAX_MS,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
} = await import("./sessions");
const { createTestUser, linkTestParent } = await import("./testing/harness");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function useCookie(token: string | undefined) {
  cookieState.jar = new Map(token === undefined ? [] : [[AUTH_COOKIE_NAME, token]]);
}

beforeEach(() => {
  resetDatabaseForTests();
  useCookie(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetDatabaseForTests();
});

describe("getSession (deny by default)", () => {
  it("returns null without a session cookie", async () => {
    await expect(getSession()).resolves.toBeNull();
  });

  it.each(["", "x", "admin", "role=admin", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}!`])(
    "returns null for a malformed cookie %j",
    async (value) => {
      useCookie(value);
      await expect(getSession()).resolves.toBeNull();
    },
  );

  it("returns null for a well-formed but unknown token", async () => {
    useCookie("A".repeat(43));
    await expect(getSession()).resolves.toBeNull();
  });

  it("is request-time only (awaits connection())", async () => {
    vi.mocked(connection).mockClear();
    await getSession();
    expect(connection).toHaveBeenCalledTimes(1);
  });

  it("fails closed (null, logged without secrets) when the database cannot be opened", async () => {
    const dir = mkdtempSync(join(tmpdir(), "aspire-session-test-"));
    try {
      const blocker = join(dir, "not-a-directory");
      writeFileSync(blocker, "");
      vi.stubEnv("AUTH_DB_PATH", join(blocker, "auth.sqlite"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const token = "B".repeat(43);
      useCookie(token);
      await expect(getSession()).resolves.toBeNull();
      expect(errors).toHaveBeenCalledTimes(1);
      const line = String(errors.mock.calls[0][0]);
      expect(JSON.parse(line)).toMatchObject({ event: "auth", action: "session", outcome: "error" });
      expect(line).not.toContain(token);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("session lifecycle", () => {
  it("creates a session that getSession() resolves to the account", async () => {
    const student = await createTestUser({ role: "student", loginId: "learner.one", password: "learner-pass-1" });
    const { token, tokenHash, expiresAt } = createSession(student.id, { userAgent: "UA\u0000/1.0" });

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toBe(hashSessionToken(token));
    const row = findSessionByTokenHash(getDb(), tokenHash);
    expect(row).toMatchObject({ userId: student.id, userAgent: "UA/1.0", expiresAt });
    // Only the hash is stored.
    const dump = JSON.stringify(getDb().prepare("SELECT * FROM sessions").all());
    expect(dump).not.toContain(token);

    useCookie(token);
    await expect(getSession()).resolves.toEqual({
      userId: student.id,
      role: "student",
      displayName: student.displayName,
      loginId: "learner.one",
      mustChangePassword: false,
    });
    const current = await getCurrentSession();
    expect(current).toMatchObject({ tokenHash, refreshed: false, token });
  });

  it("gives parents their enabled linked learners only", async () => {
    const parent = await createTestUser({ role: "parent", loginId: "parent.one", password: "parent-pass-1" });
    const a = await createTestUser({ role: "student", loginId: "kid.a", password: "kid-pass-aaaa" });
    const b = await createTestUser({ role: "student", loginId: "kid.b", password: "kid-pass-bbbb" });
    await createTestUser({ role: "student", loginId: "kid.c", password: "kid-pass-cccc" });
    linkTestParent(parent.id, a.id);
    linkTestParent(parent.id, b.id);
    setUserDisabled(getDb(), b.id, true, Date.now());

    useCookie(createSession(parent.id).token);
    expect((await getSession())?.linkedStudentIds).toEqual([a.id]);
  });

  it("expires after 7 days without activity and deletes the row", async () => {
    const user = await createTestUser({ role: "student", loginId: "learner.two", password: "learner-pass-2" });
    const start = Date.now();
    const { token, tokenHash } = createSession(user.id, { now: start });

    expect(resolveSessionToken(token, start + SESSION_TTL_MS - 1)).not.toBeNull();
    expect(resolveSessionToken(token, start + SESSION_TTL_MS - 1 + SESSION_TTL_MS)).toBeNull();
    expect(findSessionByTokenHash(getDb(), tokenHash)).toBeNull();
  });

  it("records activity at most once an hour, sliding the expiry", async () => {
    const user = await createTestUser({ role: "admin", loginId: "admin.one", password: "admin-pass-11" });
    const start = Date.now();
    const { token, tokenHash } = createSession(user.id, { now: start });

    const early = resolveSessionToken(token, start + SESSION_TOUCH_INTERVAL_MS - 1);
    expect(early?.refreshed).toBe(false);
    expect(findSessionByTokenHash(getDb(), tokenHash)?.lastSeenAt).toBe(start);

    const later = start + SESSION_TOUCH_INTERVAL_MS;
    const touched = resolveSessionToken(token, later);
    expect(touched).toMatchObject({ refreshed: true, expiresAt: later + SESSION_TTL_MS });
    expect(findSessionByTokenHash(getDb(), tokenHash)).toMatchObject({
      lastSeenAt: later,
      expiresAt: later + SESSION_TTL_MS,
    });
  });

  it("never extends a session beyond 30 days after sign-in", async () => {
    const user = await createTestUser({ role: "student", loginId: "learner.three", password: "learner-pass-3" });
    const start = Date.now();
    const { token } = createSession(user.id, { now: start });
    // Active every 6 days: the expiry keeps sliding until the absolute cap.
    let now = start;
    while (now + 6 * DAY < start + SESSION_ABSOLUTE_MAX_MS) {
      now += 6 * DAY;
      expect(resolveSessionToken(token, now)).not.toBeNull();
    }
    expect(resolveSessionToken(token, start + SESSION_ABSOLUTE_MAX_MS + 1)).toBeNull();
  });

  it("is revoked by sign-out and by revoking all of a user's sessions", async () => {
    const user = await createTestUser({ role: "parent", loginId: "parent.two", password: "parent-pass-2" });
    const first = createSession(user.id);
    const second = createSession(user.id);
    const third = createSession(user.id);

    expect(revokeSessionToken(first.token)).toBe(true);
    expect(revokeSessionToken(first.token)).toBe(false);
    useCookie(first.token);
    await expect(getSession()).resolves.toBeNull();

    expect(revokeUserSessions(user.id, { exceptTokenHash: third.tokenHash })).toBe(1);
    expect(resolveSessionToken(second.token)).toBeNull();
    expect(resolveSessionToken(third.token)).not.toBeNull();
  });

  it("ends the session when the account is disabled", async () => {
    const user = await createTestUser({ role: "student", loginId: "learner.four", password: "learner-pass-4" });
    const { token, tokenHash } = createSession(user.id);
    setUserDisabled(getDb(), user.id, true, Date.now());
    useCookie(token);
    await expect(getSession()).resolves.toBeNull();
    expect(findSessionByTokenHash(getDb(), tokenHash)).toBeNull();
  });

  it("keeps at most 10 sessions per user", async () => {
    const user = await createTestUser({ role: "student", loginId: "learner.five", password: "learner-pass-5" });
    const start = Date.now();
    const tokens = Array.from({ length: 12 }, (_, i) => createSession(user.id, { now: start + i }).token);
    expect(resolveSessionToken(tokens[0], start + 20)).toBeNull();
    expect(resolveSessionToken(tokens[1], start + 20)).toBeNull();
    expect(resolveSessionToken(tokens[11], start + 20)).not.toBeNull();
  });
});
