import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { getDb, withTransaction } from "@/lib/db/connection";

import { CRM_MESSAGES, fail, ok } from "../access";
import type { CallingHours, SettingEnvelope, SpeedRule } from "../lead-ops-types";
import { getCallingHours, getSpeedRule, validateCallingHours, validateSpeedRule, writeSetting, type FieldErrors } from "../settings";
import { crmPermissions, type CrmResult, type CrmViewer } from "../types";
import { addWorkingMinutes } from "./calling-hours";

/**
 * The first-call policy (owner: LR-SLA; docs/lead-routing-plan.md §15, D-046): calling hours +
 * speed rule, the due / tier times of a clock, whether an arrival starts one, and the
 * "Calling hours & speed" settings (read: area heads and admins; write: super admins, with the
 * optimistic lock; open clocks are recomputed in the SAME transaction).
 */

export interface SlaPolicy {
  hours: CallingHours;
  rule: SpeedRule;
  /** Grows with every save of either document (stored on each clock as `policy_version`). */
  version: number;
}

export function policyVersionOf(hours: Pick<SettingEnvelope<unknown>, "version">, rule: Pick<SettingEnvelope<unknown>, "version">): number {
  return 1 + hours.version + rule.version;
}

/** The policy in force (defaults when never saved). Never writes. */
export function loadPolicy(db: DatabaseSync): SlaPolicy {
  const hours = getCallingHours(db);
  const rule = getSpeedRule(db);
  return { hours: hours.value, rule: rule.value, version: policyVersionOf(hours, rule) };
}

export interface ClockTimes {
  dueAt: number;
  /** null = that alert step is switched off. */
  tier1At: number | null;
  tier2At: number | null;
}

/** Due and alert times of a clock started at `startedAt` (working minutes, carried over; Q3). */
export function clockTimes(policy: Pick<SlaPolicy, "hours" | "rule">, startedAt: number): ClockTimes {
  const { hours, rule } = policy;
  return {
    dueAt: addWorkingMinutes(hours, startedAt, rule.firstCallMinutes),
    tier1At: rule.tiers.areaHead.enabled ? addWorkingMinutes(hours, startedAt, rule.tiers.areaHead.afterMinutes) : null,
    tier2At: rule.tiers.superAdmin.enabled ? addWorkingMinutes(hours, startedAt, rule.tiers.superAdmin.afterMinutes) : null,
  };
}

/**
 * Whether an arrival starts a clock (§15 "Start"): the CSV option (`override`) wins; otherwise a
 * tool sign-up (lead gate) only with `leadGate` on (Q2), and any other arrival when its source is
 * in `sources` (walk-ins and phone calls are not, by default).
 */
export function clockAllowed(rule: SpeedRule, arrival: { source: string; gate: boolean; override?: boolean }): boolean {
  if (arrival.override === true) return true;
  if (arrival.override === false) return false;
  if (arrival.gate) return rule.leadGate;
  return rule.sources.includes(arrival.source);
}

// ---------------------------------------------------------------------------------------------
// "Calling hours & speed" settings (GET / PUT /api/crm/settings/speed)

export interface SpeedSettingsData {
  callingHours: SettingEnvelope<CallingHours>;
  speedRule: SettingEnvelope<SpeedRule>;
  /** After a save: how many open clocks got new due / alert times. */
  recomputed?: number;
}

export interface SpeedSettingsInput {
  callingHours?: unknown;
  speedRule?: unknown;
  expectedVersion: { callingHours?: number; speedRule?: number };
}

export const SPEED_MESSAGES = {
  nothing: "Send the calling hours, the speed rule, or both.",
  versionRequired: "Send the version you edited.",
  conflict: "Someone changed these settings meanwhile. Reload and try again.",
} as const;

/** Area heads and admins read; counsellors do not (§22). */
export function getSpeedSettings(viewer: CrmViewer, db: DatabaseSync = getDb()): CrmResult<SpeedSettingsData> {
  if (!crmPermissions(viewer).canViewSettings) return fail("forbidden", CRM_MESSAGES.forbidden);
  return ok({ callingHours: getCallingHours(db), speedRule: getSpeedRule(db) });
}

class VersionConflict extends Error {}

function prefixed(prefix: string, errors: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [key.startsWith(prefix) ? key : `${prefix}.${key}`, value]));
}

/**
 * Saves calling hours and / or the speed rule (super admins only; the route checks too). Each
 * document needs the version the page loaded (`expectedVersion`; 409 when stale). Audited by
 * `writeSetting` (`crm.settings_update { key, version }`, never the values). Open clocks are
 * recomputed from their start in the same transaction (`recomputeOpenClocks`).
 */
export function saveSpeedSettings(
  viewer: CrmViewer,
  input: SpeedSettingsInput,
  recompute: (db: DatabaseSync, now: number) => number,
  now: number = Date.now(),
): CrmResult<SpeedSettingsData> {
  if (viewer.role !== "admin" || viewer.superAdmin !== true) return fail("forbidden", CRM_MESSAGES.superAdminOnly);
  if (input.callingHours === undefined && input.speedRule === undefined) {
    return fail("validation", CRM_MESSAGES.validation, { callingHours: [SPEED_MESSAGES.nothing] });
  }
  const fieldErrors: FieldErrors = {};
  let hours: CallingHours | null = null;
  let rule: SpeedRule | null = null;
  if (input.callingHours !== undefined) {
    const checked = validateCallingHours(input.callingHours);
    if (checked.ok) hours = checked.value;
    else Object.assign(fieldErrors, prefixed("callingHours", checked.fieldErrors));
    if (!Number.isInteger(input.expectedVersion.callingHours)) fieldErrors["expectedVersion.callingHours"] = [SPEED_MESSAGES.versionRequired];
  }
  if (input.speedRule !== undefined) {
    const checked = validateSpeedRule(input.speedRule);
    if (checked.ok) rule = checked.value;
    else Object.assign(fieldErrors, prefixed("speedRule", checked.fieldErrors));
    if (!Number.isInteger(input.expectedVersion.speedRule)) fieldErrors["expectedVersion.speedRule"] = [SPEED_MESSAGES.versionRequired];
  }
  if (Object.keys(fieldErrors).length > 0) return fail("validation", CRM_MESSAGES.validation, fieldErrors);

  const db = getDb();
  try {
    return withTransaction(db, (): CrmResult<SpeedSettingsData> => {
      if (hours) {
        const written = writeSetting(db, "calling_hours", hours, { expectedVersion: input.expectedVersion.callingHours ?? null, actorId: viewer.userId, now });
        if (!written.ok) throw new VersionConflict();
      }
      if (rule) {
        const written = writeSetting(db, "speed_rule", rule, { expectedVersion: input.expectedVersion.speedRule ?? null, actorId: viewer.userId, now });
        if (!written.ok) throw new VersionConflict();
      }
      const recomputed = recompute(db, now);
      return ok({ callingHours: getCallingHours(db), speedRule: getSpeedRule(db), recomputed });
    });
  } catch (error) {
    if (error instanceof VersionConflict) return fail("conflict", SPEED_MESSAGES.conflict);
    throw error;
  }
}
