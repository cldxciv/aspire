import "server-only";

import { mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
// Explicit .ts paths: scripts/ (auth:seed, auth:create-admin) run these sources directly in Node.
import { FEATURE_SCHEMAS } from "./features/index.ts";

/**
 * SQLite connection and schema for accounts, sessions, parent links, the audit log
 * and sign-in throttling (D-029). Built on Node's `node:sqlite`; no npm packages.
 *
 * SINGLE NODE ONLY: the file lives on this server's disk. Several app instances
 * (serverless, autoscaling) would each see a different database. Move to a managed
 * database before multi-instance hosting (docs/auth-and-portals.md).
 *
 * NOTE for `scripts/*.mjs`: this module (like every file in src/lib/db) is loaded by
 * plain Node with type stripping, so it must not import other project files at
 * runtime. Type-only imports (`import type`) are fine because they are erased.
 */

export const DEFAULT_DB_PATH = ".data/aspire.sqlite";
export const MEMORY_DB_PATH = ":memory:";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * `AUTH_DB_PATH` (absolute, or relative to the working directory), else
 * `.data/aspire.sqlite`. Under the test runner (NODE_ENV=test) an unset path means an
 * in-memory database, so tests can never touch the real file by accident.
 */
export function resolveDbPath(env: Env = process.env, cwd: string = process.cwd()): string {
  const raw = env.AUTH_DB_PATH?.trim();
  if (raw === MEMORY_DB_PATH) return MEMORY_DB_PATH;
  if (!raw) {
    if (env.NODE_ENV === "test") return MEMORY_DB_PATH;
    return resolve(cwd, DEFAULT_DB_PATH);
  }
  return isAbsolute(raw) ? raw : resolve(cwd, raw);
}

/**
 * A core migration: plain SQL, or SQL that must run with foreign-key enforcement OFF (SQLite's
 * table-rebuild procedure, https://sqlite.org/lang_altertable.html#otheralter). For the latter,
 * `migrate()` switches enforcement off OUTSIDE the transaction (the pragma is a no-op inside one),
 * runs the SQL, requires `PRAGMA foreign_key_check` to come back empty before committing, and
 * switches enforcement back on afterwards.
 */
type Migration = string | { sql: string; disableForeignKeys: true };

/**
 * Ordered, append-only migrations. `PRAGMA user_version` records how many have run.
 * Never edit a released entry: add a new one. Every statement is idempotent as well
 * (`IF NOT EXISTS`) so a half-applied database still converges.
 */
const MIGRATIONS: readonly Migration[] = [
  `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin')),
    display_name TEXT NOT NULL,
    login_id TEXT NOT NULL UNIQUE CHECK (login_id = lower(login_id)),
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
  CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

  CREATE TABLE IF NOT EXISTS parent_links (
    parent_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    student_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    created_by TEXT,
    PRIMARY KEY (parent_id, student_id)
  );
  CREATE INDEX IF NOT EXISTS parent_links_student_idx ON parent_links (student_id);

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    created_at INTEGER NOT NULL,
    details TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at);

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS login_attempts_key_idx ON login_attempts (scope, key_hash, created_at);
  `,
  // 2 (M7, D-038): widen users.role to include 'staff'. SQLite cannot alter a CHECK constraint, so
  // the table is rebuilt (create new → copy → drop → rename → indexes) with foreign keys OFF, so the
  // DROP does not cascade into sessions, parent_links or the feature tables that reference users.
  // Those references are by name ("users") and resolve to the rebuilt table after the rename.
  {
    disableForeignKeys: true,
    sql: `
  DROP TABLE IF EXISTS users_rebuild_m7;
  CREATE TABLE users_rebuild_m7 (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('student', 'parent', 'admin', 'staff')),
    display_name TEXT NOT NULL,
    login_id TEXT NOT NULL UNIQUE CHECK (login_id = lower(login_id)),
    password_hash TEXT NOT NULL,
    disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  INSERT INTO users_rebuild_m7 (id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at)
    SELECT id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_rebuild_m7 RENAME TO users;
  CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
  `,
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

/** The SQL of each core migration, in order (tests build old-schema databases from these). */
export const CORE_MIGRATION_SQL: readonly string[] = MIGRATIONS.map((migration) =>
  typeof migration === "string" ? migration : migration.sql,
);

function userVersion(db: DatabaseSync): number {
  const row = db.prepare("PRAGMA user_version").get();
  return Number(row?.user_version ?? 0);
}

function migrationSql(migration: Migration): string {
  return typeof migration === "string" ? migration : migration.sql;
}

function foreignKeysEnabled(db: DatabaseSync): boolean {
  return Number(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys ?? 0) === 1;
}

/**
 * Runs pending migrations inside one write transaction. Safe to call repeatedly. When a pending
 * migration rebuilds a table, foreign-key enforcement is switched off around the transaction and
 * `PRAGMA foreign_key_check` must be empty before the commit (else everything rolls back).
 */
export function migrate(db: DatabaseSync): void {
  const startVersion = userVersion(db);
  if (startVersion >= MIGRATIONS.length) return;
  const rebuild = MIGRATIONS.slice(startVersion).some((migration) => typeof migration !== "string");
  const restoreForeignKeys = rebuild && foreignKeysEnabled(db);
  if (restoreForeignKeys) db.exec("PRAGMA foreign_keys = OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      // Re-read inside the write lock: another connection may have migrated meanwhile.
      for (let version = userVersion(db); version < MIGRATIONS.length; version += 1) {
        db.exec(migrationSql(MIGRATIONS[version]));
      }
      if (rebuild && db.prepare("PRAGMA foreign_key_check").all().length > 0) {
        throw new Error("Migration aborted: PRAGMA foreign_key_check reported violations");
      }
      db.exec(`PRAGMA user_version = ${MIGRATIONS.length}`);
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    if (restoreForeignKeys) db.exec("PRAGMA foreign_keys = ON");
  }
}

/** Applies the idempotent per-feature schemas (src/lib/db/features, M6) after the core migrations. */
export function applyFeatureSchemas(db: DatabaseSync): void {
  for (const { sql } of FEATURE_SCHEMAS) if (sql.trim()) db.exec(sql);
}

/** Opens (creating the directory if needed), configures and migrates a database. */
export function openDatabase(path: string): DatabaseSync {
  if (path !== MEMORY_DB_PATH) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec("PRAGMA busy_timeout = 5000");
    if (path !== MEMORY_DB_PATH) {
      db.exec("PRAGMA journal_mode = WAL");
      db.exec("PRAGMA synchronous = NORMAL");
    }
    migrate(db);
    applyFeatureSchemas(db);
  } catch (error) {
    db.close();
    throw error;
  }
  return db;
}

/**
 * One connection per process, kept on `globalThis` so dev-server reloads and
 * separately bundled route handlers share it instead of opening a file handle each.
 */
type Holder = { path: string; db: DatabaseSync; schemaKeys?: Set<string> };
const GLOBAL_KEY = Symbol.for("aspire.authDb");
const globalStore = globalThis as typeof globalThis & { [GLOBAL_KEY]?: Holder };

/**
 * Identifies the schema this copy of the module knows (migration count + feature schema sizes).
 * A long-running dev server keeps its connection on `globalThis` across code reloads, so a
 * reloaded module with new migrations / feature tables applies them to the open connection.
 */
const SCHEMA_KEY = `${MIGRATIONS.length}|${FEATURE_SCHEMAS.map(({ name, sql }) => `${name}:${sql.length}`).join(",")}`;

/** The process-wide database for the configured `AUTH_DB_PATH` (opened lazily). */
export function getDb(): DatabaseSync {
  const path = resolveDbPath();
  const current = globalStore[GLOBAL_KEY];
  if (current && current.path === path && current.db.isOpen) {
    if (!current.schemaKeys?.has(SCHEMA_KEY)) {
      migrate(current.db);
      applyFeatureSchemas(current.db);
      (current.schemaKeys ??= new Set()).add(SCHEMA_KEY);
    }
    return current.db;
  }
  if (current?.db.isOpen) current.db.close();
  const db = openDatabase(path);
  globalStore[GLOBAL_KEY] = { path, db, schemaKeys: new Set([SCHEMA_KEY]) };
  return db;
}

/** Test helper: closes the shared connection so the next `getDb()` starts afresh. */
export function resetDatabaseForTests(): void {
  const current = globalStore[GLOBAL_KEY];
  if (current?.db.isOpen) current.db.close();
  delete globalStore[GLOBAL_KEY];
}

/**
 * Runs `fn` in a write transaction (BEGIN IMMEDIATE … COMMIT, ROLLBACK on throw).
 * Nested calls join the outer transaction. `fn` must be synchronous.
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
