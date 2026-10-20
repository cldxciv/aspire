import "server-only";

import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { AssignmentRule, AssignmentRuleInput } from "../types";
import { stringArray, text } from "./rows";

/** `crm_assignment_rules` and the round-robin cursors (`crm_rr_cursors`). */

export function listRules(db: DatabaseSync): AssignmentRule[] {
  return db
    .prepare("SELECT id, centre_slug, program_interest, member_ids, active FROM crm_assignment_rules ORDER BY position, id")
    .all()
    .map((row) => ({
      id: String(row.id),
      centreSlug: text(row.centre_slug),
      programInterest: text(row.program_interest),
      memberIds: stringArray(row.member_ids),
      active: Number(row.active) === 1,
    }));
}

/** Replaces every rule (in the given order). */
export function replaceRules(db: DatabaseSync, rules: readonly AssignmentRuleInput[], now: number): void {
  db.prepare("DELETE FROM crm_assignment_rules").run();
  const insert = db.prepare(
    `INSERT INTO crm_assignment_rules (id, position, centre_slug, program_interest, member_ids, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  rules.forEach((rule, index) => {
    insert.run(
      randomUUID(),
      index,
      rule.centreSlug,
      rule.programInterest,
      JSON.stringify(rule.memberIds),
      rule.active ? 1 : 0,
      now,
      now,
    );
  });
}

export function getCursor(db: DatabaseSync, scopeKey: string): string | null {
  return text(db.prepare("SELECT last_user_id FROM crm_rr_cursors WHERE scope_key = ?").get(scopeKey)?.last_user_id);
}

export function setCursor(db: DatabaseSync, scopeKey: string, userId: string, now: number): void {
  db.prepare(
    `INSERT INTO crm_rr_cursors (scope_key, last_user_id, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (scope_key) DO UPDATE SET last_user_id = excluded.last_user_id, updated_at = excluded.updated_at`,
  ).run(scopeKey, userId, now);
}
