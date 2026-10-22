import "server-only";

import type { DatabaseSync } from "node:sqlite";

import type { CrmSettingKey, MetaSecretName } from "../lead-ops-types";
import { int, text } from "./rows";

/**
 * `crm_settings` (one JSON document per key, `version` = optimistic lock) and
 * `crm_integration_secrets` (sealed credentials) — SQL only (owner: LR-CORE; docs/lead-routing-plan.md
 * §12, §18.7). Typed reads / validated writes live in src/lib/crm/settings.ts; sealing in
 * src/lib/server/secret-box.ts. Secrets never leave this layer in clear: rows hold envelopes only.
 */

export interface SettingRow {
  key: CrmSettingKey;
  /** Raw JSON text (parsed and validated by settings.ts). */
  value: string;
  version: number;
  updatedAt: number;
  updatedBy: string | null;
}

export function findSettingRow(db: DatabaseSync, key: CrmSettingKey): SettingRow | null {
  const row = db.prepare("SELECT key, value, version, updated_at, updated_by FROM crm_settings WHERE key = ?").get(key);
  if (!row) return null;
  return {
    key,
    value: String(row.value),
    version: Number(row.version),
    updatedAt: Number(row.updated_at),
    updatedBy: text(row.updated_by),
  };
}

/**
 * Writes a document when its stored version still equals `expectedVersion` (0 = not stored yet).
 * Returns the new version, or null on a version conflict. `expectedVersion: null` skips the check
 * (system documents such as `meta_status`).
 */
export function writeSettingRow(
  db: DatabaseSync,
  input: { key: CrmSettingKey; value: string; expectedVersion: number | null; actorId: string | null; now: number },
): number | null {
  const current = findSettingRow(db, input.key);
  const currentVersion = current?.version ?? 0;
  if (input.expectedVersion !== null && input.expectedVersion !== currentVersion) return null;
  const next = currentVersion + 1;
  if (current) {
    const result = db
      .prepare("UPDATE crm_settings SET value = ?, version = ?, updated_at = ?, updated_by = ? WHERE key = ? AND version = ?")
      .run(input.value, next, input.now, input.actorId, input.key, currentVersion);
    return Number(result.changes) > 0 ? next : null;
  }
  db.prepare("INSERT INTO crm_settings (key, value, version, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)").run(
    input.key,
    input.value,
    next,
    input.now,
    input.actorId,
  );
  return next;
}

// ---------------------------------------------------------------------------------------------
// Sealed secrets

export interface SecretRow {
  provider: "meta";
  name: MetaSecretName;
  sealed: string;
  keyId: string;
  updatedAt: number;
  updatedBy: string | null;
}

export function findSecretRow(db: DatabaseSync, provider: "meta", name: MetaSecretName): SecretRow | null {
  const row = db
    .prepare("SELECT sealed, key_id, updated_at, updated_by FROM crm_integration_secrets WHERE provider = ? AND name = ?")
    .get(provider, name);
  if (!row) return null;
  return {
    provider,
    name,
    sealed: String(row.sealed),
    keyId: String(row.key_id),
    updatedAt: Number(row.updated_at),
    updatedBy: text(row.updated_by),
  };
}

export function listSecretRows(db: DatabaseSync, provider: "meta"): SecretRow[] {
  return db
    .prepare("SELECT name, sealed, key_id, updated_at, updated_by FROM crm_integration_secrets WHERE provider = ? ORDER BY name")
    .all(provider)
    .map((row) => ({
      provider,
      name: String(row.name) as MetaSecretName,
      sealed: String(row.sealed),
      keyId: String(row.key_id),
      updatedAt: Number(row.updated_at),
      updatedBy: text(row.updated_by),
    }));
}

export function upsertSecretRow(
  db: DatabaseSync,
  input: { provider: "meta"; name: MetaSecretName; sealed: string; keyId: string; actorId: string | null; now: number },
): void {
  db.prepare(
    `INSERT INTO crm_integration_secrets (provider, name, sealed, key_id, updated_at, updated_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (provider, name) DO UPDATE SET
       sealed = excluded.sealed, key_id = excluded.key_id, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  ).run(input.provider, input.name, input.sealed, input.keyId, input.now, input.actorId);
}

export function deleteSecretRow(db: DatabaseSync, provider: "meta", name: MetaSecretName): boolean {
  return Number(db.prepare("DELETE FROM crm_integration_secrets WHERE provider = ? AND name = ?").run(provider, name).changes) > 0;
}

/** Epoch ms of the latest update of any setting (diagnostics); null when none is stored. */
export function latestSettingUpdate(db: DatabaseSync): number | null {
  return int(db.prepare("SELECT MAX(updated_at) AS at FROM crm_settings").get()?.at);
}
