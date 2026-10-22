import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { int, text } from "./rows";

/**
 * Staff operations data (owner: LR-CORE; docs/lead-routing-plan.md §12, §13.5, §13.7):
 * - `crm_staff_scope`: an explicit manager scope (`areas`); no row = the legacy centre scope (H2);
 * - `crm_staff_availability`: "Away until …" (A5). Away = `away_until > now`.
 */

export type StaffScopeMode = "areas";

/** The manager's explicit scope mode, or null (legacy). */
export function findScopeMode(db: DatabaseSync, userId: string): StaffScopeMode | null {
  const mode = text(db.prepare("SELECT mode FROM crm_staff_scope WHERE user_id = ?").get(userId)?.mode);
  return mode === "areas" ? "areas" : null;
}

/** Sets (`areas`) or clears (null → legacy) a manager's scope mode. */
export function setScopeMode(db: DatabaseSync, input: { userId: string; mode: StaffScopeMode | null; actorId: string | null; now: number }): void {
  if (input.mode === null) {
    db.prepare("DELETE FROM crm_staff_scope WHERE user_id = ?").run(input.userId);
    return;
  }
  db.prepare(
    `INSERT INTO crm_staff_scope (user_id, mode, set_at, set_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET mode = excluded.mode, set_at = excluded.set_at, set_by = excluded.set_by`,
  ).run(input.userId, input.mode, input.now, input.actorId);
}

/** Managers without a scope row (legacy "see all their centres" / "see all"), for the review list. */
export function listLegacyScopeManagerIds(db: DatabaseSync): string[] {
  return db
    .prepare(
      `SELECT s.user_id FROM crm_staff s
        WHERE s.crm_role = 'manager' AND NOT EXISTS (SELECT 1 FROM crm_staff_scope sc WHERE sc.user_id = s.user_id)
        ORDER BY s.user_id`,
    )
    .all()
    .map((row) => String(row.user_id));
}

export interface AvailabilityRow {
  userId: string;
  awayUntil: number;
  note: string | null;
  setAt: number;
  setBy: string | null;
}

export function findAvailability(db: DatabaseSync, userId: string): AvailabilityRow | null {
  const row = db.prepare("SELECT away_until, note, set_at, set_by FROM crm_staff_availability WHERE user_id = ?").get(userId);
  if (!row) return null;
  return { userId, awayUntil: Number(row.away_until), note: text(row.note), setAt: Number(row.set_at), setBy: text(row.set_by) };
}

/** Sets "away until" (null clears it). The note is cut to 80 characters. */
export function setAvailability(
  db: DatabaseSync,
  input: { userId: string; awayUntil: number | null; note: string | null; actorId: string | null; now: number },
): void {
  if (input.awayUntil === null) {
    db.prepare("DELETE FROM crm_staff_availability WHERE user_id = ?").run(input.userId);
    return;
  }
  db.prepare(
    `INSERT INTO crm_staff_availability (user_id, away_until, note, set_at, set_by) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET away_until = excluded.away_until, note = excluded.note, set_at = excluded.set_at, set_by = excluded.set_by`,
  ).run(input.userId, input.awayUntil, input.note === null ? null : input.note.slice(0, 80), input.now, input.actorId);
}

/** Whether the person is away at `now`. */
export function isAway(db: DatabaseSync, userId: string, now: number): boolean {
  const awayUntil = int(db.prepare("SELECT away_until FROM crm_staff_availability WHERE user_id = ?").get(userId)?.away_until);
  return awayUntil !== null && awayUntil > now;
}

/** `userId → away_until` for everyone away at `now`. */
export function listAway(db: DatabaseSync, now: number): Map<string, number> {
  const away = new Map<string, number>();
  for (const row of db.prepare("SELECT user_id, away_until FROM crm_staff_availability WHERE away_until > ?").all(now)) {
    away.set(String(row.user_id), Number(row.away_until));
  }
  return away;
}
