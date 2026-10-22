import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { CRM_AUDIT, crmAudit } from "./access";
import {
  CALLING_HOURS_LIMITS,
  DEFAULT_CALLING_HOURS,
  DEFAULT_META_CONFIG,
  DEFAULT_META_STATUS,
  DEFAULT_ROUTING_SETTINGS,
  DEFAULT_SPEED_RULE,
  IMPORT_TARGETS,
  META_GRAPH_VERSION_PATTERN,
  ROUTING_MODES,
  SPEED_RULE_LIMITS,
  WEEKDAYS,
  type AreasSeedSetting,
  type CallingHours,
  type CrmSettingKey,
  type DayHours,
  type ImportTarget,
  type MetaConfig,
  type MetaFormConfig,
  type MetaStatus,
  type RoutingSettings,
  type SettingEnvelope,
  type SpeedRule,
  type Weekday,
} from "./lead-ops-types";
import { cleanSlug, toIso } from "./pure";
import { findSettingRow, writeSettingRow } from "./repo/settings";
import { CONTACT_OUTCOMES, type ContactOutcome } from "./types";

/**
 * Typed settings documents (owner: LR-CORE; docs/lead-routing-plan.md §12, §15, §18.7). Reads
 * never throw and never write: a missing or unreadable document gives the default
 * (`isDefault: true`, `version: 0`). Writes validate, use the optimistic `expectedVersion` lock
 * and (for super-admin changes) write `crm.settings_update { key, version }` — never the value.
 *
 * Who may write is decided by the routes (`requireCrmSuperAdmin`); system documents
 * (`areas_seed`, `meta_status`) are written with `audit: false` and `expectedVersion: null`.
 */

export type FieldErrors = Record<string, string[]>;
export type Validated<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

/** A stored document parsed by `parse` (null = unreadable → the default is used). */
export function readSetting<T>(db: DatabaseSync, key: CrmSettingKey, parse: (raw: unknown) => T | null, fallback: T): SettingEnvelope<T> {
  const row = findSettingRow(db, key);
  const parsed = row ? parse(parseJson(row.value)) : null;
  if (!row || parsed === null) {
    return { key, value: fallback, version: row?.version ?? 0, updatedAt: row ? toIso(row.updatedAt) : null, updatedBy: row?.updatedBy ?? null, isDefault: true };
  }
  return { key, value: parsed, version: row.version, updatedAt: toIso(row.updatedAt), updatedBy: row.updatedBy, isDefault: false };
}

export type WriteSettingResult<T> = { ok: true; envelope: SettingEnvelope<T> } | { ok: false; error: "version_conflict" };

/**
 * Stores a (validated) document. `expectedVersion` must equal the stored version (0 when never
 * stored); null skips the check. Audited `crm.settings_update { key, version }` unless `audit: false`.
 * Joins the caller's transaction.
 */
export function writeSetting<T>(
  db: DatabaseSync,
  key: CrmSettingKey,
  value: T,
  options: { expectedVersion: number | null; actorId: string | null; now: number; audit?: boolean },
): WriteSettingResult<T> {
  const version = writeSettingRow(db, { key, value: JSON.stringify(value), expectedVersion: options.expectedVersion, actorId: options.actorId, now: options.now });
  if (version === null) return { ok: false, error: "version_conflict" };
  if (options.audit !== false) {
    crmAudit(db, { actorId: options.actorId, action: CRM_AUDIT.settingsUpdate, target: key, details: { key, version }, now: options.now });
  }
  return {
    ok: true,
    envelope: { key, value, version, updatedAt: toIso(options.now), updatedBy: options.actorId, isDefault: false },
  };
}

// ---------------------------------------------------------------------------------------------
// Shapes

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

const add = (errors: FieldErrors, field: string, message: string) => {
  (errors[field] ??= []).push(message);
};

/** Validates calling hours (§15): one window per day, start < end, at least one open day. */
export function validateCallingHours(input: unknown): Validated<CallingHours> {
  const errors: FieldErrors = {};
  if (!isRecord(input)) return { ok: false, fieldErrors: { callingHours: ["Send the calling hours."] } };
  if (input.timezone !== undefined && input.timezone !== "Asia/Kolkata") add(errors, "timezone", "Only Asia/Kolkata is supported.");
  const week = isRecord(input.week) ? input.week : null;
  if (!week) add(errors, "week", "Send all seven days.");
  const out = {} as Record<Weekday, DayHours>;
  let openDays = 0;
  for (const day of WEEKDAYS) {
    const value = week?.[day];
    if (!isRecord(value) || typeof value.open !== "boolean" || typeof value.start !== "string" || typeof value.end !== "string") {
      add(errors, `week.${day}`, "Set open, start and end for every day.");
      continue;
    }
    if (!HHMM.test(value.start)) add(errors, `week.${day}.start`, "Use HH:MM.");
    if (!HHMM.test(value.end)) add(errors, `week.${day}.end`, "Use HH:MM.");
    if (value.open && HHMM.test(value.start) && HHMM.test(value.end) && minutesOf(value.start) >= minutesOf(value.end)) {
      add(errors, `week.${day}.end`, "The end must be after the start.");
    }
    if (value.open) openDays += 1;
    out[day] = { open: value.open, start: value.start, end: value.end };
  }
  if (week && openDays === 0) add(errors, "week", "At least one day must be open.");
  const closed = input.closedDates === undefined ? [] : input.closedDates;
  if (!Array.isArray(closed) || closed.length > CALLING_HOURS_LIMITS.closedDates || !closed.every(validDate)) {
    add(errors, "closedDates", `Up to ${CALLING_HOURS_LIMITS.closedDates} dates as YYYY-MM-DD.`);
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  const closedDates = [...new Set(closed as string[])].sort();
  return { ok: true, value: { timezone: "Asia/Kolkata", week: out, closedDates } };
}

function intIn(value: unknown, range: { min: number; max: number }): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max;
}

/** Validates the speed rule (§15). */
export function validateSpeedRule(input: unknown): Validated<SpeedRule> {
  const errors: FieldErrors = {};
  if (!isRecord(input)) return { ok: false, fieldErrors: { speedRule: ["Send the speed rule."] } };
  const L = SPEED_RULE_LIMITS;
  if (!intIn(input.firstCallMinutes, L.firstCallMinutes)) add(errors, "firstCallMinutes", `Use ${L.firstCallMinutes.min}–${L.firstCallMinutes.max} minutes.`);
  if (input.countOnly !== "any_attempt" && input.countOnly !== "connected") add(errors, "countOnly", "Choose any_attempt or connected.");
  const tiers = isRecord(input.tiers) ? input.tiers : null;
  const areaHead = tiers && isRecord(tiers.areaHead) ? tiers.areaHead : null;
  const superAdmin = tiers && isRecord(tiers.superAdmin) ? tiers.superAdmin : null;
  if (!areaHead || typeof areaHead.enabled !== "boolean" || !intIn(areaHead.afterMinutes, L.tierMinutes)) {
    add(errors, "tiers.areaHead", `Set enabled and ${L.tierMinutes.min}–${L.tierMinutes.max} minutes.`);
  }
  if (!superAdmin || typeof superAdmin.enabled !== "boolean" || !intIn(superAdmin.afterMinutes, L.tierMinutes)) {
    add(errors, "tiers.superAdmin", `Set enabled and ${L.tierMinutes.min}–${L.tierMinutes.max} minutes.`);
  } else if (areaHead && typeof areaHead.afterMinutes === "number" && superAdmin.afterMinutes <= areaHead.afterMinutes) {
    add(errors, "tiers.superAdmin", "The super admin step must come after the area head step.");
  }
  const retry = isRecord(input.retry) ? input.retry : null;
  if (
    !retry ||
    typeof retry.enabled !== "boolean" ||
    !intIn(retry.firstAfterMinutes, L.retryFirstAfterMinutes) ||
    !intIn(retry.maxAttempts, L.retryMaxAttempts)
  ) {
    add(errors, "retry", "Set enabled, the first retry delay and the number of retries.");
  }
  const outcomes = input.reachedOutcomes;
  if (
    !Array.isArray(outcomes) ||
    outcomes.length === 0 ||
    !outcomes.every((outcome) => (CONTACT_OUTCOMES as readonly unknown[]).includes(outcome))
  ) {
    add(errors, "reachedOutcomes", "Choose at least one outcome.");
  }
  if (!intIn(input.reachedTargetMinutes, L.reachedTargetMinutes)) add(errors, "reachedTargetMinutes", `Use ${L.reachedTargetMinutes.min}–${L.reachedTargetMinutes.max} minutes.`);
  const sources = input.sources;
  if (!Array.isArray(sources) || sources.length > L.sources || !sources.every((source) => cleanSlug(source, 32) === source)) {
    add(errors, "sources", "Use known source ids.");
  }
  if (typeof input.leadGate !== "boolean") add(errors, "leadGate", "Send true or false.");
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  const t = tiers as { areaHead: { enabled: boolean; afterMinutes: number }; superAdmin: { enabled: boolean; afterMinutes: number } };
  const r = retry as { enabled: boolean; firstAfterMinutes: number; maxAttempts: number };
  return {
    ok: true,
    value: {
      firstCallMinutes: input.firstCallMinutes as number,
      countOnly: input.countOnly as SpeedRule["countOnly"],
      tiers: {
        areaHead: { enabled: t.areaHead.enabled, afterMinutes: t.areaHead.afterMinutes },
        superAdmin: { enabled: t.superAdmin.enabled, afterMinutes: t.superAdmin.afterMinutes },
      },
      retry: { enabled: r.enabled, firstAfterMinutes: r.firstAfterMinutes, maxAttempts: r.maxAttempts },
      reachedOutcomes: [...new Set(outcomes as ContactOutcome[])],
      reachedTargetMinutes: input.reachedTargetMinutes as number,
      sources: [...new Set(sources as string[])],
      leadGate: input.leadGate as boolean,
    },
  };
}

function parseRouting(raw: unknown): RoutingSettings | null {
  return isRecord(raw) && (ROUTING_MODES as readonly unknown[]).includes(raw.mode) ? { mode: raw.mode as RoutingSettings["mode"] } : null;
}

function parseSeed(raw: unknown): AreasSeedSetting | null {
  return isRecord(raw) && typeof raw.seededAt === "string" && raw.version === 1 ? { seededAt: raw.seededAt, version: 1 } : null;
}

const nullableString = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);

function parseForms(raw: unknown): MetaFormConfig[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord).slice(0, 100).flatMap((form): MetaFormConfig[] => {
    const id = nullableString(form.id, 30);
    if (!id || !/^\d{1,30}$/.test(id)) return [];
    const defaults: Record<string, unknown> = isRecord(form.defaults) ? form.defaults : {};
    return [
      {
        id,
        name: nullableString(form.name, 200) ?? "",
        status: nullableString(form.status, 40) ?? "",
        defaults: {
          ...(cleanSlug(defaults.programInterest) ? { programInterest: cleanSlug(defaults.programInterest) as string } : {}),
          ...(cleanSlug(defaults.centreSlug) ? { centreSlug: cleanSlug(defaults.centreSlug) as string } : {}),
        },
        consentCheckboxKey: nullableString(form.consentCheckboxKey, 100),
      },
    ];
  });
}

/** Lenient: unknown / malformed fields fall back to their defaults (META validates its own PUTs). */
export function parseMetaConfig(raw: unknown): MetaConfig | null {
  if (!isRecord(raw)) return null;
  const fieldMap: Record<string, ImportTarget> = {};
  if (isRecord(raw.fieldMap)) {
    for (const [key, value] of Object.entries(raw.fieldMap).slice(0, 200)) {
      if (key.length <= 120 && (IMPORT_TARGETS as readonly unknown[]).includes(value)) fieldMap[key] = value as ImportTarget;
    }
  }
  const version = typeof raw.graphVersion === "string" && META_GRAPH_VERSION_PATTERN.test(raw.graphVersion) ? raw.graphVersion : DEFAULT_META_CONFIG.graphVersion;
  const silence = typeof raw.silenceAlertHours === "number" && Number.isInteger(raw.silenceAlertHours) && raw.silenceAlertHours >= 0 && raw.silenceAlertHours <= 720;
  return {
    enabled: raw.enabled === true,
    appId: nullableString(raw.appId, 30),
    pageId: nullableString(raw.pageId, 30),
    graphVersion: version,
    tokenTransport: raw.tokenTransport === "query" ? "query" : "header",
    fieldMap,
    forms: parseForms(raw.forms),
    testPhone: nullableString(raw.testPhone, 16),
    acceptTestLeadsUntil: nullableString(raw.acceptTestLeadsUntil, 40),
    silenceAlertHours: silence ? (raw.silenceAlertHours as number) : DEFAULT_META_CONFIG.silenceAlertHours,
  };
}

export function parseMetaStatus(raw: unknown): MetaStatus | null {
  if (!isRecord(raw)) return null;
  const iso = (key: keyof MetaStatus) => nullableString(raw[key], 40);
  const token = isRecord(raw.tokenInfo) ? raw.tokenInfo : null;
  const fields = isRecord(raw.fieldsMode) ? raw.fieldsMode : null;
  return {
    lastVerifyAt: iso("lastVerifyAt"),
    verifiedSiteUrl: nullableString(raw.verifiedSiteUrl, 200),
    lastWebhookAt: iso("lastWebhookAt"),
    lastSignatureFailureAt: iso("lastSignatureFailureAt"),
    lastImportAt: iso("lastImportAt"),
    lastTestAt: iso("lastTestAt"),
    lastSyncAt: iso("lastSyncAt"),
    paused: raw.paused === "auth" || raw.paused === "permission" ? raw.paused : null,
    pausedAt: iso("pausedAt"),
    lastErrorCode: nullableString(raw.lastErrorCode, 60),
    consecutivePermissionFailures:
      typeof raw.consecutivePermissionFailures === "number" && Number.isInteger(raw.consecutivePermissionFailures) && raw.consecutivePermissionFailures >= 0
        ? raw.consecutivePermissionFailures
        : 0,
    tokenInfo: token
      ? {
          type: nullableString(token.type, 40) ?? "",
          expiresAt: nullableString(token.expiresAt, 40),
          scopes: Array.isArray(token.scopes) ? token.scopes.filter((scope): scope is string => typeof scope === "string" && scope.length <= 80).slice(0, 40) : [],
          checkedAt: nullableString(token.checkedAt, 40) ?? "",
        }
      : null,
    pageSubscribed: typeof raw.pageSubscribed === "boolean" ? raw.pageSubscribed : null,
    fieldsMode: { mode: fields?.mode === "basic" ? "basic" : "full", until: fields ? nullableString(fields.until, 40) : null },
  };
}

// ---------------------------------------------------------------------------------------------
// Typed readers

const validatedOrNull =
  <T>(validate: (input: unknown) => Validated<T>) =>
  (raw: unknown): T | null => {
    const result = validate(raw);
    return result.ok ? result.value : null;
  };

export function getCallingHours(db: DatabaseSync): SettingEnvelope<CallingHours> {
  return readSetting(db, "calling_hours", validatedOrNull(validateCallingHours), DEFAULT_CALLING_HOURS);
}

export function getSpeedRule(db: DatabaseSync): SettingEnvelope<SpeedRule> {
  return readSetting(db, "speed_rule", validatedOrNull(validateSpeedRule), DEFAULT_SPEED_RULE);
}

export function getRoutingSettings(db: DatabaseSync): SettingEnvelope<RoutingSettings> {
  return readSetting(db, "routing", parseRouting, DEFAULT_ROUTING_SETTINGS);
}

/** The seed marker, or null when the areas were never seeded. */
export function getAreasSeed(db: DatabaseSync): AreasSeedSetting | null {
  const envelope = readSetting<AreasSeedSetting | null>(db, "areas_seed", parseSeed, null);
  return envelope.isDefault ? null : envelope.value;
}

export function getMetaConfig(db: DatabaseSync): SettingEnvelope<MetaConfig> {
  return readSetting(db, "meta_config", parseMetaConfig, DEFAULT_META_CONFIG);
}

export function getMetaStatus(db: DatabaseSync): SettingEnvelope<MetaStatus> {
  return readSetting(db, "meta_status", parseMetaStatus, DEFAULT_META_STATUS);
}
