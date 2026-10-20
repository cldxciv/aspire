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
