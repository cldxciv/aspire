import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { CrmRole } from "../types";
import { stringArray, type Row } from "./rows";

/** `crm_staff` (CRM membership of `staff` accounts), joined with `users`. */

export interface StaffRow {
  userId: string;
  displayName: string;
  loginId: string;
  userRole: string;
  disabled: boolean;
  crmRole: CrmRole;
  centreSlugs: string[];
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

const SELECT = `
  SELECT s.user_id, s.crm_role, s.centre_slugs, s.active, s.created_at, s.updated_at,
         u.display_name, u.login_id, u.role AS user_role, u.disabled
    FROM crm_staff s JOIN users u ON u.id = s.user_id`;

function mapStaff(row: Row): StaffRow {
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    loginId: String(row.login_id),
    userRole: String(row.user_role),
    disabled: Number(row.disabled) === 1,
    crmRole: String(row.crm_role) as CrmRole,
    centreSlugs: stringArray(row.centre_slugs),
    active: Number(row.active) === 1,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/** Display names of user accounts by id (any role; unknown ids are left out). */
export function findDisplayNames(db: DatabaseSync, userIds: readonly string[]): Map<string, string> {
  const names = new Map<string, string>();
  const unique = [...new Set(userIds)].slice(0, 500);
  if (unique.length === 0) return names;
  const rows = db
    .prepare(`SELECT id, display_name FROM users WHERE id IN (${unique.map(() => "?").join(", ")})`)
    .all(...unique);
  for (const row of rows) names.set(String(row.id), String(row.display_name));
  return names;
}

export function findStaff(db: DatabaseSync, userId: string): StaffRow | null {
  const row = db.prepare(`${SELECT} WHERE s.user_id = ?`).get(userId);
  return row ? mapStaff(row) : null;
}

export function listStaffRows(db: DatabaseSync): StaffRow[] {
  return db.prepare(`${SELECT} ORDER BY u.display_name COLLATE NOCASE, s.user_id`).all().map(mapStaff);
}

/**
 * Members who can receive leads right now: active membership, enabled `staff` account.
 * Sorted by user id (the round-robin order).
 */
export function listAssignableStaff(db: DatabaseSync): StaffRow[] {
  return db
    .prepare(`${SELECT} WHERE s.active = 1 AND u.disabled = 0 AND u.role = 'staff' ORDER BY s.user_id`)
    .all()
    .map(mapStaff);
}

export function upsertStaffRow(
  db: DatabaseSync,
  input: { userId: string; crmRole: CrmRole; centreSlugs: readonly string[]; active: boolean; actorId: string | null; now: number },
): void {
  db.prepare(
    `INSERT INTO crm_staff (user_id, crm_role, centre_slugs, active, created_at, updated_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET
       crm_role = excluded.crm_role, centre_slugs = excluded.centre_slugs, active = excluded.active,
       updated_at = excluded.updated_at`,
  ).run(
    input.userId,
    input.crmRole,
    JSON.stringify([...input.centreSlugs]),
    input.active ? 1 : 0,
    input.now,
    input.now,
    input.actorId,
  );
}
