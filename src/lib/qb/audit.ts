import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { recordAudit } from "@/lib/db/audit";

/**
 * Core audit entries for the question bank (owner: QB-CORE-B; §B6). Per-question history lives in
 * `qb_events`; these go to the core `audit_log`: AI import run / cancel / spend, bulk approvals,
 * blueprint publish and archive, pattern and taxonomy confirmations, key corrections, membership
 * changes and settings changes. Details are ids, counts and kinds only — never question text.
 *
 * Convention (agreed with QB-ADMIN-API / QB-IMPORT): the ROUTE that performs an action writes its
 * audit row with `qbAudit`; services do not, so no action is audited twice.
 */

export const QB_AUDIT_ACTIONS = {
  importRun: "qb.import_run",
  importCancel: "qb.import_cancel",
  importSpend: "qb.import_spend",
  bulkApprove: "qb.bulk_approve",
  bulkLabels: "qb.bulk_labels",
  blueprintPublish: "qb.blueprint_publish",
  blueprintArchive: "qb.blueprint_archive",
  patternConfirm: "qb.pattern_confirm",
  blueprintSignoff: "qb.blueprint_signoff",
  taxonomyConfirm: "qb.taxonomy_confirm",
  keyCorrection: "qb.key_correction",
  memberUpsert: "qb.member_upsert",
  settingsChange: "qb.settings_change",
  thirdPartyOverride: "qb.third_party_override",
} as const;

export type QbAuditAction = (typeof QB_AUDIT_ACTIONS)[keyof typeof QB_AUDIT_ACTIONS];

export function qbAudit(
  db: DatabaseSync,
  input: {
    actorId: string | null;
    action: QbAuditAction;
    target: string | null;
    details?: Record<string, string | number | boolean | null>;
    now: number;
  },
): void {
  recordAudit(db, input);
}

/** "a,b,c (+7)" — at most `max` ids in an audit detail. */
export function auditIdList(ids: readonly string[], max = 10): string {
  const shown = ids.slice(0, max).join(",");
  return ids.length > max ? `${shown} (+${ids.length - max})` : shown;
}
