import "server-only";

import type { DatabaseSync } from "node:sqlite";

/**
 * `parent_links`: which learners a parent account may see. Links are created only by
 * an admin (or the dev seed), never from client input. Role checks (parent → student)
 * happen in src/lib/auth/accounts.ts before a link is written.
 */

export interface LinkedStudent {
  id: string;
  displayName: string;
}

/** Creates the link if missing. Returns true when a row was added. */
export function insertParentLink(
  db: DatabaseSync,
  input: { parentId: string; studentId: string; createdBy: string | null; now: number },
): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO parent_links (parent_id, student_id, created_at, created_by) VALUES (?, ?, ?, ?)")
    .run(input.parentId, input.studentId, input.now, input.createdBy);
  return Number(result.changes) > 0;
}

/** Removes the link. Returns true when a row was deleted. */
export function deleteParentLink(db: DatabaseSync, parentId: string, studentId: string): boolean {
  const result = db.prepare("DELETE FROM parent_links WHERE parent_id = ? AND student_id = ?").run(parentId, studentId);
  return Number(result.changes) > 0;
}

/**
 * Learners linked to a parent. Only enabled student accounts are returned: disabling a
 * learner's account also ends the parent's access to it.
 */
export function listLinkedStudents(db: DatabaseSync, parentId: string): LinkedStudent[] {
  return db
    .prepare(
      `SELECT u.id AS id, u.display_name AS display_name
         FROM parent_links pl
         JOIN users u ON u.id = pl.student_id
        WHERE pl.parent_id = ? AND u.role = 'student' AND u.disabled = 0
        ORDER BY u.display_name COLLATE NOCASE, u.id`,
    )
    .all(parentId)
    .map((row) => ({ id: String(row.id), displayName: String(row.display_name) }));
}

/** Every link (for the admin user list). */
export function listAllParentLinks(db: DatabaseSync): { parentId: string; studentId: string }[] {
  return db
    .prepare("SELECT parent_id, student_id FROM parent_links ORDER BY parent_id, student_id")
    .all()
    .map((row) => ({ parentId: String(row.parent_id), studentId: String(row.student_id) }));
}
