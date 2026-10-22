import "server-only";

import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import { withTransaction } from "@/lib/db/connection";
import { openSecret, resealSecret, sealSecret, sealedKeyState, secretAad, SecretBoxError, secretBoxStatus } from "@/lib/server/secret-box";

import { CRM_AUDIT, crmAudit } from "../access";
import {
  IMPORT_TARGETS,
  META_GRAPH_VERSION_PATTERN,
  META_SECRET_NAMES,
  type ImportTarget,
  type MetaConfig,
  type MetaFormConfig,
  type MetaSecretName,
  type MetaSecretState,
  type SettingEnvelope,
} from "../lead-ops-types";
import { cleanSlug, toIso } from "../pure";
import { releaseHeldRows } from "../repo/meta";
import { deleteSecretRow, findSecretRow, listSecretRows, upsertSecretRow } from "../repo/settings";
import { getMetaConfig, writeSetting, type FieldErrors } from "../settings";
import { LEAD_PROGRAMS } from "../types";
import { META_SILENCE_HOURS_MAX, type MetaReadiness } from "./types";

/**
 * Meta settings and sealed credentials (docs/lead-routing-plan.md §18.7, §19):
 * - `meta_config` (non-secret): validated, optimistic-lock writes, audited `crm.meta_config`
 *   `{ version, enabled }` — never the value;
 * - secrets (`app_secret`, `access_token`, the derived `page_token`, the generated
 *   `verify_token`) are sealed with the secret box (AAD `meta:<name>:v1`) and NEVER returned:
 *   callers get `{ set, updatedAt, updatedBy, keyOk }`. Audited `{ slot }`.
 * Held inbox ids become pending as soon as the integration is enabled and a token exists (M10).
 */

const PROVIDER = "meta";
const aad = (name: MetaSecretName) => secretAad(PROVIDER, name);

export type SecretReadFailure = "missing" | "not_configured" | "key_mismatch" | "corrupt" | "weak_key";

/** Opens a stored secret (server use only: Graph calls, the webhook). Never throws. */
export function readMetaSecret(db: DatabaseSync, name: MetaSecretName): { ok: true; value: string } | { ok: false; reason: SecretReadFailure } {
  const row = findSecretRow(db, PROVIDER, name);
  if (!row) return { ok: false, reason: "missing" };
  try {
    return { ok: true, value: openSecret(row.sealed, aad(name)) };
  } catch (error) {
    return { ok: false, reason: error instanceof SecretBoxError ? error.code : "corrupt" };
  }
}

/** What the API may say about every secret slot (never a value). */
export function metaSecretStates(db: DatabaseSync): Record<MetaSecretName, MetaSecretState> {
  const states = Object.fromEntries(
    META_SECRET_NAMES.map((name) => [name, { set: false, updatedAt: null, updatedBy: null, keyOk: false } satisfies MetaSecretState]),
  ) as Record<MetaSecretName, MetaSecretState>;
  for (const row of listSecretRows(db, PROVIDER)) {
    if (!(row.name in states)) continue;
    states[row.name] = { set: true, updatedAt: toIso(row.updatedAt), updatedBy: row.updatedBy, keyOk: sealedKeyState(row.sealed) };
  }
  return states;
}

/** Shape check of a typed secret (no whitespace, printable ASCII, sane length). */
export function validSecretValue(name: MetaSecretName, value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (name === "app_secret") return /^[A-Za-z0-9]{16,64}$/.test(value);
  return /^[\x21-\x7e]{20,2048}$/.test(value);
}

/** Seals and stores a secret (joins the caller's transaction). Throws `SecretBoxError` without a usable key. */
export function storeMetaSecret(db: DatabaseSync, name: MetaSecretName, value: string, options: { actorId: string | null; now: number; audit?: boolean }): void {
  const status = secretBoxStatus();
  if (!status.configured || !status.keyId) throw new SecretBoxError(status.weak ? "weak_key" : "not_configured");
  const sealed = sealSecret(value, aad(name));
  withTransaction(db, () => {
    upsertSecretRow(db, { provider: PROVIDER, name, sealed, keyId: status.keyId as string, actorId: options.actorId, now: options.now });
    if (options.audit !== false) crmAudit(db, { actorId: options.actorId, action: CRM_AUDIT.metaSecretSet, target: PROVIDER, details: { slot: name }, now: options.now });
  });
}

/** Deletes a secret. Audited `{ slot }`. Returns whether one existed. */
export function removeMetaSecret(db: DatabaseSync, name: MetaSecretName, options: { actorId: string | null; now: number }): boolean {
  return withTransaction(db, () => {
    const removed = deleteSecretRow(db, PROVIDER, name);
    if (removed) crmAudit(db, { actorId: options.actorId, action: CRM_AUDIT.metaSecretDelete, target: PROVIDER, details: { slot: name }, now: options.now });
    return removed;
  });
}

/** A new verify token: 32 random bytes, base64url (43 characters). */
export function generateVerifyToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Creates the verify token when none exists yet (e.g. once the app secret is saved). True = created. */
export function ensureVerifyToken(db: DatabaseSync, options: { actorId: string | null; now: number }): boolean {
  if (findSecretRow(db, PROVIDER, "verify_token")) return false;
  storeMetaSecret(db, "verify_token", generateVerifyToken(), options);
  return true;
}

/** Re-encrypts every secret still sealed with the previous key (M13). Returns how many. */
export function resealMetaSecrets(db: DatabaseSync, options: { actorId: string | null; now: number }): number {
  const status = secretBoxStatus();
  if (!status.configured || !status.keyId) throw new SecretBoxError(status.weak ? "weak_key" : "not_configured");
  return withTransaction(db, () => {
    let count = 0;
    for (const row of listSecretRows(db, PROVIDER)) {
      if (row.keyId === status.keyId && sealedKeyState(row.sealed) === "current") continue;
      try {
        const sealed = resealSecret(row.sealed, aad(row.name));
        upsertSecretRow(db, { provider: PROVIDER, name: row.name, sealed, keyId: status.keyId as string, actorId: options.actorId, now: options.now });
        count += 1;
      } catch {
        // Neither key opens it: leave it (the screen shows "enter again").
      }
    }
    return count;
  });
}

/** Whether a slot is stored AND opens with a configured key. */
function usable(states: Record<MetaSecretName, MetaSecretState>, name: MetaSecretName): boolean {
  return states[name].set && states[name].keyOk !== false;
}

export function metaReadiness(db: DatabaseSync, config: MetaConfig = getMetaConfig(db).value): MetaReadiness {
  const states = metaSecretStates(db);
  const keyConfigured = secretBoxStatus().configured;
  const readiness = {
    keyConfigured,
    appId: config.appId !== null,
    appSecret: keyConfigured && usable(states, "app_secret"),
    accessToken: keyConfigured && usable(states, "access_token"),
    pageId: config.pageId !== null,
    enabled: config.enabled,
  };
  return { ...readiness, ready: readiness.keyConfigured && readiness.appSecret && readiness.accessToken && readiness.pageId && readiness.enabled };
}

/** Releases held ids when the integration just became ready. Returns how many. */
export function releaseHeldIfReady(db: DatabaseSync, now: number): number {
  return metaReadiness(db).ready ? releaseHeldRows(db, now) : 0;
}

// ---------------------------------------------------------------------------------------------
// meta_config PUT (partial document, strict keys)

const CONFIG_KEYS = new Set(["enabled", "appId", "pageId", "graphVersion", "tokenTransport", "fieldMap", "forms", "silenceAlertHours"]);
const META_ID = /^\d{5,20}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validForm(raw: unknown, errors: FieldErrors, index: number): MetaFormConfig | null {
  const field = `forms.${index}`;
  if (!isRecord(raw) || typeof raw.id !== "string" || !META_ID.test(raw.id)) {
    (errors[field] ??= []).push("Each form needs its numeric Meta id.");
    return null;
  }
  const defaults: Record<string, unknown> = isRecord(raw.defaults) ? raw.defaults : {};
  const program = defaults.programInterest;
  const centre = defaults.centreSlug;
  if (program !== undefined && program !== null && program !== "" && !(LEAD_PROGRAMS as readonly unknown[]).includes(program)) {
    (errors[`${field}.programInterest`] ??= []).push("Choose a programme from the list.");
  }
  if (centre !== undefined && centre !== null && centre !== "" && cleanSlug(centre) === null) (errors[`${field}.centreSlug`] ??= []).push("Choose a centre from the list.");
  const key = raw.consentCheckboxKey;
  if (key !== undefined && key !== null && key !== "" && (typeof key !== "string" || key.length > 100 || CONTROL.test(key))) {
    (errors[`${field}.consentCheckboxKey`] ??= []).push("Use the checkbox key exactly as Meta shows it (up to 100 characters).");
  }
  const name = typeof raw.name === "string" ? raw.name.replace(CONTROL, "").slice(0, 200) : "";
  const status = typeof raw.status === "string" ? raw.status.replace(CONTROL, "").slice(0, 40) : "";
  return {
    id: raw.id,
    name,
    status,
    defaults: {
      ...(typeof program === "string" && program !== "" ? { programInterest: program } : {}),
      ...(typeof centre === "string" && cleanSlug(centre) ? { centreSlug: cleanSlug(centre) as string } : {}),
    },
    consentCheckboxKey: typeof key === "string" && key.trim() !== "" ? key.trim() : null,
  };
}

/** Validates a partial `meta_config` (strict keys) and merges it into `current`. */
export function validateMetaConfigPatch(patch: unknown, current: MetaConfig): { ok: true; value: MetaConfig } | { ok: false; fieldErrors: FieldErrors } {
  const errors: FieldErrors = {};
  const add = (field: string, message: string) => (errors[field] ??= []).push(message);
  if (!isRecord(patch)) return { ok: false, fieldErrors: { config: ["Send the settings to change."] } };
  for (const key of Object.keys(patch)) {
    if (!CONFIG_KEYS.has(key)) add(key, key === "testPhone" || key === "acceptTestLeadsUntil" ? "Use the test leads switch." : "Unknown setting.");
  }
  const next: MetaConfig = { ...current, fieldMap: { ...current.fieldMap }, forms: [...current.forms] };
  if ("enabled" in patch) {
    if (typeof patch.enabled === "boolean") next.enabled = patch.enabled;
    else add("enabled", "Send true or false.");
  }
  for (const key of ["appId", "pageId"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value === null || value === "") next[key] = null;
    else if (typeof value === "string" && META_ID.test(value.trim())) next[key] = value.trim();
    else add(key, "Use the numeric id from Meta (5–20 digits).");
  }
  if ("graphVersion" in patch) {
    if (typeof patch.graphVersion === "string" && META_GRAPH_VERSION_PATTERN.test(patch.graphVersion)) next.graphVersion = patch.graphVersion;
    else add("graphVersion", "Use a Graph API version such as v26.0.");
  }
  if ("tokenTransport" in patch) {
    if (patch.tokenTransport === "header" || patch.tokenTransport === "query") next.tokenTransport = patch.tokenTransport;
    else add("tokenTransport", "Choose header or query.");
  }
  if ("silenceAlertHours" in patch) {
    const hours = patch.silenceAlertHours;
    if (typeof hours === "number" && Number.isInteger(hours) && hours >= 0 && hours <= META_SILENCE_HOURS_MAX) next.silenceAlertHours = hours;
    else add("silenceAlertHours", `Use 0–${META_SILENCE_HOURS_MAX} hours (0 switches the alert off).`);
  }
  if ("fieldMap" in patch) {
    const map = patch.fieldMap;
    if (!isRecord(map) || Object.keys(map).length > 200) add("fieldMap", "Up to 200 questions.");
    else {
      const fieldMap: Record<string, ImportTarget> = {};
      for (const [question, target] of Object.entries(map)) {
        if (question.length < 1 || question.length > 120 || CONTROL.test(question)) add("fieldMap", "Question keys are 1–120 characters.");
        else if (!(IMPORT_TARGETS as readonly unknown[]).includes(target)) add(`fieldMap.${question}`, "Choose a field from the list.");
        else fieldMap[question] = target as ImportTarget;
      }
      next.fieldMap = fieldMap;
    }
  }
  if ("forms" in patch) {
    const forms = patch.forms;
    if (!Array.isArray(forms) || forms.length > 100) add("forms", "Up to 100 forms.");
    else {
      const seen = new Set<string>();
      next.forms = forms.flatMap((raw, index) => {
        const form = validForm(raw, errors, index);
        if (!form || seen.has(form.id)) return [];
        seen.add(form.id);
        return [form];
      });
    }
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, value: next };
}

export type SaveMetaConfigResult =
  | { ok: true; envelope: SettingEnvelope<MetaConfig>; released: number }
  | { ok: false; error: "validation"; fieldErrors: FieldErrors }
  | { ok: false; error: "version_conflict" };

/** PUT /api/crm/integrations/meta: validate, lock on `expectedVersion`, audit `{ version, enabled }`, release held ids. */
export function saveMetaConfig(db: DatabaseSync, input: { patch: unknown; expectedVersion: number; actorId: string; now: number }): SaveMetaConfigResult {
  return withTransaction(db, (): SaveMetaConfigResult => {
    const current = getMetaConfig(db);
    const validated = validateMetaConfigPatch(input.patch, current.value);
    if (!validated.ok) return { ok: false, error: "validation", fieldErrors: validated.fieldErrors };
    const written = writeSetting(db, "meta_config", validated.value, { expectedVersion: input.expectedVersion, actorId: input.actorId, now: input.now, audit: false });
    if (!written.ok) return { ok: false, error: "version_conflict" };
    crmAudit(db, {
      actorId: input.actorId,
      action: CRM_AUDIT.metaConfig,
      target: "meta_config",
      details: { version: written.envelope.version, enabled: validated.value.enabled },
      now: input.now,
    });
    return { ok: true, envelope: written.envelope, released: releaseHeldIfReady(db, input.now) };
  });
}

/** A system change of the config (token transport fallback, synced forms, test mode); not audited here. */
export function patchMetaConfigAsSystem(db: DatabaseSync, patch: (current: MetaConfig) => Partial<MetaConfig>, options: { actorId: string | null; now: number }): MetaConfig {
  return withTransaction(db, () => {
    const current = getMetaConfig(db).value;
    const next = { ...current, ...patch(current) };
    writeSetting(db, "meta_config", next, { expectedVersion: null, actorId: options.actorId, now: options.now, audit: false });
    return next;
  });
}
