import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { text } from "./rows";

/**
 * Read-only SQL for the one-step call outcome (docs/admin-phase-1b-plan.md §5.C; owner: 1B-CALLS;
 * D-037). Never writes: every write goes through the CRM services (`completeTask`, `createTask`,
 * `logContact`, `changeStage`) so lead routing's SLA hooks fire.
 */

export interface ContactEntryRow {
  type: "call" | "whatsapp";
  outcome: string | null;
  at: number;
}

/** The lead's call and WhatsApp entries, newest first (outcome from the activity meta). */
export function listContactEntries(db: DatabaseSync, leadId: string): ContactEntryRow[] {
  return db
    .prepare(
      `SELECT type, json_extract(meta, '$.outcome') AS outcome, at
         FROM crm_activities
        WHERE lead_id = ? AND type IN ('call', 'whatsapp')
        ORDER BY at DESC, id DESC`,
    )
    .all(leadId)
    .map((row): ContactEntryRow => ({ type: row.type === "whatsapp" ? "whatsapp" : "call", outcome: text(row.outcome), at: Number(row.at) }));
}

/** `crm_lead_details.preferred_time` (open vocabulary, validated by the caller), or null. */
export function findPreferredTime(db: DatabaseSync, leadId: string): string | null {
  return text(db.prepare("SELECT preferred_time FROM crm_lead_details WHERE lead_id = ?").get(leadId)?.preferred_time);
}

/** The site language of the family's latest submission (`meta.locale`), or null. */
export function latestSubmissionLocale(db: DatabaseSync, leadId: string): string | null {
  const row = db
    .prepare(
      `SELECT json_extract(meta, '$.locale') AS locale
         FROM crm_activities
        WHERE lead_id = ? AND type = 'submission'
        ORDER BY at DESC, id DESC LIMIT 1`,
    )
    .get(leadId);
  return text(row?.locale);
}
