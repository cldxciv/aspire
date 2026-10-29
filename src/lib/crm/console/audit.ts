import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { recordAudit } from "@/lib/db/audit";

/**
 * Audit codes of the admin console Phase 1b (docs/admin-phase-1b-plan.md §9; owner: 1B-CORE).
 * Details hold ids, counts and enum values only: never names, phones, typed text or URLs. The
 * activity log's English labels live in src/components/portal/audit-labels.ts (1B-HOUSEKEEPING).
 * `crm.contact_log` (existing, CRM_AUDIT) gains `template` when a WhatsApp template was used.
 */
export const CONSOLE_AUDIT = {
  /** `{ fields }` (field names, comma-joined). */
  leadDetailsUpdate: "crm.lead_details_update",
  /** `{ otherLeadId }`. */
  duplicateDismiss: "crm.duplicate_dismiss",
  /** `{ decision }`. */
  lostReview: "crm.lost_review",
  /** `{ period, metric, cells }`. */
  targetsUpdate: "settings.targets_update",
  /** `{ key, lang, version }`. */
  templateUpdate: "settings.template_update",
  /** `{ key, status }`. */
  templateStatus: "settings.template_status",
  /** `{ version }`. */
  waLinksUpdate: "settings.wa_links_update",
  /** `{ centres, version }` (how many centres' links changed). */
  centreLinksUpdate: "settings.centre_links_update",
} as const;

export type ConsoleAuditAction = (typeof CONSOLE_AUDIT)[keyof typeof CONSOLE_AUDIT];

export type ConsoleAuditValue = string | number | boolean | null | readonly (string | number)[];

/** Keys that could carry personal data or secrets are never written, whatever a caller passes. */
const FORBIDDEN_KEY = /pass|hash|token|secret|salt|cookie|credential|phone|email|name|body|note|url|referrer/i;

/**
 * Writes one console audit row. Arrays (field names, ids) are stored comma-joined; keys that look
 * personal or secret are dropped (the audit sanitiser also drops secret-looking keys).
 */
export function consoleAudit(
  db: DatabaseSync,
  input: { actorId: string | null; action: ConsoleAuditAction; target: string | null; details?: Record<string, ConsoleAuditValue>; now: number },
): void {
  const details: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input.details ?? {})) {
    if (FORBIDDEN_KEY.test(key)) continue;
    details[key] = Array.isArray(value) ? value.join(",") : (value as string | number | boolean | null);
  }
  recordAudit(db, { actorId: input.actorId, action: input.action, target: input.target, details, now: input.now });
}
