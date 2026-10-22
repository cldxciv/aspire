import "server-only";

import type { DatabaseSync } from "node:sqlite";

import { QB_DEFAULT_THRESHOLDS, type QbCalibrationThresholds } from "./calibration-math";
import { qbDb, qbSearchMode } from "./db";
import { PATTERNS } from "./patterns";
import { forbidden, ok, type QbResult } from "./result";
import { qbCan } from "./access";
import type { QbExam, QbViewer } from "./types";

/**
 * `qb_settings` (owner: QB-CORE-B; §B4). Values are JSON. Keys:
 * - `bank.revision` (integer): bumped on every pool change; caches key on it;
 * - `taxonomy.<EXAM>.confirmed` (boolean), `.confirmedAt` (ms, only while confirmed), `.confirmedBy`,
 *   `.syllabusRevisionYear` (number | null);
 * - `import.enabled` (boolean, default false; the env `QB_IMPORT_ENABLED=0` always wins);
 * - `approval.self`: "allowed_recorded" (default) | "second_reviewer";
 * - `calibration.thresholds`: per exam and type (Aspire defaults, not official);
 * - `seed.*` markers (QB-SEED), `bulk:<id>` spot-check sessions (questions.ts).
 */

export const QB_SETTING = {
  bankRevision: "bank.revision",
  importEnabled: "import.enabled",
  approvalSelf: "approval.self",
  calibrationThresholds: "calibration.thresholds",
  taxonomyConfirmed: (exam: QbExam) => `taxonomy.${exam}.confirmed`,
  taxonomyConfirmedAt: (exam: QbExam) => `taxonomy.${exam}.confirmedAt`,
  taxonomyConfirmedBy: (exam: QbExam) => `taxonomy.${exam}.confirmedBy`,
  syllabusRevisionYear: (exam: QbExam) => `taxonomy.${exam}.syllabusRevisionYear`,
} as const;

export type QbApprovalSelf = "allowed_recorded" | "second_reviewer";

export function readSetting<T>(db: DatabaseSync, key: string): T | null {
  const row = db.prepare("SELECT value FROM qb_settings WHERE key = ?").get(key);
  if (!row || typeof row.value !== "string") return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as unknown as T;
  }
}

export function writeSetting(db: DatabaseSync, key: string, value: unknown, actorId: string | null, now: number): void {
  db.prepare(
    `INSERT INTO qb_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), actorId, now);
}

export function hasSetting(db: DatabaseSync, key: string): boolean {
  return db.prepare("SELECT 1 AS found FROM qb_settings WHERE key = ?").get(key) !== undefined;
}

export function deleteSetting(db: DatabaseSync, key: string): void {
  db.prepare("DELETE FROM qb_settings WHERE key = ?").run(key);
}

export function bankRevision(db: DatabaseSync): number {
  const value = readSetting<unknown>(db, QB_SETTING.bankRevision);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** +1 on every pool change (approve, suspend, retire, label change, seed). */
export function bumpBankRevision(db: DatabaseSync, now: number): number {
  db.prepare(
    `INSERT INTO qb_settings (key, value, updated_by, updated_at) VALUES ('bank.revision', '1', NULL, ?)
     ON CONFLICT (key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = excluded.updated_at`,
  ).run(now);
  return bankRevision(db);
}

export interface QbTaxonomyStatus {
  exam: QbExam;
  confirmed: boolean;
  confirmedAt: number | null;
  confirmedBy: string | null;
  syllabusRevisionYear: number | null;
}

export function isTaxonomyConfirmed(db: DatabaseSync, exam: QbExam): boolean {
  return readSetting<unknown>(db, QB_SETTING.taxonomyConfirmed(exam)) === true;
}

/** The syllabus revision year: the admin-confirmed setting, else the reported default (patterns.ts). */
export function syllabusRevisionYear(db: DatabaseSync, exam: QbExam): number | null {
  const value = readSetting<unknown>(db, QB_SETTING.syllabusRevisionYear(exam));
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null && hasSetting(db, QB_SETTING.syllabusRevisionYear(exam))) return null; // an admin set "none"
  return PATTERNS[exam].syllabusRevisionYear;
}

export function taxonomyStatus(db: DatabaseSync, exam: QbExam): QbTaxonomyStatus {
  const confirmed = isTaxonomyConfirmed(db, exam);
  const at = readSetting<unknown>(db, QB_SETTING.taxonomyConfirmedAt(exam));
  const by = readSetting<unknown>(db, QB_SETTING.taxonomyConfirmedBy(exam));
  return {
    exam,
    confirmed,
    confirmedAt: confirmed && typeof at === "number" ? at : null,
    confirmedBy: confirmed && typeof by === "string" ? by : null,
    syllabusRevisionYear: syllabusRevisionYear(db, exam),
  };
}

/** Writes the taxonomy confirmation (admin action, audited by the route). */
export function writeTaxonomyConfirmation(
  db: DatabaseSync,
  exam: QbExam,
  input: { confirm: boolean; syllabusRevisionYear: number | null; actorId: string; now: number },
): QbTaxonomyStatus {
  writeSetting(db, QB_SETTING.taxonomyConfirmed(exam), input.confirm, input.actorId, input.now);
  writeSetting(db, QB_SETTING.syllabusRevisionYear(exam), input.syllabusRevisionYear, input.actorId, input.now);
  if (input.confirm) {
    writeSetting(db, QB_SETTING.taxonomyConfirmedAt(exam), input.now, input.actorId, input.now);
    writeSetting(db, QB_SETTING.taxonomyConfirmedBy(exam), input.actorId, input.actorId, input.now);
  } else {
    deleteSetting(db, QB_SETTING.taxonomyConfirmedAt(exam));
    deleteSetting(db, QB_SETTING.taxonomyConfirmedBy(exam));
  }
  return taxonomyStatus(db, exam);
}

export function importSettingEnabled(db: DatabaseSync): boolean {
  return readSetting<unknown>(db, QB_SETTING.importEnabled) === true;
}

/** `QB_IMPORT_ENABLED=0` is a hard kill switch whatever the admin setting says. */
export function importEnvOff(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  const value = env.QB_IMPORT_ENABLED?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "off";
}

export function approvalSelfPolicy(db: DatabaseSync): QbApprovalSelf {
  return readSetting<unknown>(db, QB_SETTING.approvalSelf) === "second_reviewer" ? "second_reviewer" : "allowed_recorded";
}

export function calibrationThresholds(db: DatabaseSync): QbCalibrationThresholds {
  const stored = readSetting<Partial<QbCalibrationThresholds>>(db, QB_SETTING.calibrationThresholds);
  return { ...QB_DEFAULT_THRESHOLDS, ...(stored && typeof stored === "object" ? stored : {}) };
}

// ---------------------------------------------------------------------------------------------
// Admin settings view (manage_settings)

export interface QbSettingsView {
  importEnabled: boolean;
  importEnvOff: boolean;
  apiKeyConfigured: boolean;
  approvalSelf: QbApprovalSelf;
  bankRevision: number;
  searchMode: "fts" | "like";
  figures: { usedMb: number; quotaMb: number };
  calibrationThresholds: QbCalibrationThresholds;
}

export interface QbSettingsPatch {
  importEnabled?: boolean;
  approvalSelf?: QbApprovalSelf;
  calibrationThresholds?: Partial<QbCalibrationThresholds>;
}

function figureUsage(db: DatabaseSync): { usedMb: number; quotaMb: number } {
  const used = Number(db.prepare("SELECT COALESCE(SUM(size), 0) AS total FROM qb_figures").get()?.total ?? 0);
  const quota = Number(process.env.QB_FIGURE_QUOTA_MB);
  return { usedMb: Math.round((used / (1024 * 1024)) * 100) / 100, quotaMb: Number.isFinite(quota) && quota > 0 ? quota : 150 };
}

export function settingsView(db: DatabaseSync): QbSettingsView {
  return {
    importEnabled: importSettingEnabled(db),
    importEnvOff: importEnvOff(),
    apiKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    approvalSelf: approvalSelfPolicy(db),
    bankRevision: bankRevision(db),
    searchMode: qbSearchMode(db),
    figures: figureUsage(db),
    calibrationThresholds: calibrationThresholds(db),
  };
}

export function getSettingsView(viewer: QbViewer, db: DatabaseSync = qbDb()): QbResult<QbSettingsView> {
  if (!qbCan(viewer, "manage_settings")) return forbidden();
  return ok(settingsView(db));
}

/** Admin only. The import switch is audited by the route. */
export function updateSettings(viewer: QbViewer, patch: QbSettingsPatch, now: number, db: DatabaseSync = qbDb()): QbResult<QbSettingsView> {
  if (!qbCan(viewer, "manage_settings")) return forbidden();
  if (patch.importEnabled !== undefined) writeSetting(db, QB_SETTING.importEnabled, patch.importEnabled, viewer.userId, now);
  if (patch.approvalSelf !== undefined) writeSetting(db, QB_SETTING.approvalSelf, patch.approvalSelf, viewer.userId, now);
  if (patch.calibrationThresholds !== undefined) {
    const merged = { ...calibrationThresholds(db), ...patch.calibrationThresholds };
    writeSetting(db, QB_SETTING.calibrationThresholds, merged, viewer.userId, now);
  }
  return ok(settingsView(db));
}
