import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { countAttemptsSince, insertAttempt, pruneAttempts } from "./attempts";
import { listAudit, recordAudit, sanitizeAuditDetails } from "./audit";
import { DEFAULT_DB_PATH, MEMORY_DB_PATH, openDatabase, resolveDbPath, SCHEMA_VERSION, withTransaction } from "./connection";
import { deleteParentLink, insertParentLink, listLinkedStudents } from "./links";
import {
  countUserSessions,
  deleteUserSessions,
  findSessionByTokenHash,
  insertSession,
  touchSession,
  trimUserSessions,
} from "./sessions";
import { countActiveAdmins, findUserById, findUserByLoginId, insertUser, setUserDisabled, type NewUser } from "./users";

// Every test uses an in-memory database, except the one that checks file creation in a temp dir.
let db: DatabaseSync;
const NOW = Date.UTC(2026, 9, 20, 6, 0, 0);

function user(overrides: Partial<NewUser> = {}) {
  return insertUser(db, {
    role: "student",
    displayName: "Test Learner",
    loginId: `learner.${Math.random().toString(36).slice(2, 8)}`,
    passwordHash: "scrypt$32768$8$1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA",
    mustChangePassword: false,
    now: NOW,
    ...overrides,
  });
}

beforeEach(() => {
  db = openDatabase(MEMORY_DB_PATH);
});

afterEach(() => {
  if (db.isOpen) db.close();
});

describe("resolveDbPath", () => {
  const cwd = resolve("/srv/aspire");

  it("defaults to .data/aspire.sqlite under the working directory", () => {
    expect(resolveDbPath({ NODE_ENV: "production" }, cwd)).toBe(resolve(cwd, DEFAULT_DB_PATH));
    expect(resolveDbPath({ NODE_ENV: "development", AUTH_DB_PATH: "  " }, cwd)).toBe(resolve(cwd, DEFAULT_DB_PATH));
  });

  it("uses an in-memory database under the test runner unless told otherwise", () => {
    expect(resolveDbPath({ NODE_ENV: "test" }, cwd)).toBe(MEMORY_DB_PATH);
    expect(resolveDbPath({ NODE_ENV: "test", AUTH_DB_PATH: "x.sqlite" }, cwd)).toBe(resolve(cwd, "x.sqlite"));
  });

  it("honours AUTH_DB_PATH (relative, absolute, :memory:)", () => {
    expect(resolveDbPath({ AUTH_DB_PATH: "var/auth.sqlite" }, cwd)).toBe(resolve(cwd, "var/auth.sqlite"));
    const absolute = resolve("/data/aspire.sqlite");
    expect(resolveDbPath({ AUTH_DB_PATH: absolute }, cwd)).toBe(absolute);
    expect(resolveDbPath({ AUTH_DB_PATH: ":memory:" }, cwd)).toBe(MEMORY_DB_PATH);
  });
});

describe("openDatabase / migrate", () => {
  it("creates the directory and file, and migrating again is a no-op", () => {
    const dir = mkdtempSync(join(tmpdir(), "aspire-db-test-"));
    try {
      const path = join(dir, "nested", "auth.sqlite");
      const first = openDatabase(path);
      first.prepare("INSERT INTO audit_log (action, created_at) VALUES ('test', 1)").run();
      first.close();
      expect(existsSync(path)).toBe(true);

      const second = openDatabase(path);
      expect(Number(second.prepare("PRAGMA user_version").get()?.user_version)).toBe(SCHEMA_VERSION);
      expect(Number(second.prepare("SELECT COUNT(*) AS n FROM audit_log").get()?.n)).toBe(1);
      expect(String(second.prepare("PRAGMA journal_mode").get()?.journal_mode)).toBe("wal");
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("creates every core table", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String(row.name));
    // Feature tables (src/lib/db/features, M6) carry their feature prefix and are tested by their owners.
    const core = tables.filter((name) => !/^(predictor|mocktest|ask|planner|mcp|crm|qb|superadmin|page_layout)_/.test(name));
    expect(core).toEqual(["audit_log", "login_attempts", "parent_links", "sessions", "users"]);
  });

  it("only adds feature tables with their feature prefix", () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => String(row.name));
    const known = new Set(["audit_log", "login_attempts", "parent_links", "sessions", "users"]);
    expect(tables.filter((name) => !known.has(name) && !/^(predictor|mocktest|ask|planner|mcp|crm|qb|superadmin|page_layout)_/.test(name))).toEqual([]);
  });

  it("enforces foreign keys and rolls back failed transactions", () => {
    expect(() =>
      insertSession(db, { tokenHash: "h", userId: "missing", now: NOW, expiresAt: NOW + 1, userAgent: null }),
    ).toThrow();
    expect(() =>
      withTransaction(db, () => {
        user({ loginId: "rolled.back" });
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(findUserByLoginId(db, "rolled.back")).toBeNull();
    expect(db.isTransaction).toBe(false);
  });
});

describe("users", () => {
  it("stores and finds users by id and lower-case login id", () => {
    const created = user({ loginId: "asha.k", displayName: "Asha K" });
    expect(findUserById(db, created.id)).toEqual(created);
    expect(findUserByLoginId(db, "asha.k")?.id).toBe(created.id);
    expect(created).toMatchObject({ role: "student", disabled: false, mustChangePassword: false, createdAt: NOW });
  });

  it("rejects duplicate and upper-case login ids and unknown roles", () => {
    user({ loginId: "dup.user" });
    expect(() => user({ loginId: "dup.user" })).toThrow();
    expect(() => user({ loginId: "Upper.Case" })).toThrow();
    expect(() => user({ role: "superuser" as never })).toThrow();
  });

  it("counts active admins only", () => {
    const a = user({ role: "admin", loginId: "admin.a" });
    user({ role: "admin", loginId: "admin.b" });
    expect(countActiveAdmins(db)).toBe(2);
    setUserDisabled(db, a.id, true, NOW);
    expect(countActiveAdmins(db)).toBe(1);
  });
});

describe("sessions", () => {
  it("inserts, touches, trims and deletes", () => {
    const owner = user();
    const other = user();
    for (let i = 0; i < 4; i += 1) {
      insertSession(db, { tokenHash: `h${i}`, userId: owner.id, now: NOW + i, expiresAt: NOW + 1000, userAgent: "ua" });
    }
    insertSession(db, { tokenHash: "other", userId: other.id, now: NOW, expiresAt: NOW + 1000, userAgent: null });

    touchSession(db, "h0", NOW + 50, NOW + 5000);
    expect(findSessionByTokenHash(db, "h0")).toMatchObject({ lastSeenAt: NOW + 50, expiresAt: NOW + 5000 });

    expect(trimUserSessions(db, owner.id, 3)).toBe(1); // the oldest (h0) goes
    expect(findSessionByTokenHash(db, "h0")).toBeNull();

    expect(deleteUserSessions(db, owner.id, { exceptTokenHash: "h3" })).toBe(2);
    expect(countUserSessions(db, owner.id)).toBe(1);
    expect(countUserSessions(db, other.id)).toBe(1);
  });
});

describe("parent links", () => {
  it("are idempotent and list only enabled student accounts", () => {
    const parent = user({ role: "parent", loginId: "parent.one" });
    const s1 = user({ loginId: "kid.one", displayName: "B Learner" });
    const s2 = user({ loginId: "kid.two", displayName: "A Learner" });
    expect(insertParentLink(db, { parentId: parent.id, studentId: s1.id, createdBy: null, now: NOW })).toBe(true);
    expect(insertParentLink(db, { parentId: parent.id, studentId: s1.id, createdBy: null, now: NOW })).toBe(false);
    insertParentLink(db, { parentId: parent.id, studentId: s2.id, createdBy: null, now: NOW });

    expect(listLinkedStudents(db, parent.id)).toEqual([
      { id: s2.id, displayName: "A Learner" },
      { id: s1.id, displayName: "B Learner" },
    ]);
    setUserDisabled(db, s2.id, true, NOW);
    expect(listLinkedStudents(db, parent.id).map((s) => s.id)).toEqual([s1.id]);
    expect(deleteParentLink(db, parent.id, s1.id)).toBe(true);
    expect(listLinkedStudents(db, parent.id)).toEqual([]);
  });
});

describe("audit log", () => {
  it("drops secret-looking keys and non-primitive values", () => {
    expect(
      sanitizeAuditDetails({
        role: "parent",
        password: "x",
        temporaryPassword: "x",
        passwordHash: "x",
        token: "x",
        sessionToken: "x",
        nested: { a: 1 },
        count: 2,
        flag: true,
        none: null,
        long: "y".repeat(500),
      }),
    ).toEqual({ role: "parent", count: 2, flag: true, none: null, long: "y".repeat(200) });
  });

  it("records entries and lists the newest first", () => {
    recordAudit(db, { actorId: "a", action: "one", target: "t1", now: NOW });
    recordAudit(db, { actorId: null, action: "two", target: "t2", details: { password: "nope", n: 1 }, now: NOW + 1 });
    const entries = listAudit(db, { limit: 10 });
    expect(entries.map((e) => e.action)).toEqual(["two", "one"]);
    expect(entries[0]).toMatchObject({ actorId: null, target: "t2", details: { n: 1 } });
    expect(listAudit(db, { limit: 10, target: "t1" }).map((e) => e.action)).toEqual(["one"]);
    const raw = db.prepare("SELECT details FROM audit_log").all().map((row) => String(row.details));
    expect(raw.join(" ")).not.toContain("nope");
  });
});

describe("login attempts", () => {
  it("counts within a window and prunes old rows", () => {
    insertAttempt(db, "login", "k", NOW - 10_000);
    insertAttempt(db, "login", "k", NOW - 5_000);
    insertAttempt(db, "ip", "k", NOW - 5_000);
    expect(countAttemptsSince(db, "login", "k", NOW - 20_000)).toEqual({ count: 2, oldest: NOW - 10_000 });
    expect(countAttemptsSince(db, "login", "k", NOW - 7_000)).toEqual({ count: 1, oldest: NOW - 5_000 });
    pruneAttempts(db, NOW - 7_000);
    expect(countAttemptsSince(db, "login", "k", 0).count).toBe(1);
    expect(countAttemptsSince(db, "login", "none", 0)).toEqual({ count: 0, oldest: null });
  });
});
