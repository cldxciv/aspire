import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ActivityType } from "../types";
import { parseMeta, text, type Meta, type Row } from "./rows";

/** `crm_activities`: the lead timeline. */

export interface ActivityRow {
  id: number;
  leadId: string;
  type: ActivityType;
  body: string | null;
  meta: Meta;
  actorId: string | null;
  actorName: string | null;
  at: number;
}

export function insertActivity(
  db: DatabaseSync,
  input: { leadId: string; type: ActivityType; body?: string | null; meta?: Meta; actorId: string | null; at: number },
): ActivityRow {
  const result = db
    .prepare("INSERT INTO crm_activities (lead_id, type, body, meta, actor_id, at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(input.leadId, input.type, input.body ?? null, JSON.stringify(input.meta ?? {}), input.actorId, input.at);
  const row = findActivity(db, Number(result.lastInsertRowid));
  if (!row) throw new Error("insertActivity: row missing after insert");
  return row;
}

const SELECT = `
  SELECT a.id, a.lead_id, a.type, a.body, a.meta, a.actor_id, a.at, u.display_name AS actor_name
    FROM crm_activities a LEFT JOIN users u ON u.id = a.actor_id`;

function mapActivity(row: Row): ActivityRow {
  return {
    id: Number(row.id),
    leadId: String(row.lead_id),
    type: String(row.type) as ActivityType,
    body: text(row.body),
    meta: parseMeta(row.meta),
    actorId: text(row.actor_id),
    actorName: text(row.actor_name),
    at: Number(row.at),
  };
}

export function findActivity(db: DatabaseSync, id: number): ActivityRow | null {
  const row = db.prepare(`${SELECT} WHERE a.id = ?`).get(id);
  return row ? mapActivity(row) : null;
}

/** Newest first. */
export function listActivities(db: DatabaseSync, leadId: string, limit = 200): ActivityRow[] {
  return db
    .prepare(`${SELECT} WHERE a.lead_id = ? ORDER BY a.at DESC, a.id DESC LIMIT ?`)
    .all(leadId, limit)
    .map(mapActivity);
}

/**
 * Every activity of the given types for a lead, newest first, with NO row limit. Used for the
 * consent-bearing entries (submissions, staff `created` entries, withdrawals), so the lead page's
 * consent list and parent flag never lose the first consent behind a busy timeline.
 */
export function listActivitiesOfTypes(db: DatabaseSync, leadId: string, types: readonly ActivityType[]): ActivityRow[] {
  if (types.length === 0) return [];
  const marks = types.map(() => "?").join(", ");
  return db
    .prepare(`${SELECT} WHERE a.lead_id = ? AND a.type IN (${marks}) ORDER BY a.at DESC, a.id DESC`)
    .all(leadId, ...types)
    .map(mapActivity);
}

/**
 * Lead gate (docs/lead-gate-plan.md §3): one `tool_use` entry per lead + tool + key per day
 * ([dayStart, dayEnd), Asia/Kolkata). A repeat use that day adds 1 to `uses`, takes the latest
 * facts and moves the entry's time to `now`; otherwise a new entry starts at `uses: 1`.
 */
export function upsertDailyToolUse(
  db: DatabaseSync,
  input: { leadId: string; tool: string; key: string; dayStart: number; dayEnd: number; facts: Meta; now: number },
): { id: number; uses: number } {
  const existing = db
    .prepare(
      `SELECT id, meta FROM crm_activities
        WHERE lead_id = ? AND type = 'tool_use' AND at >= ? AND at < ?
          AND json_extract(meta, '$.tool') = ? AND json_extract(meta, '$.key') = ?
        ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .get(input.leadId, input.dayStart, input.dayEnd, input.tool, input.key);
  const lastAt = new Date(input.now).toISOString();
  if (existing) {
    const previous = parseMeta(existing.meta);
    const uses = (typeof previous.uses === "number" ? previous.uses : 1) + 1;
    const meta: Meta = { ...previous, ...input.facts, tool: input.tool, key: input.key, uses, lastAt };
    db.prepare("UPDATE crm_activities SET meta = ?, at = ? WHERE id = ?").run(JSON.stringify(meta), input.now, Number(existing.id));
    return { id: Number(existing.id), uses };
  }
  const meta: Meta = { ...input.facts, tool: input.tool, key: input.key, uses: 1, lastAt };
  const result = db
    .prepare("INSERT INTO crm_activities (lead_id, type, body, meta, actor_id, at) VALUES (?, 'tool_use', NULL, ?, NULL, ?)")
    .run(input.leadId, JSON.stringify(meta), input.now);
  return { id: Number(result.lastInsertRowid), uses: 1 };
}

/** Deletes a lead's activities of one type (erase removes `tool_use`). Returns how many. */
export function deleteActivitiesOfType(db: DatabaseSync, leadId: string, type: ActivityType): number {
  return Number(db.prepare("DELETE FROM crm_activities WHERE lead_id = ? AND type = ?").run(leadId, type).changes);
}

/** Retention sweep: deletes every activity of `type` older than `before` (epoch ms). Returns how many. */
export function deleteActivitiesOfTypeBefore(db: DatabaseSync, type: ActivityType, before: number): number {
  return Number(db.prepare("DELETE FROM crm_activities WHERE type = ? AND at < ?").run(type, before).changes);
}

/** Erase (D-042): drops staff text and every meta key that is not a known non-personal fact. */
export function scrubActivities(db: DatabaseSync, leadId: string, keepMetaKeys: readonly string[]): number {
  const rows = db.prepare("SELECT id, meta FROM crm_activities WHERE lead_id = ?").all(leadId);
  const update = db.prepare("UPDATE crm_activities SET body = NULL, meta = ? WHERE id = ?");
  for (const row of rows) {
    const meta = parseMeta(row.meta);
    const kept: Meta = {};
    for (const key of keepMetaKeys) if (key in meta) kept[key] = meta[key];
    update.run(JSON.stringify(kept), Number(row.id));
  }
  return rows.length;
}
