import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { ExternalProvider } from "../lead-ops-types";
import { int, text } from "./rows";

/**
 * Intake bookkeeping (owner: LR-CORE; docs/lead-routing-plan.md §12, §14.2, §17, §18):
 * - `crm_external_refs`: idempotency of Meta lead ids (`meta`, digits) and keyed CSV refs (`csv`,
 *   a keyed HMAC). Kept after an erase (they hold ids / HMACs only) and pointing at the stub.
 * - `crm_erase_suppressions`: keyed HMAC of an erased family's phone, so an old list or an older
 *   Meta lead cannot bring the family back (M5).
 * - `crm_import_batches`: read helpers only (the import service owns its batch rows).
 *
 * META checks `hasExternalRef` BEFORE any Graph call (M9); `captureLead` checks it again inside
 * its transaction and inserts the ref once the lead is resolved.
 */

export interface ExternalRefRow {
  provider: ExternalProvider;
  externalId: string;
  leadId: string | null;
  batchId: string | null;
  createdAt: number;
}

function ids(externalIds: string | readonly string[]): readonly string[] {
  return typeof externalIds === "string" ? [externalIds] : externalIds;
}

/** The first ref found among `externalIds` (e.g. a keyed hash under the current and the previous key). */
export function findExternalRef(db: DatabaseSync, provider: ExternalProvider, externalIds: string | readonly string[]): ExternalRefRow | null {
  const statement = db.prepare("SELECT lead_id, batch_id, created_at FROM crm_external_refs WHERE provider = ? AND external_id = ?");
  for (const externalId of ids(externalIds)) {
    const row = statement.get(provider, externalId);
    if (row) return { provider, externalId, leadId: text(row.lead_id), batchId: text(row.batch_id), createdAt: Number(row.created_at) };
  }
  return null;
}

/** Whether `(provider, externalId)` was already imported (by the webhook, a sync or a CSV). */
export function hasExternalRef(db: DatabaseSync, provider: ExternalProvider, externalIds: string | readonly string[]): boolean {
  return findExternalRef(db, provider, externalIds) !== null;
}

/** Records a ref (INSERT OR IGNORE). Returns false when it already existed. */
export function insertExternalRef(
  db: DatabaseSync,
  input: { provider: ExternalProvider; externalId: string; leadId: string | null; batchId?: string | null; now: number },
): boolean {
  const result = db
    .prepare("INSERT OR IGNORE INTO crm_external_refs (provider, external_id, lead_id, batch_id, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(input.provider, input.externalId, input.leadId, input.batchId ?? null, input.now);
  return Number(result.changes) > 0;
}

/** Refs of one lead, oldest first (the lead page shows "came from a Meta lead form"). */
export function listExternalRefsOfLead(db: DatabaseSync, leadId: string): ExternalRefRow[] {
  return db
    .prepare("SELECT provider, external_id, batch_id, created_at FROM crm_external_refs WHERE lead_id = ? ORDER BY created_at, external_id")
    .all(leadId)
    .map((row) => ({
      provider: String(row.provider) === "meta" ? "meta" : "csv",
      externalId: String(row.external_id),
      leadId,
      batchId: text(row.batch_id),
      createdAt: Number(row.created_at),
    }));
}

// ---------------------------------------------------------------------------------------------
// Erase suppressions

/** Writes (or refreshes) the suppression of an erased family's phone hash. */
export function upsertSuppression(db: DatabaseSync, input: { phoneHash: string; keyId: string; erasedAt: number }): void {
  db.prepare(
    `INSERT INTO crm_erase_suppressions (phone_hash, key_id, erased_at) VALUES (?, ?, ?)
     ON CONFLICT (phone_hash) DO UPDATE SET erased_at = MAX(erased_at, excluded.erased_at), key_id = excluded.key_id`,
  ).run(input.phoneHash, input.keyId, input.erasedAt);
}

/** The latest erase time among `phoneHashes` (current / previous key), or null. */
export function suppressionErasedAt(db: DatabaseSync, phoneHashes: readonly string[]): number | null {
  let latest: number | null = null;
  const statement = db.prepare("SELECT erased_at FROM crm_erase_suppressions WHERE phone_hash = ?");
  for (const hash of phoneHashes) {
    const erasedAt = int(statement.get(hash)?.erased_at);
    if (erasedAt !== null && (latest === null || erasedAt > latest)) latest = erasedAt;
  }
  return latest;
}

// ---------------------------------------------------------------------------------------------
// Import batches (read helpers)

/** Epoch ms of the latest finished import, or null. */
export function latestImportAt(db: DatabaseSync): number | null {
  return int(db.prepare("SELECT MAX(finished_at) AS at FROM crm_import_batches WHERE status = 'finished'").get()?.at);
}
