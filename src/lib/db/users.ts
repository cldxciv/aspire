import "server-only";

import { randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

import type { Role } from "@/lib/auth/roles";

/**
 * `users` table access. Callers pass the database (see connection.ts), so tests and
 * scripts can use their own. Password hashes are only ever read by the sign-in and
 * password-change code; `toPublicUser` (src/lib/auth/accounts.ts) strips them before
 * anything leaves the server.
 */

export interface UserRecord {
  id: string;
  role: Role;
  displayName: string;
  /** Always lower case. */
  loginId: string;
  passwordHash: string;
  disabled: boolean;
  mustChangePassword: boolean;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

const ROLE_VALUES: readonly string[] = ["student", "parent", "admin", "staff"];

type Row = Record<string, SQLOutputValue>;

function mapUser(row: Row): UserRecord {
  const role = String(row.role);
  if (!ROLE_VALUES.includes(role)) throw new Error("users.role holds an unknown value");
  return {
    id: String(row.id),
    role: role as Role,
    displayName: String(row.display_name),
    loginId: String(row.login_id),
    passwordHash: String(row.password_hash),
    disabled: Number(row.disabled) === 1,
    mustChangePassword: Number(row.must_change_password) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

const COLUMNS =
  "id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at";

export function findUserById(db: DatabaseSync, id: string): UserRecord | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`).get(id);
  return row ? mapUser(row) : null;
}

/** `loginId` must already be normalised (trimmed, lower case). */
export function findUserByLoginId(db: DatabaseSync, loginId: string): UserRecord | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM users WHERE login_id = ?`).get(loginId);
  return row ? mapUser(row) : null;
}

export function listUsers(db: DatabaseSync, filter: { role?: Role } = {}): UserRecord[] {
  const rows = filter.role
    ? db.prepare(`SELECT ${COLUMNS} FROM users WHERE role = ? ORDER BY display_name COLLATE NOCASE, id`).all(filter.role)
    : db
        .prepare(
          `SELECT ${COLUMNS} FROM users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'staff' THEN 1 WHEN 'parent' THEN 2 ELSE 3 END, display_name COLLATE NOCASE, id`,
        )
        .all();
  return rows.map(mapUser);
}

export interface NewUser {
  id?: string;
  role: Role;
  displayName: string;
  loginId: string;
  passwordHash: string;
  mustChangePassword: boolean;
  now: number;
}

/** Inserts a user. Throws on a duplicate `login_id` (UNIQUE constraint). */
export function insertUser(db: DatabaseSync, input: NewUser): UserRecord {
  const id = input.id ?? randomUUID();
  db.prepare(
    `INSERT INTO users (id, role, display_name, login_id, password_hash, disabled, must_change_password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
  ).run(
    id,
    input.role,
    input.displayName,
    input.loginId,
    input.passwordHash,
    input.mustChangePassword ? 1 : 0,
    input.now,
    input.now,
  );
  const user = findUserById(db, id);
  if (!user) throw new Error("insertUser: row missing after insert");
  return user;
}

export function setUserDisabled(db: DatabaseSync, id: string, disabled: boolean, now: number): boolean {
  const result = db
    .prepare("UPDATE users SET disabled = ?, updated_at = ? WHERE id = ?")
    .run(disabled ? 1 : 0, now, id);
  return Number(result.changes) > 0;
}

export function setUserPassword(
  db: DatabaseSync,
  id: string,
  passwordHash: string,
  mustChangePassword: boolean,
  now: number,
): boolean {
  const result = db
    .prepare("UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = ? WHERE id = ?")
    .run(passwordHash, mustChangePassword ? 1 : 0, now, id);
  return Number(result.changes) > 0;
}

/** Re-hash on sign-in when parameters change; does not touch `updated_at` semantics for the user. */
export function replacePasswordHash(db: DatabaseSync, id: string, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

export function setUserDisplayName(db: DatabaseSync, id: string, displayName: string, now: number): boolean {
  const result = db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(displayName, now, id);
  return Number(result.changes) > 0;
}

export function countActiveAdmins(db: DatabaseSync): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND disabled = 0").get();
  return Number(row?.n ?? 0);
}
