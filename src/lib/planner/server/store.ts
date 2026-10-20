import "server-only";

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";
import type { DateKey } from "../dates";
import { parseState, type PlannerState } from "../state";

/**
 * Data access for the planner tables (src/lib/db/features/planner.ts). Callers pass the database,
 * like src/lib/db/users.ts. Every query is scoped to ONE user id taken from the verified session —
 * there is no way to read another student's document through these functions (D-034).
 */

export interface StoredState {
  state: PlannerState;
  /** Server clock of the last save (epoch ms). */
  updatedAt: number;
}

/** Opaque per-account tag so a browser can tell whose copy it holds. Not reversible to a login id. */
export function ownerTag(userId: string): string {
  return createHash("sha256").update(`planner-owner:${userId}`).digest("hex").slice(0, 16);
}

export function getStoredState(db: DatabaseSync, userId: string): StoredState | null {
  const row = db.prepare("SELECT state, updated_at FROM planner_state WHERE user_id = ?").get(userId);
  if (!row) return null;
  let json: unknown;
  try {
    json = JSON.parse(String(row.state));
  } catch {
    return null;
  }
  const state = parseState(json);
  return state ? { state, updatedAt: Number(row.updated_at) } : null;
}

/** Saves an already validated and sanitised state, and rebuilds the user's daily rows from it. */
export function saveState(db: DatabaseSync, userId: string, state: PlannerState, now: number): void {
  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO planner_state (user_id, state, client_updated_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET state = excluded.state, client_updated_at = excluded.client_updated_at, updated_at = excluded.updated_at`,
    ).run(userId, JSON.stringify(state), state.updatedAt, now);
    db.prepare("DELETE FROM planner_daily WHERE user_id = ?").run(userId);
    const insert = db.prepare("INSERT INTO planner_daily (user_id, day, xp, blocks, reviews) VALUES (?, ?, ?, ?, ?)");
    for (const [day, [xp, blocks, reviews]] of Object.entries(state.activity)) {
      if (xp > 0 || blocks > 0 || reviews > 0) insert.run(userId, day, xp, blocks, reviews);
    }
  });
}

export interface DailyRow {
  day: DateKey;
  xp: number;
  blocks: number;
  reviews: number;
}

export function getDailyRows(db: DatabaseSync, userId: string, from: DateKey, to: DateKey): DailyRow[] {
  return db
    .prepare("SELECT day, xp, blocks, reviews FROM planner_daily WHERE user_id = ? AND day >= ? AND day <= ? ORDER BY day")
    .all(userId, from, to)
    .map((row) => ({ day: String(row.day), xp: Number(row.xp), blocks: Number(row.blocks), reviews: Number(row.reviews) }));
}

export interface LeaderboardSetting {
  nickname: string;
  optedInAt: number;
}

export function getLeaderboardSetting(db: DatabaseSync, userId: string): LeaderboardSetting | null {
  const row = db.prepare("SELECT nickname, opted_in_at FROM planner_leaderboard WHERE user_id = ?").get(userId);
  return row ? { nickname: String(row.nickname), optedInAt: Number(row.opted_in_at) } : null;
}

/** Opt in (with a validated nickname) or out (`null`, which deletes the row). */
export function setLeaderboardSetting(db: DatabaseSync, userId: string, nickname: string | null, now: number): void {
  if (nickname === null) {
    db.prepare("DELETE FROM planner_leaderboard WHERE user_id = ?").run(userId);
    return;
  }
  db.prepare(
    `INSERT INTO planner_leaderboard (user_id, nickname, opted_in_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET nickname = excluded.nickname`,
  ).run(userId, nickname, now);
}

export interface LeaderboardRow {
  rank: number;
  nickname: string;
  xp: number;
  me: boolean;
}

/**
 * Opted-in, enabled students ranked by XP between `from` and `to` (inclusive). Ties share a rank.
 * Returns the top `limit` plus the caller's own row when it falls outside the top.
 */
export function weeklyLeaderboard(
  db: DatabaseSync,
  options: { from: DateKey; to: DateKey; limit: number; userId: string },
): { top: LeaderboardRow[]; mine: LeaderboardRow | null; participants: number } {
  const rows = db
    .prepare(
      `SELECT l.user_id AS user_id, l.nickname AS nickname, COALESCE(SUM(d.xp), 0) AS xp
       FROM planner_leaderboard l
       JOIN users u ON u.id = l.user_id AND u.role = 'student' AND u.disabled = 0
       LEFT JOIN planner_daily d ON d.user_id = l.user_id AND d.day >= ? AND d.day <= ?
       GROUP BY l.user_id, l.nickname, l.opted_in_at
       ORDER BY xp DESC, l.opted_in_at ASC, l.user_id ASC`,
    )
    .all(options.from, options.to);
  let rank = 0;
  let previousXp: number | null = null;
  const ranked = rows.map((row, index) => {
    const xp = Number(row.xp);
    if (previousXp === null || xp !== previousXp) rank = index + 1;
    previousXp = xp;
    return { rank, nickname: String(row.nickname), xp, me: String(row.user_id) === options.userId };
  });
  const top = ranked.slice(0, options.limit);
  const mineRow = ranked.find((row) => row.me) ?? null;
  return { top, mine: mineRow, participants: ranked.length };
}
