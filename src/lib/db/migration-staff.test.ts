import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CORE_MIGRATION_SQL, migrate, openDatabase, SCHEMA_VERSION } from "./connection";
import { FEATURE_SCHEMAS } from "./features";

// M7 core migration 2 (D-038): rebuild `users` so its CHECK accepts 'staff'. It must keep every row
// and every foreign key of a database created with the old schema. Synthetic data only.

let dir: string;
let path: string;

const NOW = Date.UTC(2026, 9, 20, 6, 0, 0);

/** A database exactly as the pre-M7 code left it: migration 1 + the feature tables + data. */
function createOldDatabase(): void {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(CORE_MIGRATION_SQL[0]);
  db.exec("PRAGMA user_version = 1");
  for (const { name, sql } of FEATURE_SCHEMAS) if (name !== "crm" && sql.trim()) db.exec(sql);

  const user = db.prepare(
    `INSERT INTO users (id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'scrypt$x', ?, ?, ?, ?)`,
  );
  user.run("u-admin", "admin", "Admin One", "admin.one", 0, 0, NOW, NOW);
  user.run("u-parent", "parent", "Parent One", "parent.one", 0, 1, NOW, NOW + 1);
  user.run("u-student", "student", "Learner One", "learner.one", 1, 0, NOW, NOW + 2);
  user.run("u-student-2", "student", "Learner Two", "learner.two", 0, 0, NOW, NOW + 3);
  db.prepare(
    "INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, user_agent) VALUES (?, ?, ?, ?, ?, ?)",
  ).run("hash-1", "u-parent", NOW, NOW + 1000, NOW, "ua");
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)").run(
    "hash-2",
    "u-student-2",
    NOW,
    NOW + 1000,
    NOW,
  );
  db.prepare("INSERT INTO parent_links (parent_id, student_id, created_at, created_by) VALUES (?, ?, ?, ?)").run(
    "u-parent",
    "u-student",
    NOW,
    "u-admin",
  );
  db.prepare("INSERT INTO audit_log (actor_id, action, target, created_at, details) VALUES (?, ?, ?, ?, ?)").run(
    "u-admin",
    "admin.user_create",
    "u-parent",
    NOW,
    '{"role":"parent"}',
  );
  db.prepare("INSERT INTO login_attempts (scope, key_hash, created_at) VALUES ('ip', 'k', ?)").run(NOW);
  // Feature tables that reference users (ON DELETE CASCADE) must survive the rebuild untouched.
  db.prepare(
    "INSERT INTO mcp_tokens (id, token_hash, name, created_by, scopes, created_at, expires_at) VALUES ('t1', 'th', 'n', 'u-admin', 'read', ?, ?)",
  ).run(NOW, NOW + 1000);
  db.prepare(
    "INSERT INTO ask_topics (user_id, subject, topic_key, topic, count, first_seen, last_seen) VALUES ('u-student-2', 'physics', 'k', 'Kinematics', 2, ?, ?)",
  ).run(NOW, NOW);
  db.prepare("INSERT INTO planner_leaderboard (user_id, nickname, opted_in_at) VALUES ('u-student-2', 'nick', ?)").run(NOW);
  db.close();
}

function dump(db: DatabaseSync, sql: string) {
  return db.prepare(sql).all().map((row) => ({ ...row }));
}

const SNAPSHOTS = [
  "SELECT * FROM users ORDER BY id",
  "SELECT * FROM sessions ORDER BY token_hash",
  "SELECT * FROM parent_links ORDER BY parent_id, student_id",
  "SELECT * FROM audit_log ORDER BY id",
  "SELECT * FROM login_attempts ORDER BY id",
  "SELECT * FROM mcp_tokens ORDER BY id",
  "SELECT * FROM ask_topics ORDER BY user_id",
  "SELECT * FROM planner_leaderboard ORDER BY user_id",
];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "aspire-m7-migration-"));
  path = join(dir, "old.sqlite");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("core migration 2: users.role accepts 'staff'", () => {
  it("keeps every row and foreign key of an old-schema database", () => {
    createOldDatabase();
    const before = new DatabaseSync(path);
    const snapshot = SNAPSHOTS.map((sql) => dump(before, sql));
    before.close();

    const db = openDatabase(path);
    try {
      expect(SCHEMA_VERSION).toBe(2);
      expect(Number(db.prepare("PRAGMA user_version").get()?.user_version)).toBe(2);
      // Every row is identical.
      expect(SNAPSHOTS.map((sql) => dump(db, sql))).toEqual(snapshot);
      // Foreign keys are back on and consistent.
      expect(Number(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys)).toBe(1);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      // No leftovers; the role index and the login_id uniqueness are back.
      const tables = dump(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").map((row) => row.name);
      expect(tables).not.toContain("users_rebuild_m7");
      expect(tables).toEqual(expect.arrayContaining(["crm_leads", "crm_staff", "crm_activities", "crm_tasks"]));
      const indexes = dump(db, "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users'").map((row) => row.name);
      expect(indexes).toContain("users_role_idx");
      expect(() =>
        db
          .prepare(
            "INSERT INTO users (id, role, display_name, login_id, password_hash, created_at, updated_at) VALUES ('x', 'student', 'X', 'admin.one', 'h', 1, 1)",
          )
          .run(),
      ).toThrow(/UNIQUE/);

      // The new role is accepted, unknown roles are still refused.
      db.prepare(
        "INSERT INTO users (id, role, display_name, login_id, password_hash, created_at, updated_at) VALUES ('u-staff', 'staff', 'Staff One', 'staff.one', 'h', 1, 1)",
      ).run();
      expect(() =>
        db
          .prepare(
            "INSERT INTO users (id, role, display_name, login_id, password_hash, created_at, updated_at) VALUES ('u-bad', 'teacher', 'T', 'teacher.one', 'h', 1, 1)",
          )
          .run(),
      ).toThrow(/CHECK/);

      // The child tables now reference the rebuilt table: cascades and FK checks still work.
      expect(() =>
        db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ('h3', 'ghost', 1, 2, 1)").run(),
      ).toThrow(/FOREIGN KEY/);
      db.prepare("DELETE FROM users WHERE id = 'u-student-2'").run();
      expect(dump(db, "SELECT token_hash FROM sessions ORDER BY token_hash")).toEqual([{ token_hash: "hash-1" }]);
      expect(dump(db, "SELECT * FROM ask_topics")).toEqual([]);
      expect(dump(db, "SELECT * FROM planner_leaderboard")).toEqual([]);
      db.prepare("DELETE FROM users WHERE id = 'u-parent'").run();
      expect(dump(db, "SELECT * FROM parent_links")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("is a no-op on a database that is already migrated, and fresh databases get the new CHECK", () => {
    const fresh = openDatabase(path);
    fresh
      .prepare(
        "INSERT INTO users (id, role, display_name, login_id, password_hash, created_at, updated_at) VALUES ('s', 'staff', 'S', 'staff.one', 'h', 1, 1)",
      )
      .run();
    migrate(fresh);
    expect(Number(fresh.prepare("SELECT COUNT(*) AS n FROM users").get()?.n)).toBe(1);
    fresh.close();
    const again = openDatabase(path);
    expect(Number(again.prepare("PRAGMA user_version").get()?.user_version)).toBe(2);
    expect(Number(again.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'staff'").get()?.n)).toBe(1);
    again.close();
  });

  it("rolls back and keeps the old schema when foreign_key_check finds a violation", () => {
    createOldDatabase();
    // Plant an orphan row while enforcement is off (as a damaged database might have).
    const raw = new DatabaseSync(path);
    raw.exec("PRAGMA foreign_keys = OFF");
    raw.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ('orphan', 'ghost', 1, 2, 1)").run();
    raw.close();

    expect(() => openDatabase(path)).toThrow(/foreign_key_check/);
    const after = new DatabaseSync(path);
    expect(Number(after.prepare("PRAGMA user_version").get()?.user_version)).toBe(1);
    expect(Number(after.prepare("SELECT COUNT(*) AS n FROM users").get()?.n)).toBe(4);
    const sql = String(after.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get()?.sql);
    expect(sql).not.toContain("'staff'");
    after.close();
  });
});
